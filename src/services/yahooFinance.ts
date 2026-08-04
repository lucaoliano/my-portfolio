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
}

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

/**
 * Fetch historical price for a symbol on a specific date
 */
export const getHistoricalPrice = async (symbol: string, date: string): Promise<number | null> => {
  if (!symbol || !date) return null;
  
  const getHistoricalPriceFn = httpsCallable(functions, 'getHistoricalPrice');
  
  try {
    const result = await getHistoricalPriceFn({ symbol, date });
    const data = result.data as { price: number | null };
    return data.price;
  } catch (error) {
    console.error("Error fetching historical price:", error);
    return null;
  }
};
