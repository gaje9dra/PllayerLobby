import { RegistrationStatus } from "@/app/generated/prisma/client";

export function getRegistrationCreationStatus(entryFee: { toFixed: (digits?: number) => string }) {
  const isFree = entryFee.toFixed(2) === "0.00";
  return {
    status: isFree ? RegistrationStatus.CONFIRMED : RegistrationStatus.PENDING,
    paymentRequired: !isFree,
  } as const;
}
