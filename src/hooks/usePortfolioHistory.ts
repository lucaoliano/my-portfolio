import { useEffect, useRef, useState } from 'react';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, setDoc, writeBatch } from 'firebase/firestore';
import { Transaction } from '../types';
import { getWeeklyCloses } from '../services/yahooFinance';
import { backfillSymbols, buildBackfill } from '../utils/historyBackfill';
import { db } from '../config/firebase';

/** Una fotografia giornaliera del portafoglio, in euro. */
export interface HistoryPoint {
  /** YYYY-MM-DD nel fuso orario del dispositivo */
  date: string;
  /** Valore delle posizioni (senza liquidità) */
  invested: number;
  /** Prezzo di carico delle posizioni */
  costBasis: number;
  /** Liquidità Scalable */
  cash: number;
  /** false = quel giorno c'erano titoli senza prezzo o senza cambio */
  complete: boolean;
  /** true = punto ricostruito dalle chiusure settimanali, non registrato quel giorno */
  backfilled?: boolean;
}

export interface HistorySnapshot {
  invested: number;
  costBasis: number;
  cash: number;
  complete: boolean;
}

const localDateKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Storico giornaliero in `portfolios/{uid}/history/{YYYY-MM-DD}`: un documento per giorno, sovrascritto
 * con l'ultimo valore visto. `snapshot` va passato solo quando i prezzi sono freschi (nessun errore):
 * meglio un giorno mancante che un punto sbagliato nel grafico.
 */
export const usePortfolioHistory = (
  userId: string | undefined,
  snapshot: HistorySnapshot | null,
  transactions: Transaction[] = []
) => {
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [loaded, setLoaded] = useState(false);
  const lastWrittenRef = useRef<string | null>(null);
  const backfillStartedRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, 'portfolios', userId, 'history'), orderBy('date', 'desc'), limit(800));
    return onSnapshot(
      q,
      snap => {
        const list = snap.docs.map(d => d.data() as HistoryPoint).filter(p => typeof p.invested === 'number');
        setPoints(list.reverse());
        setLoaded(true);
      },
      err => console.warn('Storico non disponibile:', err)
    );
  }, [userId]);

  useEffect(() => {
    if (!userId || !snapshot || snapshot.invested <= 0) return;
    const date = localDateKey();
    const payload: HistoryPoint = {
      date,
      invested: Math.round(snapshot.invested * 100) / 100,
      costBasis: Math.round(snapshot.costBasis * 100) / 100,
      cash: Math.round(snapshot.cash * 100) / 100,
      complete: snapshot.complete,
    };
    const signature = JSON.stringify(payload);
    if (signature === lastWrittenRef.current) return;

    // Attende che i numeri si stabilizzino (quotazioni + sync arrivano a ondate)
    const timeoutId = setTimeout(() => {
      lastWrittenRef.current = signature;
      setDoc(doc(db, 'portfolios', userId, 'history', date), { ...payload, updatedAt: new Date().toISOString() })
        .catch(err => console.warn('Salvataggio storico non riuscito:', err));
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [userId, snapshot]);

  // Una sola volta per utente: ricostruisce le settimane tra il primo acquisto e il primo giorno registrato
  useEffect(() => {
    if (!userId || !loaded || transactions.length === 0 || backfillStartedRef.current) return;
    const first = transactions.map(t => t.date.slice(0, 10)).sort()[0];
    const until = points[0]?.date ?? localDateKey();
    if (first >= until || (new Date(until).getTime() - new Date(first).getTime()) < 10 * 86400000) return;
    backfillStartedRef.current = true;
    const metaRef = doc(db, 'portfolios', userId, 'settings', 'history_meta');
    (async () => {
      try {
        const meta = await getDoc(metaRef);
        if (meta.exists() && meta.data().backfilledFrom && meta.data().backfilledFrom <= first) return;
        const series = await getWeeklyCloses(backfillSymbols(transactions), first);
        const existing = new Set(points.map(p => p.date));
        const rebuilt = buildBackfill(transactions, series, until).filter(p => !existing.has(p.date));
        for (let i = 0; i < rebuilt.length; i += 400) {
          const batch = writeBatch(db);
          rebuilt.slice(i, i + 400).forEach(p => {
            batch.set(doc(db, 'portfolios', userId, 'history', p.date), { ...p, cash: 0, backfilled: true, updatedAt: new Date().toISOString() });
          });
          await batch.commit();
        }
        await setDoc(metaRef, { backfilledFrom: first, backfilledAt: new Date().toISOString(), weeks: rebuilt.length }, { merge: true });
      } catch (err) {
        // Riproverà alla prossima apertura
        backfillStartedRef.current = false;
        console.warn('Ricostruzione dello storico non riuscita:', err);
      }
    })();
  }, [userId, loaded, transactions, points]);

  return points;
};
