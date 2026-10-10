import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import YahooFinance from "yahoo-finance2";

if (!getApps().length) {
  initializeApp();
}

// Limita le istanze per contenere i costi in caso di abuso (chiunque con un account Google può autenticarsi)
setGlobalOptions({ maxInstances: 10 });

export {
  testScalableMcp,
  syncScalablePortfolio,
  getScalableSavingsPlans,
  getScalablePriceAlerts,
  getScalableTaxReport,
  startScalableDeviceAuth,
  pollScalableDeviceAuth,
  getScalableAuthUrl,
  exchangeScalableAuthCode,
  disconnectScalableAccount,
  refreshScalableSession,
} from "./scalableMcp.js";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

type SearchQuote = {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  quoteType?: string;
};

type MarketQuote = {
  symbol?: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketChange?: number;
  currency?: string;
  /** "scalable" = prezzo sincronizzato da Scalable, senza variazione giornaliera reale */
  source?: "scalable" | "yahoo";
  /** Ora di mercato dell'ultimo prezzo (ISO) */
  marketTime?: string;
  regularMarketTime?: Date | string | number;
};

// Endpoint per la ricerca dei ticker
export const searchSymbol = onCall(async (request: CallableRequest<{ query?: string }>) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Devi essere autenticato per eseguire questa ricerca",
    );
  }

  const query = request.data.query;
  if (!query) {
    throw new HttpsError(
      "invalid-argument",
      "Il parametro 'query' è obbligatorio",
    );
  }

  try {
    const response = await yf.search(query, { quotesCount: 10, newsCount: 0 });

    // Filtriamo per EQUITY ed ETF
    const results = ((response.quotes ?? []) as SearchQuote[])
      .filter((q: SearchQuote) => q.quoteType === "EQUITY" || q.quoteType === "ETF")
      .map((q: SearchQuote) => ({
        symbol: q.symbol,
        shortname: q.shortname || q.longname,
        longname: q.longname,
        exchange: q.exchange,
        quoteType: q.quoteType,
      }));

    return { results };
  } catch (error: unknown) {
    console.error("Error calling Yahoo Finance search:", error instanceof Error ? error.message : String(error));
    throw new HttpsError(
      "internal",
      "Errore durante la comunicazione con Yahoo Finance",
    );
  }
});

// Endpoint per il recupero delle quote
export const getQuotes = onCall(async (request: CallableRequest<{ symbols?: string[] }>) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Devi essere autenticato per recuperare le quotazioni",
    );
  }

  const symbols = request.data.symbols; // string[]
  if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
    return { quotes: [] };
  }

  const userId = request.auth.uid;
  const db = getFirestore();
  const finalQuotes: MarketQuote[] = [];
  const missingSymbols: string[] = [];

  try {
    // 1. Check if user has Scalable quotes saved for any of the requested symbols
    let scalableQuotes: Record<string, {
      regularMarketPrice?: number;
      shortName?: string;
      longName?: string;
      regularMarketChangePercent?: number;
      regularMarketChange?: number;
      currency?: string;
    }> = {};
    try {
      const sqSnap = await db.doc(`portfolios/${userId}/settings/scalable_quotes`).get();
      if (sqSnap.exists) {
        scalableQuotes = (sqSnap.data() as typeof scalableQuotes) || {};
      }
    } catch (e) {
      console.warn("Could not read scalable_quotes in getQuotes:", e);
    }

    for (const sym of symbols) {
      if (scalableQuotes[sym] && (scalableQuotes[sym].regularMarketPrice ?? 0) > 0) {
        const sq = scalableQuotes[sym];
        finalQuotes.push({
          symbol: sym,
          shortName: sq.shortName || sq.longName || sym,
          longName: sq.longName,
          regularMarketPrice: sq.regularMarketPrice,
          regularMarketChangePercent: sq.regularMarketChangePercent || 0,
          regularMarketChange: sq.regularMarketChange || 0,
          currency: sq.currency || "EUR",
          source: "scalable",
        });
      } else {
        missingSymbols.push(sym);
      }
    }

    // 2. Fetch remaining symbols from Yahoo Finance
    if (missingSymbols.length > 0) {
      try {
        const results = await yf.quote(missingSymbols);
        const quotesArray = Array.isArray(results) ? results : [results];
        for (const q of (quotesArray as MarketQuote[])) {
          if (q && q.symbol) {
            finalQuotes.push({
              symbol: q.symbol,
              shortName: q.shortName || q.longName || q.symbol,
              longName: q.longName,
              regularMarketPrice: q.regularMarketPrice,
              regularMarketChangePercent: q.regularMarketChangePercent,
              regularMarketChange: q.regularMarketChange,
              currency: q.currency || "EUR",
              source: "yahoo",
              marketTime: q.regularMarketTime ? new Date(q.regularMarketTime).toISOString() : undefined,
            });
          }
        }
      } catch (yfErr) {
        console.warn("Yahoo Finance quote error for remaining symbols:", yfErr);
      }
    }

    return { quotes: finalQuotes };
  } catch (error: unknown) {
    console.error("Error in getQuotes:", error instanceof Error ? error.message : String(error));
    if (finalQuotes.length > 0) {
      return { quotes: finalQuotes };
    }
    throw new HttpsError(
      "internal",
      "Errore durante il recupero delle quotazioni",
    );
  }
});

