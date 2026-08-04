import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import YahooFinance from "yahoo-finance2";

if (!getApps().length) {
  initializeApp();
}

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
    // Gestione deterministica in UTC per evitare shift del fuso orario
    const targetDate = new Date(`${date}T00:00:00.000Z`);
    const endDate = new Date(targetDate);
    endDate.setUTCDate(endDate.getUTCDate() + 1);

    // Inizia la ricerca fino a 4 giorni prima per coprire weekend e festività
    const startDate = new Date(targetDate);
    startDate.setUTCDate(startDate.getUTCDate() - 4);

    const period1 = startDate.toISOString().split("T")[0];
    const period2 = endDate.toISOString().split("T")[0];

    const results = await yf.historical(symbol, {
      period1,
      period2,
    });

    if (results && results.length > 0) {
      // Prendi l'ultimo prezzo di chiusura disponibile nella finestra temporale
      const lastResult = results[results.length - 1];
      return { price: lastResult.close };
    } else {
      // Se non ci sono dati, ritorniamo null
      return { price: null };
    }
  } catch (error: unknown) {
    console.error(`Error calling Yahoo Finance historical for ${symbol} on ${date}:`, error instanceof Error ? error.message : String(error));
    throw new HttpsError(
      "internal",
      "Errore durante il recupero del prezzo storico",
    );
  }
});
