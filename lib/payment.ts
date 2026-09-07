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

function createMerchantTransactionId() {
  return `PL${randomBytes(11).toString("hex")}`;
}

function getCallbackUrl(path: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) {
    throw new Error("Missing required environment variable: NEXT_PUBLIC_APP_URL");
  }
  return new URL(path, appUrl).toString();
}

function firstNameFromUser(name: string | null) {
  const firstName = name?.trim().split(/\s+/)[0];
  return firstName || "Player";
}

function paymentMessage(code: PaymentResultCode) {
  switch (code) {
    case PAYMENT_RESULT_CODES.UNAUTHENTICATED:
      return "Please sign in before proceeding to payment.";
    case PAYMENT_RESULT_CODES.USER_NOT_ACTIVE:
      return "Your account is not currently eligible for payment.";
    case PAYMENT_RESULT_CODES.REGISTRATION_NOT_FOUND:
      return "This registration is no longer available.";
    case PAYMENT_RESULT_CODES.REGISTRATION_NOT_OWNED:
      return "You cannot pay for another user's registration.";
    case PAYMENT_RESULT_CODES.REGISTRATION_NOT_PENDING:
      return "This registration is not awaiting payment.";
    case PAYMENT_RESULT_CODES.FREE_TOURNAMENT:
      return "Free tournaments do not require PayU payment.";
    case PAYMENT_RESULT_CODES.TOURNAMENT_UNAVAILABLE:
      return "This tournament is no longer available for payment.";
    case PAYMENT_RESULT_CODES.PAYMENT_ALREADY_SUCCESSFUL:
      return "This registration has already been paid successfully.";
    case PAYMENT_RESULT_CODES.PAYMENT_ALREADY_PENDING:
      return "A payment attempt is already in progress for this registration.";
    case PAYMENT_RESULT_CODES.PAYU_CONFIGURATION_ERROR:
      return "Payment is temporarily unavailable. Please try again later.";
    case PAYMENT_RESULT_CODES.PAYMENT_FAILED:
      return "Unable to start payment right now. Please try again.";
  }
}

export async function createPaymentForRegistration(registrationId: string): Promise<PaymentInitiationResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { ok: false, code: PAYMENT_RESULT_CODES.UNAUTHENTICATED, message: paymentMessage(PAYMENT_RESULT_CODES.UNAUTHENTICATED) };
  }

  if (user.status !== "ACTIVE") {
    return { ok: false, code: PAYMENT_RESULT_CODES.USER_NOT_ACTIVE, message: paymentMessage(PAYMENT_RESULT_CODES.USER_NOT_ACTIVE) };
  }

  try {
    const config = getPayUConfig();
    const result = await prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "Registration"
        WHERE "id" = CAST(${registrationId} AS UUID)
        FOR UPDATE
      `;

      if (lockedRows.length === 0) {
        return { ok: false, code: PAYMENT_RESULT_CODES.REGISTRATION_NOT_FOUND } as const;
      }

      const registration = await tx.registration.findUnique({
        where: { id: registrationId },
        select: {
          id: true,
          userId: true,
          status: true,
          tournament: {
            select: {
              id: true,
              name: true,
              entryFee: true,
              status: true,
            },
          },
          payments: {
            where: { status: { in: [PaymentStatus.SUCCESS, PaymentStatus.PENDING, PaymentStatus.INITIATED] } },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              merchantTransactionId: true,
              amount: true,
              status: true,
            },
          },
        },
      });

      if (!registration) {
        return { ok: false, code: PAYMENT_RESULT_CODES.REGISTRATION_NOT_FOUND } as const;
      }
      if (registration.userId !== user.id) {
        return { ok: false, code: PAYMENT_RESULT_CODES.REGISTRATION_NOT_OWNED } as const;
      }
      if (registration.status !== RegistrationStatus.PENDING) {
        return { ok: false, code: PAYMENT_RESULT_CODES.REGISTRATION_NOT_PENDING } as const;
      }
      if (registration.tournament.entryFee.toFixed(2) === "0.00") {
        return { ok: false, code: PAYMENT_RESULT_CODES.FREE_TOURNAMENT } as const;
      }
      if ([TournamentStatus.DRAFT, TournamentStatus.CANCELLED, TournamentStatus.COMPLETED, TournamentStatus.LIVE].includes(registration.tournament.status)) {
        return { ok: false, code: PAYMENT_RESULT_CODES.TOURNAMENT_UNAVAILABLE } as const;
      }

      const existingPayment = registration.payments[0];
      if (existingPayment?.status === PaymentStatus.SUCCESS) {
        return { ok: false, code: PAYMENT_RESULT_CODES.PAYMENT_ALREADY_SUCCESSFUL } as const;
      }
      if (existingPayment && [PaymentStatus.PENDING, PaymentStatus.INITIATED].includes(existingPayment.status)) {
        return { ok: false, code: PAYMENT_RESULT_CODES.PAYMENT_ALREADY_PENDING } as const;
      }

      const amount = registration.tournament.entryFee.toFixed(2);
      const merchantTransactionId = createMerchantTransactionId();
      const productinfo = `Tournament Entry - ${registration.tournament.name}`.slice(0, 100);
      const firstname = firstNameFromUser(user.name);
      const surl = getCallbackUrl("/api/payu/callback");
      const furl = getCallbackUrl("/api/payu/callback");
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
          status: PaymentStatus.INITIATED,
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
          udf1: "",
          udf2: "",
          udf3: "",
          udf4: "",
          udf5: "",
          surl,
          furl,
          hash,
        },
      } satisfies PaymentInitiationResult;
    });

    if (!result.ok) {
      return { ok: false, code: result.code, message: paymentMessage(result.code) };
    }

    await prisma.payment.update({
      where: { id: result.paymentId },
      data: { status: PaymentStatus.PENDING },
    });

    return result;
  } catch (error) {
    console.error("PayU payment initiation failed:", error);
    const message = error instanceof Error && error.message.includes("PAYU_")
      ? paymentMessage(PAYMENT_RESULT_CODES.PAYU_CONFIGURATION_ERROR)
      : paymentMessage(PAYMENT_RESULT_CODES.PAYMENT_FAILED);
    return {
      ok: false,
      code: error instanceof Error && error.message.includes("PAYU_") ? PAYMENT_RESULT_CODES.PAYU_CONFIGURATION_ERROR : PAYMENT_RESULT_CODES.PAYMENT_FAILED,
      message,
    };
  }
}
