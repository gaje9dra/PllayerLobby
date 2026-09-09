import "server-only";

import { createHash } from "node:crypto";
import { PayoutStatus, WithdrawalRequestStatus } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getPayUPayoutConfig } from "@/lib/payu-payout-client";

export async function handlePayURequestProcessingFailed(input: { authorization?: string; payoutMerchantId?: string; merchantReferenceId?: string; payuRefId?: string; msg?: string }) {
  const config = getPayUPayoutConfig();
  if (input.authorization !== config.webhookSecret) throw new Error("INVALID_WEBHOOK_AUTHORIZATION");
  if (input.payoutMerchantId && input.payoutMerchantId !== config.merchantId) throw new Error("INVALID_PAYOUT_MERCHANT");
  if (!input.merchantReferenceId) return { action: "NO_MUTATION" as const };
  const fingerprint = createHash("sha256").update(JSON.stringify({ event: "REQUEST_PROCESSING_FAILED", merchantReferenceId: input.merchantReferenceId, payuRefId: input.payuRefId ?? null, msg: input.msg ?? null })).digest("hex");
  const existing = await prisma.payoutWebhookEvent.findUnique({ where: { fingerprint }, select: { id: true } });
  if (existing) return { action: "DUPLICATE" as const };
  const payout = await prisma.payout.findUnique({ where: { merchantTransferId: input.merchantReferenceId }, select: { id: true, withdrawalRequestId: true, status: true } });
  await prisma.payoutWebhookEvent.create({ data: { provider: "PAYU", eventType: "REQUEST_PROCESSING_FAILED", merchantTransferId: input.merchantReferenceId, providerReference: input.payuRefId ?? null, fingerprint, payoutId: payout?.id ?? null } });
  if (!payout) return { action: "UNKNOWN_PAYOUT" as const };
  if (payout.status === PayoutStatus.PAID || payout.status === PayoutStatus.REVERSED) return { action: "NO_MUTATION" as const, payoutId: payout.id };
  await prisma.$transaction(async (tx) => {
    await tx.payout.update({ where: { id: payout.id }, data: { status: PayoutStatus.PROCESSING, providerTransferId: input.payuRefId ?? undefined, failureReason: null, failureCode: null } });
    await tx.withdrawalRequest.updateMany({ where: { id: payout.withdrawalRequestId, status: { in: [WithdrawalRequestStatus.PAYOUT_INITIATED, WithdrawalRequestStatus.PROCESSING] } }, data: { status: WithdrawalRequestStatus.PROCESSING } });
  });
  return { action: "RECONCILE_REQUIRED" as const, payoutId: payout.id };
}
