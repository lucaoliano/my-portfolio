import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import * as crypto from "crypto";

const DEFAULT_SCALABLE_MCP_URL = "https://mcp.scalable.capital/mcp";

interface TestConnectionData {
  serverUrl?: string;
  apiToken: string;
}

interface SyncPortfolioData {
  targetGroup?: string;
  forceFullSync?: boolean;
}

interface ScalableTransactionPayload {
  id: string;
  symbol: string;
  name: string;
  quantity: number;
  price: number;
  date: string; // ISO date
  type: "BUY" | "SELL";
  currency?: string;
  fee?: number;
  taxes?: number;
  isin?: string;
  category?: string;
}

const SCALABLE_GRAPHQL_ENDPOINT = "https://de.scalable.capital/api/cli/graphql";
const SCALABLE_CLIENT_ID = "yBM3BrpRgwSTJZRdJllvtD6jJEmyxWfE";
const SCALABLE_TOKEN_ENDPOINT = "https://secure.scalable.capital/oauth/token";
const SCALABLE_USER_AGENT = "scalable-cli/1.1.0";

interface ScalableKeyPair {
  privateKey: string;
  publicJwk: { kty: string; crv: string; x: string; y: string };
}

interface ScalableRefreshError extends Error {
  isInvalidGrant?: boolean;
  oauthError?: string;
}

/**
 * Generates an RFC 9449 compliant DPoP proof for Scalable Capital requests.
 */
function createDpopProof(
  method: string,
  url: string,
  keyPair: ScalableKeyPair,
  nonce?: string,
  accessToken?: string,
): string {
  const header = {
    typ: "dpop+jwt",
    alg: "ES256",
    jwk: keyPair.publicJwk,
  };
  const payload: Record<string, unknown> = {
    htm: method.toUpperCase(),
    htu: url.split("?")[0].split("#")[0],
    iat: Math.floor(Date.now() / 1000),
    jti: crypto.randomBytes(16).toString("hex"),
  };
  if (nonce) {
    payload.nonce = nonce;
  }
  if (accessToken) {
    payload.ath = crypto.createHash("sha256").update(accessToken).digest("base64url");
  }

  const b64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingInput = `${b64Header}.${b64Payload}`;

  const signer = crypto.createSign("SHA256");
  signer.update(signingInput);
  const signature = signer.sign(
    {
      key: keyPair.privateKey,
      dsaEncoding: "ieee-p1363",
    },
    "base64url",
  );

  return `${signingInput}.${signature}`;
}

/**
 * Extracts the user's personId or sub from Scalable Capital JWT tokens.
 */
