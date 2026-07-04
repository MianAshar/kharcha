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

  console.log('[process-receipt] function invoked');

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { receipt_id } = await req.json();
    console.log('[process-receipt] receipt_id:', receipt_id);

    if (!receipt_id) {
      return new Response(
        JSON.stringify({ error: 'receipt_id is required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch receipt
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .select('*')
      .eq('id', receipt_id)
      .single();

    if (receiptError || !receipt) {
      console.error('[process-receipt] receipt fetch error:', receiptError);
      throw new Error('Receipt not found');
    }

    console.log('[process-receipt] receipt fetched, image_url:', receipt.image_url);

    // Extract the storage path from the full public URL.
    // image_url looks like: https://.../storage/v1/object/public/receipts/<path>
    const pathMarker = '/object/public/receipts/';
    const markerIdx = receipt.image_url.indexOf(pathMarker);
    if (markerIdx === -1) {
      throw new Error(`Cannot extract storage path from image_url: ${receipt.image_url}`);
    }
    const storagePath = receipt.image_url.slice(markerIdx + pathMarker.length);
    console.log('[process-receipt] storage path:', storagePath);

    // Generate a signed URL valid for 10 minutes (600 s).
    // This works even when the bucket is private.
    const { data: signedData, error: signedError } = await supabase.storage
      .from('receipts')
      .createSignedUrl(storagePath, 600);

    if (signedError || !signedData?.signedUrl) {
      console.error('[process-receipt] signed URL error:', signedError);
      throw new Error(`Failed to create signed URL: ${signedError?.message}`);
    }
    console.log('[process-receipt] signed URL created (not logged for security)');

    // Mark as processing
    await supabase
      .from('receipts')
      .update({ status: 'pending' })
      .eq('id', receipt_id);

    // Inject today's date so the model can apply recency-based date disambiguation
    const todayISO = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Call OpenAI Vision API
    console.log('[process-receipt] calling OpenAI Vision API...');
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Today's date is ${todayISO}. Use this to validate that parsed dates are recent.

Extract expense data from this receipt image. Return ONLY valid JSON with these fields:
{
  "merchant_name": "string",
  "category": "one of: food, transport, groceries, shopping, utilities, health, entertainment, education, fuel, rent, mobile, travel, clothing, coffee, other",
  "amount": number,
  "currency": "string (default PKR)",
  "expense_date": "YYYY-MM-DD",
  "expense_time": "HH:MM or null",
  "payment_method": "cash | card | bank_transfer | mobile_wallet",
  "items": [{"name": "string", "qty": number, "unit_price": number, "total": number}],
  "tax_amount": number | null,
  "tip_amount": number | null,
  "confidence_score": number between 0 and 1
}

DATE PARSING RULES — follow these strictly:
1. Try parsing the receipt date in BOTH DD/MM/YYYY and MM/DD/YYYY formats.
2. RECENCY RULE: Receipts are almost always from the last 7 days. Pick whichever interpretation is closest to today (${todayISO}) and falls within the last 30 days. If one interpretation gives a future date or a date years in the past, the other interpretation is correct.
3. Two-digit years: "26" means 2026, "25" means 2025. Always expand as 20XX.
4. If both interpretations are within 30 days, prefer DD/MM/YYYY as it is the more common international format.
5. If the date is completely unreadable even after applying these rules, default to today's date (${todayISO}) and set confidence_score below 0.5.

TIME EXTRACTION RULES:
1. Look for a printed time anywhere on the receipt — near the date, at the top/bottom, or in a transaction block.
2. Convert to 24-hour HH:MM format (e.g. "3:27 PM" → "15:27", "11:05 AM" → "11:05").
3. If no time is visible on the receipt, return null — do NOT guess or fabricate a time.`,
              },
              {
                type: 'image_url',
                image_url: { url: signedData.signedUrl, detail: 'high' },
              },
            ],
          },
        ],
      }),
    });

    console.log('[process-receipt] OpenAI response status:', openaiRes.status, openaiRes.statusText);

    const openaiData = await openaiRes.json();

    if (!openaiRes.ok) {
      console.error('[process-receipt] OpenAI error body:', JSON.stringify(openaiData));
      throw new Error(`OpenAI API error ${openaiRes.status}: ${openaiData?.error?.message ?? openaiRes.statusText}`);
    }

    const content = openaiData.choices?.[0]?.message?.content ?? '';
    console.log('[process-receipt] OpenAI raw content:', content);

    let parsed = null;
    // OpenAI sometimes wraps JSON in markdown code fences; try multiple strategies
    const strategies: (() => unknown)[] = [
      // 1. Bare JSON
      () => JSON.parse(content.trim()),
      // 2. ```json ... ``` or ``` ... ```
      () => {
        const m = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (!m) throw new Error('no code block');
        return JSON.parse(m[1].trim());
      },
      // 3. First {...} block (greedy)
      () => {
        const m = content.match(/\{[\s\S]*\}/);
        if (!m) throw new Error('no json object');
        return JSON.parse(m[0]);
      },
    ];
    for (const strategy of strategies) {
      try { parsed = strategy(); break; }
      catch { /* try next */ }
    }
    if (!parsed) console.error('[process-receipt] all parse strategies failed, raw content:', content);

    if (!parsed) {
      console.error('[process-receipt] could not parse AI response, raw content:', content);
      await supabase
        .from('receipts')
        .update({ status: 'failed', raw_ai_response: { raw: content } })
        .eq('id', receipt_id);
      throw new Error('Failed to parse AI response');
    }

    console.log('[process-receipt] parsed result:', JSON.stringify(parsed));

    // Update receipt record — expense row is created later by ReviewExpenseScreen
    await supabase
      .from('receipts')
      .update({
        status: 'processed',
        raw_ai_response: parsed,
        processed_at: new Date().toISOString(),
      })
      .eq('id', receipt_id);

    return new Response(
      JSON.stringify({ success: true, result: parsed }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[process-receipt] unhandled error:', (err as Error).message, (err as Error).stack);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
