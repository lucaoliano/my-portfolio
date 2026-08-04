import { doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
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
  const cleanToken = (apiToken || '').trim();

  if (!cleanToken) {
    return {
      success: false,
      message: 'Inserisci un token di autorizzazione valido fornito da Scalable Capital.'
    };
  }

  try {
    const testCallable = httpsCallable<{ serverUrl?: string; apiToken: string }, McpTestResult>(
      functions,
      'testScalableMcp'
    );
    const result = await testCallable({ serverUrl: cleanUrl, apiToken: cleanToken });
    return result.data;
  } catch (fnErr: unknown) {
    console.warn('Cloud Function testScalableMcp error, attempting client fallback:', fnErr);

    // Fallback for Sandbox / Demo tokens if cloud functions emulator isn't active
    if (cleanToken.toLowerCase().startsWith('demo') || cleanToken.toLowerCase().startsWith('mock')) {
      await new Promise(resolve => setTimeout(resolve, 800));
      return {
        success: true,
        mode: 'sandbox',
        message: 'Connessione stabilita con successo in modalità Sandbox/Demo!',
        serverInfo: {
          name: 'Scalable Capital Agentic Investing (Demo/Sandbox)',
          version: '1.0.0'
        },
        tools: ['broker_overview', 'get_holdings', 'get_transactions', 'get_cash_balance']
      };
    }

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
      return snap.data() as ScalableMcpConfig;
    }
    return null;
  } catch (e) {
    console.error('Error fetching Scalable MCP config:', e);
    return null;
  }
}

/**
 * Saves or updates the Scalable Capital MCP configuration in Firestore.
 */
export async function saveScalableConfig(
  userId: string,
  config: Partial<ScalableMcpConfig>
): Promise<void> {
  const docRef = doc(db, getUserIntegrationPath(userId, 'scalable'));
  const snap = await getDoc(docRef);

  const rawConfig: Record<string, unknown> = {
    enabled: config.enabled ?? true,
    serverUrl: config.serverUrl || DEFAULT_SCALABLE_MCP_URL,
    apiToken: config.apiToken || '',
    readOnly: config.readOnly ?? true,
    status: config.status || 'disconnected',
    autoSync: config.autoSync ?? true,
    ...(snap.exists() ? snap.data() : {}),
    ...config
  };

  const cleanConfig: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawConfig)) {
    if (v !== undefined) {
      cleanConfig[k] = v;
    }
  }

  await setDoc(docRef, cleanConfig, { merge: true });
}

/**
 * Disconnects and removes Scalable Capital MCP integration and cached settings.
 */
export async function disconnectScalable(userId: string): Promise<void> {
  const docRef = doc(db, getUserIntegrationPath(userId, 'scalable'));
  const pendingRef = doc(db, `portfolios/${userId}/settings/scalable_device_auth_pending`);
  const spDocRef = doc(db, `portfolios/${userId}/settings/scalable_savings_plans`);
  const alertsDocRef = doc(db, `portfolios/${userId}/settings/scalable_price_alerts`);
  const taxDocRef = doc(db, `portfolios/${userId}/settings/scalable_tax_report`);

  await Promise.allSettled([
    deleteDoc(docRef),
    deleteDoc(pendingRef),
    deleteDoc(spDocRef),
    deleteDoc(alertsDocRef),
    deleteDoc(taxDocRef),
  ]);

  try {
    const disconnectCallable = httpsCallable<Record<string, never>, { success: boolean }>(
      functions,
      'disconnectScalableAccount'
    );
    await disconnectCallable({});
  } catch (backendErr) {
    console.warn('Backend disconnectScalableAccount warning (client delete already attempted):', backendErr);
  }
}

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
      callback(snap.data() as ScalableMcpConfig);
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

export interface ScalableAuthUrlResult {
  authUrl: string;
  state: string;
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
}

export interface ScalableExchangeResult {
  success: boolean;
  message: string;
  expiresIn?: number;
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

/**
 * Initiates 1-click OAuth 2.0 PKCE flow with Scalable Capital (Legacy/Localhost).
 */
export async function startScalableOAuth(redirectUri: string): Promise<void> {
  const getUrlCallable = httpsCallable<{ redirectUri: string }, ScalableAuthUrlResult>(
    functions,
    'getScalableAuthUrl'
  );

  const res = await getUrlCallable({ redirectUri });
  const { authUrl, state, codeVerifier, clientId, redirectUri: cleanRedirect } = res.data;

  // Persist session parameters for callback exchange
  if (typeof window !== 'undefined' && window.sessionStorage) {
    window.sessionStorage.setItem('sc_oauth_state', state);
    window.sessionStorage.setItem('sc_oauth_verifier', codeVerifier);
    window.sessionStorage.setItem('sc_oauth_client_id', clientId);
    window.sessionStorage.setItem('sc_oauth_redirect_uri', cleanRedirect);
    window.location.href = authUrl;
  }
}

/**
 * Handles OAuth 2.0 PKCE callback after user approved access on Scalable Capital.
 */
export async function completeScalableOAuth(code: string, state: string): Promise<ScalableExchangeResult> {
  let savedState: string | null = null;
  let codeVerifier: string | null = null;
  let clientId: string | null = null;
  let redirectUri: string | null = null;

  if (typeof window !== 'undefined' && window.sessionStorage) {
    savedState = window.sessionStorage.getItem('sc_oauth_state');
    codeVerifier = window.sessionStorage.getItem('sc_oauth_verifier');
    clientId = window.sessionStorage.getItem('sc_oauth_client_id');
    redirectUri = window.sessionStorage.getItem('sc_oauth_redirect_uri');
  }

  if (savedState && savedState !== state) {
    throw new Error('Validazione di sicurezza fallita (stato OAuth non corrispondente). Riprova il login.');
  }

  if (!codeVerifier || !clientId || !redirectUri) {
    throw new Error('Parametri di sessione OAuth mancanti. Riavvia la procedura di connessione.');
  }

  const exchangeCallable = httpsCallable<
    { code: string; codeVerifier: string; clientId: string; redirectUri: string },
    ScalableExchangeResult
  >(functions, 'exchangeScalableAuthCode');

  const res = await exchangeCallable({
    code,
    codeVerifier,
    clientId,
    redirectUri,
  });

  // Clean up session storage
  if (typeof window !== 'undefined' && window.sessionStorage) {
    window.sessionStorage.removeItem('sc_oauth_state');
    window.sessionStorage.removeItem('sc_oauth_verifier');
    window.sessionStorage.removeItem('sc_oauth_client_id');
    window.sessionStorage.removeItem('sc_oauth_redirect_uri');
  }

  return res.data;
}



