import { useState, useEffect } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Transaction } from '../types';
import { COLLECTIONS } from '../constants/collections';

export const useTransactions = (userId: string | undefined) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      const timeoutId = setTimeout(() => {
        setTransactions([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(timeoutId);
    }

    const q = query(collection(db, COLLECTIONS.PORTFOLIOS, userId, COLLECTIONS.TRANSACTIONS));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      try {
        const txs: Transaction[] = [];
        querySnapshot.forEach((doc) => {
          txs.push({ id: doc.id, ...doc.data() } as Transaction);
        });
        setTransactions(txs);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to parse transactions'));
        setLoading(false);
      }
    }, (err) => {
      console.error("Error fetching transactions:", err);
      setError(err);
      setLoading(false);
    });

    return unsubscribe;
  }, [userId]);

  return { transactions, loading, error };
};
