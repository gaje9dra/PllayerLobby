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
  if (value == null || !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number.toFixed(2) : null;
}
