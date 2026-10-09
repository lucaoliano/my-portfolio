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
  withdrawalsThisYear: number;
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
  realContributionsThisYear: number;
  realWithdrawalsThisYear: number;
  realEndBalance: number;
  realNetEndBalance?: number;
  realTotalInvested: number;
  realTotalWithdrawn: number;
  monthlyWithdrawalNominal?: number;
  monthlyWithdrawalReal?: number;
}

export interface PacResult {
  initialAmount: number;
  totalPeriodicInvested: number;
  totalInvested: number;
  totalInterest: number;
  totalWithdrawn: number;
  totalStampDutyPaid: number;
  peakBalance: number;
  finalBalance: number;
  netFinalBalance?: number;
  // Real Purchasing Power Totals
  realPeakBalance: number;
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
  
  // Effective equivalent periodic rate: i = (1 + r)^(1/m) - 1
  const i = r > 0 ? Math.pow(1 + r, 1 / periodsPerYear) - 1 : 0;
  
  // Accumulation step-up: user-defined or auto-inflation
  const effectiveAccumulationStepUp = autoAdjustAccumulationToInflation
    ? pi
    : (annualStepUp || 0) / 100;

  const yearlyData: PacYearData[] = [];
  
  let currentBalance = initialAmount;
  let totalInvested = initialAmount;
  let totalPeriodicInvested = 0;
  let totalWithdrawn = 0;
  let totalStampDutyPaid = 0;
  let totalCumulativeInterest = 0;
  let currentPeriodicAmount = periodicAmount;
  
  const currentYear = new Date().getFullYear();

  // ==========================================
  // PHASE 1: ACCUMULATION (PAC)
  // ==========================================
  for (let year = 1; year <= years; year++) {
    let contributionsThisYear = 0;
    const balanceAtStartOfYear = currentBalance;
    
    for (let period = 1; period <= periodsPerYear; period++) {
      currentBalance = currentBalance * (1 + i) + currentPeriodicAmount;
      contributionsThisYear += currentPeriodicAmount;
      totalInvested += currentPeriodicAmount;
      totalPeriodicInvested += currentPeriodicAmount;
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
      const taxAmount = netTaxableGain * (taxRate / 100);
      netEndBalance = Math.max(0, currentBalance - taxAmount);
    }

    const inflationMultiplier = Math.pow(1 + pi, year);
    
    yearlyData.push({
      year,
      age: startingAge + year,
      dateLabel: `${currentYear + year}`,
      phase: 'accumulation',
      contributionsThisYear,
      withdrawalsThisYear: 0,
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
      realContributionsThisYear: contributionsThisYear / inflationMultiplier,
      realWithdrawalsThisYear: 0,
      realEndBalance: currentBalance / inflationMultiplier,
      realNetEndBalance: netEndBalance !== undefined ? netEndBalance / inflationMultiplier : undefined,
      realTotalInvested: totalInvested / inflationMultiplier,
      realTotalWithdrawn: 0,
    });
    
    if (effectiveAccumulationStepUp > 0) {
      currentPeriodicAmount *= (1 + effectiveAccumulationStepUp);
    }
  }

  const peakBalance = currentBalance;
  let isDepleted = false;
  let depletedYear: number | undefined = undefined;
  let startingNominalWithdrawal: number | undefined = undefined;

