import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency, formatDateShort } from '@/lib/format'
import { CATEGORY_MAP, DEFAULT_CATEGORIES } from '@/lib/constants'

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; month?: string }>
}) {
  const { category, month } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let query = supabase
    .from('expenses')
    .select('*')
    .eq('user_id', user.id)
    .order('expense_date', { ascending: false })

  if (category) query = query.eq('category', category)

  if (month) {
    const [y, m] = month.split('-').map(Number)
    const start = new Date(y, m - 1, 1).toISOString().split('T')[0]
    const end = new Date(y, m, 0).toISOString().split('T')[0]
    query = query.gte('expense_date', start).lte('expense_date', end)
  }

  const { data: expenses } = await query
  const list = expenses ?? []
  const total = list.reduce((s, e) => s + e.amount, 0)

  // Group by expense_date
  const groups: { dateKey: string; label: string; items: typeof list }[] = []
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  for (const exp of list) {
    const key = exp.expense_date
    let label = key === today ? 'Today' : key === yesterday ? 'Yesterday'
      : new Date(key).toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long' })
    const last = groups[groups.length - 1]
    if (last && last.dateKey === key) last.items.push(exp)
    else groups.push({ dateKey: key, label, items: [exp] })
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1A1A2E' }}>Expenses</h1>
          <p className="text-sm mt-0.5" style={{ color: '#877273' }}>
            {list.length} expense{list.length !== 1 ? 's' : ''} · {formatCurrency(total)}
          </p>
        </div>
        <Link href="/dashboard/expenses/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition hover:opacity-90"
          style={{ background: '#E94560' }}>
          <span>+</span> Add Expense
        </Link>
      </div>

      {/* Category filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
        <Link
          href="/dashboard/expenses"
          className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition"
          style={{
            background: !category ? '#E94560' : '#fff',
            color: !category ? '#fff' : '#1A1A2E',
            borderColor: !category ? '#E94560' : '#E5E7EB',
          }}>
          All
        </Link>
        {DEFAULT_CATEGORIES.map(cat => (
          <Link
            key={cat.id}
            href={`/dashboard/expenses?category=${cat.id}${month ? `&month=${month}` : ''}`}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition"
            style={{
              background: category === cat.id ? cat.color : '#fff',
              color: category === cat.id ? '#fff' : '#1A1A2E',
              borderColor: category === cat.id ? cat.color : '#E5E7EB',
            }}>
            {cat.icon} {cat.name}
          </Link>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="bg-white rounded-2xl border p-16 text-center shadow-sm" style={{ borderColor: '#E5E7EB' }}>
          <p className="text-4xl mb-3">🧾</p>
          <p className="font-medium mb-1" style={{ color: '#1A1A2E' }}>No expenses found</p>
          <p className="text-sm mb-4" style={{ color: '#877273' }}>Scan a receipt to get started</p>
          <Link href="/dashboard/expenses/new"
            className="inline-block px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: '#E94560' }}>
            Scan Receipt
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => (
            <div key={group.dateKey}>
              <div className="flex items-center gap-3 mb-2 px-1">
                <span className="text-xs font-semibold" style={{ color: '#877273' }}>{group.label}</span>
                <div className="flex-1 h-px" style={{ background: '#E5E7EB' }} />
                <span className="text-xs" style={{ color: '#877273' }}>
                  {formatCurrency(group.items.reduce((s, e) => s + e.amount, 0))}
                </span>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border overflow-hidden" style={{ borderColor: '#E5E7EB' }}>
                {group.items.map((exp, i) => {
                  const cat = CATEGORY_MAP[exp.category]
                  return (
                    <Link key={exp.id} href={`/dashboard/expenses/${exp.id}`}
                      className={`flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors ${i > 0 ? 'border-t' : ''}`}
                      style={{ borderColor: '#F8F9FA' }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                        style={{ background: (cat?.color ?? '#E94560') + '22' }}>
                        {cat?.icon ?? '📦'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: '#1A1A2E' }}>{exp.merchant_name}</p>
                        <p className="text-xs" style={{ color: '#877273' }}>{cat?.name ?? exp.category}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold" style={{ color: '#E94560' }}>
                          {formatCurrency(exp.amount, exp.currency)}
                        </p>
                        <span className="text-xs" style={{
                          color: exp.match_status === 'matched' || exp.match_status === 'manual'
                            ? '#00955F' : '#877273'
                        }}>
                          {exp.match_status === 'cash_only' ? '💵 cash'
                            : exp.match_status === 'matched' || exp.match_status === 'manual' ? '✓ matched'
                            : exp.match_status === 'suggested' ? '~ suggested'
                            : 'unmatched'}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
