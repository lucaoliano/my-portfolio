import { Transaction } from '../types';
import type { WeeklySeries } from '../services/yahooFinance';

const DAY = 86400000;

/** Ultima chiusura disponibile fino alla data (inclusa) */
export const closeAt = (series: WeeklySeries | undefined, date: string): number | null => {
  if (!series) return null;
  let found: number | null = null;
  for (const p of series.points) {
    if (p.date > date) break;
    found = p.close;
  }
  return found;
};

/** Titolo inserito a mano in valuta estera: prezzi e cambi vanno convertiti */
export const isForeignManual = (t: Transaction) => t.source !== 'scalable_mcp' && !!t.currency && t.currency.toUpperCase() !== 'EUR';

const toMs = (date: string) => Date.parse(`${date}T12:00:00Z`);

/**
 * Prezzo in euro di una quota a una data, ricostruito dalle chiusure di Yahoo.
 *
 * Yahoo può quotare il titolo su un'altra borsa o in un'altra valuta rispetto al broker: prese così,
 * le chiusure darebbero guadagni finti. Per questo la serie è "ancorata" ai prezzi veri che conosciamo:
 * il prezzo di ogni acquisto o vendita nel suo giorno e il prezzo attuale oggi. Tra un ancoraggio e
 * l'altro la correzione cambia gradualmente, così il grafico segue i movimenti di Yahoo ma coincide
 * con i prezzi pagati e con quello di oggi.
 */
export const makePriceAt = (
  txs: Transaction[],
  series: Record<string, WeeklySeries>,
  key: string,
  nowEur: number | null,
  today = new Date().toISOString().slice(0, 10)
) => {
  const s = series[key];
  const foreign = txs.find(isForeignManual);
  const fx = foreign ? series[`${foreign.currency!.toUpperCase()}EUR=X`] : undefined;

  // Chiusura grezza, convertita in euro solo per i titoli inseriti a mano in valuta
  const raw = (date: string): number | null => {
    const c = closeAt(s, date);
    if (c === null) return null;
    if (!foreign) return c;
    const f = closeAt(fx, date);
    return f === null ? null : c * f;
  };

  // Ancoraggi: rapporto tra prezzo vero e chiusura grezza, in scala logaritmica
  const byDate = new Map<string, number>();
  for (const t of txs) {
    const date = t.date.slice(0, 10);
    const price = Number(t.purchasePrice) || 0;
    const rate = isForeignManual(t) ? (t.fxRate && t.fxRate > 0 ? t.fxRate : null) : 1;
    const r = raw(date);
    if (price > 0 && rate !== null && r !== null && r > 0) byDate.set(date, Math.log((price * rate) / r));
  }
  const latestRaw = raw(today);
  if (nowEur !== null && nowEur > 0 && latestRaw !== null && latestRaw > 0) byDate.set(today, Math.log(nowEur / latestRaw));
  const anchors = Array.from(byDate.entries())
    .map(([date, logRatio]) => ({ t: toMs(date), logRatio }))
    .sort((a, b) => a.t - b.t);

  const ratioAt = (date: string): number => {
    if (anchors.length === 0) return 1;
    const t = toMs(date);
    if (t <= anchors[0].t) return Math.exp(anchors[0].logRatio);
    const last = anchors[anchors.length - 1];
    if (t >= last.t) return Math.exp(last.logRatio);
    for (let i = 1; i < anchors.length; i++) {
      const b = anchors[i];
      if (t <= b.t) {
        const a = anchors[i - 1];
        const w = (t - a.t) / Math.max(DAY, b.t - a.t);
        return Math.exp(a.logRatio + (b.logRatio - a.logRatio) * w);
      }
    }
    return Math.exp(last.logRatio);
  };

  return (date: string): number | null => {
    const r = raw(date);
    if (r === null) return null;
    // Senza nessun prezzo vero a cui ancorarsi, solo una serie già in euro è utilizzabile
    if (anchors.length === 0 && (foreign ? false : s?.currency !== 'EUR')) return null;
    return r * ratioAt(date);
  };
};
