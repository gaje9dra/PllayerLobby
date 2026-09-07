import "server-only";

import { randomBytes } from "node:crypto";
import { PaymentStatus, RegistrationStatus, TournamentStatus } from "@/app/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPayUConfig, generatePayURequestHash, type PayURequestFields } from "@/lib/payu";

export const PAYMENT_RESULT_CODES = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  USER_NOT_ACTIVE: "USER_NOT_ACTIVE",
  REGISTRATION_NOT_FOUND: "REGISTRATION_NOT_FOUND",
  REGISTRATION_NOT_OWNED: "REGISTRATION_NOT_OWNED",
  REGISTRATION_NOT_PENDING: "REGISTRATION_NOT_PENDING",
  FREE_TOURNAMENT: "FREE_TOURNAMENT",
  TOURNAMENT_UNAVAILABLE: "TOURNAMENT_UNAVAILABLE",
  PAYMENT_ALREADY_SUCCESSFUL: "PAYMENT_ALREADY_SUCCESSFUL",
  PAYMENT_ALREADY_PENDING: "PAYMENT_ALREADY_PENDING",
  PHONE_REQUIRED: "PHONE_REQUIRED",
  INVALID_PHONE: "INVALID_PHONE",
  PAYU_CONFIGURATION_ERROR: "PAYU_CONFIGURATION_ERROR",
  PAYMENT_FAILED: "PAYMENT_FAILED",
} as const;

export type PaymentResultCode = (typeof PAYMENT_RESULT_CODES)[keyof typeof PAYMENT_RESULT_CODES];

export type PaymentInitiationResult =
  | {
      ok: true;
      paymentId: string;
      merchantTransactionId: string;
      checkoutUrl: string;
      fields: PayURequestFields;
    }
  | {
      ok: false;
      code: PaymentResultCode;
      message: string;
    };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHONE_PATTERN = /^[6-9][0-9]{9}$/;

export function generateMerchantTransactionId() {
  return `PL${randomBytes(11).toString("hex")}`;
}

function getCallbackUrl(path: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) throw new Error("Missing required environment variable: NEXT_PUBLIC_APP_URL");
  return new URL(path, appUrl).toString();
}

function firstNameFromUser(name: string | null) {
  return name?.trim().split(/\s+/)[0] || "Player";
}

function paymentMessage(code: PaymentResultCode) {
  switch (code) {
    case PAYMENT_RESULT_CODES.UNAUTHENTICATED: return "Please sign in before proceeding to payment.";
    case PAYMENT_RESULT_CODES.USER_NOT_ACTIVE: return "Your account is not currently eligible for payment.";
    case PAYMENT_RESULT_CODES.REGISTRATION_NOT_FOUND: return "This registration is no longer available.";
    case PAYMENT_RESULT_CODES.REGISTRATION_NOT_OWNED: return "You cannot pay for another user's registration.";
    case PAYMENT_RESULT_CODES.REGISTRATION_NOT_PENDING: return "This registration is not awaiting payment.";
    case PAYMENT_RESULT_CODES.FREE_TOURNAMENT: return "Free tournaments do not require PayU payment.";
    case PAYMENT_RESULT_CODES.TOURNAMENT_UNAVAILABLE: return "This tournament is no longer available for payment.";
    case PAYMENT_RESULT_CODES.PAYMENT_ALREADY_SUCCESSFUL: return "This registration has already been paid successfully.";
    case PAYMENT_RESULT_CODES.PAYMENT_ALREADY_PENDING: return "A payment attempt is already in progress for this registration.";
    case PAYMENT_RESULT_CODES.PHONE_REQUIRED: return "A phone number is required for PayU checkout.";
    case PAYMENT_RESULT_CODES.INVALID_PHONE: return "Enter a valid 10-digit Indian mobile number.";
    case PAYMENT_RESULT_CODES.PAYU_CONFIGURATION_ERROR: return "Payment is temporarily unavailable. Please try again later.";
    case PAYMENT_RESULT_CODES.PAYMENT_FAILED: return "Unable to start payment right now. Please try again.";
  }
}

