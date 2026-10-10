export type ContributionFrequency = 'monthly' | 'bimonthly' | 'quarterly' | 'semiannually' | 'annually';

export interface WithdrawalConfig {
  enabled: boolean;
  durationYears: number;
  periodicAmount: number;
  frequency: ContributionFrequency;
  expectedAnnualReturn: number;
  annualStepUp?: number;
  withdrawalInTodayEuros?: boolean; // If true, periodicAmount is in today's purchasing power and automatically adjusted for inflation
}

export interface PacParams {
  initialAmount: number;
  periodicAmount: number;
  frequency: ContributionFrequency;
  years: number;
  expectedAnnualReturn: number; // In percentage, e.g., 7 for 7%
  annualStepUp?: number;
  startingAge?: number; // User starting age, e.g., 30
  inflationRate?: number; // In percentage, e.g., 2 for 2%
  autoAdjustAccumulationToInflation?: boolean; // Automatically step-up accumulation payments with inflation
  applyTaxes?: boolean;
  taxRate?: number;
  applyStampDuty?: boolean;
  stampDutyRate?: number;
  withdrawalConfig?: WithdrawalConfig;
}

export interface PacYearData {
  year: number;
  age?: number;
  dateLabel?: string;
  phase: 'accumulation' | 'withdrawal';
  contributionsThisYear: number;
  /** Prelievi lordi dell'anno (prima dell'eventuale imposta sulla quota di guadagno) */
  withdrawalsThisYear: number;
  /** Imposta sulla quota di guadagno dei prelievi dell'anno (0 se la tassazione è disattivata) */
  withdrawalTaxThisYear: number;
  totalPeriodicInvested: number;
  totalInvested: number;
  totalWithdrawn: number;
  interestThisYear: number;
  totalInterest: number;
  stampDutyThisYear: number;
  totalStampDuty: number;
  endBalance: number;
  netEndBalance?: number;
  // Real / Deflated values (in today's purchasing power)
  inflationCumulativeMultiplier: number;
  /** Versamenti dell'anno, ciascuno deflazionato alla propria data */
  realContributionsThisYear: number;
  /** Prelievi dell'anno, ciascuno deflazionato alla propria data */
  realWithdrawalsThisYear: number;
  realEndBalance: number;
  realNetEndBalance?: number;
  /** Somma dei versamenti, ciascuno deflazionato alla propria data (non il totale diviso per l'inflazione finale) */
  realTotalInvested: number;
  realTotalWithdrawn: number;
  /** Rata di prelievo nominale (per periodo della frequenza di prelievo) */
  monthlyWithdrawalNominal?: number;
  /** La stessa rata in euro di oggi, deflazionata all'inizio dell'anno in cui viene applicata */
  monthlyWithdrawalReal?: number;
}

export interface PacResult {
  initialAmount: number;
  totalPeriodicInvested: number;
  totalInvested: number;
  totalInterest: number;
  /** Prelievi lordi totali */
  totalWithdrawn: number;
  /** Imposta sulle plusvalenze realizzate con i prelievi (costo medio proporzionale) */
  totalWithdrawalTax: number;
  /** Prelievi al netto dell'imposta (uguale ai lordi se la tassazione è disattivata) */
  netTotalWithdrawn: number;
  totalStampDutyPaid: number;
  /** Capitale lordo a fine accumulo */
  peakBalance: number;
  /** Capitale netto a fine accumulo (se la tassazione è attiva) */
  netPeakBalance?: number;
  finalBalance: number;
  netFinalBalance?: number;
  // Real Purchasing Power Totals
  realPeakBalance: number;
  realNetPeakBalance?: number;
  realTotalInvestedAtPeak: number;
  realFinalBalance: number;
  realNetFinalBalance?: number;
  realTotalWithdrawn: number;
  startingNominalWithdrawal?: number;
  isDepleted: boolean;
  depletedYear?: number;
  yearlyData: PacYearData[];
}

