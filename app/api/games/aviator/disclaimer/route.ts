import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AVIATOR_DISCLAIMER_VERSION } from "@/lib/games/aviator/disclaimer";

export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") return noStore({ error: "AUTHENTICATION_REQUIRED" }, 401);
  return noStore({
    accepted: user.aviatorDisclaimerVersion === AVIATOR_DISCLAIMER_VERSION && user.aviatorDisclaimerAcceptedAt !== null,
    version: AVIATOR_DISCLAIMER_VERSION,
  });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") return noStore({ error: "AUTHENTICATION_REQUIRED" }, 401);
  const acceptedAt = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: { aviatorDisclaimerAcceptedAt: acceptedAt, aviatorDisclaimerVersion: AVIATOR_DISCLAIMER_VERSION },
  });
  return noStore({ accepted: true, acceptedAt: acceptedAt.toISOString(), version: AVIATOR_DISCLAIMER_VERSION });
}
