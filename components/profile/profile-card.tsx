import type { CurrentUser } from "@/lib/auth";

function initials(name: string | null) {
  return (name?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("") || "U").toUpperCase();
}

export function ProfileAccountCard({ user }: { user: CurrentUser }) {
  const memberSince = new Intl.DateTimeFormat("en-IN", { dateStyle: "long" }).format(user.createdAt);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8" aria-labelledby="profile-account-title">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="size-24 rounded-3xl object-cover ring-1 ring-white/10" />
        ) : (
          <span className="grid size-24 shrink-0 place-items-center rounded-3xl bg-lime-300 text-2xl font-black text-slate-950" aria-hidden="true">
            {initials(user.name)}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Account profile</p>
          <h2 id="profile-account-title" className="mt-2 truncate text-2xl font-black text-white">{user.name ?? "Player"}</h2>
          <p className="mt-1 truncate text-sm text-slate-500">{user.email}</p>
        </div>
      </div>

      <dl className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-white/5 bg-black/10 p-4">
          <dt className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-600">Role</dt>
          <dd className="mt-2 text-sm font-semibold text-white">{user.role === "ADMIN" ? "Administrator" : "User"}</dd>
        </div>
        <div className="rounded-xl border border-white/5 bg-black/10 p-4">
          <dt className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-600">Status</dt>
          <dd className="mt-2 text-sm font-semibold text-lime-300">{user.status}</dd>
        </div>
        <div className="rounded-xl border border-white/5 bg-black/10 p-4 sm:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-600">Member since</dt>
          <dd className="mt-2 text-sm font-semibold text-white">{memberSince}</dd>
        </div>
      </dl>
    </section>
  );
}
