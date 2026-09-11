import type { Metadata } from "next";
import Link from "next/link";
import { PaymentStatus, RegistrationStatus } from "@/app/generated/prisma/client";
import { requireActiveUser } from "@/lib/auth";
import { getRegistrationCodeForUser } from "@/lib/registration-code";
import { prisma } from "@/lib/prisma";
import { SectionContainer } from "@/components/ui/section-container";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Payment Result",
  description: "View the server-verified status of your tournament payment.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export const dynamic = "force-dynamic";

function statusContent(paymentStatus: PaymentStatus, registrationStatus: RegistrationStatus) {
  if (paymentStatus === PaymentStatus.SUCCESS && registrationStatus === RegistrationStatus.CONFIRMED) {
    return {
      title: "Payment successful",
      description: "Your payment has been verified and your tournament registration is confirmed.",
      className: "border-lime-300/20 bg-lime-300/10 text-lime-200",
    };
  }

  if (paymentStatus === PaymentStatus.FAILED) {
    return {
      title: "Payment was not successful",
      description: "PayU verification did not confirm a successful payment. You can retry the payment from the tournament page.",
      className: "border-red-400/20 bg-red-400/10 text-red-200",
    };
  }

  return {
    title: "Payment verification is in progress",
    description: "The server has not received conclusive confirmation from PayU yet. Your registration remains pending until payment is verified.",
    className: "border-amber-300/20 bg-amber-300/10 text-amber-200",
  };
}

export default async function PaymentResultPage({ searchParams }: { searchParams: Promise<{ txnid?: string; status?: string }> }) {
  const user = await requireActiveUser();
  const params = await searchParams;
  const merchantTransactionId = params.txnid?.trim() ?? "";

  if (!merchantTransactionId) {
    return (
      <SectionContainer className="py-16 sm:py-24">
        <section className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[0.025] p-7 text-center sm:p-10">
          <h1 className="text-2xl font-black text-white">Payment result unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">We could not identify the payment result. Your account has not been changed by this page.</p>
          <Button href="/dashboard" className="mt-7">Go to Dashboard</Button>
        </section>
      </SectionContainer>
    );
  }

  const payment = await prisma.payment.findFirst({
    where: { merchantTransactionId, registration: { userId: user.id } },
    select: { status: true, registration: { select: { id: true, status: true } } },
  });

  if (!payment) {
    return (
      <SectionContainer className="py-16 sm:py-24">
        <section className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[0.025] p-7 text-center sm:p-10">
          <h1 className="text-2xl font-black text-white">Payment result unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">This payment could not be found for your account.</p>
          <Button href="/dashboard" className="mt-7">Go to Dashboard</Button>
        </section>
      </SectionContainer>
    );
  }

  const content = statusContent(payment.status, payment.registration.status);
  const registrationCode = payment.status === PaymentStatus.SUCCESS && payment.registration.status === RegistrationStatus.CONFIRMED
    ? await getRegistrationCodeForUser(payment.registration.id)
    : null;
  const queryStatus = params.status?.trim().toLowerCase();
  const serverStatus = payment.status.toLowerCase();

  return (
    <SectionContainer className="py-16 sm:py-24">
      <section className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[0.025] p-7 text-center shadow-2xl shadow-black/20 sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Payment verification</p>
        <h1 className="mt-3 text-3xl font-black text-white">{content.title}</h1>
        <div className={`mt-6 rounded-2xl border p-5 text-left ${content.className}`} role="status">
          <p className="text-sm leading-6">{content.description}</p>
        </div>
        {registrationCode ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/50 p-5 text-left">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Registration code</p>
            <p className="mt-2 font-mono text-lg font-black tracking-wider text-white">{registrationCode}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">Keep this code safe. It will be required when tournament joining opens.</p>
          </div>
        ) : null}
        <p className="mt-5 text-xs text-slate-600">Server status: {serverStatus}{queryStatus && queryStatus !== serverStatus ? " · Return status was not used as authority" : ""}</p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button href="/dashboard">Go to Dashboard</Button>
          {payment.status === PaymentStatus.FAILED || payment.status === PaymentStatus.PENDING ? <Button href="/tournaments" variant="secondary">Back to Tournaments</Button> : <Link href="/tournaments" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 px-5 text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white">Browse Tournaments</Link>}
        </div>
      </section>
    </SectionContainer>
  );
}
