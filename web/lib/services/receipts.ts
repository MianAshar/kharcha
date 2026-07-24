import { createClient } from '@/lib/supabase/client'
import type { AIReceiptResult } from '@/types'

const supabase = createClient()

export async function uploadAndProcessReceipt(
  userId: string,
  file: File
): Promise<{ receiptId: string; aiResult: AIReceiptResult | null }> {
  // Upload to Supabase Storage
  const timestamp = Date.now()
  const path = `receipts/${userId}/${timestamp}.jpg`

  const { error: uploadError } = await supabase.storage
    .from('receipts')
    .upload(path, file, { contentType: 'image/jpeg', upsert: false })

  if (uploadError) throw uploadError

  const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(path)

  // Insert receipt record
  const { data: receipt, error: insertError } = await supabase
    .from('receipts')
    .insert({ user_id: userId, image_url: publicUrl, status: 'pending' })
    .select()
    .single()

  if (insertError) throw insertError

  // Invoke process-receipt edge function
  try {
    const { data, error } = await supabase.functions.invoke('process-receipt', {
      body: { receipt_id: receipt.id },
    })
    if (error) throw error
    return { receiptId: receipt.id, aiResult: data?.result ?? null }
  } catch {
    return { receiptId: receipt.id, aiResult: null }
  }
}
