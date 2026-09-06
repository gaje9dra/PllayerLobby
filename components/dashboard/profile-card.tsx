import type { CurrentUser } from "@/lib/auth";

function initials(name: string | null) {
  return (name?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("") || "U").toUpperCase();
}

export function ProfileCard({ user }: { user: CurrentUser }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/10 sm:p-7" aria-labelledby="profile-card-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Profile</p>
          <h2 id="profile-card-title" className="mt-2 text-lg font-bold text-white">Your account</h2>
        </div>
        <span className="rounded-full border border-lime-300/20 bg-lime-300/10 px-3 py-1 text-xs font-bold text-lime-300">{user.role}</span>
      </div>

      <div className="mt-7 flex items-center gap-4">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="size-16 rounded-2xl object-cover ring-1 ring-white/10" />
        ) : (
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-lime-300 text-lg font-black text-slate-950" aria-hidden="true">
            {initials(user.name)}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-white">{user.name ?? "Player"}</p>
          <p className="truncate text-sm text-slate-500">{user.email}</p>
        </div>
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/5 bg-black/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-600">Role</p>
          <p className="mt-2 text-sm font-semibold text-white">{user.role === "ADMIN" ? "Administrator" : "User"}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-black/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-600">Status</p>
          <p className="mt-2 text-sm font-semibold text-lime-300">{user.status}</p>
        </div>
      </div>
    </section>
  );
}
