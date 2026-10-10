import { ScalableSavingsPlan } from '../types';

/** Rate all'anno per frequenza; valori sconosciuti di Scalable vengono letti in modo tollerante */
const PER_YEAR: Record<string, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  bimonthly: 6,
  every_two_months: 6,
  quarterly: 4,
  semiannually: 2,
  half_yearly: 2,
  annually: 1,
  yearly: 1,
};

export const installmentsPerYear = (frequency?: string): number | null => {
  const key = (frequency || '').toLowerCase();
  return PER_YEAR[key] ?? null;
};

const FREQUENCY_LABEL: Record<number, string> = {
  52: 'Ogni settimana',
  26: 'Ogni due settimane',
  12: 'Ogni mese',
  6: 'Ogni due mesi',
  4: 'Ogni tre mesi',
  2: 'Ogni sei mesi',
  1: "Ogni anno",
};

export const frequencyLabel = (frequency?: string): string => {
  const n = installmentsPerYear(frequency);
  return n ? FREQUENCY_LABEL[n] : 'Frequenza non indicata';
};

/** Importo equivalente al mese: un piano trimestrale da €300 vale €100 al mese */
export const monthlyEquivalent = (plan: Pick<ScalableSavingsPlan, 'amount' | 'frequency'>): number => {
  const n = installmentsPerYear(plan.frequency) ?? 12;
  return (Number(plan.amount) || 0) * n / 12;
};

/** Totale mensile dei soli piani attivi */
export const activeMonthlyTotal = (plans: ScalableSavingsPlan[]): number =>
  plans.filter(p => p.status === 'ACTIVE').reduce((sum, p) => sum + monthlyEquivalent(p), 0);
