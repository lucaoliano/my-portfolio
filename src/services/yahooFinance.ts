import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

export interface YahooQuote {
  symbol: string;
  shortName: string;
  longName: string;
  regularMarketPrice: number;
  regularMarketChangePercent: number;
  regularMarketChange: number;
  currency: string;
  /** Da dove arriva il prezzo: le quotazioni Scalable non hanno la variazione giornaliera. */
  source?: 'scalable' | 'yahoo';
  hasDailyChange?: boolean;
  /** Ora dell'ultimo prezzo di mercato, se nota */
  marketTime?: string;
}

export interface DailyChange {
  changePercent: number;
  yahooSymbol: string;
  marketTime?: string;
}

/**
 * Variazione percentuale di oggi per ISIN o ticker (Yahoo Finance via Cloud Function).
 * Serve per i titoli quotati da Scalable, che non la forniscono. In caso di errore restituisce {}.
 */
export const getDailyChanges = async (symbols: string[]): Promise<Record<string, DailyChange>> => {
  if (!symbols || symbols.length === 0) return {};
  try {
    const fn = httpsCallable<{ symbols: string[] }, { changes: Record<string, DailyChange> }>(functions, 'getDailyChanges');
    const result = await fn({ symbols });
    return result.data.changes || {};
  } catch (error) {
    console.warn('Daily changes not available:', error);
    return {};
  }
};

export interface YahooSearchResult {
  symbol: string;
  shortname: string;
  longname: string;
  exchange: string;
  quoteType: string;
}

/**
 * Fetch quotes for multiple symbols using Firebase Cloud Functions
 */
export const getQuotes = async (symbols: string[]): Promise<YahooQuote[]> => {
  if (!symbols || symbols.length === 0) return [];

  const getQuotesFn = httpsCallable(functions, 'getQuotes');
  
  try {
    const result = await getQuotesFn({ symbols });
    const data = result.data as { quotes: YahooQuote[] };
    return data.quotes || [];
  } catch (error) {
    console.error("Error fetching quotes:", error);
    return [];
  }
};

/**
 * Search for a symbol/company using Firebase Cloud Functions
 */
export const searchSymbol = async (query: string): Promise<YahooSearchResult[]> => {
  if (!query) return [];
  
  const searchSymbolFn = httpsCallable(functions, 'searchSymbol');
  
  try {
    const result = await searchSymbolFn({ query });
    const data = result.data as { results: YahooSearchResult[] };
    return data.results || [];
  } catch (error) {
    console.error("Error searching symbol:", error);
    return [];
  }
};

export interface HistoricalQuote {
  price: number;
  /** Valuta di quotazione (es. "USD"); null se Yahoo non la riporta */
  currency: string | null;
  /** Giorno di borsa da cui viene la chiusura (può precedere la data scelta: weekend, festivi) */
  priceDate: string | null;
  /** Euro per 1 unità della valuta, alla stessa data */
  fxRateToEur: number | null;
}

/**
 * Prezzo di chiusura di un titolo a una data, con valuta e cambio in euro.
 * null = nessun prezzo per quella data; un errore di rete viene rilanciato, così la schermata può dirlo.
 */
export const getHistoricalQuote = async (symbol: string, date: string): Promise<HistoricalQuote | null> => {
  if (!symbol || !date) return null;
  const getHistoricalPriceFn = httpsCallable(functions, 'getHistoricalPrice');
  const result = await getHistoricalPriceFn({ symbol, date });
  const data = result.data as Partial<HistoricalQuote> & { price: number | null };
  if (!data || typeof data.price !== 'number' || data.price <= 0) return null;
  return {
    price: data.price,
    currency: data.currency ?? null,
    priceDate: data.priceDate ?? null,
    fxRateToEur: typeof data.fxRateToEur === 'number' && data.fxRateToEur > 0 ? data.fxRateToEur : null,
  };
};

export interface WeeklySeries {
  currency: string | null;
  points: { date: string; close: number }[];
}

/** Chiusure settimanali dal giorno indicato (ticker, ISIN o cambi "USDEUR=X"). */
export const getWeeklyCloses = async (symbols: string[], from: string): Promise<Record<string, WeeklySeries>> => {
  const fn = httpsCallable(functions, 'getWeeklyCloses');
  const res = await fn({ symbols, from });
  return ((res.data as { series?: Record<string, WeeklySeries> })?.series) ?? {};
};
