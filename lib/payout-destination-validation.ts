const UPI_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,254}@[A-Za-z0-9.-]{2,64}$/;
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_PATTERN = /^\d{9,18}$/;
const NAME_PATTERN = /^[\p{L}][\p{L} .'-]{1,99}$/u;
const MAX_DISPLAY_NAME = 100;

export type PayoutDestinationInput =
  | { type: "UPI"; displayName: string; upiId: string }
  | { type: "BANK_ACCOUNT"; displayName: string; accountHolderName: string; accountNumber: string; ifsc: string; bankName: string };

type StoredPayoutData =
  | { version: 1; type: "UPI"; upiId: string }
  | { version: 1; type: "BANK_ACCOUNT"; accountHolderName: string; accountNumber: string; ifsc: string; bankName: string };

function cleanText(value: string, max: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/.test(value)) return null;
  return normalized;
}

export function validatePayoutDestinationInput(input: PayoutDestinationInput): { displayName: string; data: StoredPayoutData; maskedDestination: string } | null {
  const displayName = cleanText(input.displayName, MAX_DISPLAY_NAME);
  if (!displayName) return null;

  if (input.type === "UPI") {
    const rawUpiId = input.upiId;
    if (/[^\x20-\x7e]/.test(rawUpiId)) return null;
    const upiId = rawUpiId.trim().toLowerCase();
    if (!UPI_PATTERN.test(upiId)) return null;
    const at = upiId.indexOf("@");
    const local = upiId.slice(0, at);
    const domain = upiId.slice(at + 1);
    const maskedLocal = `${local.slice(0, Math.min(2, local.length))}****`;
    return { displayName, data: { version: 1, type: "UPI", upiId }, maskedDestination: `${maskedLocal}@${domain}` };
  }

  const accountHolderName = cleanText(input.accountHolderName, 100);
  const bankName = cleanText(input.bankName, 100);
  if (/[\u0000-\u001f\u007f]/.test(input.accountNumber) || /[\u0000-\u001f\u007f]/.test(input.ifsc)) return null;
  const accountNumber = input.accountNumber.replace(/[\s-]/g, "");
  const ifsc = input.ifsc.trim().toUpperCase();
  if (!accountHolderName || !NAME_PATTERN.test(accountHolderName) || !bankName || !ACCOUNT_PATTERN.test(accountNumber) || !IFSC_PATTERN.test(ifsc)) return null;
  return { displayName, data: { version: 1, type: "BANK_ACCOUNT", accountHolderName, accountNumber, ifsc, bankName }, maskedDestination: `••••••••${accountNumber.slice(-4)}` };
}
