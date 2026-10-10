import { Transaction, GroupedPortfolio, UserSettings, AggregatedAsset, Coverage } from '../types';
import { YahooQuote } from '../services/yahooFinance';
import { calculateTransactionsXIRR } from './xirr';

export interface PositionSummary {
  totalQuantity: number;
  /** Costo della posizione aperta (costo medio ponderato × quantità), nella valuta delle transazioni */
  totalInvested: number;
  averagePrice: number;
  /** Costo in euro della posizione aperta, se tutti gli acquisti in valuta hanno il cambio del giorno; altrimenti null */
  totalInvestedEur: number | null;
}

/**
 * Posizione aperta con il **costo medio ponderato** (come Scalable e come il calcolo fiscale italiano):
 * una vendita riduce quantità e costo in proporzione, senza cambiare il prezzo medio.
 */
export const calculatePosition = (transactions: Transaction[]): PositionSummary => {
  const sortedTx = [...transactions].sort((a, b) => {
    const byDate = a.date.slice(0, 10).localeCompare(b.date.slice(0, 10));
    if (byDate !== 0) return byDate;
    if ((a.type || 'BUY') === 'BUY' && b.type === 'SELL') return -1;
    if (a.type === 'SELL' && (b.type || 'BUY') === 'BUY') return 1;
    return a.date.localeCompare(b.date);
  });

  let quantity = 0;
  let cost = 0;
  let costEur: number | null = 0;

  sortedTx.forEach(tx => {
    const qty = Number(tx.quantity) || 0;
    const price = Number(tx.purchasePrice) || 0;
    if (qty <= 0) return;
    const isForeign = !!tx.currency && tx.currency.toUpperCase() !== 'EUR';
    if ((tx.type || 'BUY') === 'BUY') {
      quantity += qty;
      cost += qty * price;
      if (costEur !== null) {
        if (!isForeign) costEur += qty * price;
        else if (tx.fxRate && tx.fxRate > 0) costEur += qty * price * tx.fxRate;
        else costEur = null;
      }
    } else if (quantity > 0) {
      const sold = Math.min(qty, quantity);
      const share = sold / quantity;
      cost -= cost * share;
      if (costEur !== null) costEur -= costEur * share;
      quantity -= sold;
    }
  });

  if (quantity <= 1e-9) return { totalQuantity: 0, totalInvested: 0, averagePrice: 0, totalInvestedEur: costEur === null ? null : 0 };
  return { totalQuantity: quantity, totalInvested: cost, averagePrice: cost / quantity, totalInvestedEur: costEur };
};

/** @deprecated nome storico: il calcolo è a costo medio ponderato, non FIFO */
export const calculateFifo = calculatePosition;

/** Le quotazioni Scalable non hanno la variazione giornaliera: uno 0 lì non è un dato reale. */
const isDailyChangeReliable = (quote: YahooQuote | undefined): boolean =>
  !!quote && quote.hasDailyChange === true;

/** Tassi di conversione verso l'euro: 1 unità di valuta = rate EUR. */
export type FxRates = Record<string, number>;

const BASE_CURRENCY = 'EUR';

const emptyGroup = (groupName: string): GroupedPortfolio => ({
  groupName,
  totalInvested: 0,
  currentTotalValue: 0,
  profitOrLoss: 0,
  profitOrLossPercent: 0,
  dailyChange: 0,
  dailyChangePercent: 0,
  assets: [],
  dailyCoverage: { withData: 0, total: 0 },
  missingPriceCount: 0,
  fxMissingCount: 0,
  dailyEstimated: false,
});

/** Valuta della posizione: le transazioni Scalable sono sempre in euro. */
const resolveCurrency = (txList: Transaction[], quote: YahooQuote | undefined): string =>
  txList.some(t => t.source === 'scalable_mcp')
    ? BASE_CURRENCY
    : (txList.find(t => t.currency)?.currency || quote?.currency || BASE_CURRENCY).toUpperCase();

const rateFor = (currency: string, fxRates: FxRates): number | null =>
  currency === BASE_CURRENCY ? 1 : (fxRates[currency] ?? null);

