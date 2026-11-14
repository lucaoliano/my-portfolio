import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, collection, query, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { UserSettings } from '../types';
import { COLLECTIONS, getUserPreferencesPath } from '../constants/collections';
import { DEFAULT_PORTFOLIO, DEFAULT_PORTFOLIO_ID, cleanPortfolio, cleanPortfolios } from '../utils/portfolioManager';

export { DEFAULT_PORTFOLIO, DEFAULT_PORTFOLIO_ID };

export const useUserSettings = (userId: string | undefined) => {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      const timeoutId = setTimeout(() => {
        setSettings(null);
        setLoading(false);
      }, 0);
      return () => clearTimeout(timeoutId);
    }

    let unsubscribeSettings: () => void;

    const initSettings = async () => {
      try {
        setLoading(true);
        const prefRef = doc(db, getUserPreferencesPath(userId));
        const snap = await getDoc(prefRef);
        let currentSettings: UserSettings;

        if (!snap.exists()) {
          currentSettings = {
            groups: ['Generale'],
            defaultGroup: 'Generale',
            portfolios: [DEFAULT_PORTFOLIO],
            defaultPortfolioId: DEFAULT_PORTFOLIO_ID,
          };
          await setDoc(prefRef, currentSettings);
        } else {
          currentSettings = snap.data() as UserSettings;
          let needsUpdate = false;
          const fallbackGroups = currentSettings.groups && currentSettings.groups.length > 0 ? currentSettings.groups : ['Generale'];

          if (!currentSettings.portfolios || currentSettings.portfolios.length === 0) {
            currentSettings.portfolios = [{
              ...DEFAULT_PORTFOLIO,
              groups: [...fallbackGroups],
              defaultGroup: currentSettings.defaultGroup || fallbackGroups[0],
            }];
            currentSettings.defaultPortfolioId = DEFAULT_PORTFOLIO_ID;
            needsUpdate = true;
          } else {
            const normalized = currentSettings.portfolios.map(p => {
              if (!p.groups || p.groups.length === 0) {
                needsUpdate = true;
                return cleanPortfolio({
                  ...p,
                  groups: [...fallbackGroups],
                  defaultGroup: p.defaultGroup || currentSettings.defaultGroup || fallbackGroups[0],
                });
              }
              return cleanPortfolio(p);
            });
            currentSettings.portfolios = normalized;
          }

          if (needsUpdate) {
            await updateDoc(prefRef, {
              portfolios: currentSettings.portfolios,
              defaultPortfolioId: currentSettings.defaultPortfolioId || DEFAULT_PORTFOLIO_ID,
            });
          }
        }

        // Sincronizzazione iniziale one-time dei gruppi legacy dalle transazioni
        try {
          const qTx = query(collection(db, COLLECTIONS.PORTFOLIOS, userId, COLLECTIONS.TRANSACTIONS));
          const txSnap = await getDocs(qTx);
          let hasMissing = false;
          const currentGroups = new Set(currentSettings.groups || []);

          txSnap.forEach(d => {
            const data = d.data();
            const txGroups = data.groups || (data.group ? [data.group] : ['Generale']);
            txGroups.forEach((g: string) => {
              if (!currentGroups.has(g)) {
                currentGroups.add(g);
                hasMissing = true;
              }
            });
          });

          if (hasMissing) {
            // Il Set conserva l'ordine d'inserimento: i gruppi mancanti vanno in coda,
            // senza riordinare quelli che l'utente ha già sistemato
            const updatedGroups = Array.from(currentGroups);
            await updateDoc(prefRef, { groups: updatedGroups });
            currentSettings.groups = updatedGroups;
          }
        } catch (syncErr) {
          console.error("Error syncing legacy groups in useUserSettings:", syncErr);
        }

        // Listen for remote changes to preferences
        unsubscribeSettings = onSnapshot(prefRef, (s) => {
          if (s.exists()) {
            const sData = s.data() as UserSettings;
            const fallbackGroups = sData.groups && sData.groups.length > 0 ? sData.groups : ['Generale'];
            if (!sData.portfolios || sData.portfolios.length === 0) {
              sData.portfolios = [{
                ...DEFAULT_PORTFOLIO,
                groups: [...fallbackGroups],
                defaultGroup: sData.defaultGroup || fallbackGroups[0],
              }];
              sData.defaultPortfolioId = DEFAULT_PORTFOLIO_ID;
            } else {
              sData.portfolios = cleanPortfolios(sData.portfolios).map(p => ({
                ...p,
                groups: p.groups && p.groups.length > 0 ? p.groups : [...fallbackGroups],
                defaultGroup: p.defaultGroup || sData.defaultGroup || fallbackGroups[0],
              }));
            }
            setSettings(sData);
          }
        });

        setLoading(false);
      } catch (e) {
        console.error("Error setting up preferences:", e);
        setLoading(false);
      }
    };

    initSettings();

    return () => {
      if (unsubscribeSettings) unsubscribeSettings();
    };
  }, [userId]);

  return { settings, loading };
};
