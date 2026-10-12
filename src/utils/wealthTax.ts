import { Transaction } from '../types';
import { priceKey } from './historyBackfill';

/**
 * Imposta di bollo sui prodotti finanziari (intermediario italiano) e IVAFE (attività detenute all'estero):
 * stessa aliquota dello 0,2% annuo sul valore di mercato, in proporzione ai giorni di possesso.
 * Per conti e depositi di liquidità: €34,20 l'anno, dovuti solo se la giacenza media supera €5.000.
 */
export const WEALTH_TAX_RATE = 0.002;
export const CASH_FLAT_TAX = 34.2;
export const CASH_THRESHOLD = 5000;

/** Chi applica l'imposta: il broker italiano la trattiene (bollo), con un broker estero la versi tu (IVAFE, quadro RW) */
export type WealthTaxRegime = 'bollo' | 'ivafe';

export interface WealthTaxLine {
  key: string;
  name: string;
  /** Valore di riferimento in euro: al 31/12, oppure alla vendita se la posizione è stata chiusa nell'anno */
  value: number;
  /** Giorni di possesso nell'anno */
  days: number;
  tax: number;
  closedOn?: string;
}

export interface WealthTaxEstimate {
  year: number;
  lines: WealthTaxLine[];
  securitiesTax: number;
  securitiesValue: number;
  cash: { balance: number; tax: number } | null;
  total: number;
  /** Titoli posseduti nell'anno ma senza prezzo: esclusi dal totale */
  missing: string[];
}

const daysInYear = (year: number) => ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365);

const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000) + 1;

const signedQty = (t: Transaction) => ((t.type || 'BUY') === 'SELL' ? -1 : 1) * (Number(t.quantity) || 0);

/**
 * Stima per un anno.
 * `priceAtYearEnd(key, txs)` dà il prezzo in euro per quota al 31/12 (o il prezzo attuale per l'anno in corso).
 * Le posizioni chiuse nell'anno pagano sul controvalore della vendita, per i giorni posseduti.
 */
export function estimateWealthTax(
  transactions: Transaction[],
  year: number,
  priceAtYearEnd: (key: string, txs: Transaction[]) => number | null,
  cashBalance: number | null = null
): WealthTaxEstimate {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const totalDays = daysInYear(year);

  const byKey = new Map<string, Transaction[]>();
  transactions.forEach(t => byKey.set(priceKey(t), [...(byKey.get(priceKey(t)) ?? []), t]));

  const lines: WealthTaxLine[] = [];
  const missing: string[] = [];

  byKey.forEach((all, key) => {
    const txs = [...all].sort((a, b) => a.date.localeCompare(b.date));
    const name = txs.find(t => t.name)?.name || txs[0].symbol;
    let qty = 0;
    let openedOn: string | null = null;
    // Una posizione può essere aperta e chiusa più volte nell'anno: ogni tratto conta per i suoi giorni
    for (const t of txs) {
      const d = t.date.slice(0, 10);
      if (d > yearEnd) break;
      const before = qty;
      qty += signedQty(t);
      if (before <= 1e-9 && qty > 1e-9) openedOn = d;
      if (before > 1e-9 && qty <= 1e-9 && openedOn) {
        if (d >= yearStart) {
          const from = openedOn > yearStart ? openedOn : yearStart;
          const fx = t.currency && t.currency.toUpperCase() !== 'EUR' && t.source !== 'scalable_mcp' ? t.fxRate : 1;
          if (!fx) missing.push(name);
          else {
            const value = before * (Number(t.purchasePrice) || 0) * fx;
            const days = dayDiff(from, d);
            lines.push({ key: `${key}|${d}`, name, value, days, tax: value * WEALTH_TAX_RATE * days / totalDays, closedOn: d });
          }
        }
        openedOn = null;
      }
    }
    if (qty > 1e-9 && openedOn) {
      const price = priceAtYearEnd(key, txs);
      if (price === null) {
        missing.push(name);
        return;
      }
      const from = openedOn > yearStart ? openedOn : yearStart;
      const value = qty * price;
      const days = dayDiff(from, yearEnd);
      lines.push({ key, name, value, days, tax: value * WEALTH_TAX_RATE * days / totalDays });
    }
  });

  lines.sort((a, b) => b.tax - a.tax);
  const securitiesTax = lines.reduce((s, l) => s + l.tax, 0);
  const securitiesValue = lines.filter(l => !l.closedOn).reduce((s, l) => s + l.value, 0);
  const cash = cashBalance !== null && cashBalance > 0
    ? { balance: cashBalance, tax: cashBalance > CASH_THRESHOLD ? CASH_FLAT_TAX : 0 }
    : null;
  return {
    year,
    lines,
    securitiesTax,
    securitiesValue,
    cash,
    total: securitiesTax + (cash?.tax ?? 0),
    missing: Array.from(new Set(missing)),
  };
}
