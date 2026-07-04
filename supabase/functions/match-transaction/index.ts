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

    const body = await req.json();
    const { expense_id, transaction_id } = body;

    // ── Branch: given a transaction_id, find a matching expense ──────────────
    if (transaction_id && !expense_id) {
      const { data: tx } = await supabase
        .from('bank_transactions')
        .select('*')
        .eq('id', transaction_id)
        .single();

      if (!tx) throw new Error('Transaction not found');

      // Only try to match debits — credits don't correspond to expenses
      if (tx.transaction_type !== 'debit') {
        return new Response(
          JSON.stringify({ success: true, match: null, reason: 'credit transaction' }),
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      const txDate = new Date(tx.transaction_date);
      const windowStart = new Date(txDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const windowEnd   = new Date(txDate.getTime() + 24 * 60 * 60 * 1000).toISOString();

      const { data: candidates } = await supabase
        .from('expenses')
        .select('*')
        .eq('user_id', tx.user_id)
        .in('match_status', ['unmatched', 'suggested'])
        .gte('expense_date', windowStart.slice(0, 10))
        .lte('expense_date', windowEnd.slice(0, 10))
        .gte('amount', tx.amount * 0.98)
        .lte('amount', tx.amount * 1.02);

      if (!candidates?.length) {
        return new Response(
          JSON.stringify({ success: true, match: null }),
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      let bestExpense = candidates[0];
      let bestScore = 0.5;

      for (const exp of candidates) {
        let score = 0.5;
        if (tx.merchant_hint && exp.merchant_name) {
          const hint = tx.merchant_hint.toLowerCase();
          const merchant = exp.merchant_name.toLowerCase();
          if (hint.includes(merchant) || merchant.includes(hint)) score = 0.85;
        }
        if (score > bestScore) { bestScore = score; bestExpense = exp; }
      }

      const matchStatus = bestScore > 0.7 ? 'matched' : bestScore >= 0.4 ? 'suggested' : 'unmatched';
      if (matchStatus === 'unmatched') {
        return new Response(
          JSON.stringify({ success: true, match: null }),
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      // Resolve or create account
      let accountId: string | null = null;
      if (tx.bank_name) {
        const { data: existingAcc } = await supabase
          .from('accounts').select('id')
          .eq('user_id', tx.user_id).eq('bank_name', tx.bank_name)
          .eq('last4', tx.account_last4 ?? '').maybeSingle();
        if (existingAcc) {
          accountId = existingAcc.id;
        } else {
          const accName = tx.account_last4
            ? `${tx.bank_name} ••${tx.account_last4}` : tx.bank_name;
          const { data: newAcc } = await supabase
            .from('accounts').insert({
              user_id: tx.user_id, account_name: accName,
              account_type: 'debit_card', bank_name: tx.bank_name,
              last4: tx.account_last4 ?? null, is_default: false,
            }).select('id').single();
          if (newAcc) accountId = newAcc.id;
        }
      }

      await Promise.all([
        supabase.from('bank_transactions')
          .update({ matched_expense_id: bestExpense.id }).eq('id', tx.id),
        supabase.from('expenses')
          .update({
            transaction_id: tx.id, account_id: accountId,
            match_status: matchStatus, confidence_score: bestScore,
          }).eq('id', bestExpense.id),
      ]);

      return new Response(
        JSON.stringify({
          success: true,
          match: { expense_id: bestExpense.id, score: bestScore, status: matchStatus },
        }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // ── Branch: given an expense_id, find a matching transaction (original) ──
    if (!expense_id) {
      return new Response(
        JSON.stringify({ error: 'expense_id or transaction_id is required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const { data: expense } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', expense_id)
      .single();

    if (!expense) throw new Error('Expense not found');

    // Search for candidate transactions within ±2% amount, ±1 day date window
    const expenseDate = new Date(expense.expense_date);
    const windowStart = new Date(expenseDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const windowEnd = new Date(expenseDate.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const { data: candidates } = await supabase
      .from('bank_transactions')
      .select('*')
      .eq('user_id', expense.user_id)
      .eq('transaction_type', 'debit')
      .is('matched_expense_id', null)
      .gte('transaction_date', windowStart)
      .lte('transaction_date', windowEnd)
      .gte('amount', expense.amount * 0.98)
      .lte('amount', expense.amount * 1.02);

    if (!candidates?.length) {
      return new Response(
        JSON.stringify({ success: true, match: null }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Score candidates — prefer merchant name similarity
    let bestMatch = candidates[0];
    let bestScore = 0.5;

    for (const tx of candidates) {
      let score = 0.5;
      if (tx.merchant_hint && expense.merchant_name) {
        const hint = tx.merchant_hint.toLowerCase();
        const merchant = expense.merchant_name.toLowerCase();
        if (hint.includes(merchant) || merchant.includes(hint)) score = 0.85;
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = tx;
      }
    }

    // Auto-match rules from CLAUDE.md:
    // > 0.7 → matched, 0.4–0.7 → suggested, < 0.4 → unmatched
    const matchStatus =
      bestScore > 0.7 ? 'matched' : bestScore >= 0.4 ? 'suggested' : 'unmatched';

    if (matchStatus !== 'unmatched') {
      // Resolve account_id from the matched transaction's bank_name + account_last4.
      // Look for an existing account row; if none, create one automatically.
      let accountId: string | null = null;

      if (bestMatch.bank_name) {
        const { data: existingAccount } = await supabase
          .from('accounts')
          .select('id')
          .eq('user_id', expense.user_id)
          .eq('bank_name', bestMatch.bank_name)
          .eq('last4', bestMatch.account_last4 ?? '')
          .maybeSingle();

        if (existingAccount) {
          accountId = existingAccount.id;
        } else {
          // Auto-create the account so future matches can find it
          const accountName = bestMatch.account_last4
            ? `${bestMatch.bank_name} ••${bestMatch.account_last4}`
            : bestMatch.bank_name;

          const { data: newAccount } = await supabase
            .from('accounts')
            .insert({
              user_id: expense.user_id,
              account_name: accountName,
              account_type: 'debit_card',
              bank_name: bestMatch.bank_name,
              last4: bestMatch.account_last4 ?? null,
              is_default: false,
            })
            .select('id')
            .single();

          if (newAccount) accountId = newAccount.id;
        }
      }

      await supabase
        .from('bank_transactions')
        .update({ matched_expense_id: expense_id })
        .eq('id', bestMatch.id);

      await supabase
        .from('expenses')
        .update({
          transaction_id: bestMatch.id,
          account_id: accountId,
          match_status: matchStatus,
          confidence_score: bestScore,
        })
        .eq('id', expense_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        match: matchStatus !== 'unmatched' ? { transaction_id: bestMatch.id, score: bestScore, status: matchStatus } : null,
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
