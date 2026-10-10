import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../config/firebase';
import { getUserIntegrationPath } from '../constants/collections';
import { ScalableMcpConfig, ScalableSavingsPlan, ScalablePriceAlert, ScalableTaxReport } from '../types';

export const DEFAULT_SCALABLE_MCP_URL = 'https://mcp.scalable.capital/mcp';

export interface McpTestResult {
  success: boolean;
  message: string;
  mode?: 'live' | 'sandbox';
  tools?: string[];
  serverInfo?: {
    name?: string;
    version?: string;
    protocolVersion?: string;
    capabilities?: Record<string, unknown>;
  };
}

export interface SyncResult {
  success: boolean;
  importedCount: number;
  updatedCount: number;
  deduplicatedCount?: number;
  totalTransactions: number;
  savingsPlansCount?: number;
  priceAlertsCount?: number;
  cashBalance?: number;
  syncedAt: string;
}

/**
 * Tests connection to the Scalable Capital MCP server via Firebase Cloud Function (bypassing CORS).
 */
export async function testScalableMcpConnection(
  serverUrl: string,
  apiToken: string
): Promise<McpTestResult> {
  const cleanUrl = (serverUrl || DEFAULT_SCALABLE_MCP_URL).trim();
  // Token vuoto = la Function riusa quello già salvato lato server
  const cleanToken = (apiToken || '').trim();

  try {
    const testCallable = httpsCallable<{ serverUrl?: string; apiToken: string }, McpTestResult>(
      functions,
      'testScalableMcp'
    );
    const result = await testCallable({ serverUrl: cleanUrl, apiToken: cleanToken });
    return result.data;
  } catch (fnErr: unknown) {
    // Nessun esito simulato lato app: se il server non risponde, il collegamento non è avvenuto
    const error = fnErr as Error;
    return {
      success: false,
      message: error.message || 'Errore durante la verifica con il backend Firebase Functions.'
    };
  }
}

/**
 * Calls the backend Cloud Function to synchronize transactions, positions, and cash balance from Scalable Capital MCP.
 */
export async function syncScalablePortfolio(options?: { targetGroup?: string }): Promise<SyncResult> {
  const syncCallable = httpsCallable<{ targetGroup?: string }, SyncResult>(
    functions,
    'syncScalablePortfolio'
  );
  const result = await syncCallable({ targetGroup: options?.targetGroup || 'Scalable' });
  return result.data;
}

/**
 * Calls the backend Cloud Function to proactively refresh the Scalable Capital session token.
 */
export async function refreshScalableSession(): Promise<{ success: boolean; message: string; refreshedAt?: string }> {
  const refreshCallable = httpsCallable<Record<string, never>, { success: boolean; message: string; refreshedAt?: string }>(
    functions,
    'refreshScalableSession'
  );
  const result = await refreshCallable({});
  return result.data;
}

/**
 * Loads the Scalable Capital MCP configuration from Firestore.
 */
export async function getScalableConfig(userId: string): Promise<ScalableMcpConfig | null> {
  try {
    const docRef = doc(db, getUserIntegrationPath(userId, 'scalable'));
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return sanitizeConfig(snap.data());
    }
    return null;
  } catch (e) {
    console.error('Error fetching Scalable MCP config:', e);
    return null;
  }
}

/** Preferenze che l'app può salvare; stato, liquidità e credenziali li scrive solo il server. */
export type ScalablePreferences = Pick<ScalableMcpConfig, 'autoSync' | 'includeCashInTotal' | 'interestPlan' | 'interestRate'>;

/**
 * Salva solo le preferenze indicate, senza rileggere e rimandare il resto del documento
 * (che nei documenti legacy può contenere credenziali).
 */
export async function saveScalableConfig(userId: string, prefs: Partial<ScalablePreferences>): Promise<void> {
  const allowed: (keyof ScalablePreferences)[] = ['autoSync', 'includeCashInTotal', 'interestPlan', 'interestRate'];
  const clean: Record<string, unknown> = {};
  for (const key of allowed) {
    if (prefs[key] !== undefined) clean[key] = prefs[key];
  }
  if (Object.keys(clean).length === 0) return;
  await setDoc(doc(db, getUserIntegrationPath(userId, 'scalable')), clean, { merge: true });
}

export interface DisconnectResult {
  success: boolean;
  /** true = Scalable ha confermato la revoca dell'accesso */
  revoked: boolean;
  message: string;
}

/**
 * Scollega il conto: revoca e cancellazione avvengono sul server. Un errore viene rilanciato,
 * così la schermata non dichiara un successo che non c'è stato.
 */
export async function disconnectScalable(): Promise<DisconnectResult> {
  const disconnectCallable = httpsCallable<Record<string, never>, DisconnectResult>(functions, 'disconnectScalableAccount');
  const res = await disconnectCallable({});
  return res.data;
}