export const getPeriodsPerYear = (frequency: ContributionFrequency): number => {
  switch (frequency) {
    case 'monthly': return 12;
    case 'bimonthly': return 6;
    case 'quarterly': return 4;
    case 'semiannually': return 2;
    case 'annually': return 1;
    default: return 12;
  }
};

/** Parametri della sola fase di accumulo: per confronti (scenari, costi, FIRE) che devono leggere il capitale a fine accumulo. */
export const accumulationOnly = (params: PacParams): PacParams => ({ ...params, withdrawalConfig: undefined });

export const calculatePAC = (params: PacParams): PacResult => {
  const {
    initialAmount,
    periodicAmount,
    frequency,
    years,
    expectedAnnualReturn,
    annualStepUp = 0,
    startingAge = 30,
    inflationRate = 2.0,
    autoAdjustAccumulationToInflation = false,
    applyTaxes = false,
    taxRate = 26,
    applyStampDuty = false,
    stampDutyRate = 0.20,
    withdrawalConfig,
  } = params;

  const periodsPerYear = getPeriodsPerYear(frequency);
  const r = expectedAnnualReturn / 100;
  const pi = (inflationRate || 0) / 100;
  const tax = taxRate / 100;

  // Effective equivalent periodic rate: i = (1 + r)^(1/m) - 1
  const i = r > 0 ? Math.pow(1 + r, 1 / periodsPerYear) - 1 : 0;

  // Accumulation step-up: user-defined or auto-inflation
  const effectiveAccumulationStepUp = autoAdjustAccumulationToInflation
    ? pi
    : (annualStepUp || 0) / 100;

  // Deflatore al tempo t (in anni da oggi)
  const deflator = (t: number) => Math.pow(1 + pi, t);

  const yearlyData: PacYearData[] = [];

  let currentBalance = initialAmount;
  let totalInvested = initialAmount;
  let realTotalInvested = initialAmount; // versato oggi: nessuna deflazione
  let totalPeriodicInvested = 0;
  let totalWithdrawn = 0;
  let realTotalWithdrawn = 0;
  let totalWithdrawalTax = 0;
  let totalStampDutyPaid = 0;
  let totalCumulativeInterest = 0;
  let currentPeriodicAmount = periodicAmount;

  const currentYear = new Date().getFullYear();

  // ==========================================
  // PHASE 1: ACCUMULATION (PAC)
  // Versamenti a fine periodo, rendimento composto equivalente al tasso annuo.
  // ==========================================
  for (let year = 1; year <= years; year++) {
    let contributionsThisYear = 0;
    let realContributionsThisYear = 0;
    const balanceAtStartOfYear = currentBalance;

    for (let period = 1; period <= periodsPerYear; period++) {
      currentBalance = currentBalance * (1 + i) + currentPeriodicAmount;
      contributionsThisYear += currentPeriodicAmount;
      totalInvested += currentPeriodicAmount;
      totalPeriodicInvested += currentPeriodicAmount;
      const realContribution = currentPeriodicAmount / deflator(year - 1 + period / periodsPerYear);
      realContributionsThisYear += realContribution;
      realTotalInvested += realContribution;
    }

    const grossInterestThisYear = currentBalance - balanceAtStartOfYear - contributionsThisYear;

    let stampDutyThisYear = 0;
    if (applyStampDuty && currentBalance > 0) {
      stampDutyThisYear = currentBalance * (stampDutyRate / 100);
      currentBalance = Math.max(0, currentBalance - stampDutyThisYear);
      totalStampDutyPaid += stampDutyThisYear;
    }

    const interestThisYear = grossInterestThisYear - stampDutyThisYear;
    totalCumulativeInterest += interestThisYear;

    let netEndBalance = undefined;
    if (applyTaxes) {
      const netTaxableGain = Math.max(0, currentBalance - totalInvested);
      netEndBalance = Math.max(0, currentBalance - netTaxableGain * tax);
    }

    const inflationMultiplier = deflator(year);

    yearlyData.push({
      year,
      age: startingAge + year,
      dateLabel: `${currentYear + year}`,
      phase: 'accumulation',
      contributionsThisYear,
      withdrawalsThisYear: 0,
      withdrawalTaxThisYear: 0,
      totalPeriodicInvested,
      totalInvested,
      totalWithdrawn: 0,
      interestThisYear,
      totalInterest: currentBalance - totalInvested,
      stampDutyThisYear,
      totalStampDuty: totalStampDutyPaid,
      endBalance: currentBalance,
      netEndBalance,
      inflationCumulativeMultiplier: inflationMultiplier,
      realContributionsThisYear,
      realWithdrawalsThisYear: 0,
      realEndBalance: currentBalance / inflationMultiplier,
      realNetEndBalance: netEndBalance !== undefined ? netEndBalance / inflationMultiplier : undefined,
      realTotalInvested,
      realTotalWithdrawn: 0,
    });

    if (effectiveAccumulationStepUp > 0) {
      currentPeriodicAmount *= (1 + effectiveAccumulationStepUp);
    }
  }

  const peakBalance = currentBalance;
  const peakRow = years > 0 ? yearlyData[years - 1] : undefined;
  const realTotalInvestedAtPeak = realTotalInvested;
  let isDepleted = false;
  let depletedYear: number | undefined = undefined;
  let startingNominalWithdrawal: number | undefined = undefined;

  // Costo fiscale residuo: diminuisce in proporzione a ogni prelievo (costo medio)
  let costBasis = totalInvested;

  // ==========================================
  // PHASE 2: WITHDRAWAL / DECUMULATION (SWP)
  // ==========================================
  if (withdrawalConfig && withdrawalConfig.enabled && withdrawalConfig.durationYears > 0) {
    const withPeriodsPerYear = getPeriodsPerYear(withdrawalConfig.frequency);
    const withReturn = (withdrawalConfig.expectedAnnualReturn ?? expectedAnnualReturn) / 100;
    const with_i = withReturn > 0 ? Math.pow(1 + withReturn, 1 / withPeriodsPerYear) - 1 : 0;

    let currentWithdrawalAmount = withdrawalConfig.periodicAmount;
    let withStepUpRate = (withdrawalConfig.annualStepUp || 0) / 100;

    if (withdrawalConfig.withdrawalInTodayEuros) {
      // Prima rata nominale all'inizio della fase di prelievo (tra `years` anni), poi indicizzata ogni anno
      currentWithdrawalAmount = withdrawalConfig.periodicAmount * deflator(years);
      startingNominalWithdrawal = currentWithdrawalAmount;
      withStepUpRate = pi;
    }

    for (let wYear = 1; wYear <= withdrawalConfig.durationYears; wYear++) {
      const actualYear = years + wYear;
      let withdrawalsThisYear = 0;
      let realWithdrawalsThisYear = 0;
      let withdrawalTaxThisYear = 0;
      const balanceAtStartOfYear = currentBalance;
      const inflationMultiplier = deflator(actualYear);
      // La rata di quest'anno è fissata all'inizio dell'anno: la si esprime in euro di quel momento
      const rateDeflator = deflator(actualYear - 1);

      if (currentBalance <= 0) {
        if (!isDepleted) {
          isDepleted = true;
          depletedYear = actualYear;
        }
        yearlyData.push({
          year: actualYear,
          age: startingAge + actualYear,
          dateLabel: `${currentYear + actualYear}`,
          phase: 'withdrawal',
          contributionsThisYear: 0,
          withdrawalsThisYear: 0,
          withdrawalTaxThisYear: 0,
          totalPeriodicInvested,
          totalInvested,
          totalWithdrawn,
          interestThisYear: 0,
          totalInterest: totalCumulativeInterest,
          stampDutyThisYear: 0,
          totalStampDuty: totalStampDutyPaid,
          endBalance: 0,
          netEndBalance: applyTaxes ? 0 : undefined,
          inflationCumulativeMultiplier: inflationMultiplier,
          realContributionsThisYear: 0,
          realWithdrawalsThisYear: 0,
          realEndBalance: 0,
          realNetEndBalance: applyTaxes ? 0 : undefined,
          realTotalInvested: realTotalInvestedAtPeak,
          realTotalWithdrawn,
          monthlyWithdrawalNominal: 0,
          monthlyWithdrawalReal: 0,
        });
        continue;
      }

      for (let period = 1; period <= withPeriodsPerYear; period++) {
        currentBalance = currentBalance * (1 + with_i);
        const balanceBefore = currentBalance;
        const actualWithdrawal = Math.min(currentBalance, currentWithdrawalAmount);

        // Costo medio proporzionale: la quota di costo che esce con il prelievo
        const basisShare = balanceBefore > 0 ? (actualWithdrawal * costBasis) / balanceBefore : 0;
        costBasis = Math.max(0, costBasis - basisShare);
        const gainShare = Math.max(0, actualWithdrawal - basisShare);
        const withdrawalTax = applyTaxes ? gainShare * tax : 0;

        currentBalance -= actualWithdrawal;
        withdrawalsThisYear += actualWithdrawal;
        withdrawalTaxThisYear += withdrawalTax;
        totalWithdrawn += actualWithdrawal;
        totalWithdrawalTax += withdrawalTax;
        const realWithdrawal = actualWithdrawal / deflator(actualYear - 1 + period / withPeriodsPerYear);
        realWithdrawalsThisYear += realWithdrawal;
        realTotalWithdrawn += realWithdrawal;

        if (currentBalance <= 1e-9) {
          currentBalance = 0;
          if (!isDepleted) {
            isDepleted = true;
            depletedYear = actualYear;
          }
          break;
        }
      }

      const grossInterestThisYear = (currentBalance + withdrawalsThisYear) - balanceAtStartOfYear;

      let stampDutyThisYear = 0;
      if (applyStampDuty && currentBalance > 0) {
        stampDutyThisYear = currentBalance * (stampDutyRate / 100);
        currentBalance = Math.max(0, currentBalance - stampDutyThisYear);
        totalStampDutyPaid += stampDutyThisYear;
      }

      const interestThisYear = grossInterestThisYear - stampDutyThisYear;
      totalCumulativeInterest += interestThisYear;

      let netEndBalance = undefined;
      if (applyTaxes) {
        const netTaxableGain = Math.max(0, currentBalance - costBasis);
        netEndBalance = Math.max(0, currentBalance - netTaxableGain * tax);
      }

      yearlyData.push({
        year: actualYear,
        age: startingAge + actualYear,
        dateLabel: `${currentYear + actualYear}`,
        phase: 'withdrawal',
        contributionsThisYear: 0,
        withdrawalsThisYear,
        withdrawalTaxThisYear,
        totalPeriodicInvested,
        totalInvested,
        totalWithdrawn,
        interestThisYear,
        totalInterest: totalCumulativeInterest,
        stampDutyThisYear,
        totalStampDuty: totalStampDutyPaid,
        endBalance: currentBalance,
        netEndBalance,
        inflationCumulativeMultiplier: inflationMultiplier,
        realContributionsThisYear: 0,
        realWithdrawalsThisYear,
        realEndBalance: currentBalance / inflationMultiplier,
        realNetEndBalance: netEndBalance !== undefined ? netEndBalance / inflationMultiplier : undefined,
        realTotalInvested: realTotalInvestedAtPeak,
        realTotalWithdrawn,
        monthlyWithdrawalNominal: currentWithdrawalAmount,
        monthlyWithdrawalReal: currentWithdrawalAmount / rateDeflator,
      });

      if (withStepUpRate > 0) {
        currentWithdrawalAmount *= (1 + withStepUpRate);
      }
    }
  }

  const lastRow = yearlyData[yearlyData.length - 1];
  const finalBalance = lastRow ? lastRow.endBalance : initialAmount;
  const netFinalBalance = lastRow ? lastRow.netEndBalance : applyTaxes ? initialAmount : undefined;
  const finalInflationMultiplier = lastRow ? lastRow.inflationCumulativeMultiplier : 1;
  const peakInflationMultiplier = peakRow ? peakRow.inflationCumulativeMultiplier : 1;

  return {
    initialAmount,
    totalPeriodicInvested,
    totalInvested,
    totalInterest: lastRow ? lastRow.totalInterest : 0,
    totalWithdrawn,
    totalWithdrawalTax,
    netTotalWithdrawn: totalWithdrawn - totalWithdrawalTax,
    totalStampDutyPaid,
    peakBalance,
    netPeakBalance: peakRow?.netEndBalance,
    finalBalance,
    netFinalBalance,
    realPeakBalance: peakBalance / peakInflationMultiplier,
    realNetPeakBalance: peakRow?.realNetEndBalance,
    realTotalInvestedAtPeak,
    realFinalBalance: finalBalance / finalInflationMultiplier,
    realNetFinalBalance: netFinalBalance !== undefined ? netFinalBalance / finalInflationMultiplier : undefined,
    realTotalWithdrawn,
    startingNominalWithdrawal,
    isDepleted,
    depletedYear,
    yearlyData,
  };
};

