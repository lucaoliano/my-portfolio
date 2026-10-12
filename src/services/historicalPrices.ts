import { getWeeklyCloses, WeeklySeries } from './yahooFinance';

/**
 * Chiusure storiche (Yahoo Finance, tramite la Cloud Function) tenute in memoria per la giornata:
 * grafici, rendimento per periodo e ricostruzione dello storico condividono lo stesso download.
 */
const cache = new Map<string, Promise<Record<string, WeeklySeries>>>();

const daysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

export const fetchCloses = (symbols: string[], from: string, interval: '1d' | '1wk'): Promise<Record<string, WeeklySeries>> => {
  const sorted = [...symbols].sort();
  const key = `${new Date().toDateString()}|${interval}|${from}|${sorted.join(',')}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = getWeeklyCloses(sorted, from, interval);
    // Un errore non resta in memoria: al prossimo tentativo si riprova
    pending.catch(() => cache.delete(key));
    cache.set(key, pending);
  }
  return pending;
};

/** Chiusure giornaliere dell'ultimo anno (più una settimana di margine per il punto di partenza) */
export const fetchDailyYear = (symbols: string[]) => fetchCloses(symbols, daysAgo(372), '1d');

/** Chiusure settimanali degli ultimi cinque anni */
export const fetchWeeklyFiveYears = (symbols: string[]) => fetchCloses(symbols, daysAgo(5 * 366), '1wk');
