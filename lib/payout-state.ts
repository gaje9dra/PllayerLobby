import { PayoutStatus } from "@/app/generated/prisma/client";

const transitions: Record<PayoutStatus, readonly PayoutStatus[]> = {
  [PayoutStatus.PAYOUT_INITIATED]: [PayoutStatus.PROCESSING, PayoutStatus.FAILED],
  [PayoutStatus.PROCESSING]: [PayoutStatus.PAID, PayoutStatus.FAILED],
  [PayoutStatus.PAID]: [PayoutStatus.REVERSED],
  [PayoutStatus.FAILED]: [],
  [PayoutStatus.REVERSED]: [],
};

export function canTransitionPayout(from: PayoutStatus, to: PayoutStatus) {
  return from === to || transitions[from].includes(to);
}

export function assertPayoutTransition(from: PayoutStatus, to: PayoutStatus) {
  if (!canTransitionPayout(from, to)) throw new Error(`INVALID_PAYOUT_STATE_TRANSITION:${from}->${to}`);
}

export function isFinalPayoutStatus(status: PayoutStatus) {
  return status === PayoutStatus.PAID || status === PayoutStatus.FAILED || status === PayoutStatus.REVERSED;
}

export function isActivePayoutStatus(status: PayoutStatus) {
  return status === PayoutStatus.PAYOUT_INITIATED || status === PayoutStatus.PROCESSING;
}
