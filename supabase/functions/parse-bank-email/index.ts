/**
 * parse-bank-email — polls connected Gmail/Outlook accounts and extracts bank transactions.
 *
 * Request body: { user_id: string }
 *
 * 3-tier filtering strategy:
 *  Tier 1 — Sender filter (fastest): if the user has set notification_email on any account,
 *            fetch ONLY from those specific sender addresses.
 *  Tier 2 — Keyword filter: if no sender addresses are defined, fetch recent emails and
 *            pre-filter by transaction-related keywords before calling AI.
 *  Tier 3 — AI classification: GPT-4o-mini determines whether each candidate email is a
 *            real bank transaction and extracts the structured fields.
 *
 * Required Edge Function secrets:
 *   OPENAI_API_KEY
 *   GOOGLE_OAUTH_CLIENT_ID      — Web client ID (105328440332-6e85m2dh2q6uelm0bomj3pjiqhr718fo...)
 *                                 Used as fallback when token.client_id is absent.
 *                                 Native client tokens are refreshed with their own client_id
 *                                 (stored in the token blob), no client_secret needed.
 *   MICROSOFT_OAUTH_CLIENT_ID   — Azure app client ID (for token refresh)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── HTML entity decoder ───────────────────────────────────────────────────────

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_: string, num: string) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

// ── Tier-2 keyword set ────────────────────────────────────────────────────────
// Applied to subject + first 500 chars of body before calling AI.
const TRANSACTION_KEYWORDS = [
  'transaction', 'debit', 'credit', 'debited', 'credited',
  'rs.', 'rs ', 'pkr', 'usd', 'eur', 'gbp',
  'withdrawal', 'payment', 'transferred', 'transfer',
  'account', 'balance', 'amount', 'charged',
];

function passesTier2(subject: string, body: string): boolean {
  const hay = (subject + ' ' + body.slice(0, 500)).toLowerCase();
  return TRANSACTION_KEYWORDS.some((kw) => hay.includes(kw));
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface StoredToken {
  access_token: string;
  refresh_token: string | null;
  expires_at: number; // Unix ms
  /** OAuth client_id used to obtain the token. Stored so we refresh with the
   *  same client (native clients refresh without a client_secret). */
  client_id?: string;
}

interface ConnectedEmail {
  id: string;
  user_id: string;
  provider: 'gmail' | 'outlook';
  email_address: string;
  oauth_token_encrypted: string;
  last_polled_at: string | null;
  is_active: boolean;
}

interface ParsedTransaction {
  is_transaction: boolean;
  bank_name: string | null;
  transaction_type: 'debit' | 'credit' | null;
  amount: number | null;
  currency: string | null;
  account_last4: string | null;
  transaction_date: string | null;
  merchant_hint: string | null;
  balance_after: number | null;
  reference_number: string | null;
  category: string | null;
}

// ── Token refresh ─────────────────────────────────────────────────────────────

async function refreshGoogleToken(token: StoredToken): Promise<StoredToken> {
  if (!token.refresh_token) throw new Error('No refresh token for Google');
  // Prefer the client_id that originally obtained the token (native clients
  // can refresh without a client_secret). Fall back to the secret for web clients.
  const clientId =
    token.client_id ?? Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') ?? '';
  const params: Record<string, string> = {
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: token.refresh_token,
  };
  // Include client_secret only when it is configured (web client refresh).
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
  if (clientSecret) params.client_secret = clientSecret;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${data.error_description ?? data.error}`);
  }
  return {
    access_token: data.access_token,
    refresh_token: token.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
    client_id: clientId,
  };
}

async function refreshMicrosoftToken(token: StoredToken): Promise<StoredToken> {
  if (!token.refresh_token) throw new Error('No refresh token for Microsoft');
  const clientId = Deno.env.get('MICROSOFT_OAUTH_CLIENT_ID') ?? '';
  const res = await fetch(
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: token.refresh_token,
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Microsoft token refresh failed: ${data.error_description ?? data.error}`);
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? token.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
    client_id: token.client_id ?? clientId,
  };
}

