import "server-only";

import { PaymentStatus, RegistrationStatus } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getPayUConfig, validatePayUResponseHash, type PayUResponseFields } from "@/lib/payu";
import { canTransitionPaymentStatus } from "@/lib/payment-workflow-rules";
import { verifyPayUTransaction, type PayUVerificationResult } from "@/lib/payu-verification";
import { normalizePaymentAmount } from "@/lib/payu-verification-rules";

export type PaymentVerificationOutcome = "SUCCESS" | "FAILED" | "PENDING" | "REJECTED";
export type PaymentVerificationResult = { outcome: PaymentVerificationOutcome; message: string };

function firstNameFromUser(name: string | null) {
  return name?.trim().split(/\s+/)[0] || "Player";
}

function expectedProductInfo(tournamentName: string) {
  return `Tournament Entry - ${tournamentName}`.slice(0, 100);
}

function resultMessage(outcome: PaymentVerificationOutcome) {
  switch (outcome) {
    case "SUCCESS": return "Payment verified and tournament registration confirmed.";
    case "FAILED": return "Payment was not successful.";
    case "PENDING": return "Payment verification is still in progress.";
    case "REJECTED": return "Payment verification could not be completed.";
  }
}

function responseMatchesPayment(response: PayUResponseFields, payment: {
  merchantTransactionId: string;
  amount: { toFixed: (digits?: number) => string };
  registration: { tournament: { name: string }; user: { name: string | null; email: string; phone: string | null } };
}) {
  const expectedAmount = payment.amount.toFixed(2);
  return response.txnid === payment.merchantTransactionId &&
    response.amount === expectedAmount &&
    response.productinfo === expectedProductInfo(payment.registration.tournament.name) &&
    response.firstname === firstNameFromUser(payment.registration.user.name) &&
    response.email === payment.registration.user.email &&
    response.phone === payment.registration.user.phone;
}

function verifiedDataMatchesPayment(transaction: NonNullable<PayUVerificationResult["transaction"]>, payment: {
  merchantTransactionId: string;
  amount: { toFixed: (digits?: number) => string };
  registration: { tournament: { name: string; entryFee: { toFixed: (digits?: number) => string } }; user: { name: string | null; email: string; phone: string | null } };
}) {
  const expectedAmount = payment.amount.toFixed(2);
  const verifiedAmount = normalizePaymentAmount(transaction.amount);
  const verifiedTransactionAmount = transaction.transactionAmount == null ? verifiedAmount : normalizePaymentAmount(transaction.transactionAmount);
  return transaction.txnid === payment.merchantTransactionId &&
    verifiedAmount === expectedAmount &&
    verifiedTransactionAmount === expectedAmount &&
    payment.registration.tournament.entryFee.toFixed(2) === expectedAmount &&
    transaction.productinfo === expectedProductInfo(payment.registration.tournament.name) &&
    transaction.firstname === firstNameFromUser(payment.registration.user.name) &&
    transaction.email === payment.registration.user.email &&
    transaction.phone === payment.registration.user.phone;
}

