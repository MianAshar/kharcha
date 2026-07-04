import { supabase } from './supabase';

export async function runAutoMatch(expenseId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('match-transaction', {
    body: { expense_id: expenseId },
  });
  if (error) throw error;
}