function extractPersonIdFromToken(token: string, idToken?: string): string | null {
  for (const t of [token, idToken]) {
    if (!t) continue;
    try {
      const parts = t.split(".");
      if (parts.length < 2) continue;
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      const pid =
        payload["https://de.scalable.capital/person_id"] ||
        payload["https://de.scalable.capital/personId"] ||
        payload["person_id"];
      if (pid) return String(pid);
    } catch {
      // ignore
    }
  }
  if (token) {
    try {
      const parts = token.split(".");
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        if (payload["sub"]) return String(payload["sub"]);
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Extracts session_id claim from Scalable Capital JWT tokens.
 */
function extractSessionIdFromToken(token?: string, idToken?: string): string | null {
  for (const t of [token, idToken]) {
    if (!t) continue;
    try {
      const parts = t.split(".");
      if (parts.length < 2) continue;
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      const sid =
        payload["https://de.scalable.capital/session_id"] ||
        payload["https://de.scalable.capital/sessionId"] ||
        payload["session_id"] ||
        payload["sessionId"];
      if (sid && typeof sid === "string" && sid.trim().length > 0) {
        return sid.trim();
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Checks if a JWT token is expired or will expire within the skew window (default 60 seconds).
 */
function isTokenExpiredOrExpiringSoon(token: string, skewSeconds = 60): boolean {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return true;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (typeof payload.exp === "number") {
      const nowSec = Math.floor(Date.now() / 1000);
      return payload.exp <= nowSec + skewSeconds;
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * Checks if an HTTP response or GraphQL body indicates an authentication failure (e.g. expired or invalid token).
 * Scalable GraphQL returns HTTP 200 with errors: [{ message: "Missing or invalid credentials" }].
 */
function isScalableAuthError(
  status: number,
  json?: { errors?: Array<{ message?: string; extensions?: { code?: string } }> },
  rawText?: string,
): boolean {
  if (status === 401 || status === 403) return true;
  const errorMessages = (json?.errors || [])
    .map((e) => `${e.message || ""} ${e.extensions?.code || ""}`)
    .join(" ");
  const combined = `${errorMessages} ${rawText || ""}`.toLowerCase();
  return (
    combined.includes("missing or invalid credentials") ||
    combined.includes("unauthenticated") ||
    combined.includes("unauthorized") ||
    combined.includes("invalid token") ||
    combined.includes("invalid_token") ||
    combined.includes("token expired") ||
    combined.includes("jwt expired")
  );
}

/**
 * Refreshes an expired Scalable Capital access token using DPoP proof, session binding, and rotates the refresh token.
 */
async function refreshScalableToken(
  refreshToken: string,
  keyPair: ScalableKeyPair,
  userId?: string,
  db?: FirebaseFirestore.Firestore,
  currentToken?: string,
  idToken?: string,
  storedSessionId?: string,
): Promise<{ accessToken: string; refreshToken?: string; idToken?: string; sessionId?: string }> {
  const sessionId = storedSessionId || extractSessionIdFromToken(currentToken, idToken);
  console.log(`[Scalable Token Refresh] Starting refresh for user ${userId || "unknown"}, hasSessionId: ${!!sessionId}`);

  const formParams = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: SCALABLE_CLIENT_ID,
    refresh_token: refreshToken,
  });
  if (sessionId) {
    formParams.set("session_id", sessionId);
  }

  let proofNonce: string | undefined = undefined;
  let res: Response | null = null;
  let data: {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } = {};

  for (let attempt = 0; attempt < 2; attempt++) {
    const proof = createDpopProof("POST", SCALABLE_TOKEN_ENDPOINT, keyPair, proofNonce);
    res = await fetch(SCALABLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": SCALABLE_USER_AGENT,
        "DPoP": proof,
      },
      body: formParams.toString(),
    });

    const retryNonce = res.headers.get("dpop-nonce") || res.headers.get("DPoP-Nonce");
    if (attempt === 0 && (res.status === 400 || res.status === 401) && retryNonce) {
      console.log(`[Scalable Token Refresh] Retrying with server DPoP nonce: ${retryNonce}`);
      proofNonce = retryNonce;
      continue;
    }

    try {
      data = (await res.json()) as typeof data;
    } catch {
      data = {};
    }
    break;
  }

  if (!res?.ok || !data.access_token) {
    const errDesc = data.error_description || data.error || `HTTP ${res?.status || "unknown"}`;
    console.error(`[Scalable Token Refresh] Failed (HTTP ${res?.status}):`, JSON.stringify(data));
    const isInvalidGrant = data.error === "invalid_grant" || errDesc.toLowerCase().includes("invalid_grant");
    const error = new Error(`Token refresh fallito: ${errDesc}`);
    (error as unknown as { isInvalidGrant: boolean }).isInvalidGrant = isInvalidGrant;
    (error as unknown as { oauthError?: string }).oauthError = data.error;
    throw error;
  }

  console.log(`[Scalable Token Refresh] Successfully refreshed access token. Expires in: ${data.expires_in || 3600}s`);

  const newSessionId = extractSessionIdFromToken(data.access_token, data.id_token) || sessionId;

  if (userId && db) {
    const updateData: Record<string, unknown> = {
      apiToken: data.access_token,
      status: "connected",
      errorMessage: FieldValue.delete(),
      lastTestedAt: new Date().toISOString(),
    };
    if (data.refresh_token) {
      updateData.refreshToken = data.refresh_token;
    }
    if (data.id_token) {
      updateData.idToken = data.id_token;
    }
    if (newSessionId) {
      updateData.sessionId = newSessionId;
    }
    if (data.expires_in) {
      updateData.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
    }
    try {
      await db.doc(`portfolios/${userId}/settings/integration_scalable`).update(updateData);
      console.log("[Scalable Token Refresh] Saved new tokens & restored status='connected' in Firestore.");
    } catch (dbErr) {
      console.error("[Scalable Token Refresh] Warning: failed to persist tokens to Firestore:", dbErr);
    }
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    idToken: data.id_token || idToken,
    sessionId: newSessionId || undefined,
  };
}

interface ScalableGraphQLResponseData {
  account?: {
    id?: string;
    brokerPortfolios?: Array<{ id?: string }>;
    brokerPortfolio?: {
      payments?: {
        buyingPower?: {
          cashBalance?: number | string;
          cashAvailableToInvest?: number | string;
        };
      };
      inventory?: {
        items?: Array<{
          isin?: string;
          name?: string;
          type?: string;
          inventory?: {
            position?: {
              filled?: number;
              pending?: number;
              blocked?: number;
              fifoPrice?: number;
            };
            savingsPlan?: {
              isin?: string;
              amount?: number;
              frequency?: string;
              dayOfTheMonth?: number;
              nextExecutionDate?: {
                date?: string;
              };
            };
          };
          portfolioIsinPerformance?: {
            valuation?: number;
            currency?: string;
          };
          quoteTick?: {
            midPrice?: number;
            currency?: string;
          };
        }>;
      };
      moreTransactions?: {
        cursor?: string;
        total?: number;
        transactions?: Array<{
          __typename?: string;
          id?: string;
          currency?: string;
          type?: string;
          status?: string;
          lastEventDateTime?: string;
          description?: string;
          isin?: string;
          securityTransactionType?: string;
          quantity?: number;
          amount?: number;
          side?: string;
          relatedIsin?: string;
          cashTransactionType?: string;
        }>;
      };
      priceAlerts?: {
        itemsPerInstrument?: Array<{
          items?: Array<{
            id?: string;
            direction?: string;
            isActive?: boolean;
            price?: number;
            triggeredTimestamp?: {
              time?: string;
            };
            security?: {
              isin?: string;
              name?: string;
              type?: string;
            };
          }>;
        }>;
      };
    };
  };
}

/**
 * Executes a GraphQL query against Scalable Capital's official broker backend using DPoP authentication.
 * Automatically performs proactive expiration check and reactive error refresh.
 */
async function executeScalableGraphQL(
  query: string,
  variables: Record<string, unknown>,
  operationName: string | undefined,
  keyPair: ScalableKeyPair,
  accessToken: string,
  refreshToken?: string,
  userId?: string,
  db?: FirebaseFirestore.Firestore,
  idToken?: string,
  sessionId?: string,
): Promise<{
  data: ScalableGraphQLResponseData | undefined;
  currentAccessToken: string;
  currentRefreshToken?: string;
  currentIdToken?: string;
  currentSessionId?: string;
}> {
  let currentToken = accessToken;
  let currentRefresh = refreshToken;
  let currentIdToken = idToken;
  let currentSessionId: string | undefined = sessionId || extractSessionIdFromToken(currentToken, currentIdToken) || undefined;

  // 1. Proactive Token Refresh: if expired or expiring within 300 seconds (5 minutes)
  if (currentRefresh && userId && db && isTokenExpiredOrExpiringSoon(currentToken, 300)) {
    try {
      console.log(`[Scalable GraphQL] ${operationName || "query"} - Access token expiring soon, proactively refreshing...`);
      const refreshed = await refreshScalableToken(
        currentRefresh,
        keyPair,
        userId,
        db,
        currentToken,
        currentIdToken,
        currentSessionId,
      );
      currentToken = refreshed.accessToken;
      if (refreshed.refreshToken) currentRefresh = refreshed.refreshToken;
      if (refreshed.idToken) currentIdToken = refreshed.idToken;
      if (refreshed.sessionId) currentSessionId = refreshed.sessionId;
      console.log("[Scalable GraphQL] Access token proactively refreshed successfully.");
    } catch (proactiveErr) {
      console.warn("[Scalable GraphQL] Proactive token refresh warning, proceeding with current token:", proactiveErr);
    }
  }

  async function sendRequest(token: string, nonce?: string): Promise<Response> {
    const proof = createDpopProof("POST", SCALABLE_GRAPHQL_ENDPOINT, keyPair, nonce, token);
    return fetch(SCALABLE_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": SCALABLE_USER_AGENT,
        "Authorization": `DPoP ${token}`,
        "DPoP": proof,
      },
      body: JSON.stringify({
        query,
        variables,
        operationName: operationName || undefined,
        operation_name: operationName || undefined,
      }),
    });
  }

  let res = await sendRequest(currentToken);

  // Handle DPoP nonce retry as required by RFC 9449
  let retryNonce = res.headers.get("dpop-nonce") || res.headers.get("DPoP-Nonce");
  if (retryNonce && (res.status === 400 || res.status === 401)) {
    res = await sendRequest(currentToken, retryNonce);
  }

  let rawText = "";
  let json: { data?: ScalableGraphQLResponseData; errors?: Array<{ message?: string; extensions?: { code?: string } }> } | undefined;
  try {
    rawText = await res.text();
    json = JSON.parse(rawText);
  } catch {
    // not valid json
  }

  console.log(`[Scalable GraphQL] ${operationName || "query"} -> HTTP ${res.status}`);
  if (!res.ok || (json?.errors && json.errors.length > 0)) {
    console.log("[Scalable GraphQL] response errors/body:", rawText);
  }

  // If GraphQL response requests a DPoP nonce inside body
  if (rawText.toLowerCase().includes("use_dpop_nonce") || rawText.toLowerCase().includes("invalid_dpop_proof")) {
    retryNonce = res.headers.get("dpop-nonce") || res.headers.get("DPoP-Nonce");
    if (retryNonce) {
      console.log(`[Scalable GraphQL] Retrying with server requested DPoP nonce: ${retryNonce}`);
      res = await sendRequest(currentToken, retryNonce);
      rawText = await res.text().catch(() => "");
      try {
        json = JSON.parse(rawText);
      } catch {
        json = undefined;
      }
    }
  }

  // 2. Reactive Token Refresh: if status is 401/403 or response indicates invalid/missing credentials
  if (isScalableAuthError(res.status, json, rawText) && currentRefresh && userId && db) {
    console.log(`[Scalable GraphQL] ${operationName || "query"} returned credentials error, attempting reactive token refresh...`);
    try {
      const refreshed = await refreshScalableToken(
        currentRefresh,
        keyPair,
        userId,
        db,
        currentToken,
        currentIdToken,
        currentSessionId,
      );
      currentToken = refreshed.accessToken;
      if (refreshed.refreshToken) currentRefresh = refreshed.refreshToken;
      if (refreshed.idToken) currentIdToken = refreshed.idToken;
      if (refreshed.sessionId) currentSessionId = refreshed.sessionId;

      res = await sendRequest(currentToken);
      const postRefreshNonce = res.headers.get("dpop-nonce") || res.headers.get("DPoP-Nonce");
      if (postRefreshNonce && (res.status === 400 || res.status === 401)) {
        res = await sendRequest(currentToken, postRefreshNonce);
      }

      rawText = await res.text().catch(() => "");
      try {
        json = JSON.parse(rawText);
      } catch {
        json = undefined;
      }
    } catch (refErr) {
      console.error("[Scalable GraphQL] Reactive token refresh failed during GraphQL execution:", refErr);
      throw refErr;
    }
  }

  if (!res.ok) {
    throw new Error(`Scalable GraphQL HTTP ${res.status}: ${rawText || res.statusText}`);
  }

  if (json?.errors && json.errors.length > 0 && !json.data) {
    throw new Error(`Scalable GraphQL error: ${json.errors[0]?.message || "Errore sconosciuto"}`);
  }

  return {
    data: json?.data,
    currentAccessToken: currentToken,
    currentRefreshToken: currentRefresh,
    currentIdToken: currentIdToken,
    currentSessionId: currentSessionId || undefined,
  };
}

interface Login2faState {
  enabled: boolean;
  hasApprovedSession: boolean;
}

/**
 * Checks whether the user's Scalable Capital account requires 2FA trusted device confirmation on login.
 */
async function fetchLogin2faState(
  keyPair: ScalableKeyPair,
  accessToken: string,
  personId: string,
): Promise<Login2faState> {
  const query = `
    query Is2faOnLoginEnabled($input: Is2faOnLoginEnabledInput!) {
      is2faOnLoginEnabled(input: $input) {
        enabled
        hasApprovedSession
      }
    }
  `;
  const result = await executeScalableGraphQL(
    query,
    { input: { userId: personId } },
    "Is2faOnLoginEnabled",
    keyPair,
    accessToken,
  );
  const data = result.data as Record<string, unknown> | undefined;
  const is2fa = (data?.is2faOnLoginEnabled as Record<string, unknown>) || {};
  return {
    enabled: Boolean(is2fa.enabled),
    hasApprovedSession: Boolean(is2fa.hasApprovedSession),
  };
}

/**
 * Starts a 2FA challenge on the user's linked smartphone (push notification).
 */
async function start2faOnLogin(
  keyPair: ScalableKeyPair,
  accessToken: string,
  personId: string,
): Promise<string | null> {
  const mutation = `
    mutation Start2faOnLogin($input: Start2faOnLoginInput!) {
      start2faOnLogin(input: $input) {
        mfaSessionId
      }
    }
  `;
  const result = await executeScalableGraphQL(
    mutation,
    { input: { userId: personId, deviceName: "CLI", deviceType: "CLI" } },
    "Start2faOnLogin",
    keyPair,
    accessToken,
  );
  const data = result.data as Record<string, unknown> | undefined;
  const res = (data?.start2faOnLogin as Record<string, unknown>) || {};
  return (res.mfaSessionId as string) || null;
}

/**
 * Validates the status of the 2FA login challenge (SUCCESS, PENDING, DENY, TIMEOUT_RETRY).
 */
async function validate2faOnLogin(
  keyPair: ScalableKeyPair,
  accessToken: string,
  personId: string,
  mfaSessionId: string,
): Promise<string | null> {
  const mutation = `
    mutation Validate2faOnLogin($input: Validate2faOnLoginInput!) {
      validate2faOnLogin(input: $input) {
        status
      }
    }
  `;
  const result = await executeScalableGraphQL(
    mutation,
    { input: { userId: personId, mfaSessionId } },
    "Validate2faOnLogin",
    keyPair,
    accessToken,
  );
  const data = result.data as Record<string, unknown> | undefined;
  const res = (data?.validate2faOnLogin as Record<string, unknown>) || {};
  return (res.status as string) || null;
}

/**
 * Resolves broker accountId and portfolioId for the authenticated person.
 */
async function resolveScalableIds(
  keyPair: ScalableKeyPair,
  accessToken: string,
  refreshToken?: string,
  userId?: string,
  db?: FirebaseFirestore.Firestore,
  idToken?: string,
  sessionId?: string,
): Promise<{
  accountId: string;
  portfolioId: string;
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  sessionId?: string;
}> {
  let currentToken = accessToken;
  let currentRefresh = refreshToken;
  let currentIdToken = idToken;
  let currentSessionId: string | undefined = sessionId || extractSessionIdFromToken(currentToken, currentIdToken) || undefined;

  if (currentRefresh && userId && db && isTokenExpiredOrExpiringSoon(currentToken, 300)) {
    try {
      console.log("[resolveScalableIds] Token expired or expiring soon, proactively refreshing...");
      const refreshed = await refreshScalableToken(
        currentRefresh,
        keyPair,
        userId,
        db,
        currentToken,
        currentIdToken,
        currentSessionId,
      );
      currentToken = refreshed.accessToken;
      if (refreshed.refreshToken) currentRefresh = refreshed.refreshToken;
      if (refreshed.idToken) currentIdToken = refreshed.idToken;
      if (refreshed.sessionId) currentSessionId = refreshed.sessionId;
      console.log("[resolveScalableIds] Token proactively refreshed successfully.");
    } catch (e) {
      console.warn("[resolveScalableIds] Initial proactive token refresh warning:", e);
    }
  }

  const personId = extractPersonIdFromToken(currentToken, currentIdToken);
  if (!personId) {
    throw new Error("Impossibile estrarre l'identificativo account dal token Scalable.");
  }

  const resolveQuery = `
    query ResolveBrokerIds($id: ID!) {
      account(id: $id) {
        id
        brokerPortfolios {
          id
        }
      }
    }
  `;

  const result = await executeScalableGraphQL(
    resolveQuery,
    { id: personId },
    "ResolveBrokerIds",
    keyPair,
    currentToken,
    currentRefresh,
    userId,
    db,
    currentIdToken,
    currentSessionId,
  );

  currentToken = result.currentAccessToken;
  currentRefresh = result.currentRefreshToken;
  currentIdToken = result.currentIdToken;
  currentSessionId = result.currentSessionId;

  const accountId = result.data?.account?.id || personId;
  const portfolios = result.data?.account?.brokerPortfolios || [];
  const portfolioId = portfolios[0]?.id;

  return {
    accountId,
    portfolioId: portfolioId || accountId,
    accessToken: currentToken,
    refreshToken: currentRefresh,
    idToken: currentIdToken,
    sessionId: currentSessionId,
  };
}

/**
 * Calculates Italian tax loss buckets (Zainetto Fiscale D.Lgs. 461/97) deterministically from transactions.
 */
function calculateTaxReportFromTransactions(
  transactions: ScalableTransactionPayload[],
): ScalableTaxReportPayload {
  const currentYear = new Date().getFullYear();
  let realizedGainsCurrentYear = 0;
  let realizedLossesCurrentYear = 0;
  const realizedTrades: RealizedTradePayload[] = [];

  const symbolTxs = new Map<string, ScalableTransactionPayload[]>();
  for (const tx of transactions) {
    const list = symbolTxs.get(tx.symbol) || [];
    list.push(tx);
    symbolTxs.set(tx.symbol, list);
  }

  let totalActiveLosses = 0;
  const bucketMap = new Map<number, number>();

  for (const [symbol, txs] of symbolTxs.entries()) {
    const sorted = [...txs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const buyQueue: { quantity: number; price: number; date: string }[] = [];

    for (const tx of sorted) {
      if (tx.type === "BUY") {
        buyQueue.push({ quantity: tx.quantity, price: tx.price, date: tx.date });
      } else if (tx.type === "SELL") {
        let remainingQtyToSell = tx.quantity;
        let totalCostBasis = 0;
        let matchedQty = 0;

        while (remainingQtyToSell > 0 && buyQueue.length > 0) {
          const buy = buyQueue[0];
          const take = Math.min(buy.quantity, remainingQtyToSell);
          totalCostBasis += take * buy.price;
          matchedQty += take;
          buy.quantity -= take;
          remainingQtyToSell -= take;
          if (buy.quantity <= 0) {
            buyQueue.shift();
          }
        }

        const avgCost = matchedQty > 0 ? totalCostBasis / matchedQty : tx.price;
        const gainOrLoss = (tx.price - avgCost) * tx.quantity;
        const txYear = new Date(tx.date).getFullYear();

        if (txYear === currentYear) {
          if (gainOrLoss > 0) {
            realizedGainsCurrentYear += gainOrLoss;
          } else {
            realizedLossesCurrentYear += Math.abs(gainOrLoss);
          }
        }

        if (gainOrLoss < 0) {
          const loss = Math.abs(gainOrLoss);
          bucketMap.set(txYear, (bucketMap.get(txYear) || 0) + loss);
          totalActiveLosses += loss;
        }

        realizedTrades.push({
          id: `rt_${tx.id}`,
          symbol,
          name: tx.name,
          date: tx.date,
          quantity: tx.quantity,
          salePrice: tx.price,
          costBasis: Math.round(avgCost * 100) / 100,
          realizedGainOrLoss: Math.round(gainOrLoss * 100) / 100,
          isLoss: gainOrLoss < 0,
          category: tx.category || "Azioni",
        });
      }
    }
  }

  const buckets: TaxLossBucketPayload[] = [];
  for (let y = currentYear - 3; y <= currentYear; y++) {
    const amount = bucketMap.get(y) || 0;
    if (amount > 0) {
      buckets.push({
        yearCreated: y,
        yearExpires: y + 4,
        initialAmount: Math.round(amount * 100) / 100,
        remainingAmount: Math.round(amount * 100) / 100,
        compensatedAmount: 0,
        isExpiringThisYear: y + 4 === currentYear,
        status: "ACTIVE",
      });
    }
  }

  const potentialTaxSavings = Math.round(totalActiveLosses * 0.26 * 100) / 100;
  const netRealizedCurrentYear = Math.round((realizedGainsCurrentYear - realizedLossesCurrentYear) * 100) / 100;

  return {
    totalActiveLosses: Math.round(totalActiveLosses * 100) / 100,
    potentialTaxSavings,
    lossesExpiringThisYear: buckets.filter((b) => b.isExpiringThisYear).reduce((s, b) => s + b.remainingAmount, 0),
    realizedGainsCurrentYear: Math.round(realizedGainsCurrentYear * 100) / 100,
    realizedLossesCurrentYear: Math.round(realizedLossesCurrentYear * 100) / 100,
    netRealizedCurrentYear,
    buckets,
    realizedTrades,
    lastCalculatedAt: new Date().toISOString(),
    source: "calculated",
  };
}

/**
 * Fetches holdings, limits, transactions, savings plans, and price alerts via Scalable Capital's GraphQL broker API.
 */
async function fetchScalablePortfolioViaGraphQL(
  keyPair: ScalableKeyPair,
  accessToken: string,
  refreshToken?: string,
  userId?: string,
  db?: FirebaseFirestore.Firestore,
  idToken?: string,
  sessionId?: string,
): Promise<{
  transactions: ScalableTransactionPayload[];
  savingsPlans: ScalableSavingsPlanPayload[];
  priceAlerts: ScalablePriceAlertPayload[];
  taxReport: ScalableTaxReportPayload;
  cashBalance: number;
  holdings: Array<{
    isin: string;
    name: string;
    quantity: number;
    currentPrice: number;
    averagePrice: number;
    valuation: number;
    currency: string;
    category: string;
  }>;
  accountId: string;
  portfolioId: string;
}> {
  const resolved = await resolveScalableIds(
    keyPair,
    accessToken,
    refreshToken,
    userId,
    db,
    idToken,
    sessionId,
  );
  const accountId = resolved.accountId;
  const portfolioId = resolved.portfolioId;
  let currentToken = resolved.accessToken;
  let currentRefresh = resolved.refreshToken;
  let currentIdToken = resolved.idToken;
  let currentSessionId = resolved.sessionId;

  let cashBalance = 0;
  let rawHoldings: NonNullable<NonNullable<NonNullable<ScalableGraphQLResponseData["account"]>["brokerPortfolio"]>["inventory"]>["items"] = [];
  const transactions: ScalableTransactionPayload[] = [];
  const savingsPlans: ScalableSavingsPlanPayload[] = [];
  const priceAlerts: ScalablePriceAlertPayload[] = [];

  // 1. Fetch Limits / Cash
  try {
    const limitsQuery = `
      query BrokerLimits($accountId: ID!, $portfolioId: ID!) {
        account(id: $accountId) {
          brokerPortfolio(id: $portfolioId) {
            payments {
              buyingPower {
                cashBalance
                cashAvailableToInvest
              }
            }
          }
        }
      }
    `;
    const res = await executeScalableGraphQL(
      limitsQuery,
      { accountId, portfolioId },
      "BrokerLimits",
      keyPair,
      currentToken,
      currentRefresh,
      userId,
      db,
      currentIdToken,
      currentSessionId,
    );
    currentToken = res.currentAccessToken;
    currentRefresh = res.currentRefreshToken;
    currentIdToken = res.currentIdToken;
    currentSessionId = res.currentSessionId;
    const balance = res.data?.account?.brokerPortfolio?.payments?.buyingPower?.cashBalance;
    if (balance !== undefined && balance !== null) {
      cashBalance = Number(balance);
    }
  } catch (err) {
    console.warn("Scalable Limits query warning:", err);
  }

  // 2. Fetch Holdings
  try {
    const holdingsQuery = `
      query BrokerHoldings($accountId: ID!, $portfolioId: ID!, $includeYearToDate: Boolean!, $quoteSource: MarketDataSource) {
        account(id: $accountId) {
          brokerPortfolio(id: $portfolioId) {
            inventory {
              items {
                isin
                name
                type
                inventory {
                  position {
                    filled
                    pending
                    blocked
                    fifoPrice
                  }
                }
                portfolioIsinPerformance {
                  valuation
                  currency
                }
                quoteTick(source: $quoteSource, includeYearToDate: $includeYearToDate) {
                  midPrice
                  currency
                  timestampUtc {
                    time
                  }
                  isOutdated
                }
              }
            }
          }
        }
      }
    `;
    const res = await executeScalableGraphQL(
      holdingsQuery,
      { accountId, portfolioId, includeYearToDate: false, quoteSource: "CONSOLIDATED" },
      "BrokerHoldings",
      keyPair,
      currentToken,
      currentRefresh,
      userId,
      db,
      currentIdToken,
      currentSessionId,
    );
    currentToken = res.currentAccessToken;
    currentRefresh = res.currentRefreshToken;
    currentIdToken = res.currentIdToken;
    currentSessionId = res.currentSessionId;
    rawHoldings = res.data?.account?.brokerPortfolio?.inventory?.items || [];
    console.log(`[Scalable Holdings] Fetched ${rawHoldings.length} raw holdings from GraphQL:`, rawHoldings.map((h) => ({
      isin: h.isin,
      name: h.name,
      filled: h.inventory?.position?.filled,
      fifoPrice: h.inventory?.position?.fifoPrice,
      valuation: h.portfolioIsinPerformance?.valuation,
      midPrice: h.quoteTick?.midPrice,
      currency: h.quoteTick?.currency || h.portfolioIsinPerformance?.currency,
    })));
  } catch (err) {
    console.warn("Scalable Holdings query warning:", err);
  }

  // 3. Fetch Transactions
  try {
    const txQuery = `
      query BrokerTransactions($accountId: ID!, $portfolioId: ID!, $input: BrokerTransactionInput!) {
        account(id: $accountId) {
          brokerPortfolio(id: $portfolioId) {
            moreTransactions(input: $input) {
              cursor
              total
              transactions {
                __typename
                id
                currency
                type
                status
                lastEventDateTime
                description
                ... on BrokerSecurityTransactionSummary {
                  isin
                  securityTransactionType
                  quantity
                  amount
                  side
                  limitPrice
                  stopPrice
                }
                ... on BrokerCashTransactionSummary {
                  relatedIsin
                  cashTransactionType
                  amount
                }
              }
            }
          }
        }
      }
    `;
    const res = await executeScalableGraphQL(
      txQuery,
      { accountId, portfolioId, input: { pageSize: 100 } },
      "BrokerTransactions",
      keyPair,
      currentToken,
      currentRefresh,
      userId,
      db,
      currentIdToken,
      currentSessionId,
    );
    currentToken = res.currentAccessToken;
    currentRefresh = res.currentRefreshToken;
    currentIdToken = res.currentIdToken;
    currentSessionId = res.currentSessionId;
    // Lookup map of ISIN -> Holding info (name, type, quote price, etc.)
    const isinToHolding = new Map<string, { name: string; type: string; midPrice: number; fifoPrice: number }>();
    for (const h of rawHoldings) {
      if (h.isin) {
        const qty = Number(h.inventory?.position?.filled || 0);
        const fifo = Number(h.inventory?.position?.fifoPrice || 0);
        const mid = Number(h.quoteTick?.midPrice || 0);
        const val = Number(h.portfolioIsinPerformance?.valuation || 0);
        const priceFromVal = (qty > 0 && val > 0) ? (val / qty) : 0;
        const bestPrice = mid > 0 ? mid : (priceFromVal > 0 ? priceFromVal : fifo);
        isinToHolding.set(h.isin, {
          name: h.name || h.isin,
          type: h.type || "Azioni",
          midPrice: bestPrice,
          fifoPrice: fifo,
        });
      }
    }
    const rawTxs = res.data?.account?.brokerPortfolio?.moreTransactions?.transactions || [];
    for (const tx of rawTxs) {
      if (tx.__typename === "BrokerSecurityTransactionSummary" || tx.securityTransactionType) {
        const qty = Math.abs(Number(tx.quantity || 0));
        const amt = Math.abs(Number(tx.amount || 0));
        const price = qty > 0 ? amt / qty : amt;
        const isSell = String(tx.side || tx.securityTransactionType || "").toUpperCase().includes("SELL");
        if (qty > 0 && price > 0) {
          const holdingInfo = tx.isin ? isinToHolding.get(tx.isin) : undefined;
          const name = holdingInfo?.name || tx.description || tx.isin || "Asset Scalable";
          const cat = holdingInfo?.type === "ETF" ?
            "ETF" :
            (holdingInfo?.type === "BOND" ?
              "Obbligazioni" :
              (holdingInfo?.type === "CRYPTO" ? "Cripto" : "Azioni"));

          transactions.push({
            id: tx.id || `sc_tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            symbol: tx.isin || "UNKNOWN",
            name,
            quantity: qty,
            price: Math.round(price * 10000) / 10000,
            date: tx.lastEventDateTime || new Date().toISOString(),
            type: isSell ? "SELL" : "BUY",
            isin: tx.isin,
            currency: tx.currency || "EUR",
            category: cat,
          });
        }
      }
    }
  } catch (err) {
    console.warn("Scalable Transactions query warning:", err);
  }

  // Map processed holdings with live Scalable quote tick
  const holdings: Array<{
    isin: string;
    name: string;
    quantity: number;
    currentPrice: number;
    averagePrice: number;
    valuation: number;
    currency: string;
    category: string;
  }> = [];

  for (const item of rawHoldings) {
    const qty = Number(item.inventory?.position?.filled || 0);
    const fifo = Number(item.inventory?.position?.fifoPrice || 0);
    const mid = Number(item.quoteTick?.midPrice || 0);
    const val = Number(item.portfolioIsinPerformance?.valuation || 0);
    const priceFromValuation = (qty > 0 && val > 0) ? (val / qty) : 0;
    const currentPrice = mid > 0 ? mid : (priceFromValuation > 0 ? priceFromValuation : fifo);
    const finalValuation = val > 0 ? val : (qty * currentPrice);
    const curr = (item.quoteTick?.currency || item.portfolioIsinPerformance?.currency || "EUR").toUpperCase();
    const cat = item.type === "ETF" ?
      "ETF" :
      (item.type === "BOND" ? "Obbligazioni" : (item.type === "CRYPTO" ? "Cripto" : "Azioni"));

    if (item.isin) {
      holdings.push({
        isin: item.isin,
        name: item.name || item.isin,
        quantity: qty,
        currentPrice: Math.round(currentPrice * 10000) / 10000,
        averagePrice: fifo > 0 ? fifo : (Math.round(currentPrice * 10000) / 10000),
        valuation: Math.round(finalValuation * 100) / 100,
        currency: curr,
        category: cat,
      });

      // If no transactions were returned, synthesize initial BUY transactions for non-zero holdings
      if (transactions.length === 0 && qty > 0) {
        transactions.push({
          id: `holding_${item.isin}`,
          symbol: item.isin,
          name: item.name || item.isin,
          quantity: qty,
          price: fifo > 0 ? fifo : (Math.round(currentPrice * 10000) / 10000),
          date: new Date().toISOString(),
          type: "BUY",
          isin: item.isin,
          currency: curr,
          category: cat,
        });
      }
    }
  }

  // 4. Fetch Savings Plans (PAC)
  try {
    const spQuery = `
      query BrokerSavingsPlans($accountId: ID!, $portfolioId: ID!) {
        account(id: $accountId) {
          brokerPortfolio(id: $portfolioId) {
            totalSavingsPlanAmount
            inventory {
              items {
                isin
                name
                type
                inventory {
                  savingsPlan {
                    isin
                    amount
                    frequency
                    dayOfTheMonth
                    dynamizationRate
                    nextExecutionDate {
                      date
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    const res = await executeScalableGraphQL(
      spQuery,
      { accountId, portfolioId },
      "BrokerSavingsPlans",
      keyPair,
      currentToken,
      currentRefresh,
      userId,
      db,
      currentIdToken,
      currentSessionId,
    );
    currentToken = res.currentAccessToken;
    currentRefresh = res.currentRefreshToken;
    currentIdToken = res.currentIdToken;
    currentSessionId = res.currentSessionId;
    const spItems = res.data?.account?.brokerPortfolio?.inventory?.items || [];
    for (const item of spItems) {
      const plan = item.inventory?.savingsPlan;
      if (plan && Number(plan.amount) > 0) {
        savingsPlans.push({
          id: `sp_${item.isin || "plan"}`,
          symbol: item.isin || "UNKNOWN",
          name: item.name || item.isin || "Piano Scalable",
          amount: Number(plan.amount),
          frequency: (plan.frequency?.toLowerCase() as ScalableSavingsPlanPayload["frequency"]) || "monthly",
          dayOfMonth: Number(plan.dayOfTheMonth || 2),
          nextExecutionDate: plan.nextExecutionDate?.date || "",
          status: "ACTIVE",
        });
      }
    }
  } catch (err) {
    console.warn("Scalable Savings Plans query warning:", err);
  }

  // 5. Fetch Price Alerts
  try {
    const alertsQuery = `
      query BrokerPriceAlerts($accountId: ID!, $portfolioId: ID!, $activeOnly: Boolean!) {
        account(id: $accountId) {
          brokerPortfolio(id: $portfolioId) {
            priceAlerts(activeOnly: $activeOnly) {
              itemsPerInstrument {
                items {
                  id
                  direction
                  isActive
                  price
                  triggeredTimestamp {
                    time
                  }
                  security {
                    isin
                    name
                    type
                  }
                }
              }
            }
          }
        }
      }
    `;
    const res = await executeScalableGraphQL(
      alertsQuery,
      { accountId, portfolioId, activeOnly: false },
      "BrokerPriceAlerts",
      keyPair,
      currentToken,
      currentRefresh,
      userId,
      db,
      currentIdToken,
      currentSessionId,
    );
    currentToken = res.currentAccessToken;
    currentRefresh = res.currentRefreshToken;
    currentIdToken = res.currentIdToken;
    currentSessionId = res.currentSessionId;
    const instruments = res.data?.account?.brokerPortfolio?.priceAlerts?.itemsPerInstrument || [];
    for (const inst of instruments) {
      for (const item of inst.items || []) {
        priceAlerts.push({
          id: item.id || `sc_alert_${priceAlerts.length}`,
          symbol: item.security?.isin || "UNKNOWN",
          name: item.security?.name || item.security?.isin || "Alert Scalable",
          targetPrice: Number(item.price || 0),
          direction: String(item.direction).toUpperCase().includes("ABOVE") ? "ABOVE" : "BELOW",
          status: item.isActive ? (item.triggeredTimestamp ? "TRIGGERED" : "ACTIVE") : "DISABLED",
          createdAt: new Date().toISOString(),
          triggeredAt: item.triggeredTimestamp?.time,
        });
      }
    }
  } catch (err) {
    console.warn("Scalable Price Alerts query warning:", err);
  }

  // 6. Calculate Tax Report
  const taxReport = calculateTaxReportFromTransactions(transactions);

  return {
    transactions,
    savingsPlans,
    priceAlerts,
    taxReport,
    cashBalance,
    holdings,
    accountId,
    portfolioId,
  };
}

/**
 * Creates and connects an MCP Client to Scalable Capital using StreamableHTTP or SSE (Legacy fallback).
 */
async function createMcpClient(serverUrl: string, apiToken: string): Promise<Client> {
  const url = new URL(serverUrl || DEFAULT_SCALABLE_MCP_URL);

  const client = new Client(
    {
      name: "portfolio-finance-backend",
      version: "1.0.0",
    },
    {
      capabilities: {},
    },
  );

  // Try StreamableHTTP first, then fall back to SSE
  try {
    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: {
        headers: {
          "Authorization": `Bearer ${apiToken.trim()}`,
          "Content-Type": "application/json",
        },
      },
    });
    await client.connect(transport);
    return client;
  } catch (httpError) {
    console.warn("StreamableHTTP connection failed, trying SSEClientTransport:", httpError);
    const sseTransport = new SSEClientTransport(url, {
      requestInit: {
        headers: {
          "Authorization": `Bearer ${apiToken.trim()}`,
        },
      },
    });
    await client.connect(sseTransport);
    return client;
  }
}

/**
 * Callable Function to test connection to Scalable Capital MCP server or direct DPoP GraphQL.
 */
export const testScalableMcp = onCall(async (request: CallableRequest<TestConnectionData>) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Devi essere autenticato per testare la connessione.");
  }
  const userId = request.auth.uid;
  const db = getFirestore();

  const { serverUrl, apiToken } = request.data || {};
  const cleanToken = (apiToken || "").trim();

  // Handle Demo / Sandbox mock token
  if (cleanToken.toLowerCase().startsWith("demo") || cleanToken.toLowerCase().startsWith("mock")) {
    return {
      success: true,
      mode: "sandbox",
      message: "Connessione stabilita con successo in modalità Sandbox/Demo!",
      tools: [
        "broker_overview",
        "get_holdings",
        "get_transactions",
        "get_cash_balance",
        "get_savings_plans",
        "get_price_alerts",
      ],
      serverInfo: {
        name: "Scalable Capital Agentic Investing (Demo/Sandbox)",
        version: "1.0.0",
      },
    };
  }

  // Check if user has DPoP key configuration stored from device auth
  const configDocRef = db.doc(`portfolios/${userId}/settings/integration_scalable`);
  const configSnap = await configDocRef.get();
  const config = configSnap.data();

  if (config?.dpopPrivateKey && config?.dpopPublicKeyJwk) {
    const keyPair: ScalableKeyPair = {
      privateKey: config.dpopPrivateKey as string,
      publicJwk: config.dpopPublicKeyJwk as { kty: string; crv: string; x: string; y: string },
    };
    const currentToken = cleanToken || (config.apiToken as string);
    try {
      const { accountId, portfolioId } = await resolveScalableIds(
        keyPair,
        currentToken,
        config.refreshToken as string | undefined,
        userId,
        db,
        config.idToken as string | undefined,
        config.sessionId as string | undefined,
      );

      return {
        success: true,
        mode: "live",
        message: `Connessione stabilita con successo a Scalable Capital! Account: ${accountId}, Portafoglio: ${portfolioId}`,
        tools: [
          "broker_overview",
          "get_holdings",
          "get_transactions",
          "get_cash_balance",
          "get_savings_plans",
          "get_price_alerts",
        ],
        serverInfo: {
          name: "Scalable Capital Broker Direct (DPoP GraphQL)",
          version: "2.0.0",
        },
      };
    } catch (graphErr: unknown) {
      const gErr = graphErr as ScalableRefreshError;
      console.error("Scalable DPoP GraphQL test error:", gErr);
      const isExplicitInvalidGrant =
        gErr?.isInvalidGrant === true ||
        gErr?.oauthError === "invalid_grant" ||
        gErr?.message?.toLowerCase().includes("invalid_grant");
      if (isExplicitInvalidGrant) {
        await configDocRef
          .update({
            status: "expired",
            errorMessage: "Sessione scaduta o revocata da Scalable Capital. Effettua nuovamente il login.",
          })
          .catch(() => {});
        throw new HttpsError(
          "unauthenticated",
          "Sessione Scalable Capital scaduta o revocata. Clicca su 'Disconnetti' e riconnetti il conto per aggiornare l'autorizzazione.",
        );
      }
      throw new HttpsError(
        "unavailable",
        `Errore connessione Scalable Capital: ${gErr.message}`,
      );
    }
  }

  if (!cleanToken) {
    throw new HttpsError("invalid-argument", "Il token di autorizzazione è obbligatorio.");
  }

  const cleanUrl = (serverUrl || DEFAULT_SCALABLE_MCP_URL).trim();
  let client: Client | null = null;
  try {
    client = await createMcpClient(cleanUrl, cleanToken);
    const toolsResult = await client.listTools();

    return {
      success: true,
      mode: "live",
      message: "Connessione stabilita con successo al server Scalable Capital MCP!",
      tools: toolsResult.tools.map((t) => t.name),
      serverInfo: client.getServerVersion() || { name: "Scalable Capital MCP Server" },
    };
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Scalable MCP test error:", err);
    throw new HttpsError(
      "unavailable",
      `Impossibile connettersi a Scalable Capital MCP: ${err.message || "Errore di comunicazione"}`,
    );
  } finally {
    if (client) {
      try {
        await client.close();
      } catch (e) {
        console.warn("Error closing client:", e);
      }
    }
  }
});

/**
 * Generates realistic demo transactions for Scalable Capital sandbox mode.
 */
function getDemoScalableTransactions(): ScalableTransactionPayload[] {
  return [
    {
      id: "sc_demo_tx_1",
      symbol: "SWDA.MI",
      name: "iShares Core MSCI World UCITS ETF",
      quantity: 5,
      price: 88.40,
      date: "2024-01-15T10:30:00.000Z",
      type: "BUY",
      fee: 0,
      category: "Azioni",
    },
    {
      id: "sc_demo_tx_2",
      symbol: "SWDA.MI",
      name: "iShares Core MSCI World UCITS ETF",
      quantity: 5,
      price: 91.20,
      date: "2024-04-15T10:30:00.000Z",
      type: "BUY",
      fee: 0,
      category: "Azioni",
    },
    {
      id: "sc_demo_tx_3",
      symbol: "SWDA.MI",
      name: "iShares Core MSCI World UCITS ETF",
      quantity: 5,
      price: 95.80,
      date: "2024-07-15T10:30:00.000Z",
      type: "BUY",
      fee: 0,
      category: "Azioni",
    },
    {
      id: "sc_demo_tx_4",
      symbol: "CSSPX.MI",
      name: "iShares Core S&P 500 UCITS ETF",
      quantity: 4,
      price: 485.50,
      date: "2024-02-02T14:15:00.000Z",
      type: "BUY",
      fee: 0,
      category: "Azioni",
    },
    {
      id: "sc_demo_tx_5",
      symbol: "CSSPX.MI",
      name: "iShares Core S&P 500 UCITS ETF",
      quantity: 4,
      price: 520.10,
      date: "2024-08-02T14:15:00.000Z",
      type: "BUY",
      fee: 0,
      category: "Azioni",
    },
    {
      id: "sc_demo_tx_6",
      symbol: "XEON.MI",
      name: "Xtrackers II EUR Overnight Rate Swap UCITS ETF",
      quantity: 15,
      price: 140.20,
      date: "2024-03-10T09:00:00.000Z",
      type: "BUY",
      fee: 0,
      category: "Liquidità",
    },
  ];
}

export interface ScalableSavingsPlanPayload {
  id: string;
  symbol: string;
  name: string;
  amount: number;
  frequency: "monthly" | "bimonthly" | "quarterly" | "semiannually" | "annually";
  dayOfMonth: number;
  nextExecutionDate: string;
  status: "ACTIVE" | "PAUSED" | "INACTIVE";
  targetAllocationPercent?: number;
}

/**
 * Realistic demo savings plans for Scalable Capital.
 */
function getDemoScalableSavingsPlans(): ScalableSavingsPlanPayload[] {
  return [
    {
      id: "sp_swda",
      symbol: "SWDA.MI",
      name: "iShares Core MSCI World UCITS ETF",
      amount: 300,
      frequency: "monthly",
      dayOfMonth: 2,
      nextExecutionDate: "2024-11-02",
      status: "ACTIVE",
      targetAllocationPercent: 60,
    },
    {
      id: "sp_csspx",
      symbol: "CSSPX.MI",
      name: "iShares Core S&P 500 UCITS ETF",
      amount: 150,
      frequency: "monthly",
      dayOfMonth: 2,
      nextExecutionDate: "2024-11-02",
      status: "ACTIVE",
      targetAllocationPercent: 30,
    },
    {
      id: "sp_xeon",
      symbol: "XEON.MI",
      name: "Xtrackers II EUR Overnight Rate Swap UCITS ETF",
      amount: 50,
      frequency: "monthly",
      dayOfMonth: 2,
      nextExecutionDate: "2024-11-02",
      status: "ACTIVE",
      targetAllocationPercent: 10,
    },
  ];
}

export interface ScalablePriceAlertPayload {
  id: string;
  symbol: string;
  name: string;
  targetPrice: number;
  direction: "ABOVE" | "BELOW";
  currentPriceAtCreation?: number;
  status: "ACTIVE" | "TRIGGERED" | "DISABLED";
  createdAt?: string;
  triggeredAt?: string;
  note?: string;
}

/**
 * Realistic demo price alerts for Scalable Capital.
 */
function getDemoScalablePriceAlerts(): ScalablePriceAlertPayload[] {
  return [
    {
      id: "alert_swda_dip",
      symbol: "SWDA.MI",
      name: "iShares Core MSCI World UCITS ETF",
      targetPrice: 94.00,
      direction: "BELOW",
      currentPriceAtCreation: 97.20,
      status: "ACTIVE",
      createdAt: "2024-09-01T08:00:00.000Z",
      note: "Buy dip / Incremento quota PAC",
    },
    {
      id: "alert_csspx_ath",
      symbol: "CSSPX.MI",
      name: "iShares Core S&P 500 UCITS ETF",
      targetPrice: 550.00,
      direction: "ABOVE",
      currentPriceAtCreation: 520.10,
      status: "ACTIVE",
      createdAt: "2024-09-01T08:00:00.000Z",
      note: "Nuovo ATH / Valutazione rebalancing",
    },
    {
      id: "alert_xeon_floor",
      symbol: "XEON.MI",
      name: "Xtrackers II EUR Overnight Rate Swap UCITS ETF",
      targetPrice: 139.80,
      direction: "BELOW",
      currentPriceAtCreation: 140.20,
      status: "ACTIVE",
      createdAt: "2024-08-15T12:00:00.000Z",
      note: "Soglia monitoraggio tassi BCE",
    },
  ];
}

export interface TaxLossBucketPayload {
  yearCreated: number;
  yearExpires: number;
  initialAmount: number;
  remainingAmount: number;
  compensatedAmount: number;
  isExpiringThisYear: boolean;
  status: "ACTIVE" | "EXPIRED" | "COMPENSATED";
}

export interface RealizedTradePayload {
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

export interface ScalableTaxReportPayload {
  totalActiveLosses: number;
  potentialTaxSavings: number;
  lossesExpiringThisYear: number;
  realizedGainsCurrentYear: number;
  realizedLossesCurrentYear: number;
  netRealizedCurrentYear: number;
  buckets: TaxLossBucketPayload[];
  realizedTrades: RealizedTradePayload[];
  lastCalculatedAt: string;
  source: "mcp" | "calculated" | "hybrid";
}

/**
 * Realistic demo tax loss report for Scalable Capital sandbox mode.
 */
function getDemoScalableTaxReport(): ScalableTaxReportPayload {
  const currentYear = new Date().getFullYear();
  const buckets: TaxLossBucketPayload[] = [
    {
      yearCreated: currentYear - 3,
      yearExpires: currentYear + 1,
      initialAmount: 250.0,
      remainingAmount: 150.0,
      compensatedAmount: 100.0,
      isExpiringThisYear: false,
      status: "ACTIVE",
    },
    {
      yearCreated: currentYear - 2,
      yearExpires: currentYear + 2,
      initialAmount: 320.0,
      remainingAmount: 290.0,
      compensatedAmount: 30.0,
      isExpiringThisYear: false,
      status: "ACTIVE",
    },
    {
      yearCreated: currentYear - 1,
      yearExpires: currentYear + 3,
      initialAmount: 200.0,
      remainingAmount: 200.0,
      compensatedAmount: 0.0,
      isExpiringThisYear: false,
      status: "ACTIVE",
    },
  ];

  const totalActiveLosses = buckets
    .filter((b) => b.status === "ACTIVE")
    .reduce((sum, b) => sum + b.remainingAmount, 0);

  const potentialTaxSavings = Math.round(totalActiveLosses * 0.26 * 100) / 100;

  const realizedTrades: RealizedTradePayload[] = [
    {
      id: "demo_rt_1",
      symbol: "TSLA",
      name: "Tesla Inc.",
      date: `${currentYear}-02-14T11:20:00.000Z`,
      quantity: 5,
      salePrice: 195.4,
      costBasis: 220.0,
      realizedGainOrLoss: -123.0,
      isLoss: true,
      category: "Azioni",
    },
    {
      id: "demo_rt_2",
      symbol: "NVDA",
      name: "NVIDIA Corp.",
      date: `${currentYear}-05-20T16:45:00.000Z`,
      quantity: 2,
      salePrice: 118.5,
      costBasis: 92.0,
      realizedGainOrLoss: 53.0,
      isLoss: false,
      category: "Azioni",
    },
  ];

  return {
    totalActiveLosses,
    potentialTaxSavings,
    lossesExpiringThisYear: 0,
    realizedGainsCurrentYear: 53.0,
    realizedLossesCurrentYear: 123.0,
    netRealizedCurrentYear: -70.0,
    buckets,
    realizedTrades,
    lastCalculatedAt: new Date().toISOString(),
    source: "mcp",
  };
}

/**
 * Callable Function to synchronize Scalable Capital transactions & positions into Firestore.
 */
export const syncScalablePortfolio = onCall(async (request: CallableRequest<SyncPortfolioData>) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Devi essere autenticato per sincronizzare il portafoglio.");
  }

  const userId = request.auth.uid;
  const targetGroup = request.data?.targetGroup || "Scalable";

  const db = getFirestore();

  // 1. Read user's integration settings
  const configDocRef = db.doc(`portfolios/${userId}/settings/integration_scalable`);
  const configSnap = await configDocRef.get();

  if (!configSnap.exists) {
    throw new HttpsError("failed-precondition", "Integrazione Scalable Capital non configurata.");
  }

  const config = configSnap.data();
  if (!config || !config.apiToken) {
    throw new HttpsError("failed-precondition", "Token di accesso Scalable non presente.");
  }

  const apiToken = config.apiToken as string;
  const serverUrl = (config.serverUrl as string) || DEFAULT_SCALABLE_MCP_URL;
  const isDemo = apiToken.toLowerCase().startsWith("demo") || apiToken.toLowerCase().startsWith("mock");

  let fetchedTransactions: ScalableTransactionPayload[] = [];
  let fetchedSavingsPlans: ScalableSavingsPlanPayload[] = [];
  let fetchedPriceAlerts: ScalablePriceAlertPayload[] = [];
  let fetchedTaxReport: ScalableTaxReportPayload | null = null;
  let cashBalance = 0;

  // Real-time Scalable quotes map in EUR (keyed by both ISIN and custom ticker symbols)
  const scalableQuotesMap: Record<string, {
    symbol: string;
    shortName: string;
    longName: string;
    regularMarketPrice: number;
    currency: string;
    valuation: number;
    updatedAt: string;
  }> = {};

  if (isDemo) {
    fetchedTransactions = getDemoScalableTransactions();
    cashBalance = 1450.50;
    fetchedSavingsPlans = getDemoScalableSavingsPlans();
    fetchedPriceAlerts = getDemoScalablePriceAlerts();
    fetchedTaxReport = getDemoScalableTaxReport();
  } else if (config.dpopPrivateKey && config.dpopPublicKeyJwk) {
    // Official Scalable Capital Direct Broker API (RFC 9449 DPoP + GraphQL)
    const keyPair: ScalableKeyPair = {
      privateKey: config.dpopPrivateKey as string,
      publicJwk: config.dpopPublicKeyJwk as { kty: string; crv: string; x: string; y: string },
    };
    try {
      const graphResult = await fetchScalablePortfolioViaGraphQL(
        keyPair,
        apiToken,
        config.refreshToken as string | undefined,
        userId,
        db,
        config.idToken as string | undefined,
        config.sessionId as string | undefined,
      );
      fetchedTransactions = graphResult.transactions;
      fetchedSavingsPlans = graphResult.savingsPlans;
      fetchedPriceAlerts = graphResult.priceAlerts;
      fetchedTaxReport = graphResult.taxReport;
      cashBalance = graphResult.cashBalance;

      // Update assets collection with holding positions and real-time Scalable quotes in EUR
      for (const h of graphResult.holdings) {
        if (h.isin) {
          const assetRef = db.doc(`portfolios/${userId}/assets/${h.isin}`);
          await assetRef.set(
            {
              symbol: h.isin,
              name: h.name,
              category: h.category,
              currentPrice: h.currentPrice,
              regularMarketPrice: h.currentPrice,
              averagePrice: h.averagePrice,
              valuation: h.valuation,
              quantity: h.quantity,
              currency: h.currency || "EUR",
              source: "scalable",
              lastSyncedAt: new Date().toISOString(),
            },
            { merge: true },
          );

          if (h.currentPrice > 0) {
            scalableQuotesMap[h.isin] = {
              symbol: h.isin,
              shortName: h.name,
              longName: h.name,
              regularMarketPrice: h.currentPrice,
              currency: h.currency || "EUR",
              valuation: h.valuation,
              updatedAt: new Date().toISOString(),
            };
          }
        }
      }
    } catch (gErr: unknown) {
      const err = gErr as ScalableRefreshError;
      console.error("Scalable DPoP GraphQL sync error:", err);
      const isExplicitInvalidGrant =
        err?.isInvalidGrant === true ||
        err?.oauthError === "invalid_grant" ||
        err?.message?.toLowerCase().includes("invalid_grant");
      if (isExplicitInvalidGrant) {
        await configDocRef
          .update({
            status: "expired",
            errorMessage: "Sessione scaduta o revocata da Scalable Capital. Effettua nuovamente il login.",
          })
          .catch(() => {});
        throw new HttpsError(
          "unauthenticated",
          "Sessione Scalable Capital scaduta o revocata. Clicca su 'Disconnetti' e riconnetti il conto per aggiornare l'autorizzazione.",
        );
      }
      throw new HttpsError("unavailable", `Errore durante la sincronizzazione con Scalable: ${err.message}`);
    }
  } else {
    let client: Client | null = null;
    try {
      client = await createMcpClient(serverUrl, apiToken);
      const toolsResult = await client.listTools();
      const toolNames = toolsResult.tools.map((t) => t.name);

      // Call transactions tool if available
      if (toolNames.includes("get_transactions") || toolNames.includes("transactions")) {
        const toolName = toolNames.includes("get_transactions") ? "get_transactions" : "transactions";
        const txResult = await client.callTool({ name: toolName, arguments: {} });
        const content = Array.isArray(txResult.content) ? txResult.content : [];
        if (content.length > 0) {
          const firstContent = content[0] as { type: string; text?: string };
          if (firstContent.type === "text" && firstContent.text) {
            try {
              const parsed = JSON.parse(firstContent.text);
              const list = Array.isArray(parsed) ? parsed : (parsed.transactions || parsed.data || []);
              fetchedTransactions = list.map((item: Record<string, unknown>, index: number) => ({
                id: (item.id || item.orderId || `sc_tx_${index}`) as string,
                symbol: (item.symbol || item.ticker || item.isin || "UNKNOWN") as string,
                name: (item.name || item.title || item.symbol || "Asset Scalable") as string,
                quantity: Number(item.quantity || item.shares || 0),
                price: Number(item.price || item.purchasePrice || item.executionPrice || 0),
                date: (item.date || item.timestamp || new Date().toISOString()) as string,
                type: String(item.type || item.side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
                fee: Number(item.fee || 0),
                category: (item.category as string) || "Azioni",
              }));
            } catch (pErr) {
              console.warn("Could not parse MCP transactions JSON:", pErr);
            }
          }
        }
      }

      // Call cash balance tool if available
      if (toolNames.includes("get_cash_balance") || toolNames.includes("broker_overview")) {
        const cashTool = toolNames.includes("get_cash_balance") ? "get_cash_balance" : "broker_overview";
        const cashRes = await client.callTool({ name: cashTool, arguments: {} });
        const cashContent = Array.isArray(cashRes.content) ? cashRes.content : [];
        if (cashContent.length > 0) {
          const first = cashContent[0] as { type: string; text?: string };
          if (first.type === "text" && first.text) {
            try {
              const parsed = JSON.parse(first.text);
              cashBalance = Number(parsed.cashBalance || parsed.cash || parsed.availableCash || 0);
            } catch (cErr) {
              console.warn("Could not parse MCP cash balance:", cErr);
            }
          }
        }
      }

      // Call savings plans tool if available
      if (toolNames.includes("get_savings_plans") || toolNames.includes("savings_plans")) {
        const spTool = toolNames.includes("get_savings_plans") ? "get_savings_plans" : "savings_plans";
        const spRes = await client.callTool({ name: spTool, arguments: {} });
        const spContent = Array.isArray(spRes.content) ? spRes.content : [];
        if (spContent.length > 0) {
          const first = spContent[0] as { type: string; text?: string };
          if (first.type === "text" && first.text) {
            try {
              const parsed = JSON.parse(first.text);
              const list = Array.isArray(parsed) ? parsed : (parsed.savingsPlans || parsed.plans || parsed.data || []);
              fetchedSavingsPlans = list.map((item: Record<string, unknown>, index: number) => ({
                id: (item.id || item.planId || `sc_sp_${index}`) as string,
                symbol: (item.symbol || item.ticker || item.isin || "UNKNOWN") as string,
                name: (item.name || item.title || item.symbol || "Piano Scalable") as string,
                amount: Number(item.amount || item.periodicAmount || 0),
                frequency: "monthly",
                dayOfMonth: Number(item.dayOfMonth || 2),
                nextExecutionDate: (item.nextExecutionDate || item.nextDate || "") as string,
                status: String(item.status || "ACTIVE").toUpperCase() === "PAUSED" ? "PAUSED" : "ACTIVE",
                targetAllocationPercent: item.targetAllocationPercent ? Number(item.targetAllocationPercent) : undefined,
              }));
            } catch (spErr) {
              console.warn("Could not parse MCP savings plans:", spErr);
            }
          }
        }
      }

      // Call price alerts tool if available
      if (toolNames.includes("get_price_alerts") || toolNames.includes("price_alerts") || toolNames.includes("get_alerts")) {
        const alertTool = toolNames.includes("get_price_alerts") ? "get_price_alerts" : (toolNames.includes("price_alerts") ? "price_alerts" : "get_alerts");
        const alertRes = await client.callTool({ name: alertTool, arguments: {} });
        const alertContent = Array.isArray(alertRes.content) ? alertRes.content : [];
        if (alertContent.length > 0) {
          const first = alertContent[0] as { type: string; text?: string };
          if (first.type === "text" && first.text) {
            try {
              const parsed = JSON.parse(first.text);
              const list = Array.isArray(parsed) ? parsed : (parsed.priceAlerts || parsed.alerts || parsed.data || []);
              fetchedPriceAlerts = list.map((item: Record<string, unknown>, index: number) => ({
                id: (item.id || item.alertId || `sc_alert_${index}`) as string,
                symbol: (item.symbol || item.ticker || item.isin || "UNKNOWN") as string,
                name: (item.name || item.title || item.symbol || "Alert Scalable") as string,
                targetPrice: Number(item.targetPrice || item.price || item.threshold || 0),
                direction: String(item.direction || item.condition || "BELOW").toUpperCase().includes("ABOVE") ? "ABOVE" : "BELOW",
                currentPriceAtCreation: item.currentPriceAtCreation ? Number(item.currentPriceAtCreation) : undefined,
                status: String(item.status || "ACTIVE").toUpperCase() === "TRIGGERED" ? "TRIGGERED" : "ACTIVE",
                createdAt: (item.createdAt || item.date || new Date().toISOString()) as string,
                triggeredAt: item.triggeredAt ? (item.triggeredAt as string) : undefined,
                note: item.note ? (item.note as string) : undefined,
              }));
            } catch (aErr) {
              console.warn("Could not parse MCP price alerts:", aErr);
            }
          }
        }
      }

      // Call tax overview / losses tool if available
      if (
        toolNames.includes("get_tax_losses") ||
        toolNames.includes("get_tax_overview") ||
        toolNames.includes("get_tax_report") ||
        toolNames.includes("tax_losses")
      ) {
        const taxTool = toolNames.find((n) =>
          ["get_tax_losses", "get_tax_overview", "get_tax_report", "tax_losses"].includes(n),
        )!;
        const taxRes = await client.callTool({ name: taxTool, arguments: {} });
        const taxContent = Array.isArray(taxRes.content) ? taxRes.content : [];
        if (taxContent.length > 0) {
          const first = taxContent[0] as { type: string; text?: string };
          if (first.type === "text" && first.text) {
            try {
              const parsed = JSON.parse(first.text);
              const totalActiveLosses = Number(
                parsed.totalActiveLosses || parsed.totalLosses || parsed.minusvalenze || 0,
              );
              const potentialTaxSavings = Number(
                parsed.potentialTaxSavings || Math.round(totalActiveLosses * 0.26 * 100) / 100,
              );
              const buckets = Array.isArray(parsed.buckets) ? parsed.buckets : [];
              const realizedTrades = Array.isArray(parsed.realizedTrades) ? parsed.realizedTrades : [];
              fetchedTaxReport = {
                totalActiveLosses,
                potentialTaxSavings,
                lossesExpiringThisYear: Number(parsed.lossesExpiringThisYear || 0),
                realizedGainsCurrentYear: Number(parsed.realizedGainsCurrentYear || 0),
                realizedLossesCurrentYear: Number(parsed.realizedLossesCurrentYear || 0),
                netRealizedCurrentYear: Number(parsed.netRealizedCurrentYear || 0),
                buckets,
                realizedTrades,
                lastCalculatedAt: new Date().toISOString(),
                source: "mcp",
              };
            } catch (tErr) {
              console.warn("Could not parse MCP tax report:", tErr);
            }
          }
        }
      }
    } catch (err: unknown) {
      const e = err as Error;
      console.error("Scalable sync error:", e);
      let errMsg = e.message;
      if (
        errMsg.includes("Missing or invalid credentials") ||
        errMsg.includes("UNAUTHENTICATED") ||
        errMsg.includes("Token refresh fallito") ||
        errMsg.includes("invalid_grant")
      ) {
        errMsg = "Sessione Scalable Capital scaduta. Tocca 'Disconnetti' e riconnetti il conto per aggiornare l'autorizzazione.";
      }
      throw new HttpsError("unavailable", `Errore durante la sincronizzazione con Scalable: ${errMsg}`);
    } finally {
      if (client) {
        try {
          await client.close();
        } catch (e) {
          console.warn("Error closing client:", e);
        }
      }
    }
  }

  // 2. Reconcile transactions into Firestore with Smart Matching & Deduplication
  const txCollectionRef = db.collection(`portfolios/${userId}/transactions`);
  const allTxSnap = await txCollectionRef.get();

  interface ExistingTxItem {
    id: string;
    symbol?: string;
    name?: string;
    quantity?: number;
    purchasePrice?: number;
    date?: string;
    type?: string;
    groups?: string[];
    group?: string;
    source?: string;
    externalId?: string;
    isin?: string;
    currency?: string;
  }

  const existingDocs: ExistingTxItem[] = allTxSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<ExistingTxItem, "id">),
  }));

  const matchedDocIds = new Set<string>();
  const batch = db.batch();
  let importedCount = 0;
  let updatedCount = 0;
  let deduplicatedCount = 0;

  for (const item of fetchedTransactions) {
    if (item.quantity <= 0 || item.price <= 0) continue;

    const scalableDeterministicId = `scalable_${item.id}`;

    // A. Check if already linked by externalId or deterministic ID
    let matchedDoc = existingDocs.find(
      (d) =>
        !matchedDocIds.has(d.id) &&
        (d.externalId === item.id || d.id === scalableDeterministicId),
    );

    // B. Smart matching against pre-existing portfolio transactions
    if (!matchedDoc) {
      const itemDateStr = item.date ? item.date.slice(0, 10) : "";
      const itemTime = item.date ? new Date(item.date).getTime() : 0;

      matchedDoc = existingDocs.find((d) => {
        if (matchedDocIds.has(d.id)) return false;
        // Skip other scalable transactions that have a different externalId
        if (d.id.startsWith("scalable_") && d.id !== scalableDeterministicId) return false;

        const dType = (d.type || "BUY").toUpperCase();
        if (dType !== item.type) return false;

        const dQty = Number(d.quantity || 0);
        if (Math.abs(dQty - item.quantity) > 0.0001) return false;

        // Date matching (same day or within 3 days for trade settlement differences)
        const dDateStr = d.date ? d.date.slice(0, 10) : "";
        const dTime = d.date ? new Date(d.date).getTime() : 0;
        const isSameDay = dDateStr === itemDateStr;
        const daysDiff = Math.abs(dTime - itemTime) / (1000 * 60 * 60 * 24);
        const isCloseDay = daysDiff <= 3;

        if (!isSameDay && !isCloseDay) return false;

        // Price comparison
        const dPrice = Number(d.purchasePrice || 0);
        const priceDiff = Math.abs(dPrice - item.price);
        const pricePctDiff = dPrice > 0 ? priceDiff / dPrice : 1;
        const isPriceClose = priceDiff < 0.05 || pricePctDiff < 0.02;

        // Symbol / ISIN / Name match
        const dSym = (d.symbol || "").toUpperCase();
        const itemSym = (item.symbol || "").toUpperCase();
        const dIsin = (d.isin || "").toUpperCase();
        const itemIsin = (item.isin || "").toUpperCase();

        const isSymbolMatch =
          dSym === itemSym ||
          (dIsin && itemIsin && dIsin === itemIsin) ||
          dSym === itemIsin ||
          dIsin === itemSym;

        if (isSymbolMatch) {
          return isPriceClose || isSameDay;
        }

        // Ticker vs ISIN heuristic: if exact same day and exact same price
        if (isSameDay && isPriceClose) {
          return true;
        }

        return false;
      });
    }

    if (matchedDoc) {
      matchedDocIds.add(matchedDoc.id);

      // If matchedDoc is a pre-existing manual transaction (not scalable_${item.id}),
      // and a duplicate scalable_${item.id} was created previously in Firestore:
      if (matchedDoc.id !== scalableDeterministicId) {
        const duplicateSnap = existingDocs.find((d) => d.id === scalableDeterministicId);
        if (duplicateSnap) {
          batch.delete(txCollectionRef.doc(scalableDeterministicId));
          matchedDocIds.add(scalableDeterministicId);
          deduplicatedCount++;
          console.log(`[Scalable Sync] Removed duplicate document ${scalableDeterministicId}, linked original ${matchedDoc.id}`);
        }
      }

      // Link and update the matched transaction
      const targetDocRef = txCollectionRef.doc(matchedDoc.id);
      batch.update(targetDocRef, {
        externalId: item.id,
        source: "scalable_mcp",
        currency: item.currency || "EUR",
        isin: item.isin || matchedDoc.isin || null,
        lastSyncedAt: new Date().toISOString(),
        purchasePrice: matchedDoc.purchasePrice ? matchedDoc.purchasePrice : item.price,
      });
      updatedCount++;
    } else {
      // New transaction from Scalable
      const docRef = txCollectionRef.doc(scalableDeterministicId);
      batch.set(
        docRef,
        {
          symbol: item.symbol,
          name: item.name,
          quantity: item.quantity,
          purchasePrice: item.price,
          currency: item.currency || "EUR",
          date: item.date,
          type: item.type,
          groups: [targetGroup],
          source: "scalable_mcp",
          externalId: item.id,
          isin: item.isin || null,
          createdAt: new Date().toISOString(),
          lastSyncedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      importedCount++;
    }

    // Auto-save category in assets if provided
    if (item.category) {
      const assetRef = db.doc(`portfolios/${userId}/assets/${item.symbol}`);
      batch.set(
        assetRef,
        {
          symbol: item.symbol,
          name: item.name,
          category: item.category,
          currency: item.currency || "EUR",
        },
        { merge: true },
      );
    }
  }

  // Cross-reference Scalable quotes with all user's portfolio symbols (tickers & ISINs)
  for (const d of existingDocs) {
    const isin = d.isin;
    const sym = d.symbol;
    if (sym && isin && scalableQuotesMap[isin] && !scalableQuotesMap[sym]) {
      const q = scalableQuotesMap[isin];
      scalableQuotesMap[sym] = {
        ...q,
        symbol: sym,
      };
      const symAssetRef = db.doc(`portfolios/${userId}/assets/${sym}`);
      batch.set(
        symAssetRef,
        {
          symbol: sym,
          isin: isin,
          name: d.name || q.shortName,
          currentPrice: q.regularMarketPrice,
          regularMarketPrice: q.regularMarketPrice,
          currency: q.currency || "EUR",
          source: "scalable",
          lastSyncedAt: new Date().toISOString(),
        },
        { merge: true },
      );
    }
  }

  // Save/update scalable_quotes in settings with all resolved symbols and ISINs
  if (Object.keys(scalableQuotesMap).length > 0) {
    const quotesDocRef = db.doc(`portfolios/${userId}/settings/scalable_quotes`);
    batch.set(quotesDocRef, scalableQuotesMap, { merge: true });
  }

  // Ensure target group exists in user settings
  const prefRef = db.doc(`portfolios/${userId}/settings/preferences`);
  const prefSnap = await prefRef.get();
  if (prefSnap.exists) {
    const prefs = prefSnap.data();
    const currentGroups = (prefs?.groups as string[]) || ["Generale"];
    if (!currentGroups.includes(targetGroup)) {
      batch.update(prefRef, {
        groups: [...currentGroups, targetGroup].sort(),
      });
    }
  }

  // Save fetched savings plans to Firestore
  if (fetchedSavingsPlans.length > 0) {
    const spDocRef = db.doc(`portfolios/${userId}/settings/scalable_savings_plans`);
    const totalMonthlyAmount = fetchedSavingsPlans
      .filter((p) => p.status === "ACTIVE")
      .reduce((sum, p) => sum + p.amount, 0);

    batch.set(
      spDocRef,
      {
        plans: fetchedSavingsPlans,
        totalMonthlyAmount,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  }

  // Save fetched price alerts to Firestore
  if (fetchedPriceAlerts.length > 0) {
    const alertsDocRef = db.doc(`portfolios/${userId}/settings/scalable_price_alerts`);
    batch.set(
      alertsDocRef,
      {
        alerts: fetchedPriceAlerts,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  }

  // Save fetched tax report to Firestore
  if (fetchedTaxReport) {
    const taxDocRef = db.doc(`portfolios/${userId}/settings/scalable_tax_report`);
    batch.set(taxDocRef, fetchedTaxReport, { merge: true });
  }

  // Update integration status doc
  const configUpdates: Record<string, unknown> = {
    status: "connected",
    lastSyncedAt: new Date().toISOString(),
    syncedTransactionsCount: fetchedTransactions.length,
    cashBalance,
    priceAlertsCount: fetchedPriceAlerts.length,
    errorMessage: FieldValue.delete(),
  };
  if (fetchedTaxReport) {
    configUpdates.taxLossesTotal = fetchedTaxReport.totalActiveLosses;
  }
  batch.update(configDocRef, configUpdates);

  await batch.commit();

  return {
    success: true,
    importedCount,
    updatedCount,
    deduplicatedCount,
    totalTransactions: fetchedTransactions.length,
    savingsPlansCount: fetchedSavingsPlans.length,
    priceAlertsCount: fetchedPriceAlerts.length,
    cashBalance,
    taxLossesTotal: fetchedTaxReport ? fetchedTaxReport.totalActiveLosses : 0,
    syncedAt: new Date().toISOString(),
  };
});

/**
 * Callable Function to fetch Scalable Capital savings plans on-demand.
 */
export const getScalableSavingsPlans = onCall(async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Devi essere autenticato.");
  }
  const userId = request.auth.uid;
  const db = getFirestore();

  const configDocRef = db.doc(`portfolios/${userId}/settings/integration_scalable`);
  const configSnap = await configDocRef.get();
  if (!configSnap.exists) {
    throw new HttpsError("failed-precondition", "Integrazione Scalable non configurata.");
  }
  const config = configSnap.data();
  if (!config || !config.apiToken) {
    throw new HttpsError("failed-precondition", "Token Scalable mancante.");
  }

  const apiToken = config.apiToken as string;
  const isDemo = apiToken.toLowerCase().startsWith("demo") || apiToken.toLowerCase().startsWith("mock");

  if (isDemo) {
    const plans = getDemoScalableSavingsPlans();
    const totalMonthlyAmount = plans.reduce((s, p) => s + p.amount, 0);
    return { success: true, plans, totalMonthlyAmount };
  }

  if (config.dpopPrivateKey && config.dpopPublicKeyJwk) {
    const spDocRef = db.doc(`portfolios/${userId}/settings/scalable_savings_plans`);
    const spSnap = await spDocRef.get();
    if (spSnap.exists) {
      const data = spSnap.data() as { plans: ScalableSavingsPlanPayload[]; totalMonthlyAmount: number };
      return { success: true, plans: data.plans || [], totalMonthlyAmount: data.totalMonthlyAmount || 0 };
    }

    const keyPair: ScalableKeyPair = {
      privateKey: config.dpopPrivateKey as string,
      publicJwk: config.dpopPublicKeyJwk as { kty: string; crv: string; x: string; y: string },
    };
    try {
      const graphResult = await fetchScalablePortfolioViaGraphQL(
        keyPair,
        apiToken,
        config.refreshToken as string | undefined,
        userId,
        db,
        config.idToken as string | undefined,
        config.sessionId as string | undefined,
      );
      const plans = graphResult.savingsPlans;
      const totalMonthlyAmount = plans.reduce((s, p) => s + p.amount, 0);
      await spDocRef.set({ plans, totalMonthlyAmount, updatedAt: new Date().toISOString() }, { merge: true });
      return { success: true, plans, totalMonthlyAmount };
    } catch (e) {
      const err = e as Error;
      throw new HttpsError("unavailable", `Errore nel recupero dei piani PAC: ${err.message}`);
    }
  }

  // Live MCP call
  const serverUrl = (config.serverUrl as string) || DEFAULT_SCALABLE_MCP_URL;
  let client: Client | null = null;
  try {
    client = await createMcpClient(serverUrl, apiToken);
    const spRes = await client.callTool({ name: "get_savings_plans", arguments: {} });
    const content = Array.isArray(spRes.content) ? spRes.content : [];
    let plans: ScalableSavingsPlanPayload[] = [];
    if (content.length > 0) {
      const first = content[0] as { type: string; text?: string };
      if (first.type === "text" && first.text) {
        const parsed = JSON.parse(first.text);
        const list = Array.isArray(parsed) ? parsed : (parsed.savingsPlans || parsed.plans || parsed.data || []);
        plans = list.map((item: Record<string, unknown>, index: number) => ({
          id: (item.id || item.planId || `sc_sp_${index}`) as string,
          symbol: (item.symbol || item.ticker || item.isin || "UNKNOWN") as string,
          name: (item.name || item.title || item.symbol || "Piano Scalable") as string,
          amount: Number(item.amount || item.periodicAmount || 0),
          frequency: "monthly",
          dayOfMonth: Number(item.dayOfMonth || 2),
          nextExecutionDate: (item.nextExecutionDate || item.nextDate || "") as string,
          status: String(item.status || "ACTIVE").toUpperCase() === "PAUSED" ? "PAUSED" : "ACTIVE",
          targetAllocationPercent: item.targetAllocationPercent ? Number(item.targetAllocationPercent) : undefined,
        }));
      }
    }
    const totalMonthlyAmount = plans.filter((p) => p.status === "ACTIVE").reduce((s, p) => s + p.amount, 0);

    // Save cache to Firestore
    const spDocRef = db.doc(`portfolios/${userId}/settings/scalable_savings_plans`);
    await spDocRef.set({
      plans,
      totalMonthlyAmount,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    return { success: true, plans, totalMonthlyAmount };
  } catch (err: unknown) {
    const e = err as Error;
    throw new HttpsError("unavailable", `Errore nel recupero dei piani PAC: ${e.message}`);
  } finally {
    if (client) {
      try {
        await client.close();
      } catch (c) {
        console.warn("Error closing client:", c);
      }
    }
  }
});

/**
 * Callable Function to fetch Scalable Capital price alerts on-demand.
 */
export const getScalablePriceAlerts = onCall(async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Devi essere autenticato.");
  }
  const userId = request.auth.uid;
  const db = getFirestore();

  const configDocRef = db.doc(`portfolios/${userId}/settings/integration_scalable`);
  const configSnap = await configDocRef.get();
  if (!configSnap.exists) {
    throw new HttpsError("failed-precondition", "Integrazione Scalable non configurata.");
  }
  const config = configSnap.data();
  if (!config || !config.apiToken) {
    throw new HttpsError("failed-precondition", "Token Scalable mancante.");
  }

  const apiToken = config.apiToken as string;
  const isDemo = apiToken.toLowerCase().startsWith("demo") || apiToken.toLowerCase().startsWith("mock");

  if (isDemo) {
    const alerts = getDemoScalablePriceAlerts();
    return { success: true, alerts };
  }

  if (config.dpopPrivateKey && config.dpopPublicKeyJwk) {
    const alertsDocRef = db.doc(`portfolios/${userId}/settings/scalable_price_alerts`);
    const alertsSnap = await alertsDocRef.get();
    if (alertsSnap.exists) {
      const data = alertsSnap.data() as { alerts: ScalablePriceAlertPayload[] };
      return { success: true, alerts: data.alerts || [] };
    }

    const keyPair: ScalableKeyPair = {
      privateKey: config.dpopPrivateKey as string,
      publicJwk: config.dpopPublicKeyJwk as { kty: string; crv: string; x: string; y: string },
    };
    try {
      const graphResult = await fetchScalablePortfolioViaGraphQL(
        keyPair,
        apiToken,
        config.refreshToken as string | undefined,
        userId,
        db,
        config.idToken as string | undefined,
        config.sessionId as string | undefined,
      );
      const alerts = graphResult.priceAlerts;
      await alertsDocRef.set({ alerts, updatedAt: new Date().toISOString() }, { merge: true });
      return { success: true, alerts };
    } catch (e) {
      const err = e as Error;
      throw new HttpsError("unavailable", `Errore nel recupero dei price alert: ${err.message}`);
    }
  }

  // Live MCP call
  const serverUrl = (config.serverUrl as string) || DEFAULT_SCALABLE_MCP_URL;
  let client: Client | null = null;
  try {
    client = await createMcpClient(serverUrl, apiToken);
    const alertRes = await client.callTool({ name: "get_price_alerts", arguments: {} });
    const content = Array.isArray(alertRes.content) ? alertRes.content : [];
    let alerts: ScalablePriceAlertPayload[] = [];
    if (content.length > 0) {
      const first = content[0] as { type: string; text?: string };
      if (first.type === "text" && first.text) {
        const parsed = JSON.parse(first.text);
        const list = Array.isArray(parsed) ? parsed : (parsed.priceAlerts || parsed.alerts || parsed.data || []);
        alerts = list.map((item: Record<string, unknown>, index: number) => ({
          id: (item.id || item.alertId || `sc_alert_${index}`) as string,
          symbol: (item.symbol || item.ticker || item.isin || "UNKNOWN") as string,
          name: (item.name || item.title || item.symbol || "Alert Scalable") as string,
          targetPrice: Number(item.targetPrice || item.price || item.threshold || 0),
          direction: String(item.direction || item.condition || "BELOW").toUpperCase().includes("ABOVE") ? "ABOVE" : "BELOW",
          currentPriceAtCreation: item.currentPriceAtCreation ? Number(item.currentPriceAtCreation) : undefined,
          status: String(item.status || "ACTIVE").toUpperCase() === "TRIGGERED" ? "TRIGGERED" : "ACTIVE",
          createdAt: (item.createdAt || item.date || new Date().toISOString()) as string,
          triggeredAt: item.triggeredAt ? (item.triggeredAt as string) : undefined,
          note: item.note ? (item.note as string) : undefined,
        }));
      }
    }

    // Save cache to Firestore
    const alertsDocRef = db.doc(`portfolios/${userId}/settings/scalable_price_alerts`);
    await alertsDocRef.set({
      alerts,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    return { success: true, alerts };
  } catch (err: unknown) {
    const e = err as Error;
    throw new HttpsError("unavailable", `Errore nel recupero dei price alert: ${e.message}`);
  } finally {
    if (client) {
      try {
        await client.close();
      } catch (c) {
        console.warn("Error closing client:", c);
      }
    }
  }
});

/**
 * Callable Function to fetch Scalable Capital tax report on-demand.
 */
export const getScalableTaxReport = onCall(async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Devi essere autenticato.");
  }
  const userId = request.auth.uid;
  const db = getFirestore();

  const configDocRef = db.doc(`portfolios/${userId}/settings/integration_scalable`);
  const configSnap = await configDocRef.get();
  if (!configSnap.exists) {
    throw new HttpsError("failed-precondition", "Integrazione Scalable non configurata.");
  }
  const config = configSnap.data();
  if (!config || !config.apiToken) {
    throw new HttpsError("failed-precondition", "Token Scalable mancante.");
  }

  const apiToken = config.apiToken as string;
  const isDemo = apiToken.toLowerCase().startsWith("demo") || apiToken.toLowerCase().startsWith("mock");

  if (isDemo) {
    const report = getDemoScalableTaxReport();
    return { success: true, report };
  }

  const taxDocRef = db.doc(`portfolios/${userId}/settings/scalable_tax_report`);
  const taxSnap = await taxDocRef.get();

  if (config.dpopPrivateKey && config.dpopPublicKeyJwk) {
    if (taxSnap.exists) {
      return { success: true, report: taxSnap.data() as ScalableTaxReportPayload };
    }

    // Calculate tax report from synced transactions
    const txSnap = await db.collection(`portfolios/${userId}/transactions`)
      .where("source", "==", "scalable_mcp")
      .get();
    const txs: ScalableTransactionPayload[] = txSnap.docs.map((d) => {
      const val = d.data();
      return {
        id: d.id,
        symbol: val.symbol,
        name: val.name,
        quantity: val.quantity,
        price: val.purchasePrice,
        date: val.date,
        type: val.type,
        category: val.category,
      };
    });

    const report = calculateTaxReportFromTransactions(txs);
    await taxDocRef.set(report, { merge: true });
    return { success: true, report };
  }

  // Live MCP call
  const serverUrl = (config.serverUrl as string) || DEFAULT_SCALABLE_MCP_URL;
  let client: Client | null = null;
  try {
    client = await createMcpClient(serverUrl, apiToken);
    const toolsResult = await client.listTools();
    const toolNames = toolsResult.tools.map((t) => t.name);

    if (
      toolNames.includes("get_tax_losses") ||
      toolNames.includes("get_tax_overview") ||
      toolNames.includes("get_tax_report") ||
      toolNames.includes("tax_losses")
    ) {
      const taxTool = toolNames.find((n) =>
        ["get_tax_losses", "get_tax_overview", "get_tax_report", "tax_losses"].includes(n),
      )!;
      const taxRes = await client.callTool({ name: taxTool, arguments: {} });
      const taxContent = Array.isArray(taxRes.content) ? taxRes.content : [];
      if (taxContent.length > 0) {
        const first = taxContent[0] as { type: string; text?: string };
        if (first.type === "text" && first.text) {
          const parsed = JSON.parse(first.text);
          const totalActiveLosses = Number(
            parsed.totalActiveLosses || parsed.totalLosses || parsed.minusvalenze || 0,
          );
          const potentialTaxSavings = Number(
            parsed.potentialTaxSavings || Math.round(totalActiveLosses * 0.26 * 100) / 100,
          );
          const report: ScalableTaxReportPayload = {
            totalActiveLosses,
            potentialTaxSavings,
            lossesExpiringThisYear: Number(parsed.lossesExpiringThisYear || 0),
            realizedGainsCurrentYear: Number(parsed.realizedGainsCurrentYear || 0),
            realizedLossesCurrentYear: Number(parsed.realizedLossesCurrentYear || 0),
            netRealizedCurrentYear: Number(parsed.netRealizedCurrentYear || 0),
            buckets: Array.isArray(parsed.buckets) ? parsed.buckets : [],
            realizedTrades: Array.isArray(parsed.realizedTrades) ? parsed.realizedTrades : [],
            lastCalculatedAt: new Date().toISOString(),
            source: "mcp",
          };

          await taxDocRef.set(report, { merge: true });
          return { success: true, report };
        }
      }
    }

    if (taxSnap.exists) {
      return { success: true, report: taxSnap.data() as ScalableTaxReportPayload };
    }

    // Default empty report if no tax tool on MCP server and no cache
    const fallbackReport: ScalableTaxReportPayload = {
      totalActiveLosses: 0,
      potentialTaxSavings: 0,
      lossesExpiringThisYear: 0,
      realizedGainsCurrentYear: 0,
      realizedLossesCurrentYear: 0,
      netRealizedCurrentYear: 0,
      buckets: [],
      realizedTrades: [],
      lastCalculatedAt: new Date().toISOString(),
      source: "calculated",
    };
    return { success: true, report: fallbackReport };
  } catch (err: unknown) {
    const e = err as Error;
    if (taxSnap.exists) {
      return { success: true, report: taxSnap.data() as ScalableTaxReportPayload };
    }
    throw new HttpsError("unavailable", `Errore nel recupero del report fiscale: ${e.message}`);
  } finally {
    if (client) {
      try {
        await client.close();
      } catch (c) {
        console.warn("Error closing client:", c);
      }
    }
  }
});

/**
 * Callable Function to start the official Scalable Capital Device Authorization Grant flow (RFC 8628).
 * Enables seamless connection for any web, mobile, or desktop client with ZERO localhost or CLI dependency.
 */
export const startScalableDeviceAuth = onCall(async (request: CallableRequest<Record<string, never>>) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Devi essere autenticato.");
  }
  const userId = request.auth.uid;

  // 1. Generate EC P-256 key pair for DPoP binding
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }) as string;
  const jwk = publicKey.export({ format: "jwk" });
  const publicJwk = {
    kty: jwk.kty!,
    crv: jwk.crv!,
    x: jwk.x!,
    y: jwk.y!,
  };

  const keyPair = {
    privateKey: privateKeyPem,
    publicJwk,
  };

  // 2. Request device code from Scalable Capital OAuth server (with RFC 9449 DPoP binding)
  const deviceUrl = "https://secure.scalable.capital/oauth/device/code";
  let proof = createDpopProof("POST", deviceUrl, keyPair);

  let deviceRes = await fetch(deviceUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": SCALABLE_USER_AGENT,
      "DPoP": proof,
    },
    body: new URLSearchParams({
      client_id: SCALABLE_CLIENT_ID,
      audience: "https://de.scalable.capital/api-gateway",
      scope: "offline_access openid email",
    }).toString(),
  });

  if (deviceRes.status === 400 || deviceRes.status === 401) {
    const nonce = deviceRes.headers.get("dpop-nonce") || deviceRes.headers.get("DPoP-Nonce");
    if (nonce) {
      proof = createDpopProof("POST", deviceUrl, keyPair, nonce);
      deviceRes = await fetch(deviceUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": SCALABLE_USER_AGENT,
          "DPoP": proof,
        },
        body: new URLSearchParams({
          client_id: SCALABLE_CLIENT_ID,
          audience: "https://de.scalable.capital/api-gateway",
          scope: "offline_access openid email",
        }).toString(),
      });
    }
  }

  const deviceData = (await deviceRes.json().catch(() => ({}))) as {
    device_code?: string;
    user_code?: string;
    verification_uri?: string;
    verification_uri_complete?: string;
    expires_in?: number;
    interval?: number;
    error?: string;
    error_description?: string;
  };

  if (!deviceRes.ok || !deviceData.device_code || !deviceData.user_code) {
    throw new HttpsError(
      "unavailable",
      `Scalable Capital Device Auth error: ${deviceData.error_description || deviceData.error || "Impossibile avviare sessione."}`,
    );
  }

  // 3. Store pending device auth state in Firestore
  const db = getFirestore();
  const pendingDocRef = db.doc(`portfolios/${userId}/settings/scalable_device_auth_pending`);
  const expiresIn = deviceData.expires_in || 900;
  await pendingDocRef.set({
    deviceCode: deviceData.device_code,
    userCode: deviceData.user_code,
    dpopPrivateKey: privateKeyPem,
    dpopPublicKeyJwk: publicJwk,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  });

  return {
    userCode: deviceData.user_code,
    verificationUri: deviceData.verification_uri || "https://secure.scalable.capital/activate",
    verificationUriComplete:
      deviceData.verification_uri_complete ||
      `https://secure.scalable.capital/activate?user_code=${encodeURIComponent(deviceData.user_code)}`,
    expiresIn,
    interval: deviceData.interval || 5,
  };
});

/**
 * Callable Function to poll Scalable Capital for device code authorization.
 */
export const pollScalableDeviceAuth = onCall(async (request: CallableRequest<Record<string, never>>) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Devi essere autenticato.");
  }
  const userId = request.auth.uid;
  const db = getFirestore();
  const pendingDocRef = db.doc(`portfolios/${userId}/settings/scalable_device_auth_pending`);
  const pendingSnap = await pendingDocRef.get();

  if (!pendingSnap.exists) {
    return { status: "not_found", message: "Nessuna sessione di autorizzazione in sospeso." };
  }

  const pending = pendingSnap.data() as {
    deviceCode: string;
    userCode: string;
    dpopPrivateKey: string;
    dpopPublicKeyJwk: { kty: string; crv: string; x: string; y: string };
    expiresAt: string;
    mfaSessionId?: string;
    accessToken?: string;
    refreshToken?: string;
    idToken?: string;
    expiresIn?: number;
    personId?: string;
  };

  if (new Date(pending.expiresAt) < new Date()) {
    await pendingDocRef.delete();
    return { status: "expired", message: "Codice sessione scaduto. Riprova." };
  }

  const keyPair = {
    privateKey: pending.dpopPrivateKey,
    publicJwk: pending.dpopPublicKeyJwk,
  };

  // Phase 2: If we are already waiting for 2FA smartphone confirmation
  if (pending.mfaSessionId && pending.accessToken && pending.personId) {
    try {
      const mfaStatus = await validate2faOnLogin(
        keyPair,
        pending.accessToken,
        pending.personId,
        pending.mfaSessionId,
      );
      console.log(`[Scalable 2FA] session ${pending.mfaSessionId} status: ${mfaStatus}`);

      if (mfaStatus === "SUCCESS") {
        const expiresAt = pending.expiresIn ?
          new Date(Date.now() + pending.expiresIn * 1000).toISOString() :
          undefined;

        const extractedSessionId = extractSessionIdFromToken(pending.accessToken, pending.idToken);
        const configDocRef = db.doc(`portfolios/${userId}/settings/integration_scalable`);
        await configDocRef.set(
          {
            enabled: true,
            apiToken: pending.accessToken,
            refreshToken: pending.refreshToken || null,
            idToken: pending.idToken || null,
            sessionId: extractedSessionId || null,
            tokenExpiresAt: expiresAt,
            dpopPrivateKey: pending.dpopPrivateKey,
            dpopPublicKeyJwk: pending.dpopPublicKeyJwk,
            serverUrl: DEFAULT_SCALABLE_MCP_URL,
            status: "connected",
            readOnly: true,
            autoSync: true,
            lastTestedAt: new Date().toISOString(),
            errorMessage: FieldValue.delete(),
          },
          { merge: true },
        );

        await pendingDocRef.delete();

        return {
          status: "authorized",
          success: true,
          message: "Conto Scalable Capital collegato con successo!",
          expiresIn: pending.expiresIn,
        };
      }

      if (mfaStatus === "PENDING" || !mfaStatus) {
        return {
          status: "2fa_pending",
          message: "📱 In attesa di approvazione della notifica 2FA sul tuo smartphone...",
        };
      }

      // If DENY or TIMEOUT_RETRY
      await pendingDocRef.delete();
      return {
        status: "denied",
        message: mfaStatus === "DENY" ?
          "Accesso rifiutato dall'app sullo smartphone." :
          "Richiesta 2FA scaduta sullo smartphone. Riprova il collegamento.",
      };
    } catch (valErr) {
      console.warn("[Scalable 2FA] Error polling 2FA validation status:", valErr);
      return {
        status: "2fa_pending",
        message: "📱 In attesa di approvazione della notifica 2FA sul tuo smartphone...",
      };
    }
  }

  // Phase 1: Browser OAuth Device Code polling
  const tokenUrl = "https://secure.scalable.capital/oauth/token";
  let proof = createDpopProof("POST", tokenUrl, keyPair);

  let tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": SCALABLE_USER_AGENT,
      "DPoP": proof,
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: pending.deviceCode,
      client_id: "yBM3BrpRgwSTJZRdJllvtD6jJEmyxWfE",
    }).toString(),
  });

  // Handle DPoP Nonce retry as required by RFC 9449
  if (tokenRes.status === 400 || tokenRes.status === 401) {
    const nonce = tokenRes.headers.get("dpop-nonce") || tokenRes.headers.get("DPoP-Nonce");
    if (nonce) {
      proof = createDpopProof("POST", tokenUrl, keyPair, nonce);
      tokenRes = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": SCALABLE_USER_AGENT,
          "DPoP": proof,
        },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: pending.deviceCode,
          client_id: "yBM3BrpRgwSTJZRdJllvtD6jJEmyxWfE",
        }).toString(),
      });
    }
  }

  const tokenData = (await tokenRes.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (tokenRes.ok && tokenData.access_token) {
    const personId = extractPersonIdFromToken(tokenData.access_token, tokenData.id_token);
    if (!personId) {
      console.error("[Scalable Device Auth] Impossibile estrarre personId dai token", tokenData);
      throw new HttpsError("internal", "Impossibile estrarre l'identificativo account dai token Scalable.");
    }

    // Check if 2FA Trusted Device challenge is required on login
    let requires2fa = false;
    let mfaSessionId: string | null = null;
    try {
      const twoFaState = await fetchLogin2faState(keyPair, tokenData.access_token, personId);
      console.log("[Scalable Device Auth] 2FA status check:", twoFaState);
      if (twoFaState.enabled && !twoFaState.hasApprovedSession) {
        requires2fa = true;
        mfaSessionId = await start2faOnLogin(keyPair, tokenData.access_token, personId);
        console.log("[Scalable Device Auth] Triggered 2FA challenge, mfaSessionId:", mfaSessionId);
      }
    } catch (twoFaErr) {
      console.warn("[Scalable Device Auth] Warning during 2FA state check/start:", twoFaErr);
    }

    if (requires2fa && mfaSessionId) {
      await pendingDocRef.update({
        mfaSessionId,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        idToken: tokenData.id_token || null,
        expiresIn: tokenData.expires_in || 3600,
        personId,
      });

      return {
        status: "2fa_pending",
        message: "📱 Notifica 2FA inviata! Apri l'app Scalable Capital sul tuo smartphone e tocca 'Conferma' per completare l'accesso.",
      };
    }

    // No 2FA required or already approved
    const expiresAt = tokenData.expires_in ?
      new Date(Date.now() + tokenData.expires_in * 1000).toISOString() :
      undefined;

    const extractedSessionId = extractSessionIdFromToken(tokenData.access_token, tokenData.id_token);
    const configDocRef = db.doc(`portfolios/${userId}/settings/integration_scalable`);
    await configDocRef.set(
      {
        enabled: true,
        apiToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        idToken: tokenData.id_token || null,
        sessionId: extractedSessionId || null,
        tokenExpiresAt: expiresAt,
        dpopPrivateKey: pending.dpopPrivateKey,
        dpopPublicKeyJwk: pending.dpopPublicKeyJwk,
        serverUrl: DEFAULT_SCALABLE_MCP_URL,
        status: "connected",
        readOnly: true,
        autoSync: true,
        lastTestedAt: new Date().toISOString(),
        errorMessage: FieldValue.delete(),
      },
      { merge: true },
    );

    await pendingDocRef.delete();

    return {
      status: "authorized",
      success: true,
      message: "Conto Scalable Capital collegato con successo!",
      expiresIn: tokenData.expires_in,
    };
  }

  if (tokenData.error === "authorization_pending") {
    return { status: "pending" };
  }
  if (tokenData.error === "slow_down") {
    return { status: "slow_down" };
  }
  if (tokenData.error === "expired_token") {
    await pendingDocRef.delete();
    return { status: "expired", message: "Codice di autorizzazione scaduto. Riprova." };
  }
  if (tokenData.error === "access_denied") {
    await pendingDocRef.delete();
    return { status: "denied", message: "Accesso rifiutato dall'utente su Scalable Capital." };
  }

  return {
    status: "error",
    message: tokenData.error_description || tokenData.error || "Verifica autorizzazione in corso...",
  };
});

