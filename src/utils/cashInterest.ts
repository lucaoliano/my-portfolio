export interface CashYieldEstimate {
  annualGross: number;
  annualNet: number;
  monthlyGross: number;
  monthlyNet: number;
  dailyGross: number;
  dailyNet: number;
  taxRate: number;
}

/**
 * Piani di Scalable come scorciatoie per il tasso. I tassi cambiano: sono gli ultimi valori noti all'app,
 * non un dato in tempo reale. Il tasso che conta è quello che l'utente legge sul proprio conto.
 */
export const SCALABLE_INTEREST_PLANS = {
  free: {
    id: 'free',
    label: 'Free',
    description: 'Nessuna remunerazione della liquidità',
    rate: 0.0,
    cap: null,
  },
  prime: {
    id: 'prime',
    label: 'Prime',
    description: 'Tasso del piano Prime',
    rate: 2.6,
    cap: null,
  },
  prime_plus: {
    id: 'prime_plus',
    label: 'Prime+',
    description: 'Tasso del piano Prime+, fino a €100.000 di liquidità',
    rate: 4.0,
    cap: 100000,
  },
  custom: {
    id: 'custom',
    label: 'Altro',
    description: 'Il tasso che leggi sul tuo conto',
    rate: 2.6,
    cap: null,
  },
} as const;

/** Liquidità oltre la quale il tasso del piano non si applica (null = nessun tetto) */
export const interestCapFor = (plan?: string | null): number | null =>
  plan && plan in SCALABLE_INTEREST_PLANS ? SCALABLE_INTEREST_PLANS[plan as keyof typeof SCALABLE_INTEREST_PLANS].cap : null;

export type ScalableInterestPlanId = keyof typeof SCALABLE_INTEREST_PLANS;

export const ITALIAN_INTEREST_TAX_RATE = 0.26; // Imposta del 26% sugli interessi della liquidità

/**
 * Calculates estimated passive cash yield (gross and net of 26% tax)
 * based on the uninvested cash balance and the annual nominal interest rate.
 */
export function calculateCashYield(
  cashBalance: number,
  interestRate: number,
  taxRate: number = ITALIAN_INTEREST_TAX_RATE,
  /** Liquidità massima remunerata (es. Prime+ fino a €100.000) */
  capAmount: number | null = null
): CashYieldEstimate {
  const balance = Math.max(0, Number(cashBalance) || 0);
  const safeBalance = capAmount !== null ? Math.min(balance, capAmount) : balance;
  const safeRate = Math.max(0, Number(interestRate) || 0);

  if (safeBalance === 0 || safeRate === 0) {
    return {
      annualGross: 0,
      annualNet: 0,
      monthlyGross: 0,
      monthlyNet: 0,
      dailyGross: 0,
      dailyNet: 0,
      taxRate,
    };
  }

  const annualGross = safeBalance * (safeRate / 100);
  const annualNet = annualGross * (1 - taxRate);
  const monthlyGross = annualGross / 12;
  const monthlyNet = annualNet / 12;
  const dailyGross = annualGross / 365;
  const dailyNet = annualNet / 365;

  return {
    annualGross,
    annualNet,
    monthlyGross,
    monthlyNet,
    dailyGross,
    dailyNet,
    taxRate,
  };
}