// ==========================================
// 1. GOAL SEEKER (CALCOLATORE INVERSO)
// Considera solo rendimento costante e bollo: niente step-up, inflazione o imposta sulle plusvalenze.
// ==========================================
export interface GoalSeekerResult {
  targetAmount: number;
  /** Rata per periodo della frequenza scelta */
  requiredMonthlyAmount: number;
  totalInvested: number;
  totalInterest: number;
}

export const calculateGoalSeekerPeriodic = (
  targetAmount: number,
  years: number,
  expectedReturn: number,
  initialAmount: number,
  frequency: ContributionFrequency = 'monthly',
  applyStampDuty = false,
  stampDutyRate = 0.20
): GoalSeekerResult => {
  if (targetAmount <= 0 || years <= 0) {
    return { targetAmount, requiredMonthlyAmount: 0, totalInvested: 0, totalInterest: 0 };
  }

  const run = (periodic: number) =>
    calculatePAC({
      initialAmount,
      periodicAmount: periodic,
      frequency,
      years,
      expectedAnnualReturn: expectedReturn,
      applyStampDuty,
      stampDutyRate,
    });

  let low = 0;
  let high = targetAmount;

  if (run(0).finalBalance >= targetAmount) {
    high = 0;
  } else {
    for (let iter = 0; iter < 60; iter++) {
      const mid = (low + high) / 2;
      if (run(mid).finalBalance < targetAmount) {
        low = mid;
      } else {
        high = mid;
      }
    }
  }

  const finalRes = run(high);

  return {
    targetAmount,
    requiredMonthlyAmount: high,
    totalInvested: finalRes.totalInvested,
    totalInterest: finalRes.totalInterest,
  };
};

