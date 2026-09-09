import Link from "next/link";
import { SectionContainer } from "@/components/ui/section-container";
import { getCurrentUserPayoutDestinations } from "@/lib/payout-destination";
import { PayoutMethodForm } from "@/app/dashboard/wallet/payout-methods/payout-method-form";
import { DestinationDisable } from "@/app/dashboard/wallet/payout-methods/destination-disable";

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export default async function PayoutMethodsPage() {
  const destinations = await getCurrentUserPayoutDestinations();
  return <SectionContainer className="py-10 sm:py-14">
    <Link href="/dashboard/wallet" className="text-sm font-semibold text-lime-300 hover:text-lime-200">← Wallet</Link>
    <div className="mt-5 max-w-3xl">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Payout settings</p>
      <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Payout methods</h1>
      <p className="mt-2 text-sm leading-6 text-slate-400">Add a UPI ID or bank account for future withdrawals. New destinations remain pending until a real verification process is available.</p>
    </div>

    <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7">
      <h2 className="text-lg font-bold text-white">Your payout destinations</h2>
      {destinations.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-white/10 p-6 text-sm text-slate-500">No payout destinations added yet.</p> : <div className="mt-5 grid gap-4 md:grid-cols-2">{destinations.map((destination) => <div key={destination.id} className="rounded-xl border border-white/10 p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-bold text-white">{destination.displayName}</p><p className="mt-1 text-sm text-slate-300">{destination.type === "UPI" ? "UPI" : "Bank account"} · {destination.maskedDestination}</p></div><span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{statusLabel(destination.status)}</span></div>{destination.status !== "DISABLED" ? <DestinationDisable destinationId={destination.id} /> : <p className="mt-3 text-xs text-slate-500">Disabled destinations are retained for history and cannot be selected for new withdrawals.</p>}</div>)}</div>}
    </section>

    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <PayoutMethodForm type="UPI" />
      <PayoutMethodForm type="BANK_ACCOUNT" />
    </div>

    <div className="mt-6 rounded-2xl border border-amber-300/10 bg-amber-300/[0.04] p-5 text-sm leading-6 text-slate-400">Verification is intentionally not simulated. No UPI/bank verification provider, OTP, PIN, KYC, or external payout transfer is connected in this phase.</div>
  </SectionContainer>;
}