/** Converte i prezzi delle transazioni in euro per l'XIRR di insiemi con valute miste. */
const toBaseCurrency = (txs: Transaction[], rate: number): Transaction[] =>
  rate === 1 ? txs : txs.map(t => ({ ...t, purchasePrice: (Number(t.purchasePrice) || 0) * rate }));

interface PositionValuation {
  asset: AggregatedAsset;
  /** null = cambio non disponibile: la posizione resta fuori dai totali in euro */
  rate: number | null;
}

const valuePosition = (
  symbol: string,
  txList: Transaction[],
  quotes: Record<string, YahooQuote>,
  assetCategories: Record<string, string>,
  fxRates: FxRates
): PositionValuation => {
  const { totalQuantity, totalInvested, averagePrice, totalInvestedEur } = calculatePosition(txList);
  const isin = txList.find(t => t.isin)?.isin;
  const quote = quotes[symbol] || (isin ? quotes[isin] : undefined);
  const latestNamedTx = [...txList].reverse().find(t => t.name);
  const currency = resolveCurrency(txList, quote);
  const rate = rateFor(currency, fxRates);

  const hasPrice = !!quote?.regularMarketPrice && quote.regularMarketPrice > 0;
  const hasDailyChange = hasPrice && isDailyChangeReliable(quote);
  // Senza quotazione il titolo resta valutato al costo, ma viene segnalato (hasPrice = false):
  // mai un prezzo inventato mostrato come reale.
  const currentPrice = hasPrice ? quote!.regularMarketPrice : averagePrice;
  const currentTotalValue = totalQuantity * currentPrice;
  const profitOrLoss = currentTotalValue - totalInvested;

  const xirr = calculateTransactionsXIRR(txList, currentTotalValue);

  return {
    rate,
    asset: {
      symbol,
      name: latestNamedTx?.name || quote?.longName || quote?.shortName || symbol,
      totalQuantity,
      averagePrice,
      totalInvested,
      currentPrice,
      currentTotalValue,
      profitOrLoss,
      profitOrLossPercent: totalInvested > 0 ? (profitOrLoss / totalInvested) * 100 : 0,
      dailyChange: hasDailyChange ? totalQuantity * (quote!.regularMarketChange || 0) : 0,
      dailyChangePercent: hasDailyChange ? quote!.regularMarketChangePercent || 0 : 0,
      currency,
      category: assetCategories[symbol] || (isin ? assetCategories[isin] : undefined) || 'Altro',
      annualizedReturn: xirr.annualizedPercent,
      isAnnualizedExtrapolated: xirr.isExtrapolated,
      hasPrice,
      hasDailyChange,
      dailyChangeEstimated: hasDailyChange && quote?.source === 'scalable',
      marketTime: quote?.marketTime,
      valueInBase: rate !== null ? currentTotalValue * rate : null,
      ...fxBreakdown(currency, rate, hasPrice, totalQuantity, currentPrice, averagePrice, totalInvestedEur),
    },
  };
};

/**
 * Titoli in valuta estera: guadagno in euro diviso tra effetto prezzo ed effetto cambio.
 * Serve il cambio del giorno di ogni acquisto; senza, non si inventa nulla (null).
 */
const fxBreakdown = (
  currency: string,
  rate: number | null,
  hasPrice: boolean,
  quantity: number,
  price: number,
  averagePrice: number,
  costEur: number | null
): { profitOrLossEur?: number | null; fxEffectEur?: number | null } => {
  if (currency === BASE_CURRENCY) return {};
  if (rate === null || !hasPrice || costEur === null || quantity <= 0 || averagePrice <= 0) {
    return { profitOrLossEur: null, fxEffectEur: null };
  }
  const avgFx = costEur / (quantity * averagePrice);
  return {
    profitOrLossEur: quantity * price * rate - costEur,
    fxEffectEur: quantity * price * (rate - avgFx),
  };
};