export const GOAL_SEEKER_MAX_YEARS = 50;

/** Anni necessari per raggiungere l'obiettivo; `requiredYears` è null se non raggiungibile entro 50 anni. */
export const calculateGoalSeekerYears = (
  targetAmount: number,
  periodicAmount: number,
  expectedReturn: number,
  initialAmount: number,
  frequency: ContributionFrequency = 'monthly',
  applyStampDuty = false,
  stampDutyRate = 0.20
): { requiredYears: number | null; finalBalance: number; totalInvested: number } => {
  if (targetAmount <= 0) {
    return { requiredYears: 0, finalBalance: initialAmount, totalInvested: initialAmount };
  }
  if (initialAmount >= targetAmount) {
    return { requiredYears: 0, finalBalance: initialAmount, totalInvested: initialAmount };
  }

  for (let y = 1; y <= GOAL_SEEKER_MAX_YEARS; y++) {
    const res = calculatePAC({
      initialAmount,
      periodicAmount,
      frequency,
      years: y,
      expectedAnnualReturn: expectedReturn,
      applyStampDuty,
      stampDutyRate,
    });
    if (res.finalBalance >= targetAmount) {
      return { requiredYears: y, finalBalance: res.finalBalance, totalInvested: res.totalInvested };
    }
  }

  return { requiredYears: null, finalBalance: 0, totalInvested: 0 };
};

