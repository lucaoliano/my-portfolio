import { Transaction } from '../types';
import type { WeeklySeries } from '../services/yahooFinance';
import { priceKey } from './historyBackfill';
import type { AggregatedAsset } from '../types';

/** Periodi come nella schermata Performance di Scalable ("1G" usa la variazione di oggi già calcolata). */
export type PeriodKey = '1S' | '1M' | '6M' | 'YTD' | '1A';

export const PERIODS: { key: PeriodKey; label: string; spoken: string }[] = [
  { key: '1S', label: '1S', spoken: 'ultima settimana' },
  { key: '1M', label: '1M', spoken: 'ultimo mese' },
  { key: '6M', label: '6M', spoken: 'ultimi sei mesi' },
  { key: 'YTD', label: 'Da inizio anno', spoken: 'da inizio anno' },
  { key: '1A', label: '1A', spoken: 'ultimo anno' },
];

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Giorno di riferimento iniziale: il valore di partenza è quello alla chiusura di quel giorno. */
export const periodStart = (key: PeriodKey, today = new Date()): string => {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  switch (key) {
    case '1S': d.setDate(d.getDate() - 7); break;
    case '1M': d.setMonth(d.getMonth() - 1); break;
    case '6M': d.setMonth(d.getMonth() - 6); break;
    case 'YTD': return `${today.getFullYear() - 1}-12-31`;
    case '1A': d.setFullYear(d.getFullYear() - 1); break;
  }
  return dateKey(d);
};

export interface PeriodResult {
  /** Guadagno in euro nel periodo: valore finale − valore iniziale − versamenti netti */
  gain: number;
  /** Rendimento ponderato per il tempo (TWR), in percentuale: i versamenti non lo influenzano */
  percent: number | null;
  /** Titoli inclusi nel calcolo, su quanti ne servivano */
  coverage: { withData: number; total: number };
}

const closeAt = (series: WeeklySeries | undefined, date: string): number | null => {
  if (!series) return null;
  let found: number | null = null;
  for (const p of series.points) {
    if (p.date > date) break;
    found = p.close;
  }
  return found;
};

const isForeign = (t: Transaction) => t.source !== 'scalable_mcp' && !!t.currency && t.currency.toUpperCase() !== 'EUR';

/**
 * Prezzo in euro di una quota a una data.
 * - Titoli in euro: il prezzo attuale riportato indietro con la variazione storica (chiusura del giorno / ultima chiusura),
 *   così il punto di partenza è coerente con il prezzo attuale anche se Yahoo quota un'altra borsa.
 * - Titoli in valuta: chiusura × cambio di quel giorno, anch'essa riportata al prezzo attuale in euro.
 */
export const makePriceAt = (txs: Transaction[], series: Record<string, WeeklySeries>, key: string, nowEur: number | null) => {
  const s = series[key];
  const foreign = txs.find(isForeign);
  if (foreign) {
    const fx = series[`${foreign.currency!.toUpperCase()}EUR=X`];
    const latestEur = closeAt(s, '9999-12-31') !== null && closeAt(fx, '9999-12-31') !== null
      ? closeAt(s, '9999-12-31')! * closeAt(fx, '9999-12-31')!
      : null;
    return (date: string): number | null => {
      const c = closeAt(s, date);
      const f = closeAt(fx, date);
      if (c === null || f === null) return null;
      // Come per i titoli in euro: variazione storica applicata al prezzo attuale, così inizio e fine sono coerenti
      return nowEur !== null && latestEur ? nowEur * ((c * f) / latestEur) : c * f;
    };
  }
  const latest = s && s.points.length > 0 ? s.points[s.points.length - 1].close : null;
  return (date: string): number | null => {
    const c = closeAt(s, date);
    if (c === null) return null;
    if (nowEur !== null && latest) return nowEur * (c / latest);
    return s?.currency === 'EUR' ? c : null;
  };
};

const flowEur = (t: Transaction, priceAt: (d: string) => number | null): number | null => {
  const qty = Number(t.quantity) || 0;
  const price = Number(t.purchasePrice) || 0;
  let fx = 1;
  if (isForeign(t)) {
    if (t.fxRate && t.fxRate > 0) fx = t.fxRate;
    else {
      // Senza cambio dell'operazione si usa quello di chiusura del giorno (dedotto dal prezzo storico)
      const eur = priceAt(t.date.slice(0, 10));
      if (eur === null || price <= 0) return null;
      return ((t.type || 'BUY') === 'SELL' ? -1 : 1) * qty * eur;
    }
  }
  return ((t.type || 'BUY') === 'SELL' ? -1 : 1) * qty * price * fx;
};

