import {
  PaymentStatus,
  RegistrationStatus,
  TournamentStatus,
  UserStatus,
} from "@/app/generated/prisma/client";

export const ADMIN_REGISTRATION_PAGE_SIZE = 20;

export const ADMIN_REGISTRATION_SORTS = {
  newest: { createdAt: "desc" },
  oldest: { createdAt: "asc" },
  participant_asc: { user: { name: "asc" } },
  participant_desc: { user: { name: "desc" } },
  status: { status: "asc" },
} as const;

export type AdminRegistrationSort = keyof typeof ADMIN_REGISTRATION_SORTS;

export function parseAdminRegistrationSearch(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim().slice(0, 100);
}

export function parseAdminRegistrationPage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function parseRegistrationStatus(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return Object.values(RegistrationStatus).includes(raw as RegistrationStatus)
    ? (raw as RegistrationStatus)
    : undefined;
}

export function parsePaymentStatus(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return Object.values(PaymentStatus).includes(raw as PaymentStatus)
    ? (raw as PaymentStatus)
    : undefined;
}

export function parseUserStatus(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return Object.values(UserStatus).includes(raw as UserStatus)
    ? (raw as UserStatus)
    : undefined;
}

export function parseAdminRegistrationSort(value: string | string[] | undefined): AdminRegistrationSort {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw in ADMIN_REGISTRATION_SORTS
    ? (raw as AdminRegistrationSort)
    : "newest";
}

export function canAdminCancelRegistration(
  tournamentStatus: TournamentStatus,
  registrationStatus: RegistrationStatus,
) {
  if (tournamentStatus === TournamentStatus.COMPLETED || tournamentStatus === TournamentStatus.CANCELLED) {
    return false;
  }

  return registrationStatus === RegistrationStatus.PENDING || registrationStatus === RegistrationStatus.CONFIRMED;
}
