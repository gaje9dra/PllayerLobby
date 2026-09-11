import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireActiveUser } from "@/lib/auth";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requireActiveUser();
  return children;
}
