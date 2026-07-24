import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency, formatDateTime } from '@/lib/format'
import MatchTransactionPanel from './MatchTransactionPanel'
import UnmatchButton from './UnmatchButton'

export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: tx } = await supabase
    .from('bank_transactions').select('*').eq('id', id).eq('user_id', user.id).single()
  if (!tx) notFound()

  const { data: matchedExpense } = tx.matched_expense_id
    ? await supabase.from('expenses').select('*').eq('id', tx.matched_expense_id).single()
    : { data: null }

  const { data: unmatchedExpenses } = !tx.matched_expense_id
    ? await supabase
        .from('expenses')
        .select('id, merchant_name, amount, currency, expense_date, category, match_status')
        .eq('user_id', user.id)
        .in('match_status', ['unmatched', 'suggested'])
        .order('expense_date', { ascending: false })
        .limit(50)
    : { data: [] }

  const isDebit = tx.transaction_type === 'debit'

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/transactions" className="text-sm" style={{ color: '#877273' }}>← Transactions</Link>
      </div>

      {/* Hero */}
      <div className="bg-white rounded-2xl shadow-sm border p-6 mb-4" style={{ borderColor: '#E5E7EB' }}>
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-white text-lg"
              style={{ background: '#1A1A2E' }}>
              {tx.bank_name?.slice(0, 2).toUpperCase() ?? '??'}
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: '#1A1A2E' }}>{tx.bank_name}</h1>
              {tx.merchant_hint && <p className="text-sm" style={{ color: '#877273' }}>{tx.merchant_hint}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold" style={{ color: isDebit ? '#E94560' : '#00955F' }}>
              {isDebit ? '-' : '+'}{formatCurrency(tx.amount, tx.currency)}
            </p>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full capitalize"
              style={{
                background: isDebit ? '#FFF0F3' : '#F0FDF4',
                color: isDebit ? '#E94560' : '#00955F'
              }}>
              {tx.transaction_type}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl" style={{ background: '#F8F9FA' }}>
            <p className="text-xs mb-0.5" style={{ color: '#877273' }}>Date & Time</p>
            <p className="text-sm font-medium" style={{ color: '#1A1A2E' }}>{formatDateTime(tx.transaction_date)}</p>
          </div>
          <div className="p-3 rounded-xl" style={{ background: '#F8F9FA' }}>
            <p className="text-xs mb-0.5" style={{ color: '#877273' }}>Source</p>
            <p className="text-sm font-medium capitalize" style={{ color: '#1A1A2E' }}>{tx.source}</p>
          </div>
          {tx.account_last4 && (
            <div className="p-3 rounded-xl" style={{ background: '#F8F9FA' }}>
              <p className="text-xs mb-0.5" style={{ color: '#877273' }}>Account</p>
              <p className="text-sm font-medium" style={{ color: '#1A1A2E' }}>···{tx.account_last4}</p>
            </div>
          )}
          {tx.balance_after !== null && (
            <div className="p-3 rounded-xl" style={{ background: '#F8F9FA' }}>
              <p className="text-xs mb-0.5" style={{ color: '#877273' }}>Balance After</p>
              <p className="text-sm font-medium" style={{ color: '#1A1A2E' }}>{formatCurrency(tx.balance_after, tx.currency)}</p>
            </div>
          )}
          {tx.reference_number && (
            <div className="p-3 rounded-xl col-span-2" style={{ background: '#F8F9FA' }}>
              <p className="text-xs mb-0.5" style={{ color: '#877273' }}>Reference</p>
              <p className="text-sm font-mono" style={{ color: '#1A1A2E' }}>{tx.reference_number}</p>
            </div>
          )}
        </div>
      </div>

      {/* Matched expense */}
      {matchedExpense ? (
        <div className="bg-white rounded-2xl shadow-sm border p-5 mb-4" style={{ borderColor: '#E5E7EB' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold" style={{ color: '#1A1A2E' }}>Matched Expense</h2>
            <UnmatchButton transactionId={tx.id} expenseId={matchedExpense.id} />
          </div>
          <Link href={`/dashboard/expenses/${matchedExpense.id}`}
            className="flex items-center justify-between p-3 rounded-xl transition hover:bg-gray-50"
            style={{ background: '#F0FDF4' }}>
            <div>
              <p className="text-sm font-medium" style={{ color: '#1A1A2E' }}>{matchedExpense.merchant_name}</p>
              <p className="text-xs" style={{ color: '#877273' }}>{matchedExpense.category} · {matchedExpense.expense_date}</p>
            </div>
            <p className="text-sm font-bold" style={{ color: '#E94560' }}>
              {formatCurrency(matchedExpense.amount, matchedExpense.currency)}
            </p>
          </Link>
        </div>
      ) : isDebit && (
        <MatchTransactionPanel
          transactionId={tx.id}
          expenses={unmatchedExpenses ?? []}
        />
      )}

      {/* Raw message */}
      <div className="bg-white rounded-2xl shadow-sm border p-5" style={{ borderColor: '#E5E7EB' }}>
        <h2 className="text-sm font-semibold mb-2" style={{ color: '#1A1A2E' }}>Raw Message</h2>
        <p className="text-xs font-mono whitespace-pre-wrap p-3 rounded-xl" style={{ background: '#F8F9FA', color: '#877273' }}>
          {tx.raw_message}
        </p>
      </div>
    </div>
  )
}
