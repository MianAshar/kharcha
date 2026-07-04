import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { raw_message, user_id } = await req.json();
    if (!raw_message || !user_id) {
      return new Response(
        JSON.stringify({ error: 'raw_message and user_id are required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Ask GPT-4o-mini to parse the SMS
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 400,
        messages: [
          {
            role: 'system',
            content: `You parse bank SMS messages. Return ONLY valid JSON:
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
  "reference_number": "string | null"
}`,
          },
          { role: 'user', content: raw_message },
        ],
      }),
    });

    const openaiData = await openaiRes.json();
    const content = openaiData.choices?.[0]?.message?.content ?? '';

    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      parsed = null;
    }

    if (!parsed?.is_transaction) {
      return new Response(
        JSON.stringify({ success: true, is_transaction: false }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Deduplication check: same amount ±2%, same bank, same account_last4, within 10 min
    const windowStart = new Date(
      new Date(parsed.transaction_date || Date.now()).getTime() - 10 * 60 * 1000
    ).toISOString();
    const windowEnd = new Date(
      new Date(parsed.transaction_date || Date.now()).getTime() + 10 * 60 * 1000
    ).toISOString();

    const { data: existing } = await supabase
      .from('bank_transactions')
      .select('id, confirmed_by')
      .eq('user_id', user_id)
      .eq('bank_name', parsed.bank_name ?? '')
      .eq('account_last4', parsed.account_last4 ?? '')
      .gte('transaction_date', windowStart)
      .lte('transaction_date', windowEnd)
      .gte('amount', (parsed.amount ?? 0) * 0.98)
      .lte('amount', (parsed.amount ?? 0) * 1.02)
      .maybeSingle();

    if (existing) {
      // Update confirmed_by to 'both'
      await supabase
        .from('bank_transactions')
        .update({ confirmed_by: 'both' })
        .eq('id', existing.id);

      return new Response(
        JSON.stringify({ success: true, is_transaction: true, deduplicated: true }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Insert new transaction
    const { data: tx, error: insertError } = await supabase
      .from('bank_transactions')
      .insert({
        user_id,
        source: 'sms',
        confirmed_by: 'sms_only',
        raw_message,
        bank_name: parsed.bank_name ?? 'Unknown',
        transaction_type: parsed.transaction_type ?? 'debit',
        amount: parsed.amount ?? 0,
        currency: parsed.currency ?? 'PKR',
        account_last4: parsed.account_last4,
        transaction_date: parsed.transaction_date ?? new Date().toISOString(),
        merchant_hint: parsed.merchant_hint,
        balance_after: parsed.balance_after,
        reference_number: parsed.reference_number,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Fire-and-forget: auto-match this transaction against existing unmatched expenses
    if (tx?.id) {
      supabase.functions.invoke('match-transaction', {
        body: { transaction_id: tx.id },
      }).catch((e: Error) => console.error('[parse-bank-sms] match-transaction invoke failed:', e.message));
    }

    return new Response(
      JSON.stringify({
        success: true,
        is_transaction: true,
        transaction_id: tx?.id,
        bank_name: parsed.bank_name,
        amount: parsed.amount,
        currency: parsed.currency ?? 'PKR',
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
