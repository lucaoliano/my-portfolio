import { useState, useEffect } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS } from '../constants/collections';
import { resolveAssetCategory } from '../constants/assetClasses';

export const useAssetCategories = (userId: string | undefined) => {
  const [assetCategories, setAssetCategories] = useState<Record<string, string>>({});
  // Tipo di strumento e classe per lo zainetto fiscale (ETF/fondo, ETC, obbligazione…)
  const [assetMeta, setAssetMeta] = useState<Record<string, { instrumentType?: string; category?: string }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      const timeoutId = setTimeout(() => {
        setAssetCategories({});
        setAssetMeta({});
        setLoading(false);
      }, 0);
      return () => clearTimeout(timeoutId);
    }

    const qAssets = query(collection(db, COLLECTIONS.PORTFOLIOS, userId, COLLECTIONS.ASSETS));
    const unsubscribe = onSnapshot(qAssets, (querySnapshot) => {
      const cats: Record<string, string> = {};
      const meta: Record<string, { instrumentType?: string; category?: string }> = {};
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const info = resolveAssetCategory(data);
        if (info) cats[doc.id] = info.category;
        meta[doc.id] = {
          instrumentType: typeof data.scalableInstrumentType === 'string' ? data.scalableInstrumentType : undefined,
          category: info?.category,
        };
      });
      setAssetCategories(cats);
      setAssetMeta(meta);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching asset categories:", error);
      setLoading(false);
    });

    return unsubscribe;
  }, [userId]);

  return { assetCategories, assetMeta, loading };
};
