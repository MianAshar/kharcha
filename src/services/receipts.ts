import { supabase } from './supabase';
import type { Receipt, AIReceiptResult } from '../types';

export async function uploadReceipt(
  userId: string,
  imageUri: string
): Promise<Receipt> {
  console.log('[uploadReceipt] starting — uri:', imageUri);

  // ArrayBuffer is more reliable than Blob for local file:// URIs in React Native
  const response = await fetch(imageUri);
  const arrayBuffer = await response.arrayBuffer();
  console.log('[uploadReceipt] arrayBuffer byteLength:', arrayBuffer.byteLength);

  if (arrayBuffer.byteLength === 0) {
    throw new Error('Image data is empty (0 bytes) — the file URI may be invalid or inaccessible.');
  }

  const filename = `${userId}/${Date.now()}.jpg`;
  console.log('[uploadReceipt] uploading to path:', filename);

  // Race upload against a 30-second timeout so we never hang forever
  const { data: uploadData, error: uploadError } = await Promise.race([
    supabase.storage
      .from('receipts')
      .upload(filename, arrayBuffer, { contentType: 'image/jpeg' }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('Storage upload timed out after 30 s. Check that the "receipts" bucket exists in Supabase Storage.')),
        30_000
      )
    ),
  ]);

  console.log('[uploadReceipt] upload data:', JSON.stringify(uploadData));
  console.log('[uploadReceipt] upload error:', JSON.stringify(uploadError));

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from('receipts')
    .getPublicUrl(filename);

  console.log('[uploadReceipt] public url:', urlData.publicUrl);

  // Create receipt record in DB
  const { data, error } = await supabase
    .from('receipts')
    .insert({
      user_id: userId,
      image_url: urlData.publicUrl,
      status: 'pending',
    })
    .select()
    .single();

  console.log('[uploadReceipt] receipt insert error:', JSON.stringify(error));

  if (error) throw error;
  return data;
}

export async function processReceipt(receiptId: string): Promise<AIReceiptResult> {
  console.log('[processReceipt] invoking edge function for receipt:', receiptId);

  // 5-second timeout — function may not be deployed yet and will hang otherwise
  const { data, error } = await Promise.race([
    supabase.functions.invoke('process-receipt', { body: { receipt_id: receiptId } }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Edge Function timed out after 60 s')), 60_000)
    ),
  ]);

  console.log('[processReceipt] result data:', JSON.stringify(data));

  if (error) {
    // The generic error message is just "Edge Function returned a non-2xx status code".
    // Extract the actual error body from the function's JSON response.
    let detail = error.message;
    try {
      const body = await (error as any).context?.json?.();
      console.log('[processReceipt] edge function error body:', JSON.stringify(body));
      if (body?.error) detail = body.error;
    } catch (bodyErr) {
      console.log('[processReceipt] could not read error body:', bodyErr);
    }
    throw new Error(`Edge Function error: ${detail}`);
  }

  // Edge Function returns { success: true, expense_id, result: AIReceiptResult }
  const result = (data as { result: AIReceiptResult } | null)?.result;
  if (!result) {
    console.log('[processReceipt] unexpected response shape:', JSON.stringify(data));
    throw new Error('No AI result returned from Edge Function');
  }
  return result;
}

export async function getReceipt(id: string): Promise<Receipt | null> {
  const { data, error } = await supabase
    .from('receipts')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}
