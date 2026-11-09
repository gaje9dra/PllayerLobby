import Link from "next/link";
import { SectionContainer } from "@/components/ui/section-container";
import { AddMoneyForm } from "@/app/dashboard/wallet/add-money/add-money-form";

export default function AddMoneyPage() {
  return <SectionContainer className="py-10 sm:py-14">
    <Link href="/dashboard/wallet" className="text-sm font-semibold text-lime-300 hover:text-lime-200">← Wallet</Link>
    <div className="mt-5 max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Wallet</p>
      <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Add money</h1>
      <p className="mt-2 text-sm leading-6 text-slate-400">Enter an amount and continue directly to secure PayU checkout.</p>
    </div>
    <section className="mt-8 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7">
      <AddMoneyForm />
    </section>
    <p className="mt-5 max-w-2xl text-xs leading-5 text-slate-600">Your wallet is credited only after the server verifies the payment with PayU.</p>
  </SectionContainer>;
}
