'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDateShort } from '@/lib/format'
import { CATEGORY_MAP } from '@/lib/constants'

interface Expense {
  id: string
  merchant_name: string
  amount: number
  currency: string
  expense_date: string
  category: string
  match_status: string
}

export default function MatchTransactionPanel({
  transactionId,
  expenses,
}: {
  transactionId: string
  expenses: Expense[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)

  async function handleMatch(expenseId: string) {
    setLoading(expenseId)
    await supabase.from('bank_transactions').update({ matched_expense_id: expenseId }).eq('id', transactionId)
    await supabase.from('expenses').update({ transaction_id: transactionId, match_status: 'manual' }).eq('id', expenseId)
    router.refresh()
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border p-5 mb-4" style={{ borderColor: '#E5E7EB' }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold" style={{ color: '#1A1A2E' }}>Link to Expense</h2>
        <button onClick={() => setOpen(!open)}
          className="text-xs font-medium px-3 py-1.5 rounded-lg transition"
          style={{ background: open ? '#F8F9FA' : '#E94560', color: open ? '#877273' : '#fff' }}>
          {open ? 'Cancel' : 'Match Expense'}
        </button>
      </div>

      {!open && (
        <p className="text-xs" style={{ color: '#877273' }}>
          No expense matched yet. Click &quot;Match Expense&quot; to manually link one.
        </p>
      )}

      {open && (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {expenses.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: '#877273' }}>No unmatched expenses found</p>
          ) : expenses.map(exp => {
            const cat = CATEGORY_MAP[exp.category]
            return (
              <button key={exp.id} onClick={() => handleMatch(exp.id)} disabled={loading === exp.id}
                className="w-full flex items-center gap-3 p-3 rounded-xl border text-left transition hover:border-[#E94560] hover:bg-red-50 disabled:opacity-50"
                style={{ borderColor: '#E5E7EB' }}>
                <span className="text-lg">{cat?.icon ?? '📦'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: '#1A1A2E' }}>{exp.merchant_name}</p>
                  <p className="text-xs" style={{ color: '#877273' }}>{formatDateShort(exp.expense_date)}</p>
                </div>
                <p className="text-sm font-bold flex-shrink-0" style={{ color: '#E94560' }}>
                  {loading === exp.id ? '…' : formatCurrency(exp.amount, exp.currency)}
                </p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