async function getValidToken(
  email: ConnectedEmail,
  token: StoredToken,
  supabase: ReturnType<typeof createClient>
): Promise<StoredToken> {
  const REFRESH_BUFFER_MS = 5 * 60 * 1000;
  if (token.expires_at - Date.now() > REFRESH_BUFFER_MS) return token;

  const refreshed =
    email.provider === 'gmail'
      ? await refreshGoogleToken(token)
      : await refreshMicrosoftToken(token);

  await supabase
    .from('connected_emails')
    .update({ oauth_token_encrypted: JSON.stringify(refreshed) })
    .eq('id', email.id);

  return refreshed;
}

// ── Gmail helpers ─────────────────────────────────────────────────────────────

function base64Decode(b64url: string): string {
  return atob(b64url.replace(/-/g, '+').replace(/_/g, '/'));
}

function extractGmailBody(payload: Record<string, unknown>): string {
  const body = payload.body as { data?: string } | undefined;
  if (body?.data) return base64Decode(body.data);

  const parts = payload.parts as
    | Array<{ mimeType: string; body?: { data?: string } }>
    | undefined;
  if (parts) {
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return base64Decode(part.body.data);
      }
    }
    for (const part of parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return decodeHtmlEntities(
          base64Decode(part.body.data)
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
        );
      }
    }
  }
  return '';
}

/**
 * Build the Gmail search query applying Tier-1 or Tier-2 filter.
 * Accepts an optional `until` date to scope queries to a specific month.
 *
 * Tier 1: `from:(addr1 OR addr2) after:{unix} [before:{unix}]`
 * Tier 2: `(keyword1 OR keyword2 ...) after:{unix} [before:{unix}] -in:sent -in:drafts -in:spam`
 */
function buildGmailQuery(since: Date, until: Date | null, senderAddresses: string[]): string {
  const afterUnix = Math.floor(since.getTime() / 1000);
  const beforeClause = until ? ` before:${Math.floor(until.getTime() / 1000)}` : '';

  if (senderAddresses.length > 0) {
    const fromClause = senderAddresses.map((a) => `from:${a}`).join(' OR ');
    return `(${fromClause}) after:${afterUnix}${beforeClause}`;
  }

  const kwClause = TRANSACTION_KEYWORDS.map((kw) => `"${kw}"`).join(' OR ');
  return `(${kwClause}) after:${afterUnix}${beforeClause} -in:sent -in:drafts -in:spam`;
}

