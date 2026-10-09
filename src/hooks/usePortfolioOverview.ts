import { useMemo } from 'react';
import { useTransactions } from './useTransactions';
import { useAssetCategories } from './useAssetCategories';
import { useUserSettings } from './useUserSettings';
import { useScalableConfig } from './useScalableConfig';
import { useScalableSavingsPlans } from './useScalableSavingsPlans';
import { usePortfolioQuotes } from './usePortfolioQuotes';
import { calculatePortfolioAggregation } from '../utils/portfolioAggregator';
import { calculatePortfolioHealthCheck } from '../utils/portfolioHealthCheck';
import { ScalableInterestPlanId } from '../utils/cashInterest';

/**
 * Dati del portafoglio condivisi da dashboard e "Salute del portafoglio":
 * transazioni, quotazioni, aggregazione per gruppi, liquidità Scalable e health check.
 */
export const usePortfolioOverview = (userId: string | undefined) => {
  const { transactions, loading: txLoading } = useTransactions(userId);
  const { assetCategories } = useAssetCategories(userId);
  const { settings, loading: settingsLoading } = useUserSettings(userId);
  const { config: scalableConfig } = useScalableConfig(userId);
  const { plans: scalableSavingsPlans } = useScalableSavingsPlans(userId);
  const quotesState = usePortfolioQuotes(userId, transactions, txLoading);

  const aggregation = useMemo(
    () => calculatePortfolioAggregation(transactions, quotesState.quotes, assetCategories, settings, quotesState.fxRates),
    [transactions, quotesState.quotes, assetCategories, settings, quotesState.fxRates]
  );

  const isScalableConnected = !!scalableConfig?.enabled && scalableConfig?.status === 'connected';
  const scalableCash = isScalableConnected ? (scalableConfig?.cashBalance || 0) : 0;
  // undefined = tasso mai impostato dall'utente: la UI non deve mostrarne uno inventato
  const configuredInterestRate = scalableConfig?.interestRate;
  const includeCashInTotal = scalableConfig?.includeCashInTotal ?? false;

  // Un titolo per simbolo, calcolato su tutte le transazioni: sommare i gruppi conterebbe due volte
  // le transazioni assegnate a più gruppi.
  const allAssets = aggregation.globalAssets;

  const healthCheck = useMemo(
    () => calculatePortfolioHealthCheck(
      allAssets,
      scalableCash,
      (scalableConfig?.interestPlan as ScalableInterestPlanId) || 'prime',
      configuredInterestRate ?? null,
      scalableSavingsPlans,
      { scalableConnected: isScalableConnected, includeCashInWeights: includeCashInTotal }
    ),
    [allAssets, scalableCash, scalableConfig?.interestPlan, configuredInterestRate, scalableSavingsPlans, isScalableConnected, includeCashInTotal]
  );

  const isInitialLoading =
    (txLoading || settingsLoading || quotesState.loading) &&
    (transactions.length === 0 || Object.keys(quotesState.quotes).length === 0);

  return {
    transactions,
    settings,
    scalableConfig,
    isScalableConnected,
    scalableCash,
    configuredInterestRate,
    includeCashInTotal,
    quotesState,
    aggregation,
    allAssets,
    healthCheck,
    isInitialLoading,
  };
};
