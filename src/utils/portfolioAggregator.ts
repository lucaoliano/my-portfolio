import { Transaction, GroupedPortfolio, UserSettings, AggregatedAsset, Coverage } from '../types';
import { YahooQuote } from '../services/yahooFinance';
import { calculateTransactionsXIRR } from './xirr';

export interface PositionLot {
  quantity: number;
  purchasePrice: number;
}

export const calculateFifo = (transactions: Transaction[]): {
  totalQuantity: number;
  totalInvested: number;
  averagePrice: number;
} => {
  const sortedTx = [...transactions].sort((a, b) => {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    if (a.type === 'BUY' && b.type === 'SELL') return -1;
    if (a.type === 'SELL' && b.type === 'BUY') return 1;
    return 0;
  });

  const lots: PositionLot[] = [];

  sortedTx.forEach(tx => {
    const txType = tx.type || 'BUY';
    const quantity = Number(tx.quantity) || 0;
    const purchasePrice = Number(tx.purchasePrice) || 0;

    if (quantity <= 0) return;

    if (txType === 'BUY') {
      lots.push({ quantity, purchasePrice });
    } else {
      let remainingToSell = quantity;
      while (remainingToSell > 0 && lots.length > 0) {
        if (lots[0].quantity <= remainingToSell) {
          remainingToSell -= lots[0].quantity;
          lots.shift();
        } else {
          lots[0].quantity -= remainingToSell;
          remainingToSell = 0;
        }
      }
    }
  });

  const totalQuantity = lots.reduce((acc, lot) => acc + lot.quantity, 0);
  const totalInvested = lots.reduce((acc, lot) => acc + lot.quantity * lot.purchasePrice, 0);
  const averagePrice = totalQuantity > 0 ? totalInvested / totalQuantity : 0;

  return { totalQuantity, totalInvested, averagePrice };
};

/** Le quotazioni Scalable non hanno la variazione giornaliera: uno 0 lì non è un dato reale. */
const isDailyChangeReliable = (quote: YahooQuote | undefined): boolean =>
  !!quote && quote.hasDailyChange !== false && quote.source !== 'scalable';

