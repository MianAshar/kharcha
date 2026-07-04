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

    const { user_id, from_date, to_date, format = 'csv' } = await req.json();
    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'user_id is required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    let query = supabase
      .from('expenses')
      .select('*')
      .eq('user_id', user_id)
      .order('expense_date', { ascending: false });

    if (from_date) query = query.gte('expense_date', from_date);
    if (to_date) query = query.lte('expense_date', to_date);

    const { data: expenses, error } = await query;
    if (error) throw error;

    if (format === 'csv') {
      const headers = [
        'Date', 'Merchant', 'Category', 'Amount', 'Currency',
        'Payment Method', 'Match Status', 'Notes',
      ];

      const rows = (expenses ?? []).map((e) => [
        e.expense_date,
        `"${(e.merchant_name ?? '').replace(/"/g, '""')}"`,
        e.category,
        e.amount,
        e.currency,
        e.payment_method,
        e.match_status,
        `"${(e.notes ?? '').replace(/"/g, '""')}"`,
      ]);

      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

      return new Response(csv, {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="kharcha-expenses.csv"',
        },
      });
    }

    // JSON format
    return new Response(JSON.stringify({ success: true, data: expenses }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
