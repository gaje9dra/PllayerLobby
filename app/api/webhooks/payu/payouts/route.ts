import { handlePayUPayoutWebhook } from "@/lib/payu-payout-processing";
import { handlePayURequestProcessingFailed } from "@/lib/payu-payout-processing-failure";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const headerAuthorization = request.headers.get("authorization") ?? undefined;
    const authorization = headerAuthorization || (typeof body.authorization === "string" ? body.authorization : undefined);
    const event = String(body.event ?? "").trim().toUpperCase();
    if (!event) return Response.json({ ok: false }, { status: 400 });
    const payoutMerchantId = typeof body.payoutMerchantId === "string" || typeof body.payoutMerchantId === "number" ? String(body.payoutMerchantId) : undefined;
    const merchantReferenceId = typeof body.merchantReferenceId === "string" ? body.merchantReferenceId : undefined;
    const payuRefId = typeof body.payuRefId === "string" ? body.payuRefId : undefined;
    const msg = typeof body.msg === "string" ? body.msg : undefined;
    if (event === "REQUEST_PROCESSING_FAILED") {
      await handlePayURequestProcessingFailed({ authorization, payoutMerchantId, merchantReferenceId, payuRefId, msg });
    } else {
      await handlePayUPayoutWebhook({ event, authorization, payoutMerchantId, merchantReferenceId, payuRefId, bankReferenceId: typeof body.bankReferenceId === "string" ? body.bankReferenceId : undefined, msg, responseCode: typeof body.responseCode === "string" || typeof body.responseCode === "number" ? String(body.responseCode) : undefined });
    }
    return Response.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "WEBHOOK_ERROR";
    if (code === "INVALID_WEBHOOK_AUTHORIZATION" || code === "INVALID_PAYOUT_MERCHANT") return Response.json({ ok: false }, { status: 401 });
    return Response.json({ ok: false }, { status: 400 });
  }
}