// ==========================================
// 2. CONFRONTO SCENARI
// Tre ipotesi di rendimento costante centrate sul rendimento atteso (±3 punti). Solo fase di accumulo.
// ==========================================
export interface ScenarioItem {
  expectedReturn: number;
  result: PacResult;
}

export const SCENARIO_SPREAD = 3;

export const calculateScenarios = (
  baseParams: PacParams
): { low: ScenarioItem; base: ScenarioItem; high: ScenarioItem } => {
  const params = accumulationOnly(baseParams);
  const baseReturn = params.expectedAnnualReturn;
  const make = (ret: number): ScenarioItem => ({
    expectedReturn: ret,
    result: calculatePAC({ ...params, expectedAnnualReturn: ret }),
  });

  return {
    low: make(Math.max(0, baseReturn - SCENARIO_SPREAD)),
    base: make(baseReturn),
    high: make(baseReturn + SCENARIO_SPREAD),
  };
};

// ==========================================
// 3. SIMULAZIONE MONTE CARLO
// ==========================================
export interface MonteCarloYearPoint {
  year: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface MonteCarloResult {
  yearlyPoints: MonteCarloYearPoint[];
  finalP10: number;
  finalP50: number;
  finalP90: number;
  totalInvested: number;
  volatility: number;
  iterations: number;
}

/** PRNG deterministico (mulberry32): stessi input, stesse traiettorie. */
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Normale standard (Box-Muller) dal generatore dato. */
export const randomGaussian = (rand: () => number): number => {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
};

/** Percentile su un array ordinato: indice Math.round(q·(n−1)). */
export const percentileSorted = (sorted: number[], q: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[idx];
};

/**
 * Monte Carlo della sola fase di accumulo.
 * Convenzione: il rendimento logaritmico annuo è normale con media ln(1+μ) e deviazione σ
 * (σ = volatilità inserita, intesa sui rendimenti logaritmici). Il fattore annuo 1+R = exp(ln(1+μ) + σ·z)
 * ha quindi mediana esattamente 1+μ: la traiettoria mediana resta vicina al calcolo deterministico
 * (la media, invece, è più alta di un fattore exp(σ²/2)).
 * Versamenti, step-up e bollo come in calculatePAC.
 */
export const calculateMonteCarlo = (
  params: PacParams,
  volatility = 15.0,
  iterations = 2000,
  seed = 20240607
): MonteCarloResult => {
  const {
    initialAmount,
    periodicAmount,
    frequency,
    years,
    expectedAnnualReturn,
    annualStepUp = 0,
    inflationRate = 2.0,
    autoAdjustAccumulationToInflation = false,
    applyStampDuty,
    stampDutyRate = 0.20,
  } = params;
  const m = getPeriodsPerYear(frequency);
  const logMu = Math.log(1 + expectedAnnualReturn / 100);
  const sigma = volatility / 100;
  const stepUp = autoAdjustAccumulationToInflation ? (inflationRate || 0) / 100 : (annualStepUp || 0) / 100;
  const rand = mulberry32(seed);

  const n = Math.max(1, Math.floor(iterations));
  // balancesByYear[y][iter]
  const balancesByYear: Float64Array[] = Array.from({ length: years }, () => new Float64Array(n));

  for (let iter = 0; iter < n; iter++) {
    let bal = initialAmount;
    let contribution = periodicAmount;

    for (let y = 0; y < years; y++) {
      const annualLogReturn = logMu + sigma * randomGaussian(rand);
      const periodFactor = Math.exp(annualLogReturn / m);

      for (let p = 0; p < m; p++) {
        bal = bal * periodFactor + contribution;
      }

      if (applyStampDuty && bal > 0) {
        bal -= bal * (stampDutyRate / 100);
      }

      balancesByYear[y][iter] = bal;
      if (stepUp > 0) contribution *= 1 + stepUp;
    }
  }

  const yearlyPoints: MonteCarloYearPoint[] = balancesByYear.map((arr, yIndex) => {
    const sorted = Array.from(arr).sort((a, b) => a - b);
    return {
      year: yIndex + 1,
      p10: percentileSorted(sorted, 0.1),
      p50: percentileSorted(sorted, 0.5),
      p90: percentileSorted(sorted, 0.9),
    };
  });

  const finalP = yearlyPoints[yearlyPoints.length - 1] || { p10: 0, p50: 0, p90: 0, year: years };
  const totalInvested = calculatePAC(accumulationOnly(params)).totalInvested;

  return {
    yearlyPoints,
    finalP10: finalP.p10,
    finalP50: finalP.p50,
    finalP90: finalP.p90,
    totalInvested,
    volatility,
    iterations: n,
  };
};

// ==========================================
// 4. IMPATTO COSTI / TER (FEE DRAG)
// Solo fase di accumulo; il bollo segue l'impostazione dell'utente.
// ==========================================
export interface FeeDragResult {
  lowCostBalance: number;
  highCostBalance: number;
  totalFeeDifference: number;
  percentageLostToFees: number;
  lowCostTER: number;
  highCostTER: number;
}

export const calculateFeeDrag = (
  params: PacParams,
  lowCostTER = 0.20,
  highCostTER = 1.80
): FeeDragResult => {
  const base = accumulationOnly(params);
  const grossReturn = base.expectedAnnualReturn;

  const lowCostReturn = Math.max(0, grossReturn - lowCostTER);
  const highCostReturn = Math.max(0, grossReturn - highCostTER);

  const lowRes = calculatePAC({ ...base, expectedAnnualReturn: lowCostReturn });
  const highRes = calculatePAC({ ...base, expectedAnnualReturn: highCostReturn });

  const lowCostBalance = lowRes.finalBalance;
  const highCostBalance = highRes.finalBalance;
  const totalFeeDifference = Math.max(0, lowCostBalance - highCostBalance);
  const percentageLostToFees = lowCostBalance > 0 ? (totalFeeDifference / lowCostBalance) * 100 : 0;

  return {
    lowCostBalance,
    highCostBalance,
    totalFeeDifference,
    percentageLostToFees,
    lowCostTER,
    highCostTER,
  };
};

// ==========================================
// 5. CALCOLATORE FIRE
// Obiettivo espresso in euro di oggi: spese annue / tasso di prelievo.
// ==========================================
export interface FIREResult {
  monthlyExpenses: number;
  annualExpenses: number;
  safeWithdrawalRate: number;
  /** Capitale obiettivo in euro di oggi */
  targetFireCapital: number;
  /** Rendita mensile sostenibile dal capitale attuale (euro di oggi) */
  sustainableMonthlyIncome: number;
  /** Anni per raggiungere l'obiettivo rivalutato all'inflazione (null se oltre 50 anni) */
  yearsToFIREWithPac: number | null;
  /** Anni per raggiungere l'obiettivo senza rivalutarlo all'inflazione (null se oltre 50 anni) */
  yearsToFIRENominal: number | null;
  /** Obiettivo nominale nell'anno in cui viene raggiunto (se raggiunto) */
  nominalTargetAtFIRE: number | null;
  fireProgressPercentage: number;
}

export const FIRE_MAX_YEARS = 50;

export const calculateFIRE = (
  monthlyExpenses: number,
  currentPortfolioValue: number,
  monthlyContribution: number,
  expectedReturn = 7.0,
  safeWithdrawalRate = 4.0,
  options: { inflationRate?: number; applyStampDuty?: boolean; stampDutyRate?: number } = {}
): FIREResult => {
  const { inflationRate = 0, applyStampDuty = false, stampDutyRate = 0.20 } = options;
  const pi = inflationRate / 100;
  const annualExpenses = monthlyExpenses * 12;
  const targetFireCapital = safeWithdrawalRate > 0 ? annualExpenses / (safeWithdrawalRate / 100) : 0;
  const sustainableMonthlyIncome = (currentPortfolioValue * (safeWithdrawalRate / 100)) / 12;
  const fireProgressPercentage = targetFireCapital > 0 ? Math.min(100, (currentPortfolioValue / targetFireCapital) * 100) : 0;

  let yearsToFIREWithPac: number | null = null;
  let yearsToFIRENominal: number | null = null;
  let nominalTargetAtFIRE: number | null = null;

  if (targetFireCapital <= 0 || currentPortfolioValue >= targetFireCapital) {
    yearsToFIREWithPac = 0;
    yearsToFIRENominal = 0;
    nominalTargetAtFIRE = targetFireCapital;
  } else {
    // Una sola simulazione mensile, letta anno per anno
    const res = calculatePAC({
      initialAmount: currentPortfolioValue,
      periodicAmount: monthlyContribution,
      frequency: 'monthly',
      years: FIRE_MAX_YEARS,
      expectedAnnualReturn: expectedReturn,
      applyStampDuty,
      stampDutyRate,
    });
    for (const row of res.yearlyData) {
      if (yearsToFIRENominal === null && row.endBalance >= targetFireCapital) {
        yearsToFIRENominal = row.year;
      }
      const inflatedTarget = targetFireCapital * Math.pow(1 + pi, row.year);
      if (yearsToFIREWithPac === null && row.endBalance >= inflatedTarget) {
        yearsToFIREWithPac = row.year;
        nominalTargetAtFIRE = inflatedTarget;
      }
      if (yearsToFIRENominal !== null && yearsToFIREWithPac !== null) break;
    }
  }

  return {
    monthlyExpenses,
    annualExpenses,
    safeWithdrawalRate,
    targetFireCapital,
    sustainableMonthlyIncome,
    yearsToFIREWithPac,
    yearsToFIRENominal,
    nominalTargetAtFIRE,
    fireProgressPercentage,
  };
};

// ==========================================
// 6. CSV EXPORT UTILITY
// Separatore ';' e virgola decimale: si apre correttamente in Excel con impostazioni italiane.
// Il BOM UTF-8 va aggiunto da chi salva il file (vedi CSV_BOM).
// ==========================================
export const CSV_BOM = '﻿';

const csvNumber = (n: number): string => n.toFixed(2).replace('.', ',');

const csvCell = (v: string | number): string => {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const generatePacCsv = (yearlyData: PacYearData[]): string => {
  const headers = [
    'Anno',
    'Età',
    'Data',
    'Fase',
    'Versamento nominale (€)',
    'Versamento reale (€)',
    'Prelievo lordo nominale (€)',
    'Prelievo lordo reale (€)',
    'Imposta sui prelievi (€)',
    'Totale versato (€)',
    'Totale prelevato lordo (€)',
    'Interessi anno (€)',
    'Totale guadagno (€)',
    'Imposta di bollo (€)',
    'Capitale fine anno nominale (€)',
    'Capitale fine anno reale (€)',
  ];

  const rows = yearlyData.map((d) => [
    d.year,
    d.age ?? '',
    d.dateLabel || '',
    d.phase === 'accumulation' ? 'Accumulo' : 'Prelievo',
    csvNumber(d.contributionsThisYear),
    csvNumber(d.realContributionsThisYear),
    csvNumber(d.withdrawalsThisYear),
    csvNumber(d.realWithdrawalsThisYear),
    csvNumber(d.withdrawalTaxThisYear),
    csvNumber(d.totalInvested),
    csvNumber(d.totalWithdrawn),
    csvNumber(d.interestThisYear),
    csvNumber(d.totalInterest),
    csvNumber(d.stampDutyThisYear),
    csvNumber(d.endBalance),
    csvNumber(d.realEndBalance),
  ]);

  return [headers.map(csvCell).join(';'), ...rows.map((r) => r.map(csvCell).join(';'))].join('\r\n');
};