/**
 * Callable Function to generate Scalable Capital OAuth 2.0 PKCE authorization URL (Legacy/Localhost).
 */
export const getScalableAuthUrl = onCall(async (request: CallableRequest<{ redirectUri: string }>) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Devi essere autenticato.");
  }
  const rawRedirect = request.data?.redirectUri || "http://localhost:8081/integrations/scalable";
  const redirectUri = rawRedirect.split("?")[0].split("#")[0];

  // Dynamically register client for this redirect URI
  let clientId: string;
  try {
    const regRes = await fetch("https://mcp.scalable.capital/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Portfolio Finance App",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    });

    const regData = (await regRes.json()) as { client_id?: string; error?: string; error_description?: string };
    if (!regRes.ok || !regData.client_id) {
      throw new Error(regData.error_description || regData.error || "Impossibile registrare client OAuth.");
    }
    clientId = regData.client_id;
  } catch (err: unknown) {
    const e = err as Error;
    throw new HttpsError(
      "failed-precondition",
      `Scalable Capital OAuth: ${e.message}`,
    );
  }

  // Generate PKCE code_verifier and code_challenge
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("hex");

  const authUrl = `https://mcp.scalable.capital/authorize?client_id=${encodeURIComponent(
    clientId,
  )}&response_type=code&redirect_uri=${encodeURIComponent(
    redirectUri,
  )}&scope=openid%20profile%20offline_access&code_challenge=${encodeURIComponent(
    codeChallenge,
  )}&code_challenge_method=S256&state=${encodeURIComponent(state)}`;

  return {
    authUrl,
    state,
    codeVerifier,
    clientId,
    redirectUri,
  };
});

