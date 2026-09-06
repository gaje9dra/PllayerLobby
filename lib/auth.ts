import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { UserRole, UserStatus } from "@/app/generated/prisma/client";

const protectedUserSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export const getCurrentUser = cache(async function getCurrentUser() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: protectedUserSelect,
  });
});

export function isAdmin(user: Pick<CurrentUser, "role">) {
  return user.role === UserRole.ADMIN;
}

export function isActiveUser(user: Pick<CurrentUser, "status">) {
  return user.status === UserStatus.ACTIVE;
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireActiveUser() {
  const user = await requireUser();

  if (!isActiveUser(user)) {
    redirect("/access-denied");
  }

  return user;
}

export async function requireAdmin() {
  const user = await requireActiveUser();

  if (!isAdmin(user)) {
    redirect("/access-denied");
  }

  return user;
}