export const calculatePortfolioAggregation = (
  transactions: Transaction[],
  quotes: Record<string, YahooQuote>,
  assetCategories: Record<string, string>,
  settings: UserSettings | null,
  fxRates: FxRates = {}
): {
  groupedData: GroupedPortfolio[];
  globalTotalValue: number;
  globalInvested: number;
  globalDailyChange: number;
  globalPL: number;
  globalPLPercent: number;
  globalDailyChangePercent: number;
  globalAnnualizedReturn: number | null;
  globalIsAnnualizedExtrapolated: boolean;
  /** Simboli senza quotazione, valutati al prezzo medio di carico */
  missingPriceSymbols: string[];
  /** Simboli in valuta estera senza cambio disponibile: esclusi dai totali in euro */
  fxMissingSymbols: string[];
  globalDailyCoverage: Coverage;
  /** Un titolo per simbolo su tutte le transazioni, valori in euro: una transazione in più gruppi conta una volta */
  globalAssets: AggregatedAsset[];
  /** Almeno un rendimento annuo mostrato (globale, gruppo o titolo) è una stima su meno di un anno */
  hasExtrapolatedAnnualized: boolean;
  /** La variazione di oggi include stime (percentuale Yahoo applicata al prezzo Scalable) */
  globalDailyEstimated: boolean;
  /** Ora di mercato più recente tra le quotazioni con variazione giornaliera */
  latestMarketTime: string | null;
  /** Ora di mercato più vecchia: se è di un altro giorno, alcune borse non hanno ancora un prezzo di oggi */
  oldestMarketTime: string | null;
} => {
  const groupsMap: Record<string, GroupedPortfolio> = {};
  settings?.groups?.forEach(g => {
    groupsMap[g] = emptyGroup(g);
  });

  const groupTxs: Record<string, Record<string, Transaction[]>> = {};
  const globalTxs: Record<string, Transaction[]> = {};

  transactions.forEach(tx => {
    const txGroups = tx.groups || (tx.group ? [tx.group] : ['Generale']);
    txGroups.forEach(gName => {
      if (!groupsMap[gName]) groupsMap[gName] = emptyGroup(gName);
      groupTxs[gName] = groupTxs[gName] || {};
      groupTxs[gName][tx.symbol] = groupTxs[gName][tx.symbol] || [];
      groupTxs[gName][tx.symbol].push(tx);
    });
    globalTxs[tx.symbol] = globalTxs[tx.symbol] || [];
    globalTxs[tx.symbol].push(tx);
  });

  let hasExtrapolatedAnnualized = false;

  // Gruppi: i valori dei titoli restano nella loro valuta, i totali del gruppo sono in euro
  Object.values(groupsMap).forEach(g => {
    const groupAssetsMap = groupTxs[g.groupName] || {};
    const groupXirrTxs: Transaction[] = [];

    Object.entries(groupAssetsMap).forEach(([symbol, txList]) => {
      const { asset, rate } = valuePosition(symbol, txList, quotes, assetCategories, fxRates);
      // Posizioni chiuse (tutto venduto): non sono più in portafoglio
      if (asset.totalQuantity <= 0) return;
      g.assets.push(asset);
      if (asset.isAnnualizedExtrapolated && asset.annualizedReturn !== null) hasExtrapolatedAnnualized = true;

      g.dailyCoverage.total += 1;
      // Escluso per cambio prevale su "valutato al costo": il titolo non è nei totali, quindi non è valutato affatto
      if (rate === null) {
        g.fxMissingCount += 1;
        return;
      }
      if (!asset.hasPrice) g.missingPriceCount += 1;
      if (asset.hasDailyChange && asset.dailyChangeEstimated) g.dailyEstimated = true;
      if (asset.hasDailyChange) g.dailyCoverage.withData += 1;
      g.totalInvested += asset.totalInvested * rate;
      g.currentTotalValue += asset.currentTotalValue * rate;
      g.dailyChange += asset.dailyChange * rate;
      groupXirrTxs.push(...toBaseCurrency(txList, rate));
    });

    g.profitOrLoss = g.currentTotalValue - g.totalInvested;
    g.profitOrLossPercent = g.totalInvested > 0 ? (g.profitOrLoss / g.totalInvested) * 100 : 0;
    g.dailyChangePercent = g.currentTotalValue - g.dailyChange > 0
      ? (g.dailyChange / (g.currentTotalValue - g.dailyChange)) * 100
      : 0;

    const groupXirr = calculateTransactionsXIRR(groupXirrTxs, g.currentTotalValue);
    g.annualizedReturn = groupXirr.annualizedPercent;
    g.isAnnualizedExtrapolated = groupXirr.isExtrapolated;
    if (groupXirr.isExtrapolated && groupXirr.annualizedPercent !== null) hasExtrapolatedAnnualized = true;

    g.assets.sort((a, b) => a.name.localeCompare(b.name));
  });

  const groupedData = Object.values(groupsMap).sort((a, b) => a.groupName.localeCompare(b.groupName));

  // Totali globali in euro, un titolo per simbolo
  let globalInvested = 0;
  let globalTotalValue = 0;
  let globalDailyChange = 0;
  const missingPriceSymbols: string[] = [];
  const fxMissingSymbols: string[] = [];
  const globalAssets: AggregatedAsset[] = [];
  const globalDailyCoverage: Coverage = { withData: 0, total: 0 };
  const globalXirrTxs: Transaction[] = [];
  let globalDailyEstimated = false;

  Object.entries(globalTxs).forEach(([symbol, txList]) => {
    const { asset, rate } = valuePosition(symbol, txList, quotes, assetCategories, fxRates);
    if (asset.totalQuantity <= 0) return;

    globalDailyCoverage.total += 1;
    if (rate === null) {
      fxMissingSymbols.push(symbol);
      return;
    }
    if (!asset.hasPrice) missingPriceSymbols.push(symbol);
    if (asset.hasDailyChange && asset.dailyChangeEstimated) globalDailyEstimated = true;
    if (asset.hasDailyChange) globalDailyCoverage.withData += 1;

    globalInvested += asset.totalInvested * rate;
    globalTotalValue += asset.currentTotalValue * rate;
    globalDailyChange += asset.dailyChange * rate;
    globalXirrTxs.push(...toBaseCurrency(txList, rate));

    // Per l'analisi di salute servono valori confrontabili: tutto in euro
    globalAssets.push({
      ...asset,
      averagePrice: asset.averagePrice * rate,
      totalInvested: asset.totalInvested * rate,
      currentPrice: asset.currentPrice * rate,
      currentTotalValue: asset.currentTotalValue * rate,
      profitOrLoss: asset.profitOrLoss * rate,
      dailyChange: asset.dailyChange * rate,
      currency: BASE_CURRENCY,
    });
  });

  const globalPL = globalTotalValue - globalInvested;
  const globalPLPercent = globalInvested > 0 ? (globalPL / globalInvested) * 100 : 0;
  const globalDailyChangePercent = globalTotalValue - globalDailyChange > 0
    ? (globalDailyChange / (globalTotalValue - globalDailyChange)) * 100
    : 0;

  const globalXirr = calculateTransactionsXIRR(globalXirrTxs, globalTotalValue);
  if (globalXirr.isExtrapolated && globalXirr.annualizedPercent !== null) hasExtrapolatedAnnualized = true;

  return {
    groupedData,
    globalTotalValue,
    globalInvested,
    globalDailyChange,
    globalPL,
    globalPLPercent,
    globalDailyChangePercent,
    globalAnnualizedReturn: globalXirr.annualizedPercent,
    globalIsAnnualizedExtrapolated: globalXirr.isExtrapolated,
    missingPriceSymbols,
    fxMissingSymbols,
    globalDailyCoverage,
    globalAssets,
    hasExtrapolatedAnnualized,
    globalDailyEstimated,
    latestMarketTime: globalAssets.reduce<string | null>(
      (latest, a) => (a.hasDailyChange && a.marketTime && (!latest || a.marketTime > latest) ? a.marketTime : latest),
      null
    ),
    oldestMarketTime: globalAssets.reduce<string | null>(
      (oldest, a) => (a.hasDailyChange && a.marketTime && (!oldest || a.marketTime < oldest) ? a.marketTime : oldest),
      null
    ),
  };
};
