import { createClient } from '@/lib/supabase/client'
import type { Expense } from '@/types'

const supabase = createClient()

export async function getExpenses(userId: string, month?: string): Promise<Expense[]> {
  let query = supabase
    .from('expenses')
    .select('*')
    .eq('user_id', userId)
    .order('expense_date', { ascending: false })

  if (month) {
    const [year, mon] = month.split('-').map(Number)
    const start = new Date(year, mon - 1, 1).toISOString().split('T')[0]
    const end = new Date(year, mon, 0).toISOString().split('T')[0]
    query = query.gte('expense_date', start).lte('expense_date', end)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getExpenseById(id: string): Promise<Expense | null> {
  const { data, error } = await supabase.from('expenses').select('*').eq('id', id).single()
  if (error) return null
  return data
}

export async function createExpense(expense: Omit<Expense, 'id' | 'created_at'>): Promise<Expense> {
  const { data, error } = await supabase.from('expenses').insert(expense).select().single()
  if (error) throw error
  return data
}

export async function updateExpense(id: string, updates: Partial<Expense>): Promise<Expense> {
  const { data, error } = await supabase.from('expenses').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw error
}

export async function getMonthlyTotal(userId: string, month: string): Promise<number> {
  const [year, mon] = month.split('-').map(Number)
  const start = new Date(year, mon - 1, 1).toISOString().split('T')[0]
  const end = new Date(year, mon, 0).toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('expenses')
    .select('amount')
    .eq('user_id', userId)
    .gte('expense_date', start)
    .lte('expense_date', end)

  if (error) throw error
  return (data ?? []).reduce((sum, e) => sum + e.amount, 0)
}