  // ==========================================
  // PHASE 2: WITHDRAWAL / DECUMULATION (SWP)
  // ==========================================
  if (withdrawalConfig && withdrawalConfig.enabled && withdrawalConfig.durationYears > 0) {
    const withPeriodsPerYear = getPeriodsPerYear(withdrawalConfig.frequency);
    const withReturn = (withdrawalConfig.expectedAnnualReturn ?? expectedAnnualReturn) / 100;
    const with_i = withReturn > 0 ? Math.pow(1 + withReturn, 1 / withPeriodsPerYear) - 1 : 0;
    
    // If withdrawal is expressed in today's euros, project it to startYear (years) and index by inflation annually
    let currentWithdrawalAmount = withdrawalConfig.periodicAmount;
    let withStepUpRate = (withdrawalConfig.annualStepUp || 0) / 100;

    if (withdrawalConfig.withdrawalInTodayEuros) {
      // Starting nominal amount at the start of withdrawal phase (year = years + 1)
      const inflationAtStart = Math.pow(1 + pi, years);
      currentWithdrawalAmount = withdrawalConfig.periodicAmount * inflationAtStart;
      startingNominalWithdrawal = currentWithdrawalAmount;
      // Step-up annually by the inflation rate
      withStepUpRate = pi;
    }

    for (let wYear = 1; wYear <= withdrawalConfig.durationYears; wYear++) {
      const actualYear = years + wYear;
      let withdrawalsThisYear = 0;
      const balanceAtStartOfYear = currentBalance;
      const inflationMultiplier = Math.pow(1 + pi, actualYear);
      
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
          realTotalInvested: totalInvested / inflationMultiplier,
          realTotalWithdrawn: totalWithdrawn / inflationMultiplier,
          monthlyWithdrawalNominal: 0,
          monthlyWithdrawalReal: 0,
        });
        continue;
      }

      for (let period = 1; period <= withPeriodsPerYear; period++) {
        currentBalance = currentBalance * (1 + with_i);
        const actualWithdrawal = Math.min(currentBalance, currentWithdrawalAmount);
        currentBalance -= actualWithdrawal;
        withdrawalsThisYear += actualWithdrawal;
        totalWithdrawn += actualWithdrawal;

        if (currentBalance <= 0) {
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
        const remainingPrincipal = Math.max(0, totalInvested - totalWithdrawn);
        const netTaxableGain = Math.max(0, currentBalance - remainingPrincipal);
        const taxAmount = netTaxableGain * (taxRate / 100);
        netEndBalance = Math.max(0, currentBalance - taxAmount);
      }

      yearlyData.push({
        year: actualYear,
        age: startingAge + actualYear,
        dateLabel: `${currentYear + actualYear}`,
        phase: 'withdrawal',
        contributionsThisYear: 0,
        withdrawalsThisYear,
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
        realWithdrawalsThisYear: withdrawalsThisYear / inflationMultiplier,
        realEndBalance: currentBalance / inflationMultiplier,
        realNetEndBalance: netEndBalance !== undefined ? netEndBalance / inflationMultiplier : undefined,
        realTotalInvested: totalInvested / inflationMultiplier,
        realTotalWithdrawn: totalWithdrawn / inflationMultiplier,
        monthlyWithdrawalNominal: currentWithdrawalAmount,
        monthlyWithdrawalReal: currentWithdrawalAmount / inflationMultiplier,
      });

      if (withStepUpRate > 0) {
        currentWithdrawalAmount *= (1 + withStepUpRate);
      }
    }
  }

  const finalData = yearlyData[yearlyData.length - 1] || {
    totalPeriodicInvested: 0,
    totalInvested: initialAmount,
    totalInterest: 0,
    totalWithdrawn: 0,
    totalStampDuty: 0,
    endBalance: initialAmount,
    netEndBalance: applyTaxes ? initialAmount : undefined,
    inflationCumulativeMultiplier: 1,
    realEndBalance: initialAmount,
    realNetEndBalance: applyTaxes ? initialAmount : undefined,
    realTotalWithdrawn: 0,
  };

  const totalYearsCount = yearlyData.length;
  const finalInflationMultiplier = Math.pow(1 + pi, totalYearsCount || 1);
  const peakInflationMultiplier = Math.pow(1 + pi, years || 1);

  return {
    initialAmount,
    totalPeriodicInvested,
    totalInvested,
    totalInterest: finalData.totalInterest,
    totalWithdrawn,
    totalStampDutyPaid,
    peakBalance,
    finalBalance: finalData.endBalance,
    netFinalBalance: finalData.netEndBalance,
    realPeakBalance: peakBalance / peakInflationMultiplier,
    realFinalBalance: finalData.endBalance / finalInflationMultiplier,
    realNetFinalBalance: finalData.netEndBalance !== undefined ? finalData.netEndBalance / finalInflationMultiplier : undefined,
    realTotalWithdrawn: totalWithdrawn / finalInflationMultiplier,
    startingNominalWithdrawal,
    isDepleted,
    depletedYear,
    yearlyData,
  };
};

// ==========================================
// 1. GOAL SEEKER (CALCOLATORE INVERSO)
// ==========================================
export interface GoalSeekerResult {
  targetAmount: number;
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

  let low = 0;
  let high = targetAmount;
  let requiredPeriodic = 0;

