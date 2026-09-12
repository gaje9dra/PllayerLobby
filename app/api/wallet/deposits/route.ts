import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { createWalletDeposit, formatDepositError } from "@/lib/wallet-deposit";

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
    const message = formatDepositError(error);
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const status = code === "DEPOSIT_RATE_LIMITED" ? 429 : code === "IDEMPOTENCY_KEY_REUSED" ? 409 : code === "INVALID_IDEMPOTENCY_KEY" || code === "INVALID_AMOUNT" || code === "AMOUNT_TOO_LOW" || code === "AMOUNT_TOO_HIGH" ? 400 : code === "CURRENCY_MISMATCH" ? 409 : code === "AUTH_REQUIRED" || code === "USER_NOT_ACTIVE" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