// Endpoint per il recupero del prezzo storico
export const getHistoricalPrice = onCall(async (request: CallableRequest<{ symbol?: string; date?: string }>) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Devi essere autenticato per recuperare il prezzo storico",
    );
  }

  const { symbol, date } = request.data;
  if (!symbol || !date) {
    throw new HttpsError(
      "invalid-argument",
      "I parametri 'symbol' e 'date' sono obbligatori",
    );
  }

  try {
    // Gli ISIN (titoli Scalable) vanno tradotti nel simbolo Yahoo, preferendo le borse in euro
    const yahooSymbol = ISIN_PATTERN.test(symbol) ? await resolveYahooSymbol(symbol) : symbol;
    if (!yahooSymbol) return { price: null, currency: null, priceDate: null, fxRateToEur: null };

    const closeOn = async (sym: string) => {
      // Finestra di 5 giorni fino alla data scelta: copre weekend e festività
      const targetDate = new Date(`${date}T00:00:00.000Z`);
      const endDate = new Date(targetDate);
      endDate.setUTCDate(endDate.getUTCDate() + 1);
      const startDate = new Date(targetDate);
      startDate.setUTCDate(startDate.getUTCDate() - 4);
      const rows = await yf.historical(sym, {
        period1: startDate.toISOString().split("T")[0],
        period2: endDate.toISOString().split("T")[0],
      });
      const last = rows && rows.length > 0 ? rows[rows.length - 1] : null;
      return last ? { close: last.close, date: new Date(last.date).toISOString().slice(0, 10) } : null;
    };

    const close = await closeOn(yahooSymbol);
    if (!close) return { price: null, currency: null, priceDate: null, fxRateToEur: null };

    // Valuta di quotazione e cambio verso l'euro dello stesso giorno: il prezzo da solo non basta
    let currency: string | null = null;
    try {
      const q = await yf.quote(yahooSymbol);
      currency = (q as { currency?: string } | undefined)?.currency ?? null;
    } catch {
      currency = null;
    }
    // Le quotazioni in pence (GBp) arrivano in centesimi di sterlina
    let price = close.close;
    if (currency === "GBp" || currency === "GBX") {
      price = price / 100;
      currency = "GBP";
    }
    currency = currency ? currency.toUpperCase() : null;
    let fxRateToEur: number | null = currency === "EUR" ? 1 : null;
    if (currency && currency !== "EUR") {
      try {
        const fx = await closeOn(`${currency}EUR=X`);
        fxRateToEur = fx ? fx.close : null;
      } catch {
        fxRateToEur = null;
      }
    }
    return { price, currency, priceDate: close.date, fxRateToEur, yahooSymbol };
  } catch (error: unknown) {
    console.error(`Error calling Yahoo Finance historical for ${symbol} on ${date}:`, error instanceof Error ? error.message : String(error));
    throw new HttpsError(
      "internal",
      "Errore durante il recupero del prezzo storico",
    );
  }
});

