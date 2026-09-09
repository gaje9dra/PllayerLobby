import "server-only";

import { PayoutDestinationStatus, PayoutDestinationType } from "@/app/generated/prisma/client";
import { requireActiveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptPayoutData, encryptPayoutData } from "@/lib/payout-crypto";
import { validatePayoutDestinationInput, type PayoutDestinationInput } from "@/lib/payout-destination-validation";

export type { PayoutDestinationInput } from "@/lib/payout-destination-validation";

type StoredPayoutData =
  | { version: 1; type: "UPI"; upiId: string }
  | { version: 1; type: "BANK_ACCOUNT"; accountHolderName: string; accountNumber: string; ifsc: string; bankName: string };

export { validatePayoutDestinationInput } from "@/lib/payout-destination-validation";

function safeStatus(status: PayoutDestinationStatus) { return status; }

export async function createPayoutDestination(input: PayoutDestinationInput) {
  const user = await requireActiveUser();
  if (input.type !== PayoutDestinationType.UPI && input.type !== PayoutDestinationType.BANK_ACCOUNT) throw new Error("INVALID_DESTINATION_TYPE");
  const normalized = validatePayoutDestinationInput(input);
  if (!normalized) throw new Error("INVALID_DESTINATION_DATA");
  const encryptedDestinationData = encryptPayoutData(JSON.stringify(normalized.data));
  const destination = await prisma.payoutDestination.create({ data: { userId: user.id, type: input.type, status: PayoutDestinationStatus.PENDING_VERIFICATION, displayName: normalized.displayName, maskedDestination: normalized.maskedDestination, encryptedDestinationData } });
  return { id: destination.id, type: destination.type, status: safeStatus(destination.status), displayName: destination.displayName, maskedDestination: destination.maskedDestination, createdAt: destination.createdAt };
}

export async function getCurrentUserPayoutDestinations() {
  const user = await requireActiveUser();
  return prisma.payoutDestination.findMany({ where: { userId: user.id }, orderBy: [{ status: "asc" }, { createdAt: "desc" }, { id: "desc" }], select: { id: true, type: true, status: true, displayName: true, maskedDestination: true, createdAt: true, updatedAt: true, verifiedAt: true } });
}

export async function disablePayoutDestination(destinationId: string) {
  const user = await requireActiveUser();
  const destination = await prisma.payoutDestination.findUnique({ where: { id: destinationId }, select: { id: true, userId: true, status: true } });
  if (!destination || destination.userId !== user.id) throw new Error("DESTINATION_NOT_FOUND");
  if (destination.status === PayoutDestinationStatus.DISABLED) return { id: destination.id, status: destination.status };
  const updated = await prisma.payoutDestination.update({ where: { id: destination.id }, data: { status: PayoutDestinationStatus.DISABLED }, select: { id: true, status: true } });
  return updated;
}

export async function verifyPayoutDestination() {
  await requireActiveUser();
  throw new Error("PAYOUT_DESTINATION_VERIFICATION_UNAVAILABLE");
}

export async function getOwnedDestinationForWithdrawal(destinationId: string, userId: string) {
  const destination = await prisma.payoutDestination.findUnique({ where: { id: destinationId }, select: { id: true, userId: true, type: true, status: true, maskedDestination: true, encryptedDestinationData: true } });
  if (!destination || destination.userId !== userId) throw new Error("DESTINATION_NOT_FOUND");
  if (destination.status === PayoutDestinationStatus.DISABLED) throw new Error("DESTINATION_DISABLED");
  let data: StoredPayoutData;
  try { data = JSON.parse(decryptPayoutData(destination.encryptedDestinationData)) as StoredPayoutData; } catch { throw new Error("DESTINATION_DATA_CORRUPTED"); }
  if (data.version !== 1 || data.type !== destination.type) throw new Error("DESTINATION_DATA_CORRUPTED");
  return { id: destination.id, type: destination.type, status: destination.status, maskedDestination: destination.maskedDestination, data };
}

export function formatPayoutDestinationError(error: unknown) {
  const code = error instanceof Error ? error.message : "UNKNOWN";
  const messages: Record<string, string> = {
    INVALID_DESTINATION_TYPE: "Select a supported payout destination type.",
    INVALID_DESTINATION_DATA: "Enter valid payout destination details.",
    DESTINATION_NOT_FOUND: "Payout destination not found.",
    DESTINATION_DISABLED: "This payout destination is disabled.",
    DESTINATION_DATA_CORRUPTED: "This payout destination could not be safely read. Please create a new destination.",
    PAYOUT_DESTINATION_VERIFICATION_UNAVAILABLE: "Verification is not yet available.",
  };
  return messages[code] ?? "The payout destination operation could not be completed.";
}
