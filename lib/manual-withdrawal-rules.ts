const MAX_MANUAL_PAYMENT_REFERENCE_LENGTH = 128;

export function validateManualPaymentReference(value: string) {
  const reference = value.trim();
  if (reference.length < 4 || reference.length > MAX_MANUAL_PAYMENT_REFERENCE_LENGTH || !/^[A-Za-z0-9][A-Za-z0-9 ._:/-]*$/.test(reference)) {
    throw new Error("INVALID_MANUAL_PAYMENT_REFERENCE");
  }
  return reference;
}
