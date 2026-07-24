'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function UnmatchButton({
  transactionId,
  expenseId,
}: {
  transactionId: string
  expenseId: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handleUnmatch() {
    if (!confirm('Remove this match?')) return
    setLoading(true)
    await supabase.from('bank_transactions').update({ matched_expense_id: null }).eq('id', transactionId)
    await supabase.from('expenses').update({ transaction_id: null, match_status: 'unmatched' }).eq('id', expenseId)
    router.refresh()
  }

  return (
    <button onClick={handleUnmatch} disabled={loading}
      className="text-xs px-3 py-1.5 rounded-lg border transition hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-50"
      style={{ borderColor: '#E5E7EB', color: '#877273' }}>
      {loading ? '…' : 'Unmatch'}
    </button>
  )
}
