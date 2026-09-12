import { NextResponse } from "next/server";
import { parsePayUWalletCallback, verifyAndFinalizePayUWalletDeposit } from "@/lib/payu-wallet-deposit";

async function parseRequest(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return {};
    return parsePayUWalletCallback(body as Record<string, unknown>);
  }
  const form = await request.formData();
  return parsePayUWalletCallback(Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, typeof value === "string" ? value : ""])));
}

export async function POST(request: Request) {
  let response;
  try { response = await parseRequest(request); } catch { return new Response("Invalid PayU response.", { status: 400 }); }
  const result = await verifyAndFinalizePayUWalletDeposit(response);
  if (result.outcome === "REJECTED") return new Response("Unable to verify payment.", { status: 400 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl || !result.depositId) return NextResponse.json({ outcome: result.outcome, message: result.message }, { status: result.outcome === "SUCCESS" ? 200 : 202 });
  const url = new URL(`/dashboard/wallet/deposit/${result.depositId}`, appUrl);
  url.searchParams.set("payment", result.outcome.toLowerCase());
  return NextResponse.redirect(url, 303);
}

export async function GET() {
  return new Response("PayU wallet callbacks must use POST.", { status: 405, headers: { Allow: "POST" } });
}
