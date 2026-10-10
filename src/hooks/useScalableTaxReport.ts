import { useState, useEffect, useCallback, useMemo } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { BrokerTaxReport, ScalableTaxReport, Transaction, TaxOptimizationTip } from '../types';
import { fetchScalableTaxReport } from '../services/scalableMcp';
import { computeTaxReportsByBroker, generateTaxOptimizationTips, TaxAssetMeta } from '../utils/taxLossTracker';

export interface UseScalableTaxReportResult {
  /** Uno zainetto per intermediario, calcolato dalle transazioni */
  brokers: BrokerTaxReport[];
  /** Zainetto Scalable (per la schermata dell'integrazione) */
  taxReport: ScalableTaxReport | null;
  /** Dato ufficiale comunicato da Scalable, se il broker lo espone: fa fede rispetto alla stima */
  officialScalable: ScalableTaxReport | null;
  tips: TaxOptimizationTip[];
  loading: boolean;
  refreshing: boolean;
  refreshError: string | null;
  refreshTaxReport: () => Promise<void>;
}

export const useScalableTaxReport = (
  userId: string | undefined,
  transactions: Transaction[] = [],
  options: { transactionsLoading?: boolean; assetMeta?: Record<string, TaxAssetMeta> } = {}
): UseScalableTaxReportResult => {
  const [brokerReport, setBrokerReport] = useState<ScalableTaxReport | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      const timeoutId = setTimeout(() => {
        setBrokerReport(null);
        setSnapshotLoading(false);
      }, 0);
      return () => clearTimeout(timeoutId);
    }

    const docRef = doc(db, `portfolios/${userId}/settings/scalable_tax_report`);
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        setBrokerReport(snap.exists() ? (snap.data() as ScalableTaxReport) : null);
        setSnapshotLoading(false);
      },
      (err) => {
        console.error('Error listening to Scalable tax report:', err);
        setSnapshotLoading(false);
      }
    );
    return unsubscribe;
  }, [userId]);

  const refreshTaxReport = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const res = await fetchScalableTaxReport();
      if (res.success && res.report) setBrokerReport(res.report);
    } catch (e) {
      console.warn('Could not refresh Scalable tax report on-demand:', e);
      setRefreshError('Aggiornamento da Scalable non riuscito: la stima qui sotto usa le transazioni già sincronizzate.');
    } finally {
      setRefreshing(false);
    }
  }, [userId]);

  const assetMeta = options.assetMeta;
  const brokers = useMemo(() => computeTaxReportsByBroker(transactions, assetMeta ?? {}), [transactions, assetMeta]);
  // Solo un dato che arriva davvero dal broker conta come ufficiale; i vecchi calcoli del server no
  const officialScalable = brokerReport && brokerReport.source === 'mcp' ? brokerReport : null;
  const scalable = brokers.find(b => b.brokerId === 'scalable')?.report ?? null;
  const tips = useMemo(() => generateTaxOptimizationTips(scalable ?? brokers[0]?.report ?? null), [scalable, brokers]);

  return {
    brokers,
    taxReport: scalable,
    officialScalable,
    tips,
    loading: snapshotLoading || !!options.transactionsLoading,
    refreshing,
    refreshError,
    refreshTaxReport,
  };
};
