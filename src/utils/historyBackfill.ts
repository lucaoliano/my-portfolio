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
 * Valore del portafoglio alla chiusura di `date`: quote possedute quel giorno × chiusura × cambio;
 * costo = costo medio della posizione. "Completo" solo se tutti i titoli posseduti hanno prezzo e cambio.
 * Con `nowEurByKey` la chiusura è riportata al prezzo attuale in euro (prezzo attuale × chiusura / ultima chiusura):
 * così i giorni ricostruiti si raccordano con quelli registrati anche se Yahoo quota un'altra borsa.
 */
const pointAt = (
  bySymbol: Map<string, Transaction[]>,
  series: Record<string, WeeklySeries>,
  date: string,
  nowEurByKey?: Record<string, number | null>
): BackfillPoint | null => {
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
    const fxSeries = series[`${currency}EUR=X`];
    const fx = currency === 'EUR' ? 1 : closeAt(fxSeries, date);
    if (price === null || fx === null) {
      complete = false;
      return;
    }
    const nowEur = nowEurByKey?.[key] ?? null;
    const latest = s && s.points.length > 0 ? s.points[s.points.length - 1].close : null;
    const latestFx = currency === 'EUR' ? 1 : closeAt(fxSeries, '9999-12-31');
    const unitEur = nowEur !== null && latest && latestFx ? nowEur * (price * fx) / (latest * latestFx) : price * fx;
    invested += pos.totalQuantity * unitEur;
    costBasis += pos.totalInvestedEur ?? pos.totalInvested * fx;
  });
  if (!held || invested <= 0) return null;
  return { date, invested: Math.round(invested * 100) / 100, costBasis: Math.round(costBasis * 100) / 100, complete };
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
  nowEurByKey?: Record<string, number | null>
): BackfillPoint[] => {
  if (transactions.length === 0) return [];
  const first = transactions.map(t => t.date.slice(0, 10)).sort()[0];
  const bySymbol = groupByPriceKey(transactions);
  const points: BackfillPoint[] = [];
  for (let date = addDays(first, 7 - ((new Date(`${first}T12:00:00Z`).getUTCDay() + 2) % 7)); date < until; date = addDays(date, 7)) {
    const p = pointAt(bySymbol, series, date, nowEurByKey);
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
 * Un giorno senza chiusura (festivo di borsa) non produce un punto.
 */
export const buildDailyBackfill = (
  transactions: Transaction[],
  series: Record<string, WeeklySeries>,
  dates: string[],
  nowEurByKey?: Record<string, number | null>
): BackfillPoint[] => {
  const bySymbol = groupByPriceKey(transactions);
  const hasCloseOn = (d: string) => Object.entries(series).some(([k, s]) => !k.endsWith('=X') && s.points.some(p => p.date === d));
  return dates
    .filter(hasCloseOn)
    .map(d => pointAt(bySymbol, series, d, nowEurByKey))
    .filter((p): p is BackfillPoint => p !== null && p.complete);
};
