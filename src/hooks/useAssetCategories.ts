import { useState, useEffect } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS } from '../constants/collections';

export const useAssetCategories = (userId: string | undefined) => {
  const [assetCategories, setAssetCategories] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      const timeoutId = setTimeout(() => {
        setAssetCategories({});
        setLoading(false);
      }, 0);
      return () => clearTimeout(timeoutId);
    }

    const qAssets = query(collection(db, COLLECTIONS.PORTFOLIOS, userId, COLLECTIONS.ASSETS));
    const unsubscribe = onSnapshot(qAssets, (querySnapshot) => {
      const cats: Record<string, string> = {};
      querySnapshot.forEach((doc) => {
        cats[doc.id] = doc.data().category;
      });
      setAssetCategories(cats);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching asset categories:", error);
      setLoading(false);
    });

    return unsubscribe;
  }, [userId]);

  return { assetCategories, loading };
};
