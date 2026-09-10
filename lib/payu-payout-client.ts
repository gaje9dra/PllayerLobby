import "server-only";

export type PayUPayoutEnvironment = "TEST" | "PRODUCTION";
export type PayUPaymentType = "UPI" | "IMPS" | "NEFT" | "RTGS";

type TokenCache = { accessToken: string; expiresAt: number };
let tokenCache: TokenCache | null = null;
let tokenPromise: Promise<string> | null = null;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_MISSING`);
  return value;
}

export function getPayUPayoutConfig() {
  const environment = (process.env.PAYU_PAYOUT_ENVIRONMENT?.trim().toUpperCase() || "TEST") as PayUPayoutEnvironment;
  if (environment !== "TEST" && environment !== "PRODUCTION") throw new Error("PAYU_PAYOUT_ENVIRONMENT_INVALID");
  if (environment === "PRODUCTION" && process.env.PAYU_PAYOUT_PRODUCTION_ENABLED !== "true") throw new Error("PAYU_PAYOUT_PRODUCTION_DISABLED");
  return {
    environment,
    merchantId: required("PAYU_PAYOUT_MERCHANT_ID"),
    clientId: required("PAYU_PAYOUT_CLIENT_ID"),
    clientSecret: required("PAYU_PAYOUT_CLIENT_SECRET"),
    webhookSecret: required("PAYU_PAYOUT_WEBHOOK_SECRET"),
  };
}

function base(environment: PayUPayoutEnvironment) {
  return environment === "TEST" ? "https://uatoneapi.payu.in" : "https://payout.payumoney.com";
}

function accountsBase(environment: PayUPayoutEnvironment) {
  return environment === "TEST" ? "https://uat-accounts.payu.in" : "https://accounts.payu.in";
}

async function readJson(response: Response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) as unknown : null; } catch { throw new Error("PAYU_INVALID_RESPONSE"); }
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(input, { ...init, signal: controller.signal, cache: "no-store" }); }
  finally { clearTimeout(timeout); }
}

async function generateAccessToken(force = false) {
  const config = getPayUPayoutConfig();
  const now = Date.now();
  if (!force && tokenCache && tokenCache.expiresAt > now + 60_000) return tokenCache.accessToken;
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: config.clientId, client_secret: config.clientSecret, scope: "create_payout_transactions" });
  const response = await fetchWithTimeout(`${accountsBase(config.environment)}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error("PAYU_AUTH_FAILED");
  const data = await readJson(response);
  if (!data || typeof data !== "object") throw new Error("PAYU_AUTH_FAILED");
  const accessToken = String((data as Record<string, unknown>).access_token ?? "");
  const expiresIn = Number((data as Record<string, unknown>).expires_in ?? (data as Record<string, unknown>).expire_in ?? 0);
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) throw new Error("PAYU_AUTH_FAILED");
  tokenCache = { accessToken, expiresAt: now + expiresIn * 1000 };
  return accessToken;
}

export async function getAccessToken() {
  if (!tokenPromise) tokenPromise = generateAccessToken().finally(() => { tokenPromise = null; });
  return tokenPromise;
}

async function requestPayout(path: string, init: RequestInit, retry401 = true) {
  const config = getPayUPayoutConfig();
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  headers.set("payoutMerchantId", config.merchantId);
  headers.set("content-type", headers.get("content-type") || "application/json");
  const response = await fetchWithTimeout(`${base(config.environment)}${path}`, { ...init, headers });
  if (response.status === 401 && retry401) {
    tokenCache = null;
    const fresh = await generateAccessToken(true);
    const retryHeaders = new Headers(init.headers);
    retryHeaders.set("authorization", `Bearer ${fresh}`);
    retryHeaders.set("payoutMerchantId", config.merchantId);
    retryHeaders.set("content-type", retryHeaders.get("content-type") || "application/json");
    return fetchWithTimeout(`${base(config.environment)}${path}`, { ...init, headers: retryHeaders });
  }
  return response;
}

export async function createBeneficiary(input: { name?: string; email?: string; mobile?: string; accountNo?: string; ifsc?: string; vpa?: string }) {
  const response = await requestPayout("/payout/beneficiary", { method: "POST", body: JSON.stringify(input) });
  if (!response.ok) throw new Error("PAYU_BENEFICIARY_HTTP_ERROR");
  const data = await readJson(response);
  return data;
}

export async function getBeneficiary(beneficiaryId: string) {
  const response = await requestPayout(`/payout/beneficiary?beneficiaryId=${encodeURIComponent(beneficiaryId)}`, { method: "GET" });
  if (!response.ok) throw new Error("PAYU_BENEFICIARY_LOOKUP_FAILED");
  return readJson(response);
}

export async function validateVPA(vpa: string) {
  const config = getPayUPayoutConfig();
  const token = await getAccessToken();
  const url = `${base(config.environment)}/payout/merchant/validateVpa?vpa=${encodeURIComponent(vpa)}`;
  const headers = new Headers({ authorization: `Bearer ${token}`, payoutMerchantId: config.merchantId, "content-type": "application/x-www-form-urlencoded" });
  let response = await fetchWithTimeout(url, { method: "POST", headers });
  if (response.status === 401) {
    tokenCache = null;
    const fresh = await generateAccessToken(true);
    headers.set("authorization", `Bearer ${fresh}`);
    response = await fetchWithTimeout(url, { method: "POST", headers });
  }
  if (!response.ok) throw new Error("PAYU_VPA_HTTP_ERROR");
  return readJson(response);
}

export async function initiateTransfer(input: { beneficiaryName: string; beneficiaryEmail?: string; beneficiaryMobile?: string; accountNumber?: string; ifsc?: string; vpa?: string; purpose: string; amount: number; batchId: string; merchantRefId: string; paymentType: PayUPaymentType; retry: boolean }) {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(input.merchantRefId)) throw new Error("INVALID_MERCHANT_REFERENCE");
  const payload: Record<string, unknown> = {
    beneficiaryName: input.beneficiaryName,
    beneficiaryEmail: input.beneficiaryEmail,
    beneficiaryMobile: input.beneficiaryMobile,
    purpose: input.purpose,
    amount: input.amount,
    batchId: input.batchId,
    merchantRefId: input.merchantRefId,
    paymentType: input.paymentType,
    retry: input.retry,
  };
  if (input.paymentType === "UPI") payload.vpa = input.vpa;
  else {
    payload.beneficiaryAccountNumber = input.accountNumber;
    payload.beneficiaryIfscCode = input.ifsc;
  }
  const response = await requestPayout(`/payout/v2/payment?pid=${encodeURIComponent(getPayUPayoutConfig().merchantId)}`, { method: "POST", body: JSON.stringify([payload]) });
  if (!response.ok) {
    if (response.status >= 500) throw new Error("PAYU_TRANSFER_UNCERTAIN");
    throw new Error("PAYU_TRANSFER_HTTP_ERROR");
  }
  return readJson(response);
}

export async function getTransferStatus(merchantRefId: string) {
  const body = new URLSearchParams({ merchantRefId, page: "1", pageSize: "100" });
  const response = await requestPayout("/payout/payment/listTransactions", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error("PAYU_STATUS_LOOKUP_FAILED");
  return readJson(response);
}

export function clearPayUTokenCacheForTests() {
  tokenCache = null;
}
