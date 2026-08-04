import { Transaction, AggregatedAsset, TaxLossBucket, RealizedTrade, ScalableTaxReport, TaxOptimizationTip } from '../types';

export const ITALIAN_CAPITAL_GAINS_TAX_RATE = 0.26; // 26% aliquota standard

/**
 * Calculates realized trades (plusvalenze/minusvalenze) from transaction history using strict FIFO matching.
 */
export function calculateRealizedTrades(transactions: Transaction[]): RealizedTrade[] {
  // Sort chronologically ascending
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const inventory = new Map<string, { quantity: number; price: number; date: string }[]>();
  const realizedTrades: RealizedTrade[] = [];

  for (const tx of sorted) {
    const sym = tx.symbol.toUpperCase();
    const type = (tx.type || 'BUY').toUpperCase();

    if (!inventory.has(sym)) {
      inventory.set(sym, []);
    }

    const lots = inventory.get(sym)!;

    if (type === 'BUY') {
      lots.push({
        quantity: Number(tx.quantity),
        price: Number(tx.purchasePrice),
        date: tx.date,
      });
    } else if (type === 'SELL') {
      let remainingToSell = Number(tx.quantity);
      let totalCostBasis = 0;

      while (remainingToSell > 0.000001 && lots.length > 0) {
        const oldestLot = lots[0];
        if (oldestLot.quantity <= remainingToSell + 0.000001) {
          totalCostBasis += oldestLot.quantity * oldestLot.price;
          remainingToSell -= oldestLot.quantity;
          lots.shift();
        } else {
          totalCostBasis += remainingToSell * oldestLot.price;
          oldestLot.quantity -= remainingToSell;
          remainingToSell = 0;
        }
      }

      const saleProceeds = Number(tx.quantity) * Number(tx.purchasePrice);
      const realizedGainOrLoss = Math.round((saleProceeds - totalCostBasis) * 100) / 100;

      realizedTrades.push({
        id: tx.id || `trade_${realizedTrades.length + 1}`,
        symbol: tx.symbol,
        name: tx.name || tx.symbol,
        date: tx.date,
        quantity: Number(tx.quantity),
        salePrice: Number(tx.purchasePrice),
        costBasis: Math.round(totalCostBasis * 100) / 100,
        realizedGainOrLoss,
        isLoss: realizedGainOrLoss < 0,
        category: (tx as { category?: string }).category || 'Azioni',
      });
    }
  }

  return realizedTrades;
}

/**
 * Builds chronological tax loss buckets (Zainetto Fiscale) according to Italian tax rules:
 * - Minusvalenze expire at the end of the 4th calendar year after generation (creation + 4).
 * - Only "Redditi Diversi" (azioni, ETC, certificates, etc.) compensate accumulated minusvalenze.
 * - Compensation consumes oldest active buckets first (FIFO).
 */
