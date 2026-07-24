import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency, formatDateShort, getInitials, currentMonth, getMonthLabel } from '@/lib/format'
import { CATEGORY_MAP } from '@/lib/constants'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const month = currentMonth()
  const [year, mon] = month.split('-').map(Number)
  const start = new Date(year, mon - 1, 1).toISOString().split('T')[0]
  const end = new Date(year, mon, 0).toISOString().split('T')[0]

  const [profileRes, expensesRes, transactionsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('expenses').select('*').eq('user_id', user.id)
      .gte('expense_date', start).lte('expense_date', end)
      .order('expense_date', { ascending: false }),
    supabase.from('bank_transactions').select('id').eq('user_id', user.id)
      .gte('transaction_date', new Date(year, mon - 1, 1).toISOString())
      .lte('transaction_date', new Date(year, mon, 0, 23, 59, 59).toISOString()),
  ])

  const profile = profileRes.data
  const expenses = expensesRes.data ?? []
  const txCount = transactionsRes.data?.length ?? 0
  const currency = profile?.currency ?? 'PKR'

  const monthlyTotal = expenses.reduce((sum, e) => sum + e.amount, 0)
  const budget = profile?.monthly_budget ?? 0
  const budgetPct = budget > 0 ? Math.min((monthlyTotal / budget) * 100, 100) : 0
  const recent = expenses.slice(0, 8)

  const daysInMonth = new Date(year, mon, 0).getDate()
  const today = new Date().getDate()
  const dailyAvg = today > 0 ? monthlyTotal / today : 0

  // Category breakdown
  const byCategory: Record<string, number> = {}
  for (const e of expenses) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount
  }
  const topCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1A1A2E' }}>
            Hello, {profile?.full_name?.split(' ')[0] ?? 'there'} 👋
          </h1>
          <p className="text-sm mt-0.5" style={{ color: '#877273' }}>{getMonthLabel(month)}</p>
        </div>
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: '#E94560' }}>
          {getInitials(profile?.full_name)}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-5 shadow-sm border" style={{ borderColor: '#E5E7EB' }}>
          <p className="text-xs font-medium mb-1" style={{ color: '#877273' }}>MONTHLY SPEND</p>
          <p className="text-2xl font-bold" style={{ color: '#E94560' }}>{formatCurrency(monthlyTotal, currency)}</p>
          {budget > 0 && (
            <p className="text-xs mt-1" style={{ color: '#877273' }}>of {formatCurrency(budget, currency)} budget</p>
          )}
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border" style={{ borderColor: '#E5E7EB' }}>
          <p className="text-xs font-medium mb-1" style={{ color: '#877273' }}>DAILY AVERAGE</p>
          <p className="text-2xl font-bold" style={{ color: '#1A1A2E' }}>{formatCurrency(dailyAvg, currency)}</p>
          <p className="text-xs mt-1" style={{ color: '#877273' }}>{expenses.length} expense{expenses.length !== 1 ? 's' : ''} this month</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border" style={{ borderColor: '#E5E7EB' }}>
          <p className="text-xs font-medium mb-1" style={{ color: '#877273' }}>TRANSACTIONS</p>
          <p className="text-2xl font-bold" style={{ color: '#1A1A2E' }}>{txCount}</p>
          <p className="text-xs mt-1" style={{ color: '#877273' }}>from email this month</p>
        </div>
      </div>

      {/* Budget bar */}
      {budget > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border mb-6" style={{ borderColor: '#E5E7EB' }}>
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-medium" style={{ color: '#1A1A2E' }}>Budget Progress</span>
            <span className="text-sm font-semibold" style={{ color: budgetPct >= 90 ? '#E94560' : '#00955F' }}>
              {budgetPct.toFixed(0)}%
            </span>
          </div>
          <div className="h-2 rounded-full" style={{ background: '#F8F9FA' }}>
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: `${budgetPct}%`,
                background: budgetPct >= 90 ? '#E94560' : budgetPct >= 70 ? '#F59E0B' : '#00955F',
              }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-xs" style={{ color: '#877273' }}>Spent: {formatCurrency(monthlyTotal, currency)}</span>
            <span className="text-xs" style={{ color: '#877273' }}>Left: {formatCurrency(Math.max(budget - monthlyTotal, 0), currency)}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Recent expenses */}
        <div className="col-span-2 bg-white rounded-2xl shadow-sm border" style={{ borderColor: '#E5E7EB' }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#E5E7EB' }}>
            <h2 className="font-semibold text-sm" style={{ color: '#1A1A2E' }}>Recent Expenses</h2>
            <Link href="/dashboard/expenses" className="text-xs font-medium" style={{ color: '#E94560' }}>View all</Link>
          </div>
          {recent.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-3xl mb-2">🧾</p>
              <p className="text-sm" style={{ color: '#877273' }}>No expenses this month</p>
              <Link href="/dashboard/expenses/new" className="inline-block mt-3 text-sm font-medium" style={{ color: '#E94560' }}>
                Scan a receipt
              </Link>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: '#F8F9FA' }}>
              {recent.map(exp => {
                const cat = CATEGORY_MAP[exp.category]
                return (
                  <Link key={exp.id} href={`/dashboard/expenses/${exp.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                      style={{ background: cat ? cat.color + '22' : '#F8F9FA' }}>
                      {cat?.icon ?? '📦'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: '#1A1A2E' }}>{exp.merchant_name}</p>
                      <p className="text-xs" style={{ color: '#877273' }}>{formatDateShort(exp.expense_date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold" style={{ color: '#E94560' }}>
                        {formatCurrency(exp.amount, exp.currency)}
                      </p>
                      {exp.match_status === 'matched' || exp.match_status === 'manual' ? (
                        <span className="text-xs" style={{ color: '#00955F' }}>matched</span>
                      ) : null}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Top categories + quick actions */}
        <div className="space-y-4">
          {topCategories.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border p-5" style={{ borderColor: '#E5E7EB' }}>
              <h2 className="font-semibold text-sm mb-4" style={{ color: '#1A1A2E' }}>Top Categories</h2>
              <div className="space-y-3">
                {topCategories.map(([catId, total]) => {
                  const cat = CATEGORY_MAP[catId]
                  const pct = monthlyTotal > 0 ? (total / monthlyTotal) * 100 : 0
                  return (
                    <div key={catId}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium" style={{ color: '#1A1A2E' }}>
                          {cat?.icon} {cat?.name ?? catId}
                        </span>
                        <span className="text-xs" style={{ color: '#877273' }}>{formatCurrency(total, currency)}</span>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ background: '#F8F9FA' }}>
                        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: cat?.color ?? '#E94560' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div className="bg-white rounded-2xl shadow-sm border p-5" style={{ borderColor: '#E5E7EB' }}>
            <h2 className="font-semibold text-sm mb-4" style={{ color: '#1A1A2E' }}>Quick Actions</h2>
            <div className="space-y-2">
              <Link href="/dashboard/expenses/new"
                className="flex items-center gap-3 p-3 rounded-xl transition-colors hover:opacity-90 text-white text-sm font-medium"
                style={{ background: '#E94560' }}>
                <span>📷</span> Scan Receipt
              </Link>
              <Link href="/dashboard/transactions"
                className="flex items-center gap-3 p-3 rounded-xl border text-sm font-medium transition-colors hover:bg-gray-50"
                style={{ borderColor: '#E5E7EB', color: '#1A1A2E' }}>
                <span>🏦</span> View Transactions
              </Link>
              <Link href="/dashboard/settings"
                className="flex items-center gap-3 p-3 rounded-xl border text-sm font-medium transition-colors hover:bg-gray-50"
                style={{ borderColor: '#E5E7EB', color: '#1A1A2E' }}>
                <span>📧</span> Connect Email
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
