export interface Transaction {
  id?: string;
  symbol: string;
  name: string;
  quantity: number;
  purchasePrice: number;
  date: string; // ISO String
  type?: 'BUY' | 'SELL';
  group?: string; // Legacy single group
  groups?: string[]; // New multiple groups
  source?: string; // e.g. 'scalable_mcp'
  externalId?: string;
  currency?: string;
  isin?: string;
  fee?: number;
  taxes?: number;
  lastSyncedAt?: string;
}

export interface AggregatedAsset {
  symbol: string;
  name: string;
  totalQuantity: number;
  averagePrice: number;
  totalInvested: number;
  currentPrice: number;
  currentTotalValue: number;
  profitOrLoss: number; // absolute value
  profitOrLossPercent: number; // percentage
  dailyChange: number; // absolute daily change
  dailyChangePercent: number; // percentage daily change
  currency: string;
  category?: string;
  annualizedReturn?: number | null;
  isAnnualizedExtrapolated?: boolean;
  /** false = nessuna quotazione: il titolo è valutato al prezzo medio di carico */
  hasPrice: boolean;
  /** false = la quotazione non riporta la variazione di oggi (es. prezzi Scalable) */
  hasDailyChange: boolean;
  /** Valore della posizione in euro; null se la valuta è estera e manca il cambio */
  valueInBase?: number | null;
  /** Variazione di oggi stimata (percentuale Yahoo applicata al prezzo Scalable) */
  dailyChangeEstimated?: boolean;
  /** Ora di mercato dell'ultimo prezzo, se nota (ISO) */
  marketTime?: string;
}

/** Quanti titoli contribuiscono a un dato aggregato (es. variazione di oggi). */
export interface Coverage {
  withData: number;
  total: number;
}

export interface GroupedPortfolio {
  groupName: string;
  totalInvested: number;
  currentTotalValue: number;
  profitOrLoss: number;
  profitOrLossPercent: number;
  dailyChange: number;
  dailyChangePercent: number;
  assets: AggregatedAsset[];
  annualizedReturn?: number | null;
  isAnnualizedExtrapolated?: boolean;
  dailyCoverage: Coverage;
  /** Titoli del gruppo senza quotazione (valutati al costo) */
  missingPriceCount: number;
  /** Titoli in valuta estera senza cambio disponibile, esclusi dai totali */
  fxMissingCount: number;
  /** La variazione di oggi del gruppo include stime */
  dailyEstimated: boolean;
}

export type RootStackParamList = {
  Login: undefined;
  Portfolio: undefined;
  Search: undefined;
  ManageGroups: undefined;
  AddTransaction: { symbol: string; name: string };
  AssetDetails: { symbol: string; name: string; currentPrice: number; dailyChange: number; dailyChangePercent: number; currency: string; groupName: string };
  EditTransaction: { id: string; symbol: string; name: string; quantity: number; purchasePrice: number; date: string; groups: string[]; type?: 'BUY' | 'SELL' };
  ChangeGroupModal: { transactionId: string; symbol: string; currentGroups: string[] };
};

export interface UserSettings {
  groups: string[];
  defaultGroup: string;
}

export interface ScalableMcpConfig {
  enabled: boolean;
  serverUrl: string; // e.g. 'https://mcp.scalable.capital/mcp'
  // Le credenziali restano lato server (portfolios/{uid}/private): il client vede solo questi flag
  hasApiToken?: boolean;
  hasRefreshToken?: boolean;
  tokenExpiresAt?: string;
  readOnly: boolean;
  status: 'disconnected' | 'connected' | 'error' | 'expired';
  lastTestedAt?: string;
  lastSyncedAt?: string;
  errorMessage?: string;
  autoSync?: boolean;
  cashBalance?: number;
  syncedTransactionsCount?: number;
  interestRate?: number;
  interestPlan?: 'free' | 'prime' | 'prime_plus' | 'custom';
  includeCashInTotal?: boolean;
  priceAlertsCount?: number;
  taxLossesTotal?: number;
}

export interface IntegrationSummary {
  id: string;
  name: string;
  protocol: string;
  status: 'connected' | 'disconnected' | 'error' | 'coming_soon';
  description: string;
  isComingSoon?: boolean;
  route?: string;
}

export interface ScalableSavingsPlan {
  id: string;
  symbol: string;
  name: string;
  amount: number;
  frequency: 'monthly' | 'bimonthly' | 'quarterly' | 'semiannually' | 'annually';
  dayOfMonth: number;
  nextExecutionDate: string;
  status: 'ACTIVE' | 'PAUSED' | 'INACTIVE';
  targetAllocationPercent?: number;
}

export interface ScalableSavingsPlansDoc {
  plans: ScalableSavingsPlan[];
  totalMonthlyAmount: number;
  updatedAt: string;
}

export interface ScalablePriceAlert {
  id: string;
  symbol: string;
  name: string;
  targetPrice: number;
  direction: 'ABOVE' | 'BELOW';
  currentPriceAtCreation?: number;
  status: 'ACTIVE' | 'TRIGGERED' | 'DISABLED';
  createdAt?: string;
  triggeredAt?: string;
  note?: string;
}

export interface ScalablePriceAlertsDoc {
  alerts: ScalablePriceAlert[];
  updatedAt: string;
}

export interface TaxLossBucket {
  yearCreated: number;
  yearExpires: number;
  initialAmount: number;
  remainingAmount: number;
  compensatedAmount: number;
  isExpiringThisYear: boolean;
  status: 'ACTIVE' | 'EXPIRED' | 'COMPENSATED';
}

export interface RealizedTrade {
  id: string;
  symbol: string;
  name: string;
  date: string;
  quantity: number;
  salePrice: number;
  costBasis: number;
  realizedGainOrLoss: number;
  isLoss: boolean;
  category?: string;
}

export interface ScalableTaxReport {
  totalActiveLosses: number;
  potentialTaxSavings: number;
  lossesExpiringThisYear: number;
  realizedGainsCurrentYear: number;
  realizedLossesCurrentYear: number;
  netRealizedCurrentYear: number;
  buckets: TaxLossBucket[];
  realizedTrades: RealizedTrade[];
  lastCalculatedAt: string;
  source: 'mcp' | 'calculated' | 'hybrid';
}

export interface TaxOptimizationTip {
  id: string;
  type: 'EXPIRING_LOSSES' | 'HARVESTING_OPPORTUNITY' | 'COMPENSATION_RULE' | 'INFO';
  title: string;
  description: string;
  impactEur?: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