async function fetchGmailMessages(
  accessToken: string,
  since: Date,
  until: Date | null,
  senderAddresses: string[]
): Promise<Array<{ id: string; body: string; subject: string; from: string; date: string }>> {
  const query = encodeURIComponent(buildGmailQuery(since, until, senderAddresses));

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) {
    const err = await listRes.json();
    throw new Error(`Gmail list error: ${err.error?.message ?? listRes.status}`);
  }
  const listData = await listRes.json();
  const messageIds: string[] = (listData.messages ?? []).map(
    (m: { id: string }) => m.id
  );

  const messages: Array<{
    id: string; body: string; subject: string; from: string; date: string;
  }> = [];

  for (const msgId of messageIds) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full&fields=id,payload,internalDate`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!msgRes.ok) continue;
    const msg = await msgRes.json();

    const headers: Array<{ name: string; value: string }> = msg.payload?.headers ?? [];
    const subject = headers.find((h) => h.name === 'Subject')?.value ?? '';
    const from = headers.find((h) => h.name === 'From')?.value ?? '';
    const dateHeader = headers.find((h) => h.name === 'Date')?.value ?? '';
    const body = extractGmailBody(msg.payload ?? {});
    const date = dateHeader || new Date(parseInt(msg.internalDate ?? '0')).toISOString();

    messages.push({ id: msgId, body, subject, from, date });
  }

  return messages;
}

// ── Outlook helpers ───────────────────────────────────────────────────────────

/**
 * Build the Outlook $filter string applying Tier-1 or Tier-2 filter.
 *
 * Tier 1: receivedDateTime filter + from address filter (OData `or` chain)
 * Tier 2: receivedDateTime filter only — keyword pass is done in-process after fetching
 *         (Graph API has limited subject/body search support in $filter)
 */
function buildOutlookFilter(since: Date, senderAddresses: string[]): string {
  const sinceISO = since.toISOString();
  const dateFilter = `receivedDateTime ge ${sinceISO}`;

  if (senderAddresses.length === 0) return dateFilter;

  const fromFilter = senderAddresses
    .map((addr) => `from/emailAddress/address eq '${addr}'`)
    .join(' or ');
  return `${dateFilter} and (${fromFilter})`;
}

async function fetchOutlookMessages(
  accessToken: string,
  since: Date,
  senderAddresses: string[]
): Promise<Array<{ id: string; body: string; subject: string; from: string; date: string }>> {
  const filter = encodeURIComponent(buildOutlookFilter(since, senderAddresses));
  const select = 'id,subject,body,from,receivedDateTime';
  const url = `https://graph.microsoft.com/v1.0/me/messages?$filter=${filter}&$select=${select}&$top=50`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Outlook list error: ${err.error?.message ?? res.status}`);
  }
  const data = await res.json();
  const items = (data.value ?? []) as Array<{
    id: string;
    subject: string;
    body: { content: string; contentType: string };
    from: { emailAddress: { name: string; address: string } };
    receivedDateTime: string;
  }>;

  return items.map((item) => {
    let body = item.body.content;
    if (item.body.contentType === 'html') {
      body = decodeHtmlEntities(body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    }
    return {
      id: item.id,
      body,
      subject: item.subject,
      from: item.from?.emailAddress?.address ?? '',
      date: item.receivedDateTime,
    };
  });
}

// ── GPT-4o-mini parsing (Tier 3) ─────────────────────────────────────────────

const todayISO = new Date().toISOString().slice(0, 10);

