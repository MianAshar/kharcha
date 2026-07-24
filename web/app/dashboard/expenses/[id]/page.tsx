import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency, formatDate, formatTimeShort } from '@/lib/format'
import { CATEGORY_MAP } from '@/lib/constants'
import DeleteExpenseButton from './DeleteExpenseButton'

export default async function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: expense } = await supabase.from('expenses').select('*').eq('id', id).eq('user_id', user.id).single()
  if (!expense) notFound()

  const { data: receipt } = expense.receipt_id
    ? await supabase.from('receipts').select('image_url').eq('id', expense.receipt_id).single()
    : { data: null }

  const { data: transaction } = expense.transaction_id
    ? await supabase.from('bank_transactions').select('*').eq('id', expense.transaction_id).single()
    : { data: null }

  const cat = CATEGORY_MAP[expense.category]

  const matchLabel = expense.match_status === 'matched' || expense.match_status === 'manual'
    ? { text: '✓ Matched', color: '#00955F', bg: '#F0FDF4' }
    : expense.match_status === 'suggested'
    ? { text: '~ Suggested', color: '#F59E0B', bg: '#FFFBEB' }
    : expense.match_status === 'cash_only'
    ? { text: '💵 Cash Only', color: '#877273', bg: '#F8F9FA' }
    : { text: 'Unmatched', color: '#877273', bg: '#F8F9FA' }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/expenses" className="text-sm" style={{ color: '#877273' }}>← Expenses</Link>
      </div>

      {/* Hero card */}
      <div className="bg-white rounded-2xl shadow-sm border p-6 mb-4" style={{ borderColor: '#E5E7EB' }}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
              style={{ background: (cat?.color ?? '#E94560') + '22' }}>
              {cat?.icon ?? '📦'}
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: '#1A1A2E' }}>{expense.merchant_name}</h1>
              <p className="text-sm" style={{ color: '#877273' }}>{cat?.name ?? expense.category}</p>
            </div>
          </div>
          <p className="text-2xl font-bold" style={{ color: '#E94560' }}>
            {formatCurrency(expense.amount, expense.currency)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl" style={{ background: '#F8F9FA' }}>
            <p className="text-xs mb-0.5" style={{ color: '#877273' }}>Date</p>
            <p className="text-sm font-medium" style={{ color: '#1A1A2E' }}>
              {formatDate(expense.expense_date)}
              {expense.expense_time && ` · ${formatTimeShort(expense.expense_time)}`}
            </p>
          </div>
          <div className="p-3 rounded-xl" style={{ background: '#F8F9FA' }}>
            <p className="text-xs mb-0.5" style={{ color: '#877273' }}>Payment</p>
            <p className="text-sm font-medium capitalize" style={{ color: '#1A1A2E' }}>
              {expense.payment_method.replace('_', ' ')}
            </p>
          </div>
          <div className="p-3 rounded-xl" style={{ background: matchLabel.bg }}>
            <p className="text-xs mb-0.5" style={{ color: '#877273' }}>Match Status</p>
            <p className="text-sm font-medium" style={{ color: matchLabel.color }}>{matchLabel.text}</p>
          </div>
          <div className="p-3 rounded-xl" style={{ background: '#F8F9FA' }}>
            <p className="text-xs mb-0.5" style={{ color: '#877273' }}>AI Confidence</p>
            <p className="text-sm font-medium" style={{ color: '#1A1A2E' }}>
              {expense.confidence_score > 0 ? `${(expense.confidence_score * 100).toFixed(0)}%` : 'Manual'}
            </p>
          </div>
        </div>
      </div>

      {/* Receipt image */}
      {receipt?.image_url && (
        <div className="bg-white rounded-2xl shadow-sm border p-5 mb-4" style={{ borderColor: '#E5E7EB' }}>
          <h2 className="text-sm font-semibold mb-3" style={{ color: '#1A1A2E' }}>Receipt</h2>
          <img src={receipt.image_url} alt="Receipt" className="w-full rounded-xl object-contain max-h-80" />
        </div>
      )}

      {/* Line items */}
      {expense.items && expense.items.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border p-5 mb-4" style={{ borderColor: '#E5E7EB' }}>
          <h2 className="text-sm font-semibold mb-3" style={{ color: '#1A1A2E' }}>Line Items</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs" style={{ color: '#877273' }}>
                <th className="text-left pb-2 font-medium">Item</th>
                <th className="text-right pb-2 font-medium">Qty</th>
                <th className="text-right pb-2 font-medium">Price</th>
                <th className="text-right pb-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: '#F8F9FA' }}>
              {expense.items.map((item: { name: string; qty: number; unit_price: number; total: number }, i: number) => (
                <tr key={i}>
                  <td className="py-2" style={{ color: '#1A1A2E' }}>{item.name}</td>
                  <td className="py-2 text-right" style={{ color: '#877273' }}>{item.qty}</td>
                  <td className="py-2 text-right" style={{ color: '#877273' }}>PKR {item.unit_price.toLocaleString()}</td>
                  <td className="py-2 text-right font-medium" style={{ color: '#1A1A2E' }}>PKR {item.total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(expense.tax_amount || expense.tip_amount) && (
            <div className="mt-3 pt-3 border-t space-y-1" style={{ borderColor: '#E5E7EB' }}>
              {expense.tax_amount && (
                <div className="flex justify-between text-xs" style={{ color: '#877273' }}>
                  <span>Tax</span><span>PKR {expense.tax_amount.toLocaleString()}</span>
                </div>
              )}
              {expense.tip_amount && (
                <div className="flex justify-between text-xs" style={{ color: '#877273' }}>
                  <span>Tip</span><span>PKR {expense.tip_amount.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Matched transaction */}
      {transaction && (
        <div className="bg-white rounded-2xl shadow-sm border p-5 mb-4" style={{ borderColor: '#E5E7EB' }}>
          <h2 className="text-sm font-semibold mb-3" style={{ color: '#1A1A2E' }}>Matched Transaction</h2>
          <Link href={`/dashboard/transactions/${transaction.id}`}
            className="flex items-center justify-between p-3 rounded-xl transition hover:bg-gray-50"
            style={{ background: '#F8F9FA' }}>
            <div>
              <p className="text-sm font-medium" style={{ color: '#1A1A2E' }}>{transaction.bank_name}</p>
              <p className="text-xs" style={{ color: '#877273' }}>{transaction.merchant_hint ?? 'Bank transaction'}</p>
            </div>
            <p className="text-sm font-bold" style={{ color: '#E94560' }}>
              {formatCurrency(transaction.amount, transaction.currency)}
            </p>
          </Link>
        </div>
      )}

      {/* Notes */}
      {expense.notes && (
        <div className="bg-white rounded-2xl shadow-sm border p-5 mb-4" style={{ borderColor: '#E5E7EB' }}>
          <h2 className="text-sm font-semibold mb-2" style={{ color: '#1A1A2E' }}>Notes</h2>
          <p className="text-sm" style={{ color: '#877273' }}>{expense.notes}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 mt-2">
        <DeleteExpenseButton expenseId={expense.id} transactionId={expense.transaction_id} />
      </div>
    </div>
  )
}