  for (let iter = 0; iter < 50; iter++) {
    const mid = (low + high) / 2;
    const res = calculatePAC({
      initialAmount,
      periodicAmount: mid,
      frequency,
      years,
      expectedAnnualReturn: expectedReturn,
      applyStampDuty,
      stampDutyRate,
    });

    if (res.finalBalance < targetAmount) {
      low = mid;
    } else {
      high = mid;
    }
    requiredPeriodic = mid;
  }

  const finalRes = calculatePAC({
    initialAmount,
    periodicAmount: requiredPeriodic,
    frequency,
    years,
    expectedAnnualReturn: expectedReturn,
    applyStampDuty,
    stampDutyRate,
  });

  return {
    targetAmount,
    requiredMonthlyAmount: requiredPeriodic,
    totalInvested: finalRes.totalInvested,
    totalInterest: finalRes.totalInterest,
  };
};

export const calculateGoalSeekerYears = (
  targetAmount: number,
  periodicAmount: number,
  expectedReturn: number,
  initialAmount: number,
  frequency: ContributionFrequency = 'monthly',
  applyStampDuty = false,
  stampDutyRate = 0.20
): { requiredYears: number; finalBalance: number; totalInvested: number } => {
  if (targetAmount <= 0 || periodicAmount <= 0) {
    return { requiredYears: 0, finalBalance: 0, totalInvested: 0 };
  }

  for (let y = 1; y <= 50; y++) {
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

  return { requiredYears: 50, finalBalance: 0, totalInvested: 0 };
};

// ==========================================
// 2. CONFRONTO SCENARI
// ==========================================
export interface ScenarioItem {
  name: string;
  expectedReturn: number;
  /** Token del tema (ThemeColors) con cui rappresentare lo scenario */
  colorToken: 'info' | 'positive' | 'warning';
  result: PacResult;
}

export const calculateScenarios = (
  baseParams: PacParams
): { prudent: ScenarioItem; balanced: ScenarioItem; dynamic: ScenarioItem } => {
  const prudentReturn = 4.0;
  const balancedReturn = 7.0;
  const dynamicReturn = 10.0;

  const prudent = {
    name: 'Prudente / Obbligazionario (4%)',
    expectedReturn: prudentReturn,
    colorToken: 'info' as const,
    result: calculatePAC({ ...baseParams, expectedAnnualReturn: prudentReturn }),
  };

  const balanced = {
    name: 'Bilanciato (7%)',
    expectedReturn: balancedReturn,
    colorToken: 'positive' as const,
    result: calculatePAC({ ...baseParams, expectedAnnualReturn: balancedReturn }),
  };

  const dynamic = {
    name: 'Dinamico / Azionario Globale (10%)',
    expectedReturn: dynamicReturn,
    colorToken: 'warning' as const,
    result: calculatePAC({ ...baseParams, expectedAnnualReturn: dynamicReturn }),
  };

  return { prudent, balanced, dynamic };
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
}

const randomGaussian = (): number => {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
};

export const calculateMonteCarlo = (
  params: PacParams,
  volatility = 15.0,
  iterations = 200
): MonteCarloResult => {
  const { initialAmount, periodicAmount, frequency, years, expectedAnnualReturn, applyStampDuty, stampDutyRate = 0.20 } = params;
  const m = getPeriodsPerYear(frequency);
  const mu = expectedAnnualReturn / 100;
  const sigma = volatility / 100;

  const trajectories: number[][] = [];

  for (let iter = 0; iter < iterations; iter++) {
    const trajectory: number[] = [];
    let bal = initialAmount;

    for (let y = 1; y <= years; y++) {
      const annualReturnSample = mu + sigma * randomGaussian();
      const i_period = annualReturnSample > -0.99 ? Math.pow(1 + Math.max(-0.95, annualReturnSample), 1 / m) - 1 : -0.5 / m;

      for (let p = 1; p <= m; p++) {
        bal = Math.max(0, bal * (1 + i_period) + periodicAmount);
      }

      if (applyStampDuty && bal > 0) {
        bal = Math.max(0, bal - bal * (stampDutyRate / 100));
      }

      trajectory.push(bal);
    }
    trajectories.push(trajectory);
  }

  const yearlyPoints: MonteCarloYearPoint[] = [];

  for (let yIndex = 0; yIndex < years; yIndex++) {
    const balancesAtYear = trajectories.map((t) => t[yIndex]).sort((a, b) => a - b);
    const p10Index = Math.floor(iterations * 0.10);
    const p50Index = Math.floor(iterations * 0.50);
    const p90Index = Math.floor(iterations * 0.90);

    yearlyPoints.push({
      year: yIndex + 1,
      p10: balancesAtYear[p10Index] || 0,
      p50: balancesAtYear[p50Index] || 0,
      p90: balancesAtYear[p90Index] || 0,
    });
  }

  const finalP = yearlyPoints[yearlyPoints.length - 1] || { p10: 0, p50: 0, p90: 0, year: years };
  const totalInvested = initialAmount + periodicAmount * m * years;

  return {
    yearlyPoints,
    finalP10: finalP.p10,
    finalP50: finalP.p50,
    finalP90: finalP.p90,
    totalInvested,
    volatility,
  };
};

// ==========================================
// 4. IMPATTO COSTI / TER (FEE DRAG)
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
  const grossReturn = params.expectedAnnualReturn;

  const lowCostReturn = Math.max(0, grossReturn - lowCostTER);
  const highCostReturn = Math.max(0, grossReturn - highCostTER);

  const lowRes = calculatePAC({ ...params, expectedAnnualReturn: lowCostReturn });
  const highRes = calculatePAC({ ...params, expectedAnnualReturn: highCostReturn });

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
// ==========================================
export interface FIREResult {
  monthlyExpenses: number;
  annualExpenses: number;
  safeWithdrawalRate: number;
  targetFireCapital: number;
  sustainableMonthlyIncome: number;
  yearsToFIREWithPac: number;
  fireProgressPercentage: number;
}

export const calculateFIRE = (
  monthlyExpenses: number,
  currentPortfolioValue: number,
  pacMonthlyAmount: number,
  expectedReturn = 7.0,
  safeWithdrawalRate = 4.0
): FIREResult => {
  const annualExpenses = monthlyExpenses * 12;
  const targetFireCapital = safeWithdrawalRate > 0 ? annualExpenses / (safeWithdrawalRate / 100) : 0;
  const sustainableMonthlyIncome = (currentPortfolioValue * (safeWithdrawalRate / 100)) / 12;
  const fireProgressPercentage = targetFireCapital > 0 ? Math.min(100, (currentPortfolioValue / targetFireCapital) * 100) : 0;

  let yearsToFIREWithPac = 0;
  if (currentPortfolioValue < targetFireCapital && pacMonthlyAmount > 0) {
    const seeker = calculateGoalSeekerYears(
      targetFireCapital,
      pacMonthlyAmount,
      expectedReturn,
      currentPortfolioValue,
      'monthly'
    );
    yearsToFIREWithPac = seeker.requiredYears;
  }

  return {
    monthlyExpenses,
    annualExpenses,
    safeWithdrawalRate,
    targetFireCapital,
    sustainableMonthlyIncome,
    yearsToFIREWithPac,
    fireProgressPercentage,
  };
};

// ==========================================
// 6. CSV EXPORT UTILITY
// ==========================================
export const generatePacCsv = (yearlyData: PacYearData[]): string => {
  const headers = [
    'Anno',
    'Età',
    'Data',
    'Fase',
    'Versamento Nominale (€)',
    'Versamento Reale (€)',
    'Prelievo Nominale (€)',
    'Prelievo Reale (€)',
    'Totale Versato (€)',
    'Totale Prelevato (€)',
    'Interessi Anno (€)',
    'Totale Guadagno (€)',
    'Imposta Bollo (€)',
    'Capitale Fine Anno Nominale (€)',
    'Capitale Fine Anno Reale (€)',
  ];

  const rows = yearlyData.map((d) => [
    d.year,
    d.age ?? '',
    d.dateLabel || '',
    d.phase === 'accumulation' ? 'Accumulo' : 'Prelievo',
    d.contributionsThisYear.toFixed(2),
    d.realContributionsThisYear.toFixed(2),
    d.withdrawalsThisYear.toFixed(2),
    d.realWithdrawalsThisYear.toFixed(2),
    d.totalInvested.toFixed(2),
    d.totalWithdrawn.toFixed(2),
    d.interestThisYear.toFixed(2),
    d.totalInterest.toFixed(2),
    d.stampDutyThisYear.toFixed(2),
    d.endBalance.toFixed(2),
    d.realEndBalance.toFixed(2),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
};
