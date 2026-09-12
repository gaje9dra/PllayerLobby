import { NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { requireActiveUser } from "@/lib/auth";
import { createWalletDeposit, formatDepositError } from "@/lib/wallet-deposit";

function infrastructureError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2021":
        return { status: 503, message: "Wallet deposits are unavailable because the database is missing the WalletDeposit table. Run the pending Prisma migrations and restart the app." };
      case "P2022":
        return { status: 503, message: "Wallet deposits are unavailable because the database schema is out of date. Run the pending Prisma migrations and restart the app." };
      case "P2002":
        return { status: 409, message: "That deposit request already exists. Please retry." };
      case "P2034":
        return { status: 409, message: "The deposit request conflicted with another transaction. Please retry." };
      default:
        return null;
    }
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return { status: 503, message: "The wallet database is temporarily unavailable. Check DATABASE_URL and the database connection, then retry." };
  }

  return null;
}

export async function POST(request: Request) {
  try {
    await requireActiveUser();
    const body = await request.json().catch(() => null);
    const amount = typeof body?.amount === "string" || typeof body?.amount === "number" ? String(body.amount) : "";
    const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey : "";
    const result = await createWalletDeposit(amount, idempotencyKey);
    return NextResponse.json({
      deposit: {
        id: result.deposit.id,
        amount: result.deposit.amount.toString(),
        currency: result.deposit.currency,
        status: result.deposit.status,
        reference: result.deposit.reference,
        providerReference: result.deposit.providerReference,
        createdAt: result.deposit.createdAt,
        updatedAt: result.deposit.updatedAt,
      },
      idempotent: result.idempotent,
    }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    const infrastructure = infrastructureError(error);
    if (infrastructure) {
      console.error("Wallet deposit infrastructure error", {
        code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "INITIALIZATION_ERROR",
      });
      return NextResponse.json({ error: infrastructure.message }, { status: infrastructure.status });
    }

    const message = formatDepositError(error);
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const status = code === "DEPOSIT_RATE_LIMITED" ? 429
      : code === "IDEMPOTENCY_KEY_REUSED" ? 409
      : code === "INVALID_IDEMPOTENCY_KEY" || code === "INVALID_AMOUNT" || code === "AMOUNT_TOO_LOW" || code === "AMOUNT_TOO_HIGH" ? 400
      : code === "CURRENCY_MISMATCH" ? 409
      : code === "AUTH_REQUIRED" || code === "USER_NOT_ACTIVE" ? 401
      : 500;

    if (status >= 500) console.error("Wallet deposit request failed", { error: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ error: message }, { status });
  }
}
