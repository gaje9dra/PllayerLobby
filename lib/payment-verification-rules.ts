export type PayUPaymentFieldSet = {
  txnid: string | null;
  amount: string | null;
  productinfo: string | null;
  firstname: string | null;
  email: string | null;
  phone: string | null;
};

export function matchesAuthoritativePaymentFields(actual: PayUPaymentFieldSet, expected: PayUPaymentFieldSet) {
  return actual.txnid === expected.txnid &&
    actual.amount === expected.amount &&
    actual.productinfo === expected.productinfo &&
    actual.firstname === expected.firstname &&
    actual.email === expected.email &&
    actual.phone === expected.phone;
}

export function normalizePaymentAmount(value: string | null | undefined) {
  if (value == null) return null;
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const canonicalWhole = whole.replace(/^0+(?=\d)/, "");
  return `${canonicalWhole}.${fraction.padEnd(2, "0")}`;
}
