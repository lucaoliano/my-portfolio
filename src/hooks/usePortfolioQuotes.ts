import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getQuotes, YahooQuote } from '../services/yahooFinance';
import { Transaction } from '../types';

interface QuotesCache {
  userId: string;
  quotes: Record<string, YahooQuote>;
  updatedAt: Date;
}

// Ultime quotazioni in memoria: le schermate che si aprono dalla dashboard
// (es. Salute del portafoglio) partono subito dagli stessi numeri invece che da zero.
let lastQuotes: QuotesCache | null = null;

export interface PortfolioQuotesState {
  quotes: Record<string, YahooQuote>;
  /** Primo caricamento senza quotazioni in memoria */
  loading: boolean;
  /** Aggiornamento richiesto dall'utente (pull-to-refresh, sync) */
  refreshing: boolean;
  /** Messaggio leggibile se l'ultimo aggiornamento è fallito; le quotazioni precedenti restano */
  error: string | null;
  updatedAt: Date | null;
  refresh: (showRefreshIndicator?: boolean) => Promise<void>;
}

const readScalableQuotes = async (
  userId: string,
  transactions: Transaction[]
): Promise<Record<string, YahooQuote>> => {
  const map: Record<string, YahooQuote> = {};
  const snap = await getDoc(doc(db, 'portfolios', userId, 'settings', 'scalable_quotes'));
  if (!snap.exists()) return map;

  for (const [sym, q] of Object.entries(snap.data())) {
    const item = q as {
      shortName?: string;
      longName?: string;
      regularMarketPrice?: number;
      currency?: string;
    };
    if (item.regularMarketPrice && item.regularMarketPrice > 0) {
      map[sym] = {
        symbol: sym,
        shortName: item.shortName || sym,
        longName: item.longName || sym,
        regularMarketPrice: item.regularMarketPrice,
        regularMarketChangePercent: 0,
        regularMarketChange: 0,
        currency: item.currency || 'EUR',
        source: 'scalable',
        hasDailyChange: false,
      };
    }
  }

  // Le transazioni possono usare il ticker o l'ISIN: collega le due chiavi
  transactions.forEach(t => {
    if (t.isin && map[t.isin] && !map[t.symbol]) {
      map[t.symbol] = { ...map[t.isin], symbol: t.symbol, shortName: t.name || map[t.isin].shortName || t.symbol };
    }
    if (t.symbol && map[t.symbol] && t.isin && !map[t.isin]) {
      map[t.isin] = { ...map[t.symbol], symbol: t.isin };
    }
  });
  return map;
};

/**
 * Quotazioni del portafoglio: prima i prezzi sincronizzati da Scalable, poi Yahoo Finance
 * per i titoli restanti. Un errore non cancella i prezzi già noti: viene esposto in `error`.
 */
export const usePortfolioQuotes = (
  userId: string | undefined,
  transactions: Transaction[],
  transactionsLoading: boolean
): PortfolioQuotesState => {
  const cached = lastQuotes && lastQuotes.userId === userId ? lastQuotes : null;
  const [quotes, setQuotes] = useState<Record<string, YahooQuote>>(cached?.quotes ?? {});
  const [updatedAt, setUpdatedAt] = useState<Date | null>(cached?.updatedAt ?? null);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transactionsRef = useRef(transactions);
  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);

  const refresh = useCallback(async (showRefreshIndicator = false) => {
    const txs = transactionsRef.current;
    const uniqueSymbols = Array.from(new Set(txs.map(t => t.symbol)));

    if (uniqueSymbols.length === 0) {
      setQuotes({});
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (showRefreshIndicator) setRefreshing(true);

    try {
      let scalableQuotes: Record<string, YahooQuote> = {};
      if (userId) {
        try {
          scalableQuotes = await readScalableQuotes(userId, txs);
        } catch (sqErr) {
          console.warn('Error reading scalable quotes:', sqErr);
        }
      }

      const symbolsToFetch = uniqueSymbols.filter(s => !scalableQuotes[s]);
      const yahooQuotes = symbolsToFetch.length > 0 ? await getQuotes(symbolsToFetch) : [];

      const next: Record<string, YahooQuote> = { ...scalableQuotes };
      yahooQuotes.forEach(q => {
        if (!next[q.symbol]) {
          next[q.symbol] = { ...q, source: 'yahoo', hasDailyChange: typeof q.regularMarketChange === 'number' };
        }
      });

      // getQuotes restituisce [] anche in caso di errore: se mancavano prezzi e non ne è arrivato nessuno,
      // l'aggiornamento è fallito e va detto, invece di mostrare i titoli al costo come se nulla fosse.
      const yahooFailed = symbolsToFetch.length > 0 && yahooQuotes.length === 0;
      setQuotes(prev => (yahooFailed ? { ...prev, ...next } : next));
      if (yahooFailed) {
        setError('Quotazioni non aggiornate: il servizio prezzi non risponde.');
      } else {
        const now = new Date();
        setError(null);
        setUpdatedAt(now);
        if (userId) lastQuotes = { userId, quotes: next, updatedAt: now };
      }
    } catch (err) {
      console.error('Errore fetch quotes:', err);
      setError('Quotazioni non aggiornate: controlla la connessione e riprova.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    if (transactionsLoading) return;
    const timeoutId = setTimeout(() => {
      if (transactions.length > 0) {
        refresh();
      } else {
        setLoading(false);
      }
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [transactions, transactionsLoading, refresh]);

  return { quotes, loading, refreshing, error, updatedAt, refresh };
};
