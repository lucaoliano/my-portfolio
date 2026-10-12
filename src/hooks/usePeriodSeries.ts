import { useEffect, useMemo, useState } from 'react';
import { Transaction } from '../types';
import { getWeeklyCloses, WeeklySeries } from '../services/yahooFinance';
import { backfillSymbols } from '../utils/historyBackfill';

// Chiusure giornaliere dell'ultimo anno, tenute in memoria per la giornata: cambiare periodo non riscarica nulla
let cache: { key: string; series: Record<string, WeeklySeries> } | null = null;

const fromDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - 372);
  return d.toISOString().slice(0, 10);
};

/**
 * Prezzi storici per il rendimento per periodo. Si scaricano solo quando servono (`enabled`),
 * cioè quando l'utente sceglie un periodo diverso da Oggi / Totale.
 */
export const usePeriodSeries = (transactions: Transaction[], enabled: boolean) => {
  const symbols = useMemo(() => backfillSymbols(transactions).sort(), [transactions]);
  const key = `${new Date().toDateString()}|${symbols.join(',')}`;
  const [series, setSeries] = useState<Record<string, WeeklySeries> | null>(cache?.key === key ? cache.series : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled || symbols.length === 0) return;
    if (cache?.key === key) {
      const t = setTimeout(() => setSeries(cache!.series), 0);
      return () => clearTimeout(t);
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const result = await getWeeklyCloses(symbols, fromDate(), '1d');
        if (cancelled) return;
        cache = { key, series: result };
        setSeries(result);
      } catch (err) {
        console.warn('Prezzi storici non disponibili:', err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [enabled, key, symbols]);

  return { series, loading, error };
};