const SECRET_KEYS = ['apiToken', 'refreshToken', 'idToken', 'sessionId', 'dpopPrivateKey', 'dpopPublicKeyJwk'];
let secureRequested = false;

/** Chiede al server di spostare le credenziali di un documento legacy nel documento privato. */
const requestSecureConfig = () => {
  if (secureRequested) return;
  secureRequested = true;
  httpsCallable(functions, 'secureScalableConfig')({}).catch(err => {
    secureRequested = false;
    console.warn('Migrazione credenziali Scalable non riuscita:', err);
  });
};

/** Toglie dal documento le credenziali legacy prima di passarlo all'interfaccia. */
const sanitizeConfig = (data: Record<string, unknown>): ScalableMcpConfig => {
  const clean: Record<string, unknown> = {};
  let hadSecrets = false;
  for (const [k, v] of Object.entries(data)) {
    if (SECRET_KEYS.includes(k)) hadSecrets = true;
    else clean[k] = v;
  }
  if (hadSecrets) requestSecureConfig();
  return clean as unknown as ScalableMcpConfig;
};

/**
 * Subscribes to real-time changes of the Scalable configuration in Firestore.
 */
export function subscribeScalableConfig(
  userId: string,
  callback: (config: ScalableMcpConfig | null) => void
): () => void {
  const docRef = doc(db, getUserIntegrationPath(userId, 'scalable'));
  return onSnapshot(docRef, snap => {
    if (snap.exists()) {
      callback(sanitizeConfig(snap.data()));
    } else {
      callback(null);
    }
  }, err => {
    console.error('Error subscribing to Scalable config:', err);
    callback(null);
  });
}

export interface FetchSavingsPlansResult {
  success: boolean;
  plans: ScalableSavingsPlan[];
  totalMonthlyAmount: number;
}

/**
 * Calls backend to fetch Scalable Savings Plans.
 */
export async function fetchScalableSavingsPlans(): Promise<FetchSavingsPlansResult> {
  const plansCallable = httpsCallable<Record<string, never>, FetchSavingsPlansResult>(
    functions,
    'getScalableSavingsPlans'
  );
  const result = await plansCallable({});
  return result.data;
}

export interface FetchPriceAlertsResult {
  success: boolean;
  alerts: ScalablePriceAlert[];
}

/**
 * Calls backend to fetch Scalable Price Alerts on-demand.
 */
export async function fetchScalablePriceAlerts(): Promise<FetchPriceAlertsResult> {
  const alertsCallable = httpsCallable<Record<string, never>, FetchPriceAlertsResult>(
    functions,
    'getScalablePriceAlerts'
  );
  const result = await alertsCallable({});
  return result.data;
}

export interface FetchTaxReportResult {
  success: boolean;
  report: ScalableTaxReport;
}

/**
 * Calls backend to fetch Scalable Tax Report on-demand.
 */
export async function fetchScalableTaxReport(): Promise<FetchTaxReportResult> {
  const taxCallable = httpsCallable<Record<string, never>, FetchTaxReportResult>(
    functions,
    'getScalableTaxReport'
  );
  const result = await taxCallable({});
  return result.data;
}

/**
 * Subscribes to real-time changes of the Scalable Tax Report in Firestore.
 */
export function subscribeScalableTaxReport(
  userId: string,
  callback: (report: ScalableTaxReport | null) => void
): () => void {
  const docRef = doc(db, `portfolios/${userId}/settings/scalable_tax_report`);
  return onSnapshot(
    docRef,
    snap => {
      if (snap.exists()) {
        callback(snap.data() as ScalableTaxReport);
      } else {
        callback(null);
      }
    },
    err => {
      console.error('Error subscribing to Scalable tax report:', err);
      callback(null);
    }
  );
}

export interface ScalableDeviceAuthSession {
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

export interface ScalableDevicePollResult {
  status: 'pending' | 'slow_down' | 'authorized' | 'expired' | 'denied' | 'not_found' | 'error' | '2fa_pending';
  success?: boolean;
  message?: string;
  expiresIn?: number;
}

/**
 * Starts the official Scalable Capital Device Authorization flow (RFC 8628).
 * Works 100% seamlessly for any web, mobile, or remote user with NO localhost dependency.
 */
export async function startScalableDeviceAuth(): Promise<ScalableDeviceAuthSession> {
  const startCallable = httpsCallable<Record<string, never>, ScalableDeviceAuthSession>(
    functions,
    'startScalableDeviceAuth'
  );
  const res = await startCallable({});
  return res.data;
}

/**
 * Polls Scalable Capital for device authorization status.
 */
export async function pollScalableDeviceAuth(): Promise<ScalableDevicePollResult> {
  const pollCallable = httpsCallable<Record<string, never>, ScalableDevicePollResult>(
    functions,
    'pollScalableDeviceAuth'
  );
  const res = await pollCallable({});
  return res.data;
}
