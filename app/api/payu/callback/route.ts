import type { PayUResponseFields } from "@/lib/payu";
import { verifyAndFinalizePayUPayment } from "@/lib/payment-verification";

function getText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function responseFields(data: Record<string, unknown>): PayUResponseFields {
  const get = (name: string) => typeof data[name] === "string" ? String(data[name]).trim() : "";
  return {
    key: get("key"),
    txnid: get("txnid"),
    amount: get("amount"),
    productinfo: get("productinfo"),
    firstname: get("firstname"),
    email: get("email"),
    phone: get("phone"),
    udf1: get("udf1"),
    udf2: get("udf2"),
    udf3: get("udf3"),
    udf4: get("udf4"),
    udf5: get("udf5"),
    status: get("status").toLowerCase(),
    hash: get("hash"),
    mihpayid: get("mihpayid"),
  };
}

async function parseResponse(request: Request): Promise<PayUResponseFields> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return {};
    return responseFields(body as Record<string, unknown>);
  }

  const formData = await request.formData();
  return responseFields(Object.fromEntries(Array.from(formData.entries()).map(([key, value]) => [key, getText(value)])));
}

function redirectForOutcome(outcome: "SUCCESS" | "FAILED" | "PENDING", txnid: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) return new Response("Application URL is not configured.", { status: 500 });
  const result = outcome.toLowerCase();
  const url = new URL("/payment/result", appUrl);
  url.searchParams.set("txnid", txnid);
  url.searchParams.set("status", result);
  return Response.redirect(url, 303);
}

export async function POST(request: Request) {
  let response: PayUResponseFields;
  try {
    response = await parseResponse(request);
  } catch {
    return new Response("Invalid PayU response.", { status: 400 });
  }

  if (!response.txnid || !response.key || !response.amount || !response.hash || !response.status) {
    return new Response("Invalid PayU response.", { status: 400 });
  }

  const result = await verifyAndFinalizePayUPayment(response);

  if (result.outcome === "REJECTED") {
    console.warn("Rejected PayU callback", { merchantTransactionId: response.txnid });
    return new Response("Unable to verify payment.", { status: 400 });
  }

  console.info("PayU callback processed", {
    merchantTransactionId: response.txnid,
    outcome: result.outcome,
  });

  return redirectForOutcome(result.outcome, response.txnid);
}
