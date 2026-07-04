import { useState, useEffect, useCallback } from 'react';
import { BankTransaction } from '../types';
import { getTransactions } from '../services/transactions';
import { useAuth } from './useAuth';

export function useTransactions() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getTransactions(user.id);
      setTransactions(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { transactions, loading, error, refresh };
}