/**
 * Rendimento di un insieme di transazioni tra la chiusura di `start` e adesso.
 * Il TWR spezza il periodo a ogni giorno con acquisti o vendite e concatena i rendimenti dei sotto-periodi:
 * un versamento del PAC cambia il guadagno in euro ma non la percentuale.
 * Un titolo senza prezzi storici resta fuori ed è contato nella copertura.
 */
export function computePeriodPerformance(
  transactions: Transaction[],
  series: Record<string, WeeklySeries>,
  /** Prezzo attuale in euro per quota, per chiave di prezzo (ISIN per Scalable, ticker altrimenti) */
  nowEurByKey: Record<string, number | null>,
  start: string,
  today = dateKey(new Date())
): PeriodResult | null {
  const byKey = new Map<string, Transaction[]>();
  transactions.forEach(t => byKey.set(priceKey(t), [...(byKey.get(priceKey(t)) ?? []), t]));

  const qtyAt = (txs: Transaction[], date: string) =>
    txs.filter(t => t.date.slice(0, 10) <= date).reduce((q, t) => q + ((t.type || 'BUY') === 'SELL' ? -1 : 1) * (Number(t.quantity) || 0), 0);

  // Solo i titoli coinvolti nel periodo: posseduti all'inizio o mossi durante
  const relevant = Array.from(byKey.entries()).filter(([, txs]) =>
    qtyAt(txs, start) > 1e-9 || txs.some(t => t.date.slice(0, 10) > start)
  );
  if (relevant.length === 0) return null;

  type Asset = { txs: Transaction[]; priceAt: (d: string) => number | null; nowEur: number | null };
  const usable: Asset[] = [];
  for (const [key, txs] of relevant) {
    const nowEur = nowEurByKey[key] ?? null;
    const priceAt = makePriceAt(txs, series, key, nowEur);
    const heldNow = qtyAt(txs, today) > 1e-9;
    const flowDates = txs.map(t => t.date.slice(0, 10)).filter(d => d > start);
    const needs = [...(qtyAt(txs, start) > 1e-9 ? [start] : []), ...flowDates];
    const ok = needs.every(d => priceAt(d) !== null)
      && (!heldNow || nowEur !== null)
      && txs.filter(t => t.date.slice(0, 10) > start).every(t => flowEur(t, priceAt) !== null);
    if (ok) usable.push({ txs, priceAt, nowEur });
  }
  const coverage = { withData: usable.length, total: relevant.length };
  if (usable.length === 0) return { gain: 0, percent: null, coverage };

  const valueAt = (date: string) => usable.reduce((v, a) => {
    const q = qtyAt(a.txs, date);
    return q > 1e-9 ? v + q * (a.priceAt(date) ?? 0) : v;
  }, 0);
  const flowsOn = (date: string) => usable.reduce((f, a) =>
    f + a.txs.filter(t => t.date.slice(0, 10) === date).reduce((s, t) => s + (flowEur(t, a.priceAt) ?? 0), 0), 0);

  const startValue = valueAt(start);
  const flowDates = Array.from(new Set(usable.flatMap(a => a.txs.map(t => t.date.slice(0, 10)).filter(d => d > start)))).sort();

  let growth = 1;
  let prev = startValue;
  let netFlows = 0;
  for (const d of flowDates) {
    const f = flowsOn(d);
    const v = valueAt(d);
    netFlows += f;
    if (prev > 0) growth *= (v - f) / prev;
    else if (f > 0) growth *= v / f; // primo ingresso: dal prezzo pagato alla chiusura del giorno
    prev = v;
  }
  const nowValue = usable.reduce((v, a) => {
    const q = qtyAt(a.txs, today);
    return q > 1e-9 ? v + q * (a.nowEur ?? 0) : v;
  }, 0);
  if (prev > 0) growth *= nowValue / prev;

  const exposed = startValue > 0 || netFlows !== 0 || flowDates.length > 0;
  return {
    gain: nowValue - startValue - netFlows,
    percent: exposed && isFinite(growth) ? (growth - 1) * 100 : null,
    coverage,
  };
}

/** Prezzo attuale in euro per quota, per chiave di prezzo (ISIN per Scalable, ticker altrimenti) */
export const nowEurByPriceKey = (assets: AggregatedAsset[], transactions: Transaction[]): Record<string, number | null> => {
  const map: Record<string, number | null> = {};
  assets.forEach(a => {
    const price = a.hasPrice && a.valueInBase != null && a.totalQuantity > 0 ? a.valueInBase / a.totalQuantity : null;
    transactions.filter(t => t.symbol === a.symbol).forEach(t => { map[priceKey(t)] = price; });
  });
  return map;
};
