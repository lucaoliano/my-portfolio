import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ScalableTaxReport, Transaction, AggregatedAsset, TaxOptimizationTip } from '../types';
import { fetchScalableTaxReport } from '../services/scalableMcp';
import {
  computeTaxReportFromTransactions,
  mergeTaxReport,
  generateTaxOptimizationTips,
} from '../utils/taxLossTracker';

export interface UseScalableTaxReportResult {
  taxReport: ScalableTaxReport | null;
  tips: TaxOptimizationTip[];
  loading: boolean;
  refreshing: boolean;
  refreshTaxReport: () => Promise<void>;
}

export const useScalableTaxReport = (
  userId: string | undefined,
  transactions: Transaction[] = [],
  assets: AggregatedAsset[] = []
): UseScalableTaxReportResult => {
  const [mcpTaxReport, setMcpTaxReport] = useState<ScalableTaxReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  useEffect(() => {
    if (!userId) {
      const timeoutId = setTimeout(() => {
        setMcpTaxReport(null);
        setLoading(false);
      }, 0);
      return () => clearTimeout(timeoutId);
    }

    const docRef = doc(db, `portfolios/${userId}/settings/scalable_tax_report`);
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          setMcpTaxReport(snap.data() as ScalableTaxReport);
        } else {
          setMcpTaxReport(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to Scalable tax report:', err);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [userId]);

  const refreshTaxReport = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      const res = await fetchScalableTaxReport();
      if (res.success && res.report) {
        setMcpTaxReport(res.report);
      }
    } catch (e) {
      console.warn('Could not refresh Scalable tax report on-demand:', e);
    } finally {
      setRefreshing(false);
    }
  }, [userId]);

  // Compute calculated report from transactions
  const calculatedReport = computeTaxReportFromTransactions(transactions);

  // Merge broker MCP report (if present) with calculated trades
  const taxReport = mcpTaxReport
    ? mergeTaxReport(mcpTaxReport, calculatedReport)
    : calculatedReport;

  // Generate deterministic optimization tips
  const tips = generateTaxOptimizationTips(taxReport, assets);

  return {
    taxReport,
    tips,
    loading,
    refreshing,
    refreshTaxReport,
  };
};
