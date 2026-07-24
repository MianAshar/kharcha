import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency, formatDateTime, currentMonth, getMonthLabel } from '@/lib/format'

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; bank?: string }>
}) {
  const { month: monthParam, bank: bankParam } = await searchParams
  const month = monthParam ?? currentMonth()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [y, m] = month.split('-').map(Number)
  const start = new Date(y, m - 1, 1).toISOString()
  const end = new Date(y, m, 0, 23, 59, 59).toISOString()

  let query = supabase
    .from('bank_transactions')
    .select('*')
    .eq('user_id', user.id)
    .gte('transaction_date', start)
    .lte('transaction_date', end)
    .order('transaction_date', { ascending: false })

  if (bankParam) query = query.eq('bank_name', bankParam)

  const { data: transactions } = await query
  const list = transactions ?? []

  // Get unique banks for filter
  const { data: allTx } = await supabase
    .from('bank_transactions')
    .select('bank_name')
    .eq('user_id', user.id)
  const banks = [...new Set((allTx ?? []).map(t => t.bank_name).filter(Boolean))]

  const totalDebit = list.filter(t => t.transaction_type === 'debit').reduce((s, t) => s + t.amount, 0)
  const totalCredit = list.filter(t => t.transaction_type === 'credit').reduce((s, t) => s + t.amount, 0)

  // Month navigation
  const prevMonth = new Date(y, m - 2, 1)
  const nextMonth = new Date(y, m, 1)
  const nowDate = new Date()
  const isCurrentMonth = y === nowDate.getFullYear() && m === nowDate.getMonth() + 1

  function monthStr(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#1A1A2E' }}>Transactions</h1>
        <div className="flex items-center gap-2">
          <Link href={`/dashboard/transactions?month=${monthStr(prevMonth)}${bankParam ? `&bank=${bankParam}` : ''}`}
            className="px-3 py-1.5 rounded-lg border text-sm transition hover:bg-gray-50"
            style={{ borderColor: '#E5E7EB', color: '#1A1A2E' }}>←</Link>
          <span className="text-sm font-medium px-3" style={{ color: '#1A1A2E' }}>{getMonthLabel(month)}</span>
          {!isCurrentMonth && (
            <Link href={`/dashboard/transactions?month=${monthStr(nextMonth)}${bankParam ? `&bank=${bankParam}` : ''}`}
              className="px-3 py-1.5 rounded-lg border text-sm transition hover:bg-gray-50"
              style={{ borderColor: '#E5E7EB', color: '#1A1A2E' }}>→</Link>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-4 border shadow-sm" style={{ borderColor: '#E5E7EB' }}>
          <p className="text-xs mb-1" style={{ color: '#877273' }}>TOTAL DEBITS</p>
          <p className="text-xl font-bold" style={{ color: '#E94560' }}>{formatCurrency(totalDebit)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border shadow-sm" style={{ borderColor: '#E5E7EB' }}>
          <p className="text-xs mb-1" style={{ color: '#877273' }}>TOTAL CREDITS</p>
          <p className="text-xl font-bold" style={{ color: '#00955F' }}>{formatCurrency(totalCredit)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border shadow-sm" style={{ borderColor: '#E5E7EB' }}>
          <p className="text-xs mb-1" style={{ color: '#877273' }}>TRANSACTIONS</p>
          <p className="text-xl font-bold" style={{ color: '#1A1A2E' }}>{list.length}</p>
        </div>
      </div>

      {/* Bank filter */}
      {banks.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
          <Link href={`/dashboard/transactions?month=${month}`}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition"
            style={{
              background: !bankParam ? '#E94560' : '#fff',
              color: !bankParam ? '#fff' : '#1A1A2E',
              borderColor: !bankParam ? '#E94560' : '#E5E7EB',
            }}>All Banks</Link>
          {banks.map(bank => (
            <Link key={bank} href={`/dashboard/transactions?month=${month}&bank=${bank}`}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition"
              style={{
                background: bankParam === bank ? '#1A1A2E' : '#fff',
                color: bankParam === bank ? '#fff' : '#1A1A2E',
                borderColor: bankParam === bank ? '#1A1A2E' : '#E5E7EB',
              }}>{bank}</Link>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <div className="bg-white rounded-2xl border p-16 text-center shadow-sm" style={{ borderColor: '#E5E7EB' }}>
          <p className="text-4xl mb-3">🏦</p>
          <p className="font-medium mb-1" style={{ color: '#1A1A2E' }}>No transactions found</p>
          <p className="text-sm" style={{ color: '#877273' }}>
            Connect your email in Settings to auto-capture bank alerts
          </p>
          <Link href="/dashboard/settings" className="inline-block mt-3 text-sm font-medium" style={{ color: '#E94560' }}>
            Connect Email
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden" style={{ borderColor: '#E5E7EB' }}>
          {list.map((tx, i) => {
            const isDebit = tx.transaction_type === 'debit'
            const isMatched = !!tx.matched_expense_id
            return (
              <Link key={tx.id} href={`/dashboard/transactions/${tx.id}`}
                className={`flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors ${i > 0 ? 'border-t' : ''}`}
                style={{ borderColor: '#F8F9FA' }}>
                {/* Bank initials */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
                  style={{ background: '#1A1A2E' }}>
                  {tx.bank_name?.slice(0, 2).toUpperCase() ?? '??'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: '#1A1A2E' }}>
                    {tx.merchant_hint ?? tx.bank_name}
                    {tx.account_last4 && <span className="text-xs ml-1.5" style={{ color: '#877273' }}>···{tx.account_last4}</span>}
                  </p>
                  <p className="text-xs" style={{ color: '#877273' }}>
                    {formatDateTime(tx.transaction_date)}
                    {' · '}
                    <span className="capitalize">{tx.source}</span>
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold" style={{ color: isDebit ? '#E94560' : '#00955F' }}>
                    {isDebit ? '-' : '+'}{formatCurrency(tx.amount, tx.currency)}
                  </p>
                  <span className="text-xs" style={{ color: isMatched ? '#00955F' : '#877273' }}>
                    {isMatched ? '✓ matched' : 'unmatched'}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