export const calculatePortfolioAggregation = (
  transactions: Transaction[],
  quotes: Record<string, YahooQuote>,
  assetCategories: Record<string, string>,
  settings: UserSettings | null
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
  globalDailyCoverage: Coverage;
  /** Un titolo per simbolo su tutte le transazioni: una transazione in più gruppi conta una volta */
  globalAssets: AggregatedAsset[];
} => {
  const groupsMap: Record<string, GroupedPortfolio> = {};

  if (settings && settings.groups) {
    settings.groups.forEach(g => {
      groupsMap[g] = {
        groupName: g,
        totalInvested: 0,
        currentTotalValue: 0,
        profitOrLoss: 0,
        profitOrLossPercent: 0,
        dailyChange: 0,
        dailyChangePercent: 0,
        assets: [],
        dailyCoverage: { withData: 0, total: 0 },
        missingPriceCount: 0,
      };
    });
  }

  const groupTxs: Record<string, Record<string, Transaction[]>> = {};
  const globalTxs: Record<string, Transaction[]> = {};

  transactions.forEach(tx => {
    const txGroups = tx.groups || (tx.group ? [tx.group] : ['Generale']);

    txGroups.forEach(gName => {
      if (!groupsMap[gName]) {
        groupsMap[gName] = {
          groupName: gName,
          totalInvested: 0,
          currentTotalValue: 0,
          profitOrLoss: 0,
          profitOrLossPercent: 0,
          dailyChange: 0,
          dailyChangePercent: 0,
          assets: [],
          dailyCoverage: { withData: 0, total: 0 },
          missingPriceCount: 0,
        };
      }

      if (!groupTxs[gName]) {
        groupTxs[gName] = {};
      }
      if (!groupTxs[gName][tx.symbol]) {
        groupTxs[gName][tx.symbol] = [];
      }
      groupTxs[gName][tx.symbol].push(tx);
    });

    if (!globalTxs[tx.symbol]) {
      globalTxs[tx.symbol] = [];
    }
    globalTxs[tx.symbol].push(tx);
  });

  // Calculate FIFO and prepare assets for each group
  Object.keys(groupsMap).forEach(gName => {
    const groupAssetsMap = groupTxs[gName] || {};

    Object.entries(groupAssetsMap).forEach(([symbol, txList]) => {
      const { totalQuantity, totalInvested, averagePrice } = calculateFifo(txList);
      const isin = txList.find(t => t.isin)?.isin;
      const quote = quotes[symbol] || (isin ? quotes[isin] : undefined);
      const latestNamedTx = [...txList].reverse().find(t => t.name);

      const asset: AggregatedAsset = {
        symbol,
        name: latestNamedTx?.name || quote?.longName || quote?.shortName || symbol,
        totalQuantity,
        averagePrice,
        totalInvested,
        currentPrice: 0,
        currentTotalValue: 0,
        profitOrLoss: 0,
        profitOrLossPercent: 0,
        dailyChange: 0,
        dailyChangePercent: 0,
        currency: (txList.some(t => t.source === 'scalable_mcp' || t.currency === 'EUR') 
          ? 'EUR' 
          : (txList.find(t => t.currency)?.currency || quote?.currency || 'EUR')),
        category: assetCategories[symbol] || (isin ? assetCategories[isin] : undefined) || 'Altro',
        hasPrice: false,
        hasDailyChange: false,
      };

      groupsMap[gName].assets.push(asset);
    });
  });

  // Now compute current values, totals, and XIRR for groups and their assets
  Object.values(groupsMap).forEach(g => {
    const groupAssetsMap = groupTxs[g.groupName] || {};

    g.assets.forEach(asset => {
      const assetTxs = groupAssetsMap[asset.symbol] || [];
      const isin = assetTxs.find(t => t.isin)?.isin;
      const quote = quotes[asset.symbol] || (isin ? quotes[isin] : undefined);
      const hasPrice = !!quote?.regularMarketPrice && quote.regularMarketPrice > 0;
      const hasDailyChange = hasPrice && isDailyChangeReliable(quote);
      // Senza quotazione il titolo resta valutato al costo, ma viene segnalato (hasPrice = false):
      // mai un prezzo inventato mostrato come reale.
      const currentPrice = hasPrice ? quote!.regularMarketPrice : asset.averagePrice;
      const dailyChangePercent = hasDailyChange ? quote!.regularMarketChangePercent || 0 : 0;
      const dailyChangeAbs = hasDailyChange ? quote!.regularMarketChange || 0 : 0;

      asset.hasPrice = hasPrice;
      asset.hasDailyChange = hasDailyChange;
      asset.currentPrice = currentPrice;
      asset.currentTotalValue = asset.totalQuantity * currentPrice;
      asset.profitOrLoss = asset.currentTotalValue - asset.totalInvested;
      asset.profitOrLossPercent = asset.totalInvested > 0 ? (asset.profitOrLoss / asset.totalInvested) * 100 : 0;
      asset.dailyChange = asset.totalQuantity * dailyChangeAbs;
      asset.dailyChangePercent = dailyChangePercent;

      // Calculate XIRR for individual asset in this group
      const assetXirr = calculateTransactionsXIRR(assetTxs, asset.currentTotalValue);
      asset.annualizedReturn = assetXirr.annualizedPercent;
      asset.isAnnualizedExtrapolated = assetXirr.isExtrapolated;
      
      g.totalInvested += asset.totalInvested;
      g.currentTotalValue += asset.currentTotalValue;
      g.dailyChange += asset.dailyChange;
      if (asset.totalQuantity > 0) {
        g.dailyCoverage.total += 1;
        if (hasDailyChange) g.dailyCoverage.withData += 1;
        if (!hasPrice) g.missingPriceCount += 1;
      }
    });
    
    g.profitOrLoss = g.currentTotalValue - g.totalInvested;
    g.profitOrLossPercent = g.totalInvested > 0 ? (g.profitOrLoss / g.totalInvested) * 100 : 0;
    g.dailyChangePercent = g.currentTotalValue - g.dailyChange > 0
      ? (g.dailyChange / (g.currentTotalValue - g.dailyChange)) * 100
      : 0;

    // Calculate XIRR for group
    const allGroupTxs: Transaction[] = [];
    Object.values(groupAssetsMap).forEach(list => allGroupTxs.push(...list));
    const groupXirr = calculateTransactionsXIRR(allGroupTxs, g.currentTotalValue);
    g.annualizedReturn = groupXirr.annualizedPercent;
    g.isAnnualizedExtrapolated = groupXirr.isExtrapolated;
      
    // Ordina gli asset in ordine alfabetico per nome
    g.assets.sort((a, b) => a.name.localeCompare(b.name));
  });

  const groupedData = Object.values(groupsMap).sort((a, b) => a.groupName.localeCompare(b.groupName));

  // Global calculations using FIFO
  let globalInvested = 0;
  let globalTotalValue = 0;
  let globalDailyChange = 0;

  const missingPriceSymbols: string[] = [];
  const globalAssets: AggregatedAsset[] = [];
  const globalDailyCoverage: Coverage = { withData: 0, total: 0 };

  Object.entries(globalTxs).forEach(([symbol, txList]) => {
    const { totalQuantity, totalInvested, averagePrice } = calculateFifo(txList);
    const isin = txList.find(t => t.isin)?.isin;
    const quote = quotes[symbol] || (isin ? quotes[isin] : undefined);
    const hasPrice = !!quote?.regularMarketPrice && quote.regularMarketPrice > 0;
    const hasDailyChange = hasPrice && isDailyChangeReliable(quote);
    const currentPrice = hasPrice ? quote!.regularMarketPrice : averagePrice;
    const dailyChangeAbs = hasDailyChange ? quote!.regularMarketChange || 0 : 0;

    if (totalQuantity > 0) {
      if (!hasPrice) missingPriceSymbols.push(symbol);
      globalDailyCoverage.total += 1;
      if (hasDailyChange) globalDailyCoverage.withData += 1;
    }

    if (totalQuantity > 0) {
      const value = totalQuantity * currentPrice;
      const latestNamedTx = [...txList].reverse().find(t => t.name);
      globalAssets.push({
        symbol,
        name: latestNamedTx?.name || quote?.longName || quote?.shortName || symbol,
        totalQuantity,
        averagePrice,
        totalInvested,
        currentPrice,
        currentTotalValue: value,
        profitOrLoss: value - totalInvested,
        profitOrLossPercent: totalInvested > 0 ? ((value - totalInvested) / totalInvested) * 100 : 0,
        dailyChange: totalQuantity * dailyChangeAbs,
        dailyChangePercent: hasDailyChange ? quote!.regularMarketChangePercent || 0 : 0,
        currency: txList.find(t => t.currency)?.currency || quote?.currency || 'EUR',
        category: assetCategories[symbol] || (isin ? assetCategories[isin] : undefined) || 'Altro',
        hasPrice,
        hasDailyChange,
      });
    }

    globalInvested += totalInvested;
    globalTotalValue += totalQuantity * currentPrice;
    globalDailyChange += totalQuantity * dailyChangeAbs;
  });

  const globalPL = globalTotalValue - globalInvested;
  const globalPLPercent = globalInvested > 0 ? (globalPL / globalInvested) * 100 : 0;
  const globalDailyChangePercent = globalTotalValue - globalDailyChange > 0 
    ? (globalDailyChange / (globalTotalValue - globalDailyChange)) * 100 
    : 0;

  // Calculate Global XIRR
  const globalXirr = calculateTransactionsXIRR(transactions, globalTotalValue);

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
    globalDailyCoverage,
    globalAssets,
  };
};
