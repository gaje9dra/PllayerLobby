import "server-only";

type TokenCache = { accessToken: string; refreshToken?: string; expiresAt: number };
let tokenCache: TokenCache | null = null;
let tokenPromise: Promise<string> | null = null;

export type PayUPayoutEnvironment = "TEST" | "PRODUCTION";
export type PayUPaymentType = "UPI" | "IMPS" | "NEFT" | "RTGS";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required PayU payout environment variable: ${name}`);
  return value;
}

export function getPayUPayoutConfig() {
  const environment = (process.env.PAYU_PAYOUT_ENVIRONMENT?.trim().toUpperCase() || "TEST") as PayUPayoutEnvironment;
  if (environment !== "TEST" && environment !== "PRODUCTION") throw new Error("PAYU_PAYOUT_ENVIRONMENT must be TEST or PRODUCTION.");
  if (environment === "PRODUCTION" && process.env.PAYU_PAYOUT_PRODUCTION_ENABLED !== "true") throw new Error("PayU production payouts are disabled by the application safety switch.");
  return { environment, merchantId: required("PAYU_PAYOUT_MERCHANT_ID"), clientId: required("PAYU_PAYOUT_CLIENT_ID"), clientSecret: required("PAYU_PAYOUT_CLIENT_SECRET"), webhookSecret: required("PAYU_PAYOUT_WEBHOOK_SECRET") };
}

function baseUrl(environment: PayUPayoutEnvironment) { return environment === "PRODUCTION" ? "https://payout.payumoney.com" : "https://uatoneapi.payu.in"; }
function authUrl(environment: PayUPayoutEnvironment) { return environment === "PRODUCTION" ? "https://accounts.payu.in/oauth/token" : "https://uat-accounts.payu.in/oauth/token"; }

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(15_000) });
  const text = await response.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!response.ok) {
    const safe = body && typeof body === "object" && "msg" in body ? String((body as { msg?: unknown }).msg ?? "Provider request failed").replace(/[\r\n]+/g, " ").slice(0, 300) : "Provider request failed";
    const error = new Error(`PAYU_HTTP_${response.status}:${safe}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return body;
}

function parseTokenResponse(response: unknown) {
  if (!response || typeof response !== "object") throw new Error("PAYU_AUTH_INVALID_RESPONSE");
  const value = response as Record<string, unknown>;
  const accessToken = typeof value.access_token === "string" ? value.access_token : "";
  const expiresIn = Number(value.expires_in);
  const refreshToken = typeof value.refresh_token === "string" ? value.refresh_token : undefined;
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) throw new Error("PAYU_AUTH_INVALID_RESPONSE");
  return { accessToken, expiresIn, refreshToken };
}

async function authenticateWithClientCredentials() {
  const config = getPayUPayoutConfig();
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: config.clientId, client_secret: config.clientSecret, scope: "create_payout_transactions" });
  return parseTokenResponse(await requestJson(authUrl(config.environment), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "cache-control": "no-cache" }, body }));
}

async function authenticateWithRefreshToken(refreshToken: string) {
  const config = getPayUPayoutConfig();
  const body = new URLSearchParams({ grant_type: "refresh_token", client_id: config.clientId, refresh_token: refreshToken });
  return parseTokenResponse(await requestJson(authUrl(config.environment), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "cache-control": "no-cache" }, body }));
}

async function fetchAccessToken(forceRefresh = false) {
  if (!forceRefresh && tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.accessToken;
  if (tokenPromise) return tokenPromise;
  tokenPromise = (async () => {
    let response;
    if (tokenCache?.refreshToken) {
      try { response = await authenticateWithRefreshToken(tokenCache.refreshToken); } catch { response = await authenticateWithClientCredentials(); }
    } else {
      response = await authenticateWithClientCredentials();
    }
    tokenCache = { accessToken: response.accessToken, refreshToken: response.refreshToken ?? tokenCache?.refreshToken, expiresAt: Date.now() + response.expiresIn * 1000 };
    return response.accessToken;
  })().finally(() => { tokenPromise = null; });
  return tokenPromise;
}

async function withAuth<T>(operation: (token: string, config: ReturnType<typeof getPayUPayoutConfig>) => Promise<T>) {
  const config = getPayUPayoutConfig();
  let token = await fetchAccessToken();
  try { return await operation(token, config); } catch (error) {
    if ((error as Error & { status?: number }).status !== 401) throw error;
    tokenCache = null;
    token = await fetchAccessToken(true);
    return operation(token, config);
  }
}

function authHeaders(token: string, merchantId: string) { return { Authorization: `Bearer ${token}`, payoutMerchantId: merchantId, "Content-Type": "application/json" }; }

export type PayUBeneficiaryInput = { name: string; email?: string; mobile?: string; accountNo?: string; ifsc?: string; vpa?: string };
export async function createPayUBeneficiary(input: PayUBeneficiaryInput) { return withAuth(async (token, config) => requestJson(`${baseUrl(config.environment)}/payout/beneficiary`, { method: "POST", headers: authHeaders(token, config.merchantId), body: JSON.stringify(input) })); }

export async function validatePayUVpa(vpa: string) {
  return withAuth(async (token, config) => {
    const url = new URL(`${baseUrl(config.environment)}/payout/merchant/validateVpa`);
    url.searchParams.set("vpa", vpa);
    return requestJson(url.toString(), { method: "POST", headers: { Authorization: `Bearer ${token}`, payoutMerchantId: config.merchantId, "Content-Type": "application/x-www-form-urlencoded" } });
  });
}

export type PayUTransferInput = { beneficiaryName: string; beneficiaryEmail?: string; beneficiaryMobile?: string; beneficiaryAccountNumber?: string; beneficiaryIfscCode?: string; vpa?: string; purpose: string; amount: number; batchId: string; merchantRefId: string; paymentType: PayUPaymentType; retry: boolean };
export async function initiatePayUTransfer(input: PayUTransferInput) {
  return withAuth(async (token, config) => {
    const url = new URL(`${baseUrl(config.environment)}/payout/v2/payment`);
    url.searchParams.set("pid", config.merchantId);
    return requestJson(url.toString(), { method: "POST", headers: authHeaders(token, config.merchantId), body: JSON.stringify([input]) });
  });
}

export async function getPayUTransferStatus(merchantRefId: string) {
  return withAuth(async (token, config) => {
    const body = new URLSearchParams({ merchantRefId, page: "1", pageSize: "100" });
    return requestJson(`${baseUrl(config.environment)}/payout/payment/listTransactions`, { method: "POST", headers: { Authorization: `Bearer ${token}`, payoutMerchantId: config.merchantId, "Content-Type": "application/x-www-form-urlencoded", "cache-control": "no-cache" }, body });
  });
}

export function clearPayUPayoutTokenCacheForTests() { tokenCache = null; tokenPromise = null; }
