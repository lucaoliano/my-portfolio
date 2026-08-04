import { Transaction } from '../types';

export interface CashFlow {
  date: Date | string;
  amount: number;
}

export interface XirrResult {
  xirr: number | null; // e.g. 0.0825 (8.25%)
  annualizedPercent: number | null; // e.g. 8.25
  holdingDays: number;
  isExtrapolated: boolean; // true if holding period < 365 days
}

const DAYS_IN_YEAR = 365;

/**
 * Calculates Net Present Value for a given rate and set of cash flows.
 */
function npv(rate: number, cashFlows: { days: number; amount: number }[]): number {
  let sum = 0;
  for (const cf of cashFlows) {
    sum += cf.amount / Math.pow(1 + rate, cf.days / DAYS_IN_YEAR);
  }
  return sum;
}

/**
 * Calculates the first derivative of NPV with respect to rate.
 */
function npvDerivative(rate: number, cashFlows: { days: number; amount: number }[]): number {
  let sum = 0;
  for (const cf of cashFlows) {
    const fraction = cf.days / DAYS_IN_YEAR;
    sum -= (fraction * cf.amount) / Math.pow(1 + rate, fraction + 1);
  }
  return sum;
}

/**
 * Core XIRR numerical solver using Newton-Raphson with a robust Bisection fallback.
 * Returns the annualized internal rate of return as a decimal (e.g. 0.12 for 12%), or null if not solvable.
 */
export function calculateXIRR(rawCashFlows: CashFlow[], guess = 0.1): number | null {
  // Validate and parse cash flows
  const validFlows = rawCashFlows
    .map(cf => ({
      time: new Date(cf.date).getTime(),
      amount: Number(cf.amount)
    }))
    .filter(cf => !isNaN(cf.time) && !isNaN(cf.amount) && Math.abs(cf.amount) > 1e-7);

  if (validFlows.length < 2) {
    return null;
  }

  // Must have both positive (inflows) and negative (outflows)
  const hasPositive = validFlows.some(cf => cf.amount > 0);
  const hasNegative = validFlows.some(cf => cf.amount < 0);
  if (!hasPositive || !hasNegative) {
    return null;
  }

  // Sort by date ascending
  validFlows.sort((a, b) => a.time - b.time);

  const t0 = validFlows[0].time;
  const tn = validFlows[validFlows.length - 1].time;
  const totalDays = (tn - t0) / (1000 * 60 * 60 * 24);

  // If holding period is practically 0 days, annualization is undefined
  if (totalDays < 1) {
    return null;
  }

  // Convert to relative days from start
  const flows = validFlows.map(cf => ({
    days: (cf.time - t0) / (1000 * 60 * 60 * 24),
    amount: cf.amount
  }));

  // Estimate a sensible initial guess based on simple return
  let totalInvested = 0;
  let totalReturned = 0;
  for (const f of flows) {
    if (f.amount < 0) totalInvested += Math.abs(f.amount);
    else totalReturned += f.amount;
  }

  let rate = guess;
  if (totalInvested > 0) {
    const simpleReturn = (totalReturned - totalInvested) / totalInvested;
    const years = Math.max(totalDays / DAYS_IN_YEAR, 0.1);
    if (simpleReturn > -1) {
      rate = Math.pow(1 + simpleReturn, 1 / years) - 1;
      // Clamp initial guess
      rate = Math.max(-0.9, Math.min(2.0, rate));
    }
  }

  const MAX_ITERATIONS = 60;
  const TOLERANCE = 1e-6;

  // 1. Try Newton-Raphson
  let converged = false;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (rate <= -0.9999) {
      break;
    }

    const value = npv(rate, flows);
    if (Math.abs(value) < TOLERANCE) {
      converged = true;
      break;
    }

    const deriv = npvDerivative(rate, flows);
    if (Math.abs(deriv) < 1e-12) {
      break;
    }

    const nextRate = rate - value / deriv;
    if (Math.abs(nextRate - rate) < TOLERANCE) {
      rate = nextRate;
      converged = true;
      break;
    }

    rate = nextRate;
  }

  if (converged && !isNaN(rate) && isFinite(rate) && rate > -1) {
    return rate;
  }

  // 2. Fallback: Bisection Method
  let low = -0.999;
  let high = 5.0;

  let fLow = npv(low, flows);
  let fHigh = npv(high, flows);

  // If high bound doesn't cross zero, expand up to 50.0 (5000% p.a.)
  if (fLow * fHigh > 0) {
    for (const testHigh of [10.0, 50.0, 100.0]) {
      high = testHigh;
      fHigh = npv(high, flows);
      if (fLow * fHigh <= 0) break;
    }
  }

  // If still no sign change, no root in reasonable bracket
  if (fLow * fHigh > 0) {
    return null;
  }

  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    const fMid = npv(mid, flows);

    if (Math.abs(fMid) < TOLERANCE || (high - low) / 2 < TOLERANCE) {
      return mid;
    }

    if (fLow * fMid < 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }

  return (low + high) / 2;
}

/**
 * Calculates XIRR for a list of transactions (BUY/SELL) plus a terminal current value at evaluation date.
 * Returns the annual percentage (e.g. 12.5 for 12.5%), holding period in days, and whether it is extrapolated (< 365 days).
 */
export function calculateTransactionsXIRR(
  transactions: Transaction[],
  currentTotalValue: number,
  asOfDate: Date = new Date()
): XirrResult {
  if (!transactions || transactions.length === 0) {
    return {
      xirr: null,
      annualizedPercent: null,
      holdingDays: 0,
      isExtrapolated: false
    };
  }

  const cashFlows: CashFlow[] = [];

  transactions.forEach(tx => {
    const qty = Number(tx.quantity) || 0;
    const price = Number(tx.purchasePrice) || 0;
    if (qty <= 0) return;

    const isSell = tx.type === 'SELL';
    // Buy is outflow (-), Sell is inflow (+)
    const amount = isSell ? qty * price : -(qty * price);
    cashFlows.push({
      date: tx.date,
      amount
    });
  });

  // Add terminal liquidation value ad of today (if positive)
  if (currentTotalValue > 0) {
    cashFlows.push({
      date: asOfDate.toISOString(),
      amount: currentTotalValue
    });
  }

  if (cashFlows.length < 2) {
    return {
      xirr: null,
      annualizedPercent: null,
      holdingDays: 0,
      isExtrapolated: false
    };
  }

  // Calculate earliest date
  const timestamps = cashFlows
    .map(cf => new Date(cf.date).getTime())
    .filter(t => !isNaN(t));

  if (timestamps.length === 0) {
    return {
      xirr: null,
      annualizedPercent: null,
      holdingDays: 0,
      isExtrapolated: false
    };
  }

  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const holdingDays = Math.max(0, Math.round((maxTime - minTime) / (1000 * 60 * 60 * 24)));
  const isExtrapolated = holdingDays < 365;

  const rawRate = calculateXIRR(cashFlows);

  if (rawRate === null || isNaN(rawRate) || !isFinite(rawRate)) {
    return {
      xirr: null,
      annualizedPercent: null,
      holdingDays,
      isExtrapolated
    };
  }

  return {
    xirr: rawRate,
    annualizedPercent: rawRate * 100,
    holdingDays,
    isExtrapolated
  };
}