export function buildTaxBuckets(
  trades: RealizedTrade[],
  currentYear = new Date().getFullYear()
): TaxLossBucket[] {
  const bucketsMap = new Map<number, TaxLossBucket>();

  // 1. Group losses into annual buckets
  for (const trade of trades) {
    const tradeYear = new Date(trade.date).getFullYear();
    const expiresYear = tradeYear + 4;

    if (!bucketsMap.has(tradeYear)) {
      bucketsMap.set(tradeYear, {
        yearCreated: tradeYear,
        yearExpires: expiresYear,
        initialAmount: 0,
        remainingAmount: 0,
        compensatedAmount: 0,
        isExpiringThisYear: expiresYear === currentYear,
        status: expiresYear < currentYear ? 'EXPIRED' : 'ACTIVE',
      });
    }

    const bucket = bucketsMap.get(tradeYear)!;
    if (trade.isLoss) {
      const lossAmount = Math.abs(trade.realizedGainOrLoss);
      bucket.initialAmount = Math.round((bucket.initialAmount + lossAmount) * 100) / 100;
      if (bucket.status === 'ACTIVE') {
        bucket.remainingAmount = Math.round((bucket.remainingAmount + lossAmount) * 100) / 100;
      }
    }
  }

  // 2. Chronological compensation from Redditi Diversi gains
  const sortedBucketYears = Array.from(bucketsMap.keys()).sort((a, b) => a - b);

  for (const trade of trades) {
    if (!trade.isLoss && trade.realizedGainOrLoss > 0) {
      // UCITS ETF gains ("Redditi di Capitale") DO NOT compensate minusvalenze under Italian fiscal law
      const isETF = (trade.category || '').toUpperCase().includes('ETF') ||
                    trade.name.toUpperCase().includes('UCITS') ||
                    trade.name.toUpperCase().includes('ETF');

      if (isETF) {
        continue; // Cannot offset minusvalenze
      }

      let gainRemaining = trade.realizedGainOrLoss;
      const tradeYear = new Date(trade.date).getFullYear();

      for (const bYear of sortedBucketYears) {
        if (gainRemaining <= 0.001) break;
        // Gain can only compensate losses generated on or before the trade date
        if (bYear > tradeYear) continue;

        const bucket = bucketsMap.get(bYear)!;
        if (bucket.status !== 'ACTIVE' || bucket.remainingAmount <= 0.001) continue;

        const toCompensate = Math.min(bucket.remainingAmount, gainRemaining);
        bucket.remainingAmount = Math.round((bucket.remainingAmount - toCompensate) * 100) / 100;
        bucket.compensatedAmount = Math.round((bucket.compensatedAmount + toCompensate) * 100) / 100;
        gainRemaining -= toCompensate;

        if (bucket.remainingAmount <= 0.001) {
          bucket.remainingAmount = 0;
          bucket.status = 'COMPENSATED';
        }
      }
    }
  }

  // Filter out empty buckets and sort by year ascending
  return Array.from(bucketsMap.values())
    .filter((b) => b.initialAmount > 0)
    .sort((a, b) => a.yearCreated - b.yearCreated);
}

/**
 * Computes a full ScalableTaxReport deterministically from transaction data.
 */
export function computeTaxReportFromTransactions(
  transactions: Transaction[],
  currentYear = new Date().getFullYear()
): ScalableTaxReport {
  const realizedTrades = calculateRealizedTrades(transactions);
  const buckets = buildTaxBuckets(realizedTrades, currentYear);

  const activeBuckets = buckets.filter((b) => b.status === 'ACTIVE');
  const totalActiveLosses = Math.round(
    activeBuckets.reduce((sum, b) => sum + b.remainingAmount, 0) * 100
  ) / 100;

  const potentialTaxSavings = Math.round(
    totalActiveLosses * ITALIAN_CAPITAL_GAINS_TAX_RATE * 100
  ) / 100;

  const lossesExpiringThisYear = Math.round(
    activeBuckets
      .filter((b) => b.isExpiringThisYear)
      .reduce((sum, b) => sum + b.remainingAmount, 0) * 100
  ) / 100;

  // Current year realized gains & losses
  const currentYearTrades = realizedTrades.filter(
    (t) => new Date(t.date).getFullYear() === currentYear
  );

  const realizedGainsCurrentYear = Math.round(
    currentYearTrades
      .filter((t) => !t.isLoss)
      .reduce((sum, t) => sum + t.realizedGainOrLoss, 0) * 100
  ) / 100;

  const realizedLossesCurrentYear = Math.round(
    currentYearTrades
      .filter((t) => t.isLoss)
      .reduce((sum, t) => sum + Math.abs(t.realizedGainOrLoss), 0) * 100
  ) / 100;

  const netRealizedCurrentYear = Math.round(
    (realizedGainsCurrentYear - realizedLossesCurrentYear) * 100
  ) / 100;

  return {
    totalActiveLosses,
    potentialTaxSavings,
    lossesExpiringThisYear,
    realizedGainsCurrentYear,
    realizedLossesCurrentYear,
    netRealizedCurrentYear,
    buckets,
    realizedTrades,
    lastCalculatedAt: new Date().toISOString(),
    source: 'calculated',
  };
}

/**
 * Merges official broker Scalable MCP tax report with locally calculated transactions.
 */
