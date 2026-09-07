import "server-only";

import { generatePayUVerifyPaymentHash, getPayUConfig } from "@/lib/payu";

export type PayUVerificationState = "SUCCESS" | "FAILED" | "PENDING" | "UNKNOWN";

export type PayUVerificationTransaction = {
  txnid: string;
  mihpayid: string | null;
  status: string;
  unmappedstatus: string;
  amount: string | null;
  transactionAmount: string | null;
  productinfo: string | null;
  firstname: string | null;
  email: string | null;
  phone: string | null;
};

export type PayUVerificationResult = {
  state: PayUVerificationState;
  transaction: PayUVerificationTransaction | null;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? null : String(value);
}

function normalizeStatus(value: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function mapPayUStatus(status: string, unmappedStatus: string): PayUVerificationState {
  if (unmappedStatus === "captured" || unmappedStatus === "auth" || status === "success") return "SUCCESS";
  if (unmappedStatus === "failed" || unmappedStatus === "bounced" || unmappedStatus === "dropped" || unmappedStatus === "usercancelled" || unmappedStatus === "autorefund" || status === "failure" || status === "failed") return "FAILED";
  if (unmappedStatus === "pending" || unmappedStatus === "initiated" || unmappedStatus === "in progress" || status === "pending") return "PENDING";
  return "UNKNOWN";
}

function parseTransaction(raw: unknown, merchantTransactionId: string): PayUVerificationTransaction | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const txnid = stringValue(value.txnid);
  if (!txnid || txnid !== merchantTransactionId) return null;

  return {
    txnid,
    mihpayid: stringValue(value.mihpayid ?? value.mihpayupid),
    status: normalizeStatus(stringValue(value.status)),
    unmappedstatus: normalizeStatus(stringValue(value.unmappedstatus)),
    amount: stringValue(value.amt ?? value.amount),
    transactionAmount: stringValue(value.transaction_amount),
    productinfo: stringValue(value.productinfo),
    firstname: stringValue(value.firstname),
    email: stringValue(value.email),
    phone: stringValue(value.phone),
  };
}

export async function verifyPayUTransaction(merchantTransactionId: string): Promise<PayUVerificationResult> {
  const config = getPayUConfig();
  const hash = generatePayUVerifyPaymentHash({ key: config.merchantKey, txnid: merchantTransactionId, salt: config.merchantSalt });
  const body = new URLSearchParams({
    key: config.merchantKey,
    command: "verify_payment",
    var1: merchantTransactionId,
    hash,
  });

  try {
    const response = await fetch(config.verifyPaymentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return { state: "UNKNOWN", transaction: null };

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") return { state: "UNKNOWN", transaction: null };

    const root = payload as Record<string, unknown>;
    if (Number(root.status) !== 1) return { state: "UNKNOWN", transaction: null };

    const transactionDetails = root.transaction_details;
    if (!transactionDetails || typeof transactionDetails !== "object") return { state: "UNKNOWN", transaction: null };

    const details = transactionDetails as Record<string, unknown>;
    const rawTransaction = details[merchantTransactionId];
    const transaction = parseTransaction(rawTransaction, merchantTransactionId);
    if (!transaction) return { state: "UNKNOWN", transaction: null };

    return {
      state: mapPayUStatus(transaction.status, transaction.unmappedstatus),
      transaction,
    };
  } catch (error) {
    console.error("PayU server verification request failed", {
      merchantTransactionId,
      error: error instanceof Error ? error.name : "unknown",
    });
    return { state: "UNKNOWN", transaction: null };
  }
}
