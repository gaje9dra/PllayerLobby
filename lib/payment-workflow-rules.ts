import { randomBytes } from "node:crypto";
import { PaymentStatus } from "@/app/generated/prisma/client";

const ALLOWED_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  [PaymentStatus.INITIATED]: [PaymentStatus.INITIATED, PaymentStatus.PENDING, PaymentStatus.CANCELLED, PaymentStatus.FAILED],
  [PaymentStatus.PENDING]: [PaymentStatus.PENDING, PaymentStatus.SUCCESS, PaymentStatus.FAILED, PaymentStatus.CANCELLED],
  [PaymentStatus.SUCCESS]: [PaymentStatus.SUCCESS],
  [PaymentStatus.FAILED]: [PaymentStatus.FAILED, PaymentStatus.PENDING],
  [PaymentStatus.CANCELLED]: [PaymentStatus.CANCELLED, PaymentStatus.PENDING],
};

export function canTransitionPaymentStatus(from: PaymentStatus, to: PaymentStatus) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function generateMerchantTransactionId() {
  return `PL${randomBytes(11).toString("hex")}`;
}
