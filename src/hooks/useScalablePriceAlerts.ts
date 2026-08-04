import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ScalablePriceAlert, ScalablePriceAlertsDoc } from '../types';
import { fetchScalablePriceAlerts } from '../services/scalableMcp';

export const useScalablePriceAlerts = (userId: string | undefined) => {
  const [alerts, setAlerts] = useState<ScalablePriceAlert[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  useEffect(() => {
    if (!userId) {
      const timeoutId = setTimeout(() => {
        setAlerts([]);
        setUpdatedAt(null);
        setLoading(false);
      }, 0);
      return () => clearTimeout(timeoutId);
    }

    const docRef = doc(db, `portfolios/${userId}/settings/scalable_price_alerts`);
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as ScalablePriceAlertsDoc;
          setAlerts(data.alerts || []);
          setUpdatedAt(data.updatedAt || null);
        } else {
          setAlerts([]);
          setUpdatedAt(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to Scalable price alerts:', err);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [userId]);

  const refreshAlerts = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      const res = await fetchScalablePriceAlerts();
      if (res.success && res.alerts) {
        setAlerts(res.alerts);
      }
    } catch (e) {
      console.warn('Could not refresh Scalable price alerts on-demand:', e);
    } finally {
      setRefreshing(false);
    }
  }, [userId]);

  return { alerts, updatedAt, loading, refreshing, refreshAlerts };
};
