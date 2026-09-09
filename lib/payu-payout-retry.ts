import "server-only";

import { Prisma, PayoutStatus, WithdrawalRequestStatus } from "@/app/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { initiateWithdrawalPayout } from "@/lib/payu-payout-processing";

export async function retryFailedWithdrawalPayout(withdrawalId: string, paymentType?: string) {
  await requireAdmin();
  await prisma.$transaction(async (tx) => {
    const request = await tx.withdrawalRequest.findUnique({ where: { id: withdrawalId }, select: { id: true, status: true } });
    if (!request) throw new Error("WITHDRAWAL_NOT_FOUND");
    const payout = await tx.payout.findFirst({ where: { withdrawalRequestId: withdrawalId }, orderBy: { createdAt: "desc" }, select: { status: true } });
    if (payout?.status !== PayoutStatus.FAILED || request.status !== WithdrawalRequestStatus.FAILED) throw new Error("PAYOUT_RETRY_NOT_ALLOWED");
    await tx.withdrawalRequest.update({ where: { id: withdrawalId }, data: { status: WithdrawalRequestStatus.APPROVED, rejectionReason: null } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return initiateWithdrawalPayout(withdrawalId, paymentType);
}
