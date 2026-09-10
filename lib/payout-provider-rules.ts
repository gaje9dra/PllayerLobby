import { compareMoney } from "@/lib/wallet-rules";

function safeMessage(value: unknown) { return String(value ?? "Provider request failed").replace(/[\r\n]+/g, " ").slice(0, 1000); }

export type ProviderTransferResult =
  | { state: "UNKNOWN" }
  | { state: "MISMATCH" }
  | { state: "PROCESSING"; providerReference?: string }
  | { state: "SUCCESS"; providerReference?: string; bankReference?: string }
  | { state: "FAILED"; providerReference?: string; message: string };

export function interpretPayUTransferStatus(response: unknown, merchantRefId: string, expectedAmount: string, expectedCurrency: string): ProviderTransferResult {
  const root = response && typeof response === "object" ? response as Record<string, unknown> : {};
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : {};
  const rows = Array.isArray(data.transactionDetails) ? data.transactionDetails : [];
  const row = rows.find((item) => item && typeof item === "object" && String((item as Record<string, unknown>).merchantRefId ?? "") === merchantRefId) as Record<string, unknown> | undefined;
  if (!row) return { state: "UNKNOWN" };
  const providerAmount = row.amount === undefined ? null : String(row.amount);
  if (providerAmount !== null && compareMoney(providerAmount, expectedAmount) !== 0) return { state: "MISMATCH" };
  if (expectedCurrency !== "INR") return { state: "MISMATCH" };
  const status = String(row.txnStatus ?? "").toUpperCase();
  const providerReference = String(row.payuTransactionRefNo ?? "");
  const bankReference = String(row.bankTransactionRefNo ?? "");
  if (status === "SUCCESS") return { state: "SUCCESS", providerReference, bankReference };
  if (status === "FAILED") return { state: "FAILED", providerReference, message: safeMessage(row.msg ?? row.txnStatusDescription) };
  return { state: "PROCESSING", providerReference };
}
