import { useEffect, useRef, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';
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
export const usePortfolioHistory = (userId: string | undefined, snapshot: HistorySnapshot | null) => {
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const lastWrittenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, 'portfolios', userId, 'history'), orderBy('date', 'desc'), limit(800));
    return onSnapshot(
      q,
      snap => {
        const list = snap.docs.map(d => d.data() as HistoryPoint).filter(p => typeof p.invested === 'number');
        setPoints(list.reverse());
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

  return points;
};
