import { useState, useEffect } from 'react';
import { activeMonthlyTotal } from '../utils/savingsPlans';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ScalableSavingsPlan, ScalableSavingsPlansDoc } from '../types';

export const useScalableSavingsPlans = (userId: string | undefined) => {
  const [plans, setPlans] = useState<ScalableSavingsPlan[]>([]);
  const [totalMonthlyAmount, setTotalMonthlyAmount] = useState<number>(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!userId) {
      const timeoutId = setTimeout(() => {
        setPlans([]);
        setTotalMonthlyAmount(0);
        setUpdatedAt(null);
        setLoading(false);
      }, 0);
      return () => clearTimeout(timeoutId);
    }

    const docRef = doc(db, `portfolios/${userId}/settings/scalable_savings_plans`);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as ScalableSavingsPlansDoc;
        setPlans(data.plans || []);
        // Totale ricalcolato qui: solo piani attivi, ogni frequenza riportata al mese
        setTotalMonthlyAmount(activeMonthlyTotal(data.plans || []));
        setUpdatedAt(data.updatedAt || null);
      } else {
        setPlans([]);
        setTotalMonthlyAmount(0);
        setUpdatedAt(null);
      }
      setLoading(false);
    }, (err) => {
      console.error('Error listening to Scalable savings plans:', err);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [userId]);

  return { plans, totalMonthlyAmount, updatedAt, loading };
};
