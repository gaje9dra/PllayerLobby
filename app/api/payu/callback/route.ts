import { PaymentStatus } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getPayUConfig, validatePayUResponseHash } from "@/lib/payu";
import { canTransitionPaymentStatus } from "@/lib/payment-workflow-rules";

function firstNameFromUser(name: string | null) {
  return name?.trim().split(/\s+/)[0] || "Player";
}

function responseFields(formData: FormData) {
  const get = (name: string) => String(formData.get(name) ?? "").trim();
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

export async function POST(request: Request) {
  const formData = await request.formData();
  const response = responseFields(formData);

  if (!response.txnid || !response.key || !response.amount || !response.hash || !response.status) {
    return new Response("Invalid PayU response.", { status: 400 });
  }

  try {
    const config = getPayUConfig();
    const payment = await prisma.payment.findUnique({
      where: { merchantTransactionId: response.txnid },
      select: {
        id: true,
        amount: true,
        status: true,
        registration: {
          select: {
            tournament: { select: { name: true } },
            user: { select: { name: true, email: true, phone: true } },
          },
        },
      },
    });

    if (!payment) return new Response("Payment not found.", { status: 404 });

    const expectedProductInfo = `Tournament Entry - ${payment.registration.tournament.name}`.slice(0, 100);
    const expectedFirstname = firstNameFromUser(payment.registration.user.name);

    if (
      response.key !== config.merchantKey ||
      response.amount !== payment.amount.toFixed(2) ||
      response.productinfo !== expectedProductInfo ||
      response.firstname !== expectedFirstname ||
      response.email !== payment.registration.user.email ||
      response.phone !== payment.registration.user.phone
    ) {
      return new Response("PayU response did not match the payment record.", { status: 400 });
    }

    if (!validatePayUResponseHash(response, config.merchantSalt)) {
      return new Response("Invalid PayU response hash.", { status: 400 });
    }

    const nextStatus = response.status === "success" ? PaymentStatus.PENDING : PaymentStatus.FAILED;
    if (!canTransitionPaymentStatus(payment.status, nextStatus)) {
      return new Response("Invalid payment state transition.", { status: 409 });
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: nextStatus, payuTransactionId: response.mihpayid || undefined },
    });

    console.info("PayU callback validated", {
      paymentId: payment.id,
      merchantTransactionId: response.txnid,
      payuTransactionId: response.mihpayid || null,
      status: nextStatus,
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (!appUrl) return new Response("Application URL is not configured.", { status: 500 });

    return Response.redirect(
      new URL(response.status === "success" ? "/dashboard?payment=pending" : "/dashboard?payment=failed", appUrl),
      303,
    );
  } catch (error) {
    console.error("PayU callback processing failed:", error);
    return new Response("Unable to process PayU response.", { status: 500 });
  }
}