/**
 * Callable Function to exchange authorization code for Bearer token and save to Firestore (Legacy/Localhost).
 */
export const exchangeScalableAuthCode = onCall(
  async (
    request: CallableRequest<{
      code: string;
      codeVerifier: string;
      clientId: string;
      redirectUri: string;
    }>,
  ) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Devi essere autenticato.");
    }
    const userId = request.auth.uid;
    const { code, codeVerifier, clientId, redirectUri } = request.data || {};

    if (!code || !codeVerifier || !clientId || !redirectUri) {
      throw new HttpsError("invalid-argument", "Parametri OAuth mancanti.");
    }

    const bodyParams = new URLSearchParams();
    bodyParams.append("grant_type", "authorization_code");
    bodyParams.append("client_id", clientId);
    bodyParams.append("code", code);
    bodyParams.append("redirect_uri", redirectUri);
    bodyParams.append("code_verifier", codeVerifier);

    const tokenRes = await fetch("https://mcp.scalable.capital/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: bodyParams.toString(),
    });

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || !tokenData.access_token) {
      throw new HttpsError(
        "unavailable",
        tokenData.error_description || tokenData.error || "Scambio codice di autorizzazione fallito.",
      );
    }

    const db = getFirestore();
    const configDocRef = db.doc(`portfolios/${userId}/settings/integration_scalable`);
    let expiresAt: string | undefined;
    if (tokenData.expires_in) {
      expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
    }

    await configDocRef.set(
      {
        enabled: true,
        apiToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        tokenExpiresAt: expiresAt,
        serverUrl: DEFAULT_SCALABLE_MCP_URL,
        status: "connected",
        readOnly: true,
        autoSync: true,
        lastTestedAt: new Date().toISOString(),
        errorMessage: FieldValue.delete(),
      },
      { merge: true },
    );

    return {
      success: true,
      message: "Conto Scalable Capital connesso con successo!",
      expiresIn: tokenData.expires_in,
    };
  },
);

