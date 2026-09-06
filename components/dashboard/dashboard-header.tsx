import { SignOutButton } from "@/components/auth/sign-out-button";

type DashboardHeaderProps = {
  name: string | null;
};

export function DashboardHeader({ name }: DashboardHeaderProps) {
  return (
    <div className="flex flex-col gap-6 border-b border-white/10 pb-8 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-lime-300">Player dashboard</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
          Welcome back, {name ?? "Player"}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
          Manage your ArenaX account and keep an eye on the tournaments, payments, and notifications that will be connected here in future phases.
        </p>
      </div>
      <SignOutButton />
    </div>
  );
}
