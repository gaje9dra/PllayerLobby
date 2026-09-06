import type { ReactNode } from "react";
import { requireActiveUser } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requireActiveUser();
  return children;
}