async function parseEmailWithAI(
  subject: string,
  from: string,
  body: string,
  date: string
): Promise<ParsedTransaction | null> {
  const content = `From: ${from}\nDate: ${date}\nSubject: ${subject}\n\n${body.slice(0, 2000)}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 400,
      messages: [
        {
          role: 'system',
          content: `You parse bank notification emails. Return ONLY valid JSON:
{
  "is_transaction": boolean,
  "bank_name": "string | null",
  "transaction_type": "debit | credit | null",
  "amount": number | null,
  "currency": "string | null",
  "account_last4": "string | null",
  "transaction_date": "ISO8601 or null",
  "merchant_hint": "string | null",
  "balance_after": number | null,
  "reference_number": "string | null",
  "category": "one of: food | transport | groceries | shopping | utilities | health | entertainment | education | fuel | rent | mobile | travel | clothing | coffee | other"
}
Today is ${todayISO}. Use ISO8601 for dates. If no year, assume current year.

transaction_type rules (from the USER's perspective, not the bank's):
- "debit" = money LEAVING the user: purchases, withdrawals, fees, credit card charges/bills
- "credit" = money ARRIVING to the user: incoming transfers, refunds, salary, cashback
- For CREDIT CARDS specifically: a purchase or charge on the card = "debit" (user owes more). A payment received or refund = "credit".
- The words "credited to your card" or "charged to your card" both mean the card was used for a purchase = "debit".

bank_name rules — always use the SHORT canonical name, never the full legal name:
- Any email from Standard Chartered / Standard Chartered Bank (Pakistan) Limited / SCB → "Standard Chartered"
- Any email from Habib Bank / HBL → "HBL"
- Any email from United Bank / UBL → "UBL"
- Any email from MCB Bank / Muslim Commercial Bank → "MCB"
- Any email from Meezan Bank Limited → "Meezan Bank"
- Any email from Bank Alfalah Limited → "Bank Alfalah"
- Any email from Allied Bank Limited / ABL → "Allied Bank"
- Any email from Faysal Bank Limited → "Faysal Bank"
- Any email from National Bank / NBP → "NBP"
- Any email from Askari Bank → "Askari Bank"
- For any other bank: use the shortest commonly recognised name, drop "Limited", "Ltd", "(Pakistan)", etc.

category rules — pick the best fit from the allowed values:
- food: restaurants, fast food, cafes, dining, bakeries
- transport: Uber, Careem, rickshaw, taxi, ride-hailing, parking
- groceries: supermarkets, grocery stores, Carrefour, Metro, Imtiaz, Naheed
- shopping: retail stores, online shopping, Amazon, Daraz, clothing (if not at a clothing store)
- utilities: electricity, gas, water, LESCO, SNGPL, KESC, utility bills
- health: pharmacy, hospital, clinic, lab tests, medical
- entertainment: cinema, streaming, games, concerts, sports
- education: school, university, tuition, books, courses
- fuel: petrol, diesel, PSO, Shell, Total, fuel stations
- rent: rent, housing, property payments
- mobile: mobile recharge, internet, phone bills, Jazz, Zong, Ufone, Telenor
- travel: airlines, hotels, booking.com, travel agencies, international transactions
- clothing: clothing stores, fashion brands
- coffee: Starbucks, Gloria Jean's, coffee shops, tea houses
- other: anything that does not clearly fit the above`,
        },
        { role: 'user', content },
      ],
    }),
  });

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? '';
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch {
    return null;
  }
}

// ── Deduplication ─────────────────────────────────────────────────────────────

async function checkDuplicate(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  parsed: ParsedTransaction
): Promise<{ dup: boolean; existingId: string | null }> {
  const txDate = new Date(parsed.transaction_date || Date.now());
  const windowStart = new Date(txDate.getTime() - 10 * 60 * 1000).toISOString();
  const windowEnd = new Date(txDate.getTime() + 10 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('bank_transactions')
    .select('id, confirmed_by')
    .eq('user_id', userId)
    .eq('bank_name', parsed.bank_name ?? '')
    .eq('account_last4', parsed.account_last4 ?? '')
    .gte('transaction_date', windowStart)
    .lte('transaction_date', windowEnd)
    .gte('amount', (parsed.amount ?? 0) * 0.98)
    .lte('amount', (parsed.amount ?? 0) * 1.02)
    .maybeSingle();

  return { dup: !!data, existingId: data?.id ?? null };
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json();
    const { user_id, date_from, date_to } = body as {
      user_id: string;
      date_from?: string; // e.g. "2026-05-01" — fetch a specific month
      date_to?: string;   // e.g. "2026-05-31"
    };
    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'user_id is required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // When fetching a specific date range, use it directly.
    // When date_to is in the past (historical fetch), do NOT update last_polled_at.
    const rangeFrom = date_from ? new Date(date_from) : null;
    const rangeUntil = date_to ? new Date(date_to + 'T23:59:59Z') : null;
    const isHistoricalFetch = !!(rangeFrom && rangeUntil && rangeUntil < new Date());

    // ── Collect Tier-1 sender addresses from the user's accounts ─────────────
    const { data: accountRows } = await supabase
      .from('accounts')
      .select('notification_email')
      .eq('user_id', user_id)
      .not('notification_email', 'is', null);

    const senderAddresses: string[] = (accountRows ?? [])
      .map((a: { notification_email: string | null }) => a.notification_email!)
      .filter(Boolean)
      .map((e: string) => e.toLowerCase());

    const usingTier1 = senderAddresses.length > 0;

    // ── Fetch active connected emails ─────────────────────────────────────────
    const { data: emails } = await supabase
      .from('connected_emails')
      .select('*')
      .eq('user_id', user_id)
      .eq('is_active', true);

    if (!emails?.length) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, new_transactions: 0, tier: usingTier1 ? 1 : 2 }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    let totalNew = 0;
    const errors: string[] = [];

    for (const emailRow of emails as ConnectedEmail[]) {
      try {
        let token: StoredToken = JSON.parse(emailRow.oauth_token_encrypted);
        token = await getValidToken(emailRow, token, supabase);

        // Date range: use explicit range if provided, else fall back to last_polled_at / 72h
        const since = rangeFrom
          ?? (emailRow.last_polled_at
            ? new Date(emailRow.last_polled_at)
            : new Date(Date.now() - 72 * 60 * 60 * 1000));
        const until = rangeUntil ?? null;

        // Fetch messages — Tier-1 sender filter applied at query level when available
        const messages =
          emailRow.provider === 'gmail'
            ? await fetchGmailMessages(token.access_token, since, until, senderAddresses)
            : await fetchOutlookMessages(token.access_token, since, senderAddresses);

        for (const msg of messages) {
          if (!msg.body.trim()) continue;

          // Tier 2 — keyword pre-filter (skip if Tier-1 sender filter is active,
          // because those emails are already known to be bank alerts)
          if (!usingTier1 && !passesTier2(msg.subject, msg.body)) continue;

          // Tier 3 — AI classification
          const parsed = await parseEmailWithAI(
            msg.subject,
            msg.from,
            msg.body,
            msg.date
          );

          if (!parsed?.is_transaction || !parsed.amount) continue;

          const { dup, existingId } = await checkDuplicate(supabase, user_id, parsed);

          if (dup && existingId) {
            await supabase
              .from('bank_transactions')
              .update({ confirmed_by: 'both' })
              .eq('id', existingId)
              .eq('confirmed_by', 'sms_only');
            continue;
          }

          const { data: tx, error: insertErr } = await supabase
            .from('bank_transactions')
            .insert({
              user_id,
              source: 'email',
              confirmed_by: 'email_only',
              raw_message: `${msg.subject}\n\n${msg.body.slice(0, 1000)}`,
              bank_name: parsed.bank_name ?? 'Unknown',
              transaction_type: parsed.transaction_type ?? 'debit',
              amount: parsed.amount,
              currency: parsed.currency ?? 'PKR',
              account_last4: parsed.account_last4 ?? null,
              transaction_date: parsed.transaction_date ?? msg.date,
              merchant_hint: parsed.merchant_hint ?? null,
              balance_after: parsed.balance_after ?? null,
              reference_number: parsed.reference_number ?? null,
              category: parsed.category ?? 'other',
            })
            .select('id')
            .single();

          if (insertErr) {
            console.warn('[parse-bank-email] insert error:', insertErr.message);
            continue;
          }

          totalNew++;

          if (tx?.id) {
            supabase.functions
              .invoke('match-transaction', { body: { transaction_id: tx.id } })
              .catch((e: Error) =>
                console.error('[parse-bank-email] match-transaction failed:', e.message)
              );
          }
        }

        // Only advance last_polled_at for live polls, not historical date-range fetches
        if (!isHistoricalFetch) {
          await supabase
            .from('connected_emails')
            .update({ last_polled_at: new Date().toISOString() })
            .eq('id', emailRow.id);
        }
      } catch (emailErr) {
        const msg = emailErr instanceof Error ? emailErr.message : String(emailErr);
        errors.push(`${emailRow.email_address}: ${msg}`);

        if (
          msg.includes('token refresh failed') ||
          msg.includes('No refresh token') ||
          msg.includes('401')
        ) {
          await supabase
            .from('connected_emails')
            .update({ is_active: false })
            .eq('id', emailRow.id);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: emails.length,
        new_transactions: totalNew,
        tier: usingTier1 ? 1 : 2,
        errors: errors.length ? errors : undefined,
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