type DailyChange = {
  changePercent: number;
  yahooSymbol: string;
  marketTime?: string;
};

const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
// Borse in euro preferite per abbinare l'ISIN a una quotazione Yahoo con la stessa valuta di Scalable
const EUR_EXCHANGES = ["GER", "FRA", "AMS", "MIL", "PAR", "BRU", "MCE", "LIS", "VIE"];

/**
 * Risolve un ISIN nel simbolo Yahoo Finance più adatto, con cache server-side in Firestore
 * (collezione `yahoo_symbols`, non esposta al client dalle regole).
 */
async function resolveYahooSymbol(isin: string): Promise<string | null> {
  const db = getFirestore();
  const cacheRef = db.doc(`yahoo_symbols/${isin}`);
  const cached = await cacheRef.get();
  if (cached.exists) {
    return (cached.data()?.symbol as string | null) ?? null;
  }
  try {
    const res = await yf.search(isin, { quotesCount: 10, newsCount: 0 });
    const candidates = ((res.quotes ?? []) as SearchQuote[]).filter(
      (q) => !!q.symbol && (q.quoteType === "ETF" || q.quoteType === "EQUITY" || q.quoteType === "MUTUALFUND"),
    );
    const preferred = candidates.find((q) => EUR_EXCHANGES.includes(q.exchange ?? "")) ?? candidates[0];
    const symbol = preferred?.symbol ?? null;
    await cacheRef.set({ symbol, resolvedAt: new Date().toISOString() });
    return symbol;
  } catch (err) {
    console.warn(`Yahoo symbol lookup failed for ${isin}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Variazione percentuale di oggi per i titoli quotati da Scalable, che non la forniscono.
 * Accetta ISIN o ticker; restituisce solo i titoli per cui Yahoo ha un dato.
 */
export const getDailyChanges = onCall(async (request: CallableRequest<{ symbols?: string[] }>) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Devi essere autenticato per recuperare le variazioni giornaliere");
  }
  const symbols = (request.data.symbols ?? []).filter((s) => typeof s === "string").slice(0, 50);
  if (symbols.length === 0) {
    return { changes: {} };
  }

  const resolved = await Promise.all(
    symbols.map(async (s) => [s, ISIN_PATTERN.test(s) ? await resolveYahooSymbol(s) : s] as const),
  );
  const yahooSymbols = Array.from(new Set(resolved.map(([, y]) => y).filter((y): y is string => !!y)));
  if (yahooSymbols.length === 0) {
    return { changes: {} };
  }

  try {
    const results = await yf.quote(yahooSymbols);
    const list = (Array.isArray(results) ? results : [results]) as Array<{
      symbol?: string;
      regularMarketChangePercent?: number;
      regularMarketTime?: Date | string | number;
    }>;
    const bySymbol = new Map(list.filter((q) => q?.symbol).map((q) => [q.symbol as string, q]));

    const changes: Record<string, DailyChange> = {};
    for (const [original, yahooSymbol] of resolved) {
      const q = yahooSymbol ? bySymbol.get(yahooSymbol) : undefined;
      if (q && typeof q.regularMarketChangePercent === "number") {
        changes[original] = {
          changePercent: q.regularMarketChangePercent,
          yahooSymbol: yahooSymbol as string,
          marketTime: q.regularMarketTime ? new Date(q.regularMarketTime).toISOString() : undefined,
        };
      }
    }
    return { changes };
  } catch (error: unknown) {
    console.error("Error in getDailyChanges:", error instanceof Error ? error.message : String(error));
    throw new HttpsError("unavailable", "Variazioni giornaliere non disponibili");
  }
});
