import { useEffect, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocsFromServer, limit, onSnapshot, orderBy, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { Transaction } from '../types';
import { getWeeklyCloses } from '../services/yahooFinance';
import { backfillSymbols, buildBackfill, buildDailyBackfill, missingWeekdays } from '../utils/historyBackfill';
import { fetchDailyYear } from '../services/historicalPrices';
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
  /** true = punto ricostruito dalle chiusure di borsa, non registrato quel giorno */
  backfilled?: boolean;
  /** true = ricostruito dalle chiusure giornaliere e riportato al prezzo attuale */
  daily?: boolean;
  /** Versione del metodo di ricostruzione: i punti di una versione precedente si rifanno */
  v?: number;
}

/** 2 = prezzi ancorati alle operazioni e al prezzo attuale (vedi makePriceAt) */
const BACKFILL_VERSION = 2;

export interface HistorySnapshot {
  invested: number;
  costBasis: number;
  cash: number;
  complete: boolean;
}

/**
 * Scrive i punti ricostruiti senza mai toccare un giorno registrato sul server (l'elenco locale può venire
 * dalla cache offline ed essere incompleto). Un punto già ricostruito si può sostituire con uno migliore.
 */
const writeBackfill = async (userId: string, rebuilt: { date: string }[], extra: Record<string, unknown> = {}) => {
  if (rebuilt.length === 0) return 0;
  const from = rebuilt.reduce((m, p) => (p.date < m ? p.date : m), rebuilt[0].date);
  const existing = await getDocsFromServer(query(collection(db, 'portfolios', userId, 'history'), where('date', '>=', from)));
  const taken = new Set(existing.docs.filter(d => !d.data().backfilled).map(d => d.id));
  const fresh = rebuilt.filter(p => !taken.has(p.date));
  for (let i = 0; i < fresh.length; i += 400) {
    const batch = writeBatch(db);
    fresh.slice(i, i + 400).forEach(p => {
      batch.set(doc(db, 'portfolios', userId, 'history', p.date), { ...p, ...extra, cash: 0, backfilled: true, updatedAt: new Date().toISOString() });
    });
    await batch.commit();
  }
  return fresh.length;
};

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
  transactions: Transaction[] = [],
  /** Prezzo attuale in euro per chiave di prezzo: serve a raccordare i giorni ricostruiti con quelli registrati */
  nowEurByKey: Record<string, number | null> = {}
) => {
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [loaded, setLoaded] = useState(false);
  const lastWrittenRef = useRef<string | null>(null);
  const backfillStartedRef = useRef(false);
  const gapFillStartedRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, 'portfolios', userId, 'history'), orderBy('date', 'desc'), limit(800));
    return onSnapshot(
      q,
      snap => {
        const list = snap.docs.map(d => d.data() as HistoryPoint).filter(p => typeof p.invested === 'number');
        setPoints(list.reverse());
        // Le ricostruzioni partono solo con l'elenco confermato dal server, non con quello della cache
        if (!snap.metadata.fromCache) setLoaded(true);
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

  const pricesReady = Object.values(nowEurByKey).some(v => v !== null);

  // Una sola volta per utente: ricostruisce le settimane tra il primo acquisto e il primo giorno registrato
  useEffect(() => {
    if (!userId || !loaded || !pricesReady || transactions.length === 0 || backfillStartedRef.current) return;
    const first = transactions.map(t => t.date.slice(0, 10)).sort()[0];
    // Si ricostruisce fino al primo giorno registrato o già ricostruito con il metodo attuale
    const kept = points.filter(p => !p.backfilled || p.v === BACKFILL_VERSION);
    const until = kept[0]?.date ?? localDateKey();
    if (first >= until || (new Date(until).getTime() - new Date(first).getTime()) < 10 * 86400000) return;
    backfillStartedRef.current = true;
    const metaRef = doc(db, 'portfolios', userId, 'settings', 'history_meta');
    (async () => {
      try {
        const meta = await getDoc(metaRef);
        // Una ricostruzione finita senza punti (server senza prezzi) non conta come fatta: si riprova
        const done = meta.exists() && meta.data().backfilledFrom && meta.data().backfilledFrom <= first && (meta.data().weeks ?? 1) > 0 && meta.data().backfillVersion === BACKFILL_VERSION;
        if (done) return;
        const series = await getWeeklyCloses(backfillSymbols(transactions), first);
        const existing = new Set(kept.map(p => p.date));
        const rebuilt = buildBackfill(transactions, series, until, nowEurByKey).filter(p => !existing.has(p.date));
        const weeks = await writeBackfill(userId, rebuilt, { v: BACKFILL_VERSION });
        await setDoc(metaRef, { backfilledFrom: first, backfilledAt: new Date().toISOString(), weeks, backfillVersion: BACKFILL_VERSION }, { merge: true });
      } catch (err) {
        // Riproverà alla prossima apertura
        backfillStartedRef.current = false;
        console.warn('Ricostruzione dello storico non riuscita:', err);
      }
    })();
  }, [userId, loaded, pricesReady, transactions, points, nowEurByKey]);

  // Una volta al giorno: i giorni dell'ultimo anno in cui l'app non è stata aperta si ricostruiscono dalle chiusure giornaliere
  useEffect(() => {
    if (!userId || !loaded || !pricesReady || transactions.length === 0 || gapFillStartedRef.current) return;
    const first = transactions.map(t => t.date.slice(0, 10)).sort()[0];
    const yearAgo = new Date();
    yearAgo.setDate(yearAgo.getDate() - 365);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const from = first > localDateKey(yearAgo) ? first : localDateKey(yearAgo);
    // Mancano i giorni senza punto e quelli ricostruiti solo a settimana: questi si rifanno con le chiusure giornaliere
    const missing = missingWeekdays(new Set(points.filter(p => !p.backfilled || (p.daily && p.v === BACKFILL_VERSION)).map(p => p.date)), from, localDateKey(yesterday));
    if (missing.length === 0) return;
    gapFillStartedRef.current = true;
    const metaRef = doc(db, 'portfolios', userId, 'settings', 'history_meta');
    (async () => {
      try {
        const meta = await getDoc(metaRef);
        if (meta.exists() && meta.data().gapsFilledOn === localDateKey() && meta.data().gapsVersion === BACKFILL_VERSION) return;
        const series = await fetchDailyYear(backfillSymbols(transactions));
        const filled = await writeBackfill(userId, buildDailyBackfill(transactions, series, missing, nowEurByKey), { daily: true, v: BACKFILL_VERSION });
        await setDoc(metaRef, { gapsFilledOn: localDateKey(), gapDaysFilled: filled, gapsVersion: BACKFILL_VERSION }, { merge: true });
      } catch (err) {
        gapFillStartedRef.current = false;
        console.warn('Ricostruzione dei giorni mancanti non riuscita:', err);
      }
    })();
  }, [userId, loaded, pricesReady, transactions, points, nowEurByKey]);

  return points;
};
