import { ScalableSavingsPlan } from '../types';

export interface PlanRebalanceItem {
  id: string;
  symbol: string;
  name: string;
  currentAmount: number;
  suggestedAmount: number;
  diffAmount: number;
  currentHoldingValue: number;
  currentWeightPercent: number;
  targetWeightPercent: number;
  status: 'underweight' | 'overweight' | 'balanced';
}

export interface RebalanceAnalysisResult {
  items: PlanRebalanceItem[];
  totalMonthlyBudget: number;
  totalHoldingsValue: number;
  rebalancingNeeded: boolean;
  summaryMessage: string;
}

/**
 * Calculates smart deterministic cash-flow DCA rebalancing for Scalable Savings Plans.
 * Adjusts the monthly contribution to underweight assets to pull the portfolio
 * back to target allocation without triggering sales or capital gain taxes.
 */
export function calculatePacRebalancing(
  plans: ScalableSavingsPlan[],
  currentHoldings: Record<string, { currentTotalValue?: number }>,
  customMonthlyBudget?: number
): RebalanceAnalysisResult {
  const activePlans = plans.filter((p) => p.status === 'ACTIVE');

  const totalCurrentMonthly = activePlans.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  const monthlyBudget = customMonthlyBudget !== undefined && customMonthlyBudget > 0
    ? customMonthlyBudget
    : totalCurrentMonthly;

  if (activePlans.length === 0 || monthlyBudget <= 0) {
    return {
      items: [],
      totalMonthlyBudget: 0,
      totalHoldingsValue: 0,
      rebalancingNeeded: false,
      summaryMessage: 'Nessun piano di accumulo attivo configurato.',
    };
  }

  // 1. Calculate current holdings value for PAC assets
  let totalHoldingsValue = 0;
  const holdingValues: Record<string, number> = {};

  activePlans.forEach((p) => {
    const val = Math.max(0, currentHoldings[p.symbol]?.currentTotalValue || 0);
    holdingValues[p.symbol] = val;
    totalHoldingsValue += val;
  });

  // 2. Determine target weights (%)
  // If targetAllocationPercent is provided on the plan, use it. Otherwise, derive from nominal plan amounts.
  const targetWeights: Record<string, number> = {};
  const totalProvidedTarget = activePlans.reduce(
    (acc, p) => acc + (p.targetAllocationPercent !== undefined ? p.targetAllocationPercent : 0),
    0
  );

  activePlans.forEach((p) => {
    if (totalProvidedTarget > 0 && p.targetAllocationPercent !== undefined) {
      targetWeights[p.symbol] = (p.targetAllocationPercent / totalProvidedTarget) * 100;
    } else if (totalCurrentMonthly > 0) {
      targetWeights[p.symbol] = (p.amount / totalCurrentMonthly) * 100;
    } else {
      targetWeights[p.symbol] = 100 / activePlans.length;
    }
  });

  // 3. Current weights
  const currentWeights: Record<string, number> = {};
  activePlans.forEach((p) => {
    currentWeights[p.symbol] = totalHoldingsValue > 0
      ? (holdingValues[p.symbol] / totalHoldingsValue) * 100
      : targetWeights[p.symbol];
  });

  // 4. Compute optimal cash-flow allocation towards target weights
  const projectedTotal = totalHoldingsValue + monthlyBudget;
  const deficits: Record<string, number> = {};
  let totalDeficit = 0;

  activePlans.forEach((p) => {
    const targetVal = projectedTotal * (targetWeights[p.symbol] / 100);
    const diff = targetVal - holdingValues[p.symbol];
    const deficit = Math.max(0, diff);
    deficits[p.symbol] = deficit;
    totalDeficit += deficit;
  });

  const rawSuggested: Record<string, number> = {};
  let sumSuggested = 0;

  activePlans.forEach((p) => {
    let alloc = 0;
    if (totalDeficit > 0) {
      alloc = Math.round(monthlyBudget * (deficits[p.symbol] / totalDeficit));
    } else {
      alloc = Math.round(monthlyBudget * (targetWeights[p.symbol] / 100));
    }
    rawSuggested[p.symbol] = alloc;
    sumSuggested += alloc;
  });

  // Adjust rounding differences to strictly match monthlyBudget
  let remainder = monthlyBudget - sumSuggested;
  if (remainder !== 0 && activePlans.length > 0) {
    // Add/subtract remainder to the plan with the largest suggested allocation
    const sortedByAlloc = [...activePlans].sort(
      (a, b) => rawSuggested[b.symbol] - rawSuggested[a.symbol]
    );
    rawSuggested[sortedByAlloc[0].symbol] = Math.max(0, rawSuggested[sortedByAlloc[0].symbol] + remainder);
  }

  // 5. Build items and status
  let rebalancingNeeded = false;
  const items: PlanRebalanceItem[] = activePlans.map((p) => {
    const suggested = rawSuggested[p.symbol] ?? p.amount;
    const diff = suggested - p.amount;
    let status: 'underweight' | 'overweight' | 'balanced' = 'balanced';

    if (diff >= 5) {
      status = 'underweight'; // Needs more cash to catch up
    } else if (diff <= -5) {
      status = 'overweight'; // Has grown faster, can reduce current contribution
    }

    if (Math.abs(diff) >= 10) {
      rebalancingNeeded = true;
    }

    return {
      id: p.id,
      symbol: p.symbol,
      name: p.name,
      currentAmount: p.amount,
      suggestedAmount: suggested,
      diffAmount: diff,
      currentHoldingValue: holdingValues[p.symbol],
      currentWeightPercent: currentWeights[p.symbol],
      targetWeightPercent: targetWeights[p.symbol],
      status,
    };
  });

  // 6. Generate summary message
  let summaryMessage = 'I tuoi piani di accumulo sono allineati con la tua asset allocation target.';
  if (rebalancingNeeded) {
    const underweightCount = items.filter((i) => i.status === 'underweight').length;
    summaryMessage = `Rilevati ${underweightCount} asset sottopesati rispetto al target. Puoi ribilanciare il portafoglio tramite i prossimi versamenti senza vendere posizioni.`;
  }

  return {
    items,
    totalMonthlyBudget: monthlyBudget,
    totalHoldingsValue,
    rebalancingNeeded,
    summaryMessage,
  };
}
