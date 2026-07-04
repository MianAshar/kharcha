import { useState, useEffect, useCallback } from 'react';
import { Expense } from '../types';
import { getExpenses } from '../services/expenses';
import { useAuth } from './useAuth';

export function useExpenses() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getExpenses(user.id);
      setExpenses(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { expenses, loading, error, refresh };
}
