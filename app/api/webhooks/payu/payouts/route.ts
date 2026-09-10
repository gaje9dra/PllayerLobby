import { NextResponse } from "next/server";
import { processPayUPayoutWebhook } from "@/lib/payu-payout-webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const authorization = request.headers.get("authorization") ?? "";
    await processPayUPayoutWebhook({
      event: String(body.event ?? ""),
      merchantReferenceId: typeof body.merchantReferenceId === "string" ? body.merchantReferenceId : undefined,
      payuRefId: typeof body.payuRefId === "string" ? body.payuRefId : undefined,
      bankReferenceId: typeof body.bankReferenceId === "string" ? body.bankReferenceId : undefined,
      payoutMerchantId: body.payoutMerchantId === undefined ? undefined : String(body.payoutMerchantId),
      msg: typeof body.msg === "string" ? body.msg : undefined,
      authorization,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "INVALID_WEBHOOK_AUTHORIZATION" || code === "INVALID_PAYOUT_MERCHANT_ID" || code === "MISSING_MERCHANT_REFERENCE") return NextResponse.json({ ok: false }, { status: 401 });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
