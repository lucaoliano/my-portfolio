import { Transaction } from '../types';
import { calculatePosition } from './portfolioAggregator';
import type { WeeklySeries } from '../services/yahooFinance';

export interface BackfillPoint {
  date: string;
  invested: number;
  costBasis: number;
  complete: boolean;
}

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Ultima chiusura disponibile fino alla data (inclusa) */
const closeAt = (series: WeeklySeries | undefined, date: string): number | null => {
  if (!series) return null;
  let found: number | null = null;
  for (const p of series.points) {
    if (p.date > date) break;
    found = p.close;
  }
  return found;
};

const isForeignManual = (t: Transaction) => t.source !== 'scalable_mcp' && !!t.currency && t.currency.toUpperCase() !== 'EUR';

/** Simbolo con cui chiedere i prezzi: ISIN per i titoli Scalable, altrimenti il ticker */
export const priceKey = (t: Transaction) => (t.source === 'scalable_mcp' && t.isin ? t.isin : t.symbol);

/** Simboli e cambi da scaricare per ricostruire lo storico */
export const backfillSymbols = (transactions: Transaction[]): string[] => {
  const symbols = new Set(transactions.map(priceKey));
  transactions.filter(isForeignManual).forEach(t => symbols.add(`${t.currency!.toUpperCase()}EUR=X`));
  return Array.from(symbols);
};

/**
 * Ricostruisce un punto a settimana tra il primo acquisto e il primo giorno già registrato.
 * Valore = quote possedute quel giorno × chiusura della settimana × cambio; costo = costo medio della posizione.
 * Un punto è "completo" solo se tutti i titoli posseduti hanno prezzo e cambio.
 */
export const buildBackfill = (
  transactions: Transaction[],
  series: Record<string, WeeklySeries>,
  until: string
): BackfillPoint[] => {
  if (transactions.length === 0) return [];
  const first = transactions.map(t => t.date.slice(0, 10)).sort()[0];
  const bySymbol = new Map<string, Transaction[]>();
  transactions.forEach(t => {
    const key = priceKey(t);
    bySymbol.set(key, [...(bySymbol.get(key) ?? []), t]);
  });

  const points: BackfillPoint[] = [];
  for (let date = addDays(first, 7 - ((new Date(`${first}T12:00:00Z`).getUTCDay() + 2) % 7)); date < until; date = addDays(date, 7)) {
    let invested = 0;
    let costBasis = 0;
    let complete = true;
    let held = false;
    bySymbol.forEach((txs, key) => {
      const pos = calculatePosition(txs.filter(t => t.date.slice(0, 10) <= date));
      if (pos.totalQuantity <= 0) return;
      held = true;
      const s = series[key];
      const price = closeAt(s, date);
      const currency = (txs.find(isForeignManual)?.currency || (txs[0].source === 'scalable_mcp' ? 'EUR' : s?.currency) || 'EUR').toUpperCase();
      const fx = currency === 'EUR' ? 1 : closeAt(series[`${currency}EUR=X`], date);
      if (price === null || fx === null) {
        complete = false;
        return;
      }
      invested += pos.totalQuantity * price * fx;
      costBasis += pos.totalInvestedEur ?? pos.totalInvested * fx;
    });
    if (held && invested > 0) {
      points.push({ date, invested: Math.round(invested * 100) / 100, costBasis: Math.round(costBasis * 100) / 100, complete });
    }
  }
  return points;
};
