export interface CashYieldEstimate {
  annualGross: number;
  annualNet: number;
  monthlyGross: number;
  monthlyNet: number;
  dailyGross: number;
  dailyNet: number;
  taxRate: number;
}

export const SCALABLE_INTEREST_PLANS = {
  free: {
    id: 'free',
    label: 'FREE (0%)',
    description: 'Nessuna remunerazione sulla liquidità',
    rate: 0.0,
  },
  prime: {
    id: 'prime',
    label: 'PRIME (2,60%)',
    description: 'Tasso base remunerato Scalable',
    rate: 2.6,
  },
  prime_plus: {
    id: 'prime_plus',
    label: 'PRIME+ (4,00%)',
    description: 'Tasso promozionale Prime+ (fino a 100.000€)',
    rate: 4.0,
  },
  custom: {
    id: 'custom',
    label: 'Personalizzato',
    description: 'Imposta un tasso annuo su misura',
    rate: 2.6,
  },
} as const;

export type ScalableInterestPlanId = keyof typeof SCALABLE_INTEREST_PLANS;

export const ITALIAN_INTEREST_TAX_RATE = 0.26; // Ritenuta fiscale del 26% su interessi bancari e liquidità broker

/**
 * Calculates estimated passive cash yield (gross and net of 26% tax)
 * based on the uninvested cash balance and the annual nominal interest rate.
 */
export function calculateCashYield(
  cashBalance: number,
  interestRate: number,
  taxRate: number = ITALIAN_INTEREST_TAX_RATE
): CashYieldEstimate {
  const safeBalance = Math.max(0, Number(cashBalance) || 0);
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
