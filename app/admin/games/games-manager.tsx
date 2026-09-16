"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type Game = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  isActive: boolean;
  createdAt: string;
  tournamentCount: number;
};

type FormState = { name: string; slug: string; description: string; logoUrl: string; isActive: boolean };
const emptyForm: FormState = { name: "", slug: "", description: "", logoUrl: "", isActive: true };

function formFromGame(game: Game): FormState {
  return { name: game.name, slug: game.slug, description: game.description ?? "", logoUrl: game.logoUrl ?? "", isActive: game.isActive };
}

export function GamesManager({ initialGames }: { initialGames: Game[] }) {
  const [games, setGames] = useState(initialGames);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const visibleGames = useMemo(() => games.filter((game) => {
    const matchesSearch = !search.trim() || game.name.toLowerCase().includes(search.trim().toLowerCase()) || game.slug.toLowerCase().includes(search.trim().toLowerCase());
    const matchesStatus = status === "ALL" || (status === "ACTIVE" ? game.isActive : !game.isActive);
    return matchesSearch && matchesStatus;
  }), [games, search, status]);

  function reset() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(editingId ? `/api/admin/games/${editingId}` : "/api/admin/games", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to save game.");
      const saved = payload.game as Game;
      const normalized = { ...saved, createdAt: saved.createdAt ?? new Date().toISOString(), tournamentCount: saved.tournamentCount ?? 0 };
      setGames((current) => editingId ? current.map((item) => item.id === editingId ? { ...item, ...normalized } : item) : [...current, normalized]);
      setMessage(editingId ? "Game updated successfully." : "Game created successfully.");
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save game.");
    } finally { setBusy(false); }
  }

  async function toggle(game: Game) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/admin/games/${game.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...formFromGame(game), isActive: !game.isActive }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to change game status.");
      setGames((current) => current.map((item) => item.id === game.id ? { ...item, ...payload.game } : item));
      setMessage(game.isActive ? "Game deactivated." : "Game activated.");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to change game status."); }
    finally { setBusy(false); }
  }

  async function remove(game: Game) {
    if (game.tournamentCount > 0) { setError("This game has tournament history and must be deactivated instead."); return; }
    if (!window.confirm(`Permanently delete ${game.name}?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/admin/games/${game.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to delete game.");
      setGames((current) => current.filter((item) => item.id !== game.id));
      setMessage("Game deleted.");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to delete game."); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
        <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-bold text-white">{editingId ? "Edit game" : "Add game"}</h2><p className="mt-1 text-sm text-slate-500">Use a logo URL when image storage is not configured.</p></div>{editingId && <Button type="button" variant="secondary" onClick={reset}>Cancel</Button>}</div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-300">Game name<input required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none" /></label>
          <label className="text-sm text-slate-300">Slug (optional)<input maxLength={80} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none" placeholder="auto-generated-from-name" /></label>
          <label className="text-sm text-slate-300 md:col-span-2">Description<textarea maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none" /></label>
          <label className="text-sm text-slate-300">Logo URL<input type="url" maxLength={2048} value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none" placeholder="https://..." /></label>
          <label className="flex items-center gap-3 self-end text-sm text-slate-300"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active and available for new tournaments</label>
        </div>
        {error && <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-200">{error}</p>}
        {message && <p className="mt-4 rounded-xl border border-lime-400/20 bg-lime-400/5 px-4 py-3 text-sm text-lime-200">{message}</p>}
        <Button type="submit" disabled={busy} className="mt-5">{busy ? "Saving..." : editingId ? "Save changes" : "Add game"}</Button>
      </form>

      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
        <div className="flex flex-col gap-3 md:flex-row"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or slug" className="flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none" /><select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white"><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></div>
        <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-3">Game</th><th className="px-3 py-3">Slug</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Tournaments</th><th className="px-3 py-3">Created</th><th className="px-3 py-3">Actions</th></tr></thead><tbody className="divide-y divide-white/5">{visibleGames.map((game) => <tr key={game.id}><td className="px-3 py-4"><div className="flex items-center gap-3">{game.logoUrl ? <img src={game.logoUrl} alt="" className="h-9 w-9 rounded-lg object-cover" /> : <div className="h-9 w-9 rounded-lg bg-white/10" />}<div><p className="font-semibold text-white">{game.name}</p><p className="text-xs text-slate-500">{game.id}</p></div></div></td><td className="px-3 py-4 text-slate-400">{game.slug}</td><td className="px-3 py-4"><span className={game.isActive ? "text-lime-300" : "text-slate-500"}>{game.isActive ? "ACTIVE" : "INACTIVE"}</span></td><td className="px-3 py-4 text-slate-300">{game.tournamentCount}</td><td className="px-3 py-4 text-slate-500">{new Date(game.createdAt).toLocaleDateString()}</td><td className="px-3 py-4"><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => { setEditingId(game.id); setForm(formFromGame(game)); setError(""); setMessage(""); }}>Edit</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => toggle(game)}>{game.isActive ? "Deactivate" : "Activate"}</Button>{game.tournamentCount === 0 && <Button type="button" variant="secondary" disabled={busy} onClick={() => remove(game)}>Delete</Button>}</div></td></tr>)}</tbody></table>{visibleGames.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No games match your filters.</p>}</div>
      </div>
    </div>
  );
}
