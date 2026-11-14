import { useMemo } from 'react';
import { useTransactions } from './useTransactions';
import { useAssetCategories } from './useAssetCategories';
import { useUserSettings, DEFAULT_PORTFOLIO } from './useUserSettings';
import { useScalableConfig } from './useScalableConfig';
import { useScalableSavingsPlans } from './useScalableSavingsPlans';
import { usePortfolioQuotes } from './usePortfolioQuotes';
import { calculatePortfolioAggregation } from '../utils/portfolioAggregator';
import { calculatePortfolioHealthCheck } from '../utils/portfolioHealthCheck';
import { ScalableInterestPlanId } from '../utils/cashInterest';

/**
 * Dati del portafoglio condivisi da dashboard e "Salute del portafoglio":
 * transazioni, quotazioni, aggregazione per gruppi, liquidità Scalable e health check.
 * Se selectedPortfolioId è indicato (diverso da 'all' o null), filtra le transazioni per quel portafoglio.
 */
export const usePortfolioOverview = (userId: string | undefined, selectedPortfolioId?: string | null) => {
  const { transactions, loading: txLoading } = useTransactions(userId);
  const { assetCategories } = useAssetCategories(userId);
  const { settings, loading: settingsLoading } = useUserSettings(userId);
  const { config: scalableConfig } = useScalableConfig(userId);
  const { plans: scalableSavingsPlans } = useScalableSavingsPlans(userId);
  const quotesState = usePortfolioQuotes(userId, transactions, txLoading);

  const portfolios = useMemo(() => settings?.portfolios || [DEFAULT_PORTFOLIO], [settings?.portfolios]);
  const isFiltered = Boolean(selectedPortfolioId && selectedPortfolioId !== 'all');

  const filteredTransactions = useMemo(() => {
    if (!isFiltered) return transactions;
    return transactions.filter(tx => (tx.portfolioId || 'default') === selectedPortfolioId);
  }, [transactions, selectedPortfolioId, isFiltered]);

  const aggregation = useMemo(
    () => calculatePortfolioAggregation(
      filteredTransactions,
      quotesState.quotes,
      assetCategories,
      settings,
      quotesState.fxRates,
      { selectedPortfolioId }
    ),
    [filteredTransactions, quotesState.quotes, assetCategories, settings, quotesState.fxRates, selectedPortfolioId]
  );

  const isScalableConnected = !!scalableConfig?.enabled && scalableConfig?.status === 'connected';
  const isScalablePortfolio = !isFiltered || selectedPortfolioId === 'default' || selectedPortfolioId === settings?.defaultPortfolioId;
  const scalableCash = (isScalableConnected && isScalablePortfolio) ? (scalableConfig?.cashBalance || 0) : 0;
  // undefined = tasso mai impostato dall'utente: la UI non deve mostrarne uno inventato
  const configuredInterestRate = scalableConfig?.interestRate;
  const includeCashInTotal = scalableConfig?.includeCashInTotal ?? false;

  // Un titolo per simbolo, calcolato su tutte le transazioni filtrate
  const allAssets = aggregation.globalAssets;

  const healthCheck = useMemo(
    () => calculatePortfolioHealthCheck(
      allAssets,
      scalableCash,
      (scalableConfig?.interestPlan as ScalableInterestPlanId) || 'prime',
      configuredInterestRate ?? null,
      scalableSavingsPlans,
      {
        scalableConnected: isScalableConnected && isScalablePortfolio,
        includeCashInWeights: includeCashInTotal,
        incompleteAssets: aggregation.fxMissingSymbols.length + aggregation.missingPriceSymbols.length,
      }
    ),
    [aggregation.fxMissingSymbols.length, aggregation.missingPriceSymbols.length, allAssets, scalableCash, scalableConfig?.interestPlan, configuredInterestRate, scalableSavingsPlans, isScalableConnected, isScalablePortfolio, includeCashInTotal]
  );

  const isInitialLoading =
    (txLoading || settingsLoading || quotesState.loading) &&
    (transactions.length === 0 || Object.keys(quotesState.quotes).length === 0);

  return {
    allTransactions: transactions,
    transactions: filteredTransactions,
    settings,
    portfolios,
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
