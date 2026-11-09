"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UserStatus } from "@/app/generated/prisma/client";
import { createAdminWalletAdjustment, setAdminUserStatus, setAdminWalletFreeze } from "@/lib/admin-finance-tools";

export async function adjustUserWalletAction(formData: FormData) {
  const walletId = String(formData.get("walletId") ?? "");
  const amount = String(formData.get("amount") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  await createAdminWalletAdjustment({ walletId, amount, direction: direction as "CREDIT" | "DEBIT", reason, idempotencyKey });
  revalidatePath("/admin/user-controls");
  revalidatePath("/admin/finance");
  revalidatePath("/admin/finance/wallets");
  revalidatePath("/admin/finance/transactions");
  redirect("/admin/user-controls?updated=wallet");
}

export async function freezeUserWalletAction(formData: FormData) {
  const walletId = String(formData.get("walletId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  await setAdminWalletFreeze({ walletId, frozen: true, reason });
  revalidatePath("/admin/user-controls");
  revalidatePath("/admin/finance/wallets");
  redirect("/admin/user-controls?updated=frozen");
}

export async function unfreezeUserWalletAction(formData: FormData) {
  const walletId = String(formData.get("walletId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  await setAdminWalletFreeze({ walletId, frozen: false, reason });
  revalidatePath("/admin/user-controls");
  revalidatePath("/admin/finance/wallets");
  redirect("/admin/user-controls?updated=unfrozen");
}

export async function changeUserStatusAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!Object.values(UserStatus).includes(status as UserStatus)) throw new Error("Invalid user status.");
  await setAdminUserStatus({ userId, status: status as UserStatus, reason });
  revalidatePath("/admin/user-controls");
  revalidatePath("/admin/finance/wallets");
  redirect("/admin/user-controls?updated=status");
}