export function mergeTaxReport(
  mcpReport: ScalableTaxReport | null | undefined,
  calculatedReport: ScalableTaxReport
): ScalableTaxReport {
  if (!mcpReport || mcpReport.buckets.length === 0) {
    return calculatedReport;
  }

  // If MCP report is populated from Scalable Capital, use it as baseline
  // but enrich trades if calculatedReport has more trades
  const trades = (mcpReport.realizedTrades && mcpReport.realizedTrades.length > 0)
    ? mcpReport.realizedTrades
    : calculatedReport.realizedTrades;

  return {
    ...mcpReport,
    realizedTrades: trades,
    source: 'hybrid',
  };
}

/**
 * Generates actionable, deterministic Italian tax optimization tips.
 */
export function generateTaxOptimizationTips(
  report: ScalableTaxReport,
  assets: AggregatedAsset[] = [],
  currentYear = new Date().getFullYear()
): TaxOptimizationTip[] {
  const tips: TaxOptimizationTip[] = [];

  // Tip 1: Expiring minusvalenze alert (Urgent)
  if (report.lossesExpiringThisYear > 0) {
    const savingsLoss = Math.round(report.lossesExpiringThisYear * ITALIAN_CAPITAL_GAINS_TAX_RATE * 100) / 100;
    tips.push({
      id: 'expiring_losses',
      type: 'EXPIRING_LOSSES',
      title: `Attenzione: €${report.lossesExpiringThisYear.toFixed(2)} in scadenza nel ${currentYear}`,
      description: `Hai minusvalenze accumulate nel ${currentYear - 4} che scadranno il 31 dicembre ${currentYear}. Se non realizzi plusvalenze compensabili (azioni singole, ETC oro/materie prime, certificates), perderai definitivamente €${savingsLoss.toFixed(2)} di crediti fiscali.`,
      impactEur: savingsLoss,
      priority: 'HIGH',
    });
  }

  // Tip 2: Potential tax savings
  if (report.totalActiveLosses > 0) {
    tips.push({
      id: 'potential_savings',
      type: 'COMPENSATION_RULE',
      title: `Zainetto attivo: €${report.totalActiveLosses.toFixed(2)} disponibili`,
      description: `Il tuo zainetto fiscale ti permette di non pagare imposte su futuri guadagni fino a un risparmio fiscale effettivo di €${report.potentialTaxSavings.toFixed(2)} (aliquota 26%).`,
      impactEur: report.potentialTaxSavings,
      priority: 'MEDIUM',
    });
  }

  // Tip 3: ETF vs Redditi Diversi Rule (Education)
  tips.push({
    id: 'etf_tax_rule',
    type: 'COMPENSATION_RULE',
    title: 'Regola Fiscale: ETF UCITS vs Redditi Diversi',
    description: 'In Italia, i guadagni da ETF armonizzati (UCITS) sono "Redditi di Capitale" e non possono compensare le minusvalenze pregresse. Per recuperare il credito dello zainetto, puoi utilizzare plusvalenze su singole azioni, ETC/ETN (es. oro fisico) o certificati di investimento.',
    priority: 'LOW',
  });

  // Tip 4: Tax loss harvesting opportunity
  const positionsInLoss = assets.filter((a) => a.profitOrLoss < -50);
  if (positionsInLoss.length > 0) {
    const totalPotentialHarvest = positionsInLoss.reduce(
      (sum, a) => sum + Math.abs(a.profitOrLoss),
      0
    );
    const potentialCredit = Math.round(totalPotentialHarvest * ITALIAN_CAPITAL_GAINS_TAX_RATE * 100) / 100;

    tips.push({
      id: 'loss_harvesting',
      type: 'HARVESTING_OPPORTUNITY',
      title: `Tax Loss Harvesting: ${positionsInLoss.length} posizioni in perdita latente`,
      description: `Hai posizioni con perdite non realizzate per €${totalPotentialHarvest.toFixed(2)}. Chiudere una posizione in perdita genererebbe una minusvalenza valida per 4 anni per compensare future plusvalenze (fino a €${potentialCredit.toFixed(2)} di credito fiscale).`,
      impactEur: potentialCredit,
      priority: 'MEDIUM',
    });
  }

  return tips;
}
