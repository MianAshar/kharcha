import { createClient } from '@/lib/supabase/client'
import type { BankTransaction } from '@/types'

const supabase = createClient()

export async function getTransactions(userId: string, month?: string): Promise<BankTransaction[]> {
  let query = supabase
    .from('bank_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('transaction_date', { ascending: false })

  if (month) {
    const [year, mon] = month.split('-').map(Number)
    const start = new Date(year, mon - 1, 1).toISOString()
    const end = new Date(year, mon, 0, 23, 59, 59).toISOString()
    query = query.gte('transaction_date', start).lte('transaction_date', end)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getTransactionById(id: string): Promise<BankTransaction | null> {
  const { data, error } = await supabase.from('bank_transactions').select('*').eq('id', id).single()
  if (error) return null
  return data
}

export async function matchTransactionToExpense(transactionId: string, expenseId: string): Promise<void> {
  const { error: txError } = await supabase
    .from('bank_transactions')
    .update({ matched_expense_id: expenseId })
    .eq('id', transactionId)
  if (txError) throw txError

  const { error: expError } = await supabase
    .from('expenses')
    .update({ transaction_id: transactionId, match_status: 'manual' })
    .eq('id', expenseId)
  if (expError) throw expError
}

export async function unmatchTransaction(transactionId: string, expenseId: string): Promise<void> {
  const { error: txError } = await supabase
    .from('bank_transactions')
    .update({ matched_expense_id: null })
    .eq('id', transactionId)
  if (txError) throw txError

  const { error: expError } = await supabase
    .from('expenses')
    .update({ transaction_id: null, match_status: 'unmatched' })
    .eq('id', expenseId)
  if (expError) throw expError
}