export async function createPaymentForRegistration(registrationId: string, phoneInput: string): Promise<PaymentInitiationResult> {
  if (!UUID_PATTERN.test(registrationId)) {
    return { ok: false, code: PAYMENT_RESULT_CODES.REGISTRATION_NOT_FOUND, message: paymentMessage(PAYMENT_RESULT_CODES.REGISTRATION_NOT_FOUND) };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, code: PAYMENT_RESULT_CODES.UNAUTHENTICATED, message: paymentMessage(PAYMENT_RESULT_CODES.UNAUTHENTICATED) };
  }
  if (user.status !== "ACTIVE") {
    return { ok: false, code: PAYMENT_RESULT_CODES.USER_NOT_ACTIVE, message: paymentMessage(PAYMENT_RESULT_CODES.USER_NOT_ACTIVE) };
  }

  const submittedPhone = phoneInput.replace(/\s+/g, "");
  if (!user.phone && !PHONE_PATTERN.test(submittedPhone)) {
    return { ok: false, code: submittedPhone ? PAYMENT_RESULT_CODES.INVALID_PHONE : PAYMENT_RESULT_CODES.PHONE_REQUIRED, message: paymentMessage(submittedPhone ? PAYMENT_RESULT_CODES.INVALID_PHONE : PAYMENT_RESULT_CODES.PHONE_REQUIRED) };
  }

  try {
    const config = getPayUConfig();
    return await prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "Registration"
        WHERE "id" = CAST(${registrationId} AS UUID)
        FOR UPDATE
      `;

      if (lockedRows.length === 0) return { ok: false, code: PAYMENT_RESULT_CODES.REGISTRATION_NOT_FOUND, message: paymentMessage(PAYMENT_RESULT_CODES.REGISTRATION_NOT_FOUND) };

      const registration = await tx.registration.findUnique({
        where: { id: registrationId },
        select: {
          id: true,
          userId: true,
          status: true,
          tournament: { select: { name: true, entryFee: true, status: true } },
          payments: {
            where: { status: { in: [PaymentStatus.SUCCESS, PaymentStatus.PENDING, PaymentStatus.INITIATED] } },
            orderBy: { createdAt: "desc" },
            select: { id: true, status: true },
          },
        },
      });

      if (!registration) return { ok: false, code: PAYMENT_RESULT_CODES.REGISTRATION_NOT_FOUND, message: paymentMessage(PAYMENT_RESULT_CODES.REGISTRATION_NOT_FOUND) };
      if (registration.userId !== user.id) return { ok: false, code: PAYMENT_RESULT_CODES.REGISTRATION_NOT_OWNED, message: paymentMessage(PAYMENT_RESULT_CODES.REGISTRATION_NOT_OWNED) };
      if (registration.status !== RegistrationStatus.PENDING) return { ok: false, code: PAYMENT_RESULT_CODES.REGISTRATION_NOT_PENDING, message: paymentMessage(PAYMENT_RESULT_CODES.REGISTRATION_NOT_PENDING) };
      if (registration.tournament.entryFee.toFixed(2) === "0.00") return { ok: false, code: PAYMENT_RESULT_CODES.FREE_TOURNAMENT, message: paymentMessage(PAYMENT_RESULT_CODES.FREE_TOURNAMENT) };
      if ([TournamentStatus.DRAFT, TournamentStatus.CANCELLED, TournamentStatus.COMPLETED, TournamentStatus.LIVE].includes(registration.tournament.status)) {
        return { ok: false, code: PAYMENT_RESULT_CODES.TOURNAMENT_UNAVAILABLE, message: paymentMessage(PAYMENT_RESULT_CODES.TOURNAMENT_UNAVAILABLE) };
      }
      if (registration.payments.some((payment) => payment.status === PaymentStatus.SUCCESS)) return { ok: false, code: PAYMENT_RESULT_CODES.PAYMENT_ALREADY_SUCCESSFUL, message: paymentMessage(PAYMENT_RESULT_CODES.PAYMENT_ALREADY_SUCCESSFUL) };
      if (registration.payments.some((payment) => [PaymentStatus.PENDING, PaymentStatus.INITIATED].includes(payment.status))) return { ok: false, code: PAYMENT_RESULT_CODES.PAYMENT_ALREADY_PENDING, message: paymentMessage(PAYMENT_RESULT_CODES.PAYMENT_ALREADY_PENDING) };

      const phone = user.phone || submittedPhone;
      if (!PHONE_PATTERN.test(phone)) return { ok: false, code: PAYMENT_RESULT_CODES.INVALID_PHONE, message: paymentMessage(PAYMENT_RESULT_CODES.INVALID_PHONE) };

      if (!user.phone) {
        await tx.user.update({ where: { id: user.id }, data: { phone } });
      }

      const amount = registration.tournament.entryFee.toFixed(2);
      const merchantTransactionId = generateMerchantTransactionId();
      const productinfo = `Tournament Entry - ${registration.tournament.name}`.slice(0, 100);
      const firstname = firstNameFromUser(user.name);
      const hash = generatePayURequestHash({
        key: config.merchantKey,
        txnid: merchantTransactionId,
        amount,
        productinfo,
        firstname,
        email: user.email,
        salt: config.merchantSalt,
      });

      const payment = await tx.payment.create({
        data: {
          registrationId: registration.id,
          merchantTransactionId,
          amount: registration.tournament.entryFee,
          currency: "INR",
          status: PaymentStatus.PENDING,
        },
        select: { id: true },
      });

      return {
        ok: true,
        paymentId: payment.id,
        merchantTransactionId,
        checkoutUrl: config.checkoutUrl,
        fields: {
          key: config.merchantKey,
          txnid: merchantTransactionId,
          amount,
          productinfo,
          firstname,
          email: user.email,
          phone,
          udf1: "",
          udf2: "",
          udf3: "",
          udf4: "",
          udf5: "",
          surl: getCallbackUrl("/api/payu/callback"),
          furl: getCallbackUrl("/api/payu/callback"),
          hash,
        },
      } satisfies PaymentInitiationResult;
    });
  } catch (error) {
    console.error("PayU payment initiation failed:", error);
    const configurationError = error instanceof Error && (error.message.includes("PAYU_") || error.message.includes("NEXT_PUBLIC_APP_URL"));
    return {
      ok: false,
      code: configurationError ? PAYMENT_RESULT_CODES.PAYU_CONFIGURATION_ERROR : PAYMENT_RESULT_CODES.PAYMENT_FAILED,
      message: paymentMessage(configurationError ? PAYMENT_RESULT_CODES.PAYU_CONFIGURATION_ERROR : PAYMENT_RESULT_CODES.PAYMENT_FAILED),
    };
  }
}
