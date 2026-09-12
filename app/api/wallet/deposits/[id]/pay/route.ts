import { NextResponse } from "next/server";
import { createPayUWalletDepositPayment } from "@/lib/payu-wallet-deposit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown = {};
  try { body = await request.json(); } catch { /* empty body is valid when phone is already stored */ }
  const phone = body && typeof body === "object" && !Array.isArray(body) && typeof (body as Record<string, unknown>).phone === "string'" ? (body as Record<string, unknown>).phone as string : "";
  const result = await createPayUWalletDepositPayment(id, phone);
  if (!result.ok) return NextResponse.json({ error: result.message, code: result.code }, { status: result.code === "PAYMENT_UNAVAILABLE" ? 400 : 500 });
  return NextResponse.json({ depositId: result.depositId, reference: result.reference, checkoutUrl: result.checkoutUrl, fields: result.fields });
}
