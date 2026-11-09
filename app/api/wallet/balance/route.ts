import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateWalletForUser } from "@/lib/wallet";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") {
    return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, {
      status: 401,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }

  const wallet = await getOrCreateWalletForUser(user.id);
  return NextResponse.json(
    { balance: wallet.balance.toString(), currency: wallet.currency },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
