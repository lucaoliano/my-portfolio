import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getQuotesDetailed, getDailyChanges, YahooQuote } from '../services/yahooFinance';
import { FxRates } from '../utils/portfolioAggregator';
import { Transaction } from '../types';

interface QuotesCache {
  userId: string;
  quotes: Record<string, YahooQuote>;
  fxRates: FxRates;
  updatedAt: Date;
}

// Ultime quotazioni in memoria: le schermate che si aprono dalla dashboard
// (es. Salute del portafoglio) partono subito dagli stessi numeri invece che da zero.
let lastQuotes: QuotesCache | null = null;

export interface PortfolioQuotesState {
  quotes: Record<string, YahooQuote>;
  /** Cambi verso l'euro per le valute estere presenti nel portafoglio */
  fxRates: FxRates;
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
  const [fxRates, setFxRates] = useState<FxRates>(cached?.fxRates ?? {});
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
    // Ignora le posizioni completamente chiuse (quantità 0): non servono quotazioni live
    const qtyByPosition: Record<string, number> = {};
    txs.forEach(t => {
      const key = `${t.portfolioId || 'default'}::${t.symbol}`;
      const qty = Number(t.quantity) || 0;
      qtyByPosition[key] = (qtyByPosition[key] || 0) + (t.type === 'SELL' ? -qty : qty);
    });
    const openSymbols = new Set<string>();
    txs.forEach(t => {
      const key = `${t.portfolioId || 'default'}::${t.symbol}`;
      if ((qtyByPosition[key] || 0) > 1e-9) {
        openSymbols.add(t.symbol);
      }
    });
    const uniqueSymbols = Array.from(openSymbols);

    if (uniqueSymbols.length === 0) {
      setQuotes({});
      setError(null);
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

      // Valute estere da convertire in euro (le transazioni Scalable sono già in euro)
      const foreignCurrencies = Array.from(new Set(
        txs
          .filter(t => openSymbols.has(t.symbol) && t.source !== 'scalable_mcp' && t.currency && t.currency.toUpperCase() !== 'EUR')
          .map(t => t.currency!.toUpperCase())
      ));
      const fxSymbols = foreignCurrencies.map(c => `${c}EUR=X`);

      const symbolsToFetch = uniqueSymbols.filter(s => !scalableQuotes[s]);
      const scalableSymbols = uniqueSymbols.filter(s => scalableQuotes[s]);
      const [quotesResult, dailyChanges] = await Promise.all([
        symbolsToFetch.length + fxSymbols.length > 0
          ? getQuotesDetailed([...symbolsToFetch, ...fxSymbols])
          : Promise.resolve({ quotes: [] as YahooQuote[], yahooFailed: false }),
        // Scalable non dà la variazione di oggi: la prendiamo da Yahoo per lo stesso ISIN
        getDailyChanges(scalableSymbols),
      ]);
      const yahooQuotes = quotesResult.quotes;

      const next: Record<string, YahooQuote> = {};
      for (const [sym, q] of Object.entries(scalableQuotes)) {
        const change = dailyChanges[sym];
        if (change) {
          // La percentuale di Yahoo applicata al prezzo Scalable: variazione assoluta per quota
          const pct = change.changePercent;
          const absPerShare = q.regularMarketPrice - q.regularMarketPrice / (1 + pct / 100);
          next[sym] = {
            ...q,
            regularMarketChangePercent: pct,
            regularMarketChange: absPerShare,
            hasDailyChange: true,
            marketTime: change.marketTime,
          };
        } else {
          next[sym] = q;
        }
      }

      const rates: FxRates = {};
      const newlyScalableSymbols: string[] = [];
      yahooQuotes.forEach(q => {
        const fx = /^([A-Z]{3})EUR=X$/.exec(q.symbol);
        if (fx) {
          if (q.regularMarketPrice > 0) rates[fx[1]] = q.regularMarketPrice;
          return;
        }
        if (!next[q.symbol]) {
          const isScalable = q.source === 'scalable';
          if (isScalable) newlyScalableSymbols.push(q.symbol);
          next[q.symbol] = {
            ...q,
            source: isScalable ? 'scalable' : 'yahoo',
            hasDailyChange: !isScalable && typeof q.regularMarketChange === 'number',
          };
        }
      });

      if (newlyScalableSymbols.length > 0) {
        const extraChanges = await getDailyChanges(newlyScalableSymbols);
        for (const sym of newlyScalableSymbols) {
          const change = extraChanges[sym];
          const q = next[sym];
          if (change && q && q.regularMarketPrice > 0) {
            const pct = change.changePercent;
            next[sym] = {
              ...q,
              regularMarketChangePercent: pct,
              regularMarketChange: q.regularMarketPrice - q.regularMarketPrice / (1 + pct / 100),
              hasDailyChange: true,
              marketTime: change.marketTime || q.marketTime,
            };
          }
        }
      }

      const yahooFailed = quotesResult.yahooFailed || (symbolsToFetch.length > 0 && yahooQuotes.length === 0 && Object.keys(scalableQuotes).length === 0);
      setQuotes(prev => (yahooFailed ? { ...prev, ...next } : next));
      setFxRates(prev => (yahooFailed ? prev : rates));
      if (yahooFailed) {
        setError('Quotazioni non aggiornate: il servizio prezzi non risponde.');
      } else {
        const now = new Date();
        setError(null);
        setUpdatedAt(now);
        if (userId) lastQuotes = { userId, quotes: next, fxRates: rates, updatedAt: now };
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

  return { quotes, fxRates, loading, refreshing, error, updatedAt, refresh };
};