async function applyVerifiedOutcome(merchantTransactionId: string, verification: PayUVerificationResult): Promise<PaymentVerificationResult> {
  return prisma.$transaction(async (tx) => {
    const lockedRows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Payment" WHERE "merchantTransactionId" = ${merchantTransactionId} FOR UPDATE
    `;
    if (lockedRows.length === 0) return { outcome: "REJECTED", message: resultMessage("REJECTED") };

    const payment = await tx.payment.findUnique({
      where: { merchantTransactionId },
      select: {
        id: true,
        merchantTransactionId: true,
        payuTransactionId: true,
        amount: true,
        currency: true,
        status: true,
        registration: {
          select: {
            id: true,
            status: true,
            tournament: { select: { name: true, entryFee: true } },
            user: { select: { name: true, email: true, phone: true } },
          },
        },
      },
    });

    if (!payment || !verification.transaction) return { outcome: "REJECTED", message: resultMessage("REJECTED") };
    if (payment.currency !== "INR") return { outcome: "REJECTED", message: resultMessage("REJECTED") };
    if (!verifiedDataMatchesPayment(verification.transaction, payment)) {
      console.warn("PayU verification data mismatch", { paymentId: payment.id, merchantTransactionId });
      return { outcome: "REJECTED", message: resultMessage("REJECTED") };
    }

    const payuTransactionId = verification.transaction.mihpayid || undefined;
    if (payment.payuTransactionId && payuTransactionId && payment.payuTransactionId !== payuTransactionId) {
      console.warn("PayU reference mismatch", { paymentId: payment.id, merchantTransactionId });
      return { outcome: "REJECTED", message: resultMessage("REJECTED") };
    }

    if (verification.state === "SUCCESS") {
      if (payment.status === PaymentStatus.SUCCESS && payment.registration.status === RegistrationStatus.CONFIRMED) return { outcome: "SUCCESS", message: resultMessage("SUCCESS") };
      if (payment.status !== PaymentStatus.PENDING) return { outcome: "REJECTED", message: resultMessage("REJECTED") };
      if (payment.registration.status !== RegistrationStatus.PENDING) {
        console.warn("PayU verification found inconsistent registration state", { paymentId: payment.id, merchantTransactionId, registrationStatus: payment.registration.status });
        return { outcome: "REJECTED", message: resultMessage("REJECTED") };
      }
      if (!canTransitionPaymentStatus(payment.status, PaymentStatus.SUCCESS)) return { outcome: "REJECTED", message: resultMessage("REJECTED") };

      await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.SUCCESS, payuTransactionId } });
      await tx.registration.update({ where: { id: payment.registration.id }, data: { status: RegistrationStatus.CONFIRMED } });

      console.info("PayU payment verified successfully", {
        paymentId: payment.id,
        merchantTransactionId,
        payuTransactionId: verification.transaction.mihpayid,
        oldPaymentStatus: payment.status,
        newPaymentStatus: PaymentStatus.SUCCESS,
        oldRegistrationStatus: payment.registration.status,
        newRegistrationStatus: RegistrationStatus.CONFIRMED,
      });
      return { outcome: "SUCCESS", message: resultMessage("SUCCESS") };
    }

    if (verification.state === "FAILED") {
      if (payment.status === PaymentStatus.SUCCESS) return { outcome: "SUCCESS", message: resultMessage("SUCCESS") };
      if (payment.status === PaymentStatus.FAILED) return { outcome: "FAILED", message: resultMessage("FAILED") };
      if (payment.status !== PaymentStatus.PENDING || !canTransitionPaymentStatus(payment.status, PaymentStatus.FAILED)) return { outcome: "REJECTED", message: resultMessage("REJECTED") };

      await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED, payuTransactionId } });
      console.info("PayU payment verified as failed", { paymentId: payment.id, merchantTransactionId, payuTransactionId: verification.transaction.mihpayid, oldStatus: payment.status, newStatus: PaymentStatus.FAILED });
      return { outcome: "FAILED", message: resultMessage("FAILED") };
    }

    if (payment.status === PaymentStatus.SUCCESS) return { outcome: "SUCCESS", message: resultMessage("SUCCESS") };
    if (payment.status !== PaymentStatus.PENDING) return { outcome: "REJECTED", message: resultMessage("REJECTED") };
    if (payuTransactionId) await tx.payment.update({ where: { id: payment.id }, data: { payuTransactionId } });
    console.info("PayU payment remains pending", { paymentId: payment.id, merchantTransactionId, payuTransactionId: verification.transaction.mihpayid });
    return { outcome: "PENDING", message: resultMessage("PENDING") };
  });
}

export async function verifyAndFinalizePayUPayment(response: PayUResponseFields): Promise<PaymentVerificationResult> {
  if (!response.txnid || !response.key || !response.amount || !response.hash || !response.status || !response.productinfo || !response.firstname || !response.email) return { outcome: "REJECTED", message: resultMessage("REJECTED") };

  try {
    const config = getPayUConfig();
    const payment = await prisma.payment.findUnique({
      where: { merchantTransactionId: response.txnid },
      select: {
        id: true,
        merchantTransactionId: true,
        amount: true,
        registration: { select: { tournament: { select: { name: true } }, user: { select: { name: true, email: true, phone: true } } } },
      },
    });

    if (!payment) return { outcome: "REJECTED", message: resultMessage("REJECTED") };
    if (!responseMatchesPayment(response, payment)) return { outcome: "REJECTED", message: resultMessage("REJECTED") };
    if (!validatePayUResponseHash(response, config.merchantSalt)) {
      console.warn("PayU response hash validation failed", { paymentId: payment.id, merchantTransactionId: response.txnid });
      return { outcome: "REJECTED", message: resultMessage("REJECTED") };
    }

    const verification = await verifyPayUTransaction(response.txnid);
    if (verification.state === "UNKNOWN") return { outcome: "PENDING", message: resultMessage("PENDING") };
    return applyVerifiedOutcome(response.txnid, verification);
  } catch (error) {
    console.error("PayU payment verification failed", { merchantTransactionId: response.txnid, error: error instanceof Error ? error.name : "unknown" });
    return { outcome: "PENDING", message: resultMessage("PENDING") };
  }
}
