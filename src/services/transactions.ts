import { supabase } from './supabase';
import type { BankTransaction } from '../types';

export async function getTransactions(userId: string): Promise<BankTransaction[]> {
  const { data, error } = await supabase
    .from('bank_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('transaction_date', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function parseSMS(rawMessage: string, userId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('parse-bank-sms', {
    body: { raw_message: rawMessage, user_id: userId },
  });
  if (error) throw error;
}

export async function matchTransactionToExpense(
  transactionId: string,
  expenseId: string
): Promise<void> {
  const { error: txError } = await supabase
    .from('bank_transactions')
    .update({ matched_expense_id: expenseId })
    .eq('id', transactionId);

  if (txError) throw txError;

  const { error: expError } = await supabase
    .from('expenses')
    .update({ transaction_id: transactionId, match_status: 'manual' })
    .eq('id', expenseId);

  if (expError) throw expError;
}

export async function unmatchTransaction(
  transactionId: string,
  expenseId: string
): Promise<void> {
  const { error: txError } = await supabase
    .from('bank_transactions')
    .update({ matched_expense_id: null })
    .eq('id', transactionId);

  if (txError) throw txError;

  const { error: expError } = await supabase
    .from('expenses')
    .update({ transaction_id: null, match_status: 'unmatched' })
    .eq('id', expenseId);

  if (expError) throw expError;
}
