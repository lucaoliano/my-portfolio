import { Transaction } from '../types';
import { calculatePosition } from './portfolioAggregator';
import type { WeeklySeries } from '../services/yahooFinance';
import { closeAt, isForeignManual, makePriceAt } from './priceHistory';

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

/** Simbolo con cui chiedere i prezzi: ISIN per i titoli Scalable, altrimenti il ticker */
export const priceKey = (t: Transaction) => (t.source === 'scalable_mcp' && t.isin ? t.isin : t.symbol);

/** Simboli e cambi da scaricare per ricostruire lo storico */
export const backfillSymbols = (transactions: Transaction[]): string[] => {
  const symbols = new Set(transactions.map(priceKey));
  transactions.filter(isForeignManual).forEach(t => symbols.add(`${t.currency!.toUpperCase()}EUR=X`));
  return Array.from(symbols);
};

type PriceAt = (date: string) => number | null;

/**
 * Valore del portafoglio alla chiusura di `date`: quote possedute quel giorno × prezzo ricostruito
 * (chiusure Yahoo ancorate ai prezzi delle operazioni e a quello attuale, vedi makePriceAt);
 * costo = costo medio della posizione. "Completo" solo se tutti i titoli posseduti hanno un prezzo.
 */
const pointAt = (
  bySymbol: Map<string, Transaction[]>,
  priceAtByKey: Map<string, PriceAt>,
  series: Record<string, WeeklySeries>,
  date: string
): BackfillPoint | null => {
  let invested = 0;
  let costBasis = 0;
  let complete = true;
  let held = false;
  bySymbol.forEach((txs, key) => {
    const pos = calculatePosition(txs.filter(t => t.date.slice(0, 10) <= date));
    if (pos.totalQuantity <= 0) return;
    held = true;
    const unitEur = priceAtByKey.get(key)!(date);
    if (unitEur === null) {
      complete = false;
      return;
    }
    const foreign = txs.find(isForeignManual);
    const fx = foreign ? closeAt(series[`${foreign.currency!.toUpperCase()}EUR=X`], date) ?? 1 : 1;
    invested += pos.totalQuantity * unitEur;
    costBasis += pos.totalInvestedEur ?? pos.totalInvested * fx;
  });
  if (!held || invested <= 0) return null;
  return { date, invested: Math.round(invested * 100) / 100, costBasis: Math.round(costBasis * 100) / 100, complete };
};

const pricesByKey = (
  bySymbol: Map<string, Transaction[]>,
  series: Record<string, WeeklySeries>,
  nowEurByKey?: Record<string, number | null>,
  today?: string
) => {
  const map = new Map<string, PriceAt>();
  bySymbol.forEach((txs, key) => map.set(key, makePriceAt(txs, series, key, nowEurByKey?.[key] ?? null, today)));
  return map;
};

const groupByPriceKey = (transactions: Transaction[]) => {
  const bySymbol = new Map<string, Transaction[]>();
  transactions.forEach(t => {
    const key = priceKey(t);
    bySymbol.set(key, [...(bySymbol.get(key) ?? []), t]);
  });
  return bySymbol;
};

/** Un punto a settimana (venerdì) tra il primo acquisto e il primo giorno già registrato. */
export const buildBackfill = (
  transactions: Transaction[],
  series: Record<string, WeeklySeries>,
  until: string,
  nowEurByKey?: Record<string, number | null>,
  today?: string
): BackfillPoint[] => {
  if (transactions.length === 0) return [];
  const first = transactions.map(t => t.date.slice(0, 10)).sort()[0];
  const bySymbol = groupByPriceKey(transactions);
  const prices = pricesByKey(bySymbol, series, nowEurByKey, today);
  const points: BackfillPoint[] = [];
  for (let date = addDays(first, 7 - ((new Date(`${first}T12:00:00Z`).getUTCDay() + 2) % 7)); date < until; date = addDays(date, 7)) {
    const p = pointAt(bySymbol, prices, series, date);
    if (p) points.push(p);
  }
  return points;
};

/** Giorni feriali tra `from` e `to` (inclusi) che mancano dallo storico registrato */
export const missingWeekdays = (existing: Set<string>, from: string, to: string): string[] => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6 && !existing.has(d)) out.push(d);
  }
  return out;
};

/**
 * Riempie i giorni in cui l'app non è stata aperta, con le chiusure giornaliere.
 * Un giorno senza chiusura (festivo di borsa) non produce un punto. Un titolo senza prezzo resta fuori
 * da valore e costo (il guadagno degli altri resta giusto) e il punto è segnato come incompleto.
 */
export const buildDailyBackfill = (
  transactions: Transaction[],
  series: Record<string, WeeklySeries>,
  dates: string[],
  nowEurByKey?: Record<string, number | null>,
  today?: string
): BackfillPoint[] => {
  const bySymbol = groupByPriceKey(transactions);
  const prices = pricesByKey(bySymbol, series, nowEurByKey, today);
  const hasCloseOn = (d: string) => Object.entries(series).some(([k, s]) => !k.endsWith('=X') && s.points.some(p => p.date === d));
  return dates
    .filter(hasCloseOn)
    .map(d => pointAt(bySymbol, prices, series, d))
    .filter((p): p is BackfillPoint => p !== null);
};
