'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function DeleteExpenseButton({
  expenseId,
  transactionId,
}: {
  expenseId: string
  transactionId: string | null
}) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (!confirm('Delete this expense? This cannot be undone.')) return
    setLoading(true)

    // Unmatch transaction if linked
    if (transactionId) {
      await supabase
        .from('bank_transactions')
        .update({ matched_expense_id: null })
        .eq('id', transactionId)
    }

    await supabase.from('expenses').delete().eq('id', expenseId)
    router.push('/dashboard/expenses')
    router.refresh()
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="px-5 py-2.5 rounded-xl border text-sm font-medium transition hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-50"
      style={{ borderColor: '#E5E7EB', color: '#877273' }}
    >
      {loading ? 'Deleting…' : '🗑 Delete Expense'}
    </button>
  )
}
