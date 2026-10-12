import { useEffect, useMemo, useState } from 'react';
import { Transaction } from '../types';
import type { WeeklySeries } from '../services/yahooFinance';
import { fetchDailyYear } from '../services/historicalPrices';
import { backfillSymbols } from '../utils/historyBackfill';

/**
 * Prezzi storici per il rendimento per periodo. Si scaricano solo quando servono (`enabled`),
 * cioè quando l'utente sceglie un periodo diverso da Oggi / Totale; poi restano in memoria per la giornata.
 */
export const usePeriodSeries = (transactions: Transaction[], enabled: boolean) => {
  const symbols = useMemo(() => backfillSymbols(transactions).sort(), [transactions]);
  const key = symbols.join(',');
  const [state, setState] = useState<{ key: string; series: Record<string, WeeklySeries> | null; error: boolean }>({ key: '', series: null, error: false });

  useEffect(() => {
    if (!enabled || symbols.length === 0) return;
    let cancelled = false;
    fetchDailyYear(symbols)
      .then(series => { if (!cancelled) setState({ key, series, error: false }); })
      .catch(err => {
        console.warn('Prezzi storici non disponibili:', err);
        if (!cancelled) setState({ key, series: null, error: true });
      });
    return () => { cancelled = true; };
  }, [enabled, key, symbols]);

  const current = state.key === key;
  return {
    series: current ? state.series : null,
    loading: enabled && symbols.length > 0 && !current,
    error: current && state.error,
  };
};
