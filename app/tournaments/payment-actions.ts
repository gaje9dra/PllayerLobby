"use server";

import { createPaymentForRegistration, type PaymentInitiationResult } from "@/lib/payment";

export type PaymentActionState = PaymentInitiationResult | { ok: false };

export async function initiateTournamentPayment(
  _previousState: PaymentActionState,
  formData: FormData,
): Promise<PaymentInitiationResult> {
  const registrationId = String(formData.get("registrationId") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!registrationId) {
    return {
      ok: false,
      code: "REGISTRATION_NOT_FOUND",
      message: "This registration is no longer available.",
    };
  }

  return createPaymentForRegistration(registrationId, phone);
}