/**
 * Callable Function to proactively refresh the Scalable Capital session token.
 */
export const refreshScalableSession = onCall(
  async (request: CallableRequest<Record<string, never>>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Devi essere autenticato.");
    }
    const userId = request.auth.uid;
    const db = getFirestore();

    const configDocRef = db.doc(`portfolios/${userId}/settings/integration_scalable`);
    const configSnap = await configDocRef.get();
    if (!configSnap.exists) {
      throw new HttpsError("failed-precondition", "Integrazione Scalable Capital non configurata.");
    }

    const config = configSnap.data();
    if (!config || !config.refreshToken || !config.dpopPrivateKey || !config.dpopPublicKeyJwk) {
      throw new HttpsError("failed-precondition", "Credenziali o refresh token Scalable mancanti.");
    }

    const keyPair: ScalableKeyPair = {
      privateKey: config.dpopPrivateKey as string,
      publicJwk: config.dpopPublicKeyJwk as { kty: string; crv: string; x: string; y: string },
    };

    try {
      await refreshScalableToken(
        config.refreshToken as string,
        keyPair,
        userId,
        db,
        config.apiToken as string | undefined,
        config.idToken as string | undefined,
        config.sessionId as string | undefined,
      );

      return {
        success: true,
        message: "Sessione Scalable Capital rinnovata con successo.",
        refreshedAt: new Date().toISOString(),
      };
    } catch (e: unknown) {
      const refreshErr = e as ScalableRefreshError;
      console.error("[refreshScalableSession] Error refreshing session:", refreshErr);
      if (refreshErr?.isInvalidGrant || refreshErr?.oauthError === "invalid_grant") {
        await configDocRef.update({
          status: "expired",
          errorMessage: "Sessione scaduta o revocata da Scalable Capital. Effettua nuovamente il login.",
        }).catch(() => {});
        throw new HttpsError(
          "unauthenticated",
          "La sessione con Scalable Capital è scaduta o revocata. È necessario ripetere l'accesso.",
        );
      }
      throw new HttpsError(
        "unavailable",
        `Impossibile rinnovare la sessione Scalable: ${refreshErr.message}`,
      );
    }
  },
);

/**
 * Callable Function to disconnect and completely purge Scalable Capital integration configuration.
 */
export const disconnectScalableAccount = onCall(
  async (request: CallableRequest<Record<string, never>>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Devi essere autenticato.");
    }
    const userId = request.auth.uid;
    const db = getFirestore();

    await Promise.allSettled([
      db.doc(`portfolios/${userId}/settings/integration_scalable`).delete(),
      db.doc(`portfolios/${userId}/settings/scalable_device_auth_pending`).delete(),
      db.doc(`portfolios/${userId}/settings/scalable_savings_plans`).delete(),
      db.doc(`portfolios/${userId}/settings/scalable_price_alerts`).delete(),
      db.doc(`portfolios/${userId}/settings/scalable_tax_report`).delete(),
    ]);

    return {
      success: true,
      message: "Integrazione Scalable Capital disconnessa con successo.",
    };
  },
);

