"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Search, Users, MessageSquarePlus, Check, Megaphone, Store } from "lucide-react";
import { listDirectory, getOrCreateDM, createGroup, broadcast, DirUser } from "@/lib/chat";
import { areaOf, areaLabel, roleLabel } from "@/lib/roles";

const AREA_ORDER = ["pv", "cc", "ob", "sede"];
const initials = (n: string) => n.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

export function NewChatModal({ meId, onClose, onCreated, onBroadcastDone }: {
  meId: string;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
  onBroadcastDone?: (count: number) => void;
}) {
  const [tab, setTab] = useState<"dm" | "group" | "broadcast">("dm");
  const [dir, setDir] = useState<DirUser[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [title, setTitle] = useState("");
  const [bcBody, setBcBody] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { listDirectory(meId).then(setDir).catch(() => setDir([])); }, [meId]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return dir;
    return dir.filter((u) =>
      u.full_name.toLowerCase().includes(s) ||
      (u.primary_store || "").toLowerCase().includes(s) ||
      roleLabel(u.role).toLowerCase().includes(s));
  }, [dir, q]);

  const grouped = useMemo(() => {
    const g: Record<string, DirUser[]> = {};
    for (const u of filtered) { const a = areaOf(u.role) || "sede"; (g[a] ||= []).push(u); }
    return g;
  }, [filtered]);

  // "Tag" selezionabili in un click: negozi e aree
  const stores = useMemo(() => {
    const m: Record<string, number> = {};
    dir.forEach((u) => { if (u.primary_store) m[u.primary_store] = (m[u.primary_store] || 0) + 1; });
    return Object.keys(m).sort().map((s) => ({ name: s, count: m[s] }));
  }, [dir]);
  const areas = useMemo(() => {
    const m: Record<string, number> = {};
    dir.forEach((u) => { const a = areaOf(u.role) || "sede"; m[a] = (m[a] || 0) + 1; });
    return AREA_ORDER.filter((a) => m[a]).map((a) => ({ id: a, count: m[a] }));
  }, [dir]);

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);
  const multi = tab !== "dm";
  const toggle = (id: string) => setSelected((p) => ({ ...p, [id]: !p[id] }));
  const addMany = (users: DirUser[]) =>
    setSelected((p) => { const n = { ...p }; users.forEach((u) => (n[u.id] = true)); return n; });
  const clearAll = () => setSelected({});

  /** Un tag e' "attivo" quando tutti i suoi membri sono selezionati. */
  const isTagOn = (users: DirUser[]) => users.length > 0 && users.every((u) => selected[u.id]);
  /** Click sul tag: seleziona tutti; se erano gia' tutti selezionati, li deseleziona. */
  const toggleMany = (users: DirUser[]) =>
    setSelected((p) => {
      const all = users.length > 0 && users.every((u) => p[u.id]);
      const n = { ...p };
      users.forEach((u) => { if (all) delete n[u.id]; else n[u.id] = true; });
      return n;
    });

  const startDM = async (otherId: string) => {
    if (busy) return; setBusy(true);
    try { onCreated(await getOrCreateDM(meId, otherId)); } finally { setBusy(false); }
  };
  const makeGroup = async () => {
    if (busy || !title.trim() || selectedIds.length === 0) return;
    setBusy(true);
    try { onCreated(await createGroup(meId, title.trim(), selectedIds)); } finally { setBusy(false); }
  };
  const sendBroadcast = async () => {
    if (busy || !bcBody.trim() || selectedIds.length === 0) return;
    setBusy(true);
    try {
      const n = await broadcast(meId, selectedIds, bcBody.trim());
      onBroadcastDone?.(n);
    } catch (e: any) { alert("Invio non riuscito: " + (e?.message || e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[88vh] flex flex-col rounded-2xl border border-white/10 bg-[#141824] shadow-2xl overflow-hidden"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4">
          <h3 className="text-white font-semibold">Nuova conversazione</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex gap-1 px-5 mt-3">
          {[["dm", "Messaggio", MessageSquarePlus], ["group", "Gruppo", Users], ["broadcast", "Broadcast", Megaphone]].map(([id, label, Icon]: any) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded-t-lg border-b-2 transition-colors ${tab === id ? "border-indigo-400 text-white" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {tab === "group" && (
          <div className="px-5 pt-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nome del gruppo" className="glass-input w-full" />
          </div>
        )}

        {tab === "broadcast" && (
          <div className="px-5 pt-3">
            <textarea value={bcBody} onChange={(e) => setBcBody(e.target.value)} rows={3}
              placeholder="Messaggio da inviare a tutti i destinatari…" className="glass-input w-full resize-none" />
            <p className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2 mt-2">
              Ognuno lo riceve come <b>chat privata individuale</b> — non è un gruppo: le risposte arrivano solo a te.
            </p>
          </div>
        )}

        {/* Tag rapidi: negozi / aree (utili sia per gruppo che per broadcast) */}
        {multi && (
          <div className="px-5 pt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5" /> Seleziona un tag (negozio o area)
              </span>
              {selectedIds.length > 0 && (
                <button type="button" onClick={clearAll} className="text-[11px] text-slate-400 hover:text-white">deseleziona tutto</button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {areas.map((a) => {
                const members = dir.filter((u) => (areaOf(u.role) || "sede") === a.id);
                const on = isTagOn(members);
                return (
                  <button type="button" key={a.id} onClick={() => toggleMany(members)}
                    className={`px-2 py-1 rounded-lg text-[11px] border transition-colors flex items-center gap-1 ${on
                      ? "bg-purple-500 text-white border-purple-400"
                      : "bg-purple-500/15 text-purple-200 border-purple-500/25 hover:bg-purple-500/30"}`}>
                    {on && <Check className="w-3 h-3" />}{areaLabel(a.id as any)} · {a.count}
                  </button>
                );
              })}
              {stores.map((s) => {
                const members = dir.filter((u) => u.primary_store === s.name);
                const on = isTagOn(members);
                return (
                  <button type="button" key={s.name} onClick={() => toggleMany(members)}
                    className={`px-2 py-1 rounded-lg text-[11px] border transition-colors flex items-center gap-1 ${on
                      ? "bg-indigo-500 text-white border-indigo-400"
                      : "bg-indigo-500/15 text-indigo-200 border-indigo-500/25 hover:bg-indigo-500/30"}`}>
                    {on && <Check className="w-3 h-3" />}{s.name} · {s.count}
                  </button>
                );
              })}
            </div>
            <p className={`text-xs mt-2 ${selectedIds.length ? "text-indigo-300 font-semibold" : "text-slate-500"}`}>
              {selectedIds.length
                ? `${selectedIds.length} destinatar${selectedIds.length === 1 ? "io" : "i"} selezionat${selectedIds.length === 1 ? "o" : "i"}`
                : "Nessun destinatario selezionato — tocca un tag qui sopra."}
            </p>
          </div>
        )}

        <div className="px-5 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca nome, negozio o ruolo…" className="glass-input w-full pl-9" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {AREA_ORDER.filter((a) => grouped[a]?.length).map((a) => (
            <div key={a} className="mb-2">
              <div className="flex items-center justify-between px-2 py-1.5 sticky top-0 bg-[#141824]">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {areaLabel(a as any)} · {grouped[a].length}
                </span>
                {multi && (
                  <button onClick={() => addMany(grouped[a])} className="text-[11px] text-indigo-400 hover:text-indigo-300">
                    + tutta l'area
                  </button>
                )}
              </div>
              {grouped[a].map((u) => {
                const on = !!selected[u.id];
                return (
                  <button key={u.id} onClick={() => (multi ? toggle(u.id) : startDM(u.id))}
                    className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors ${on ? "bg-indigo-500/15" : "hover:bg-white/5"}`}>
                    <span className="w-9 h-9 shrink-0 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30 flex items-center justify-center">
                      {initials(u.full_name)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-white truncate">{u.full_name}</span>
                      <span className="block text-xs text-slate-500 truncate">
                        {roleLabel(u.role)}{u.primary_store ? ` · ${u.primary_store}` : ""}
                      </span>
                    </span>
                    {multi && (
                      <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${on ? "bg-indigo-500 border-indigo-500" : "border-white/20"}`}>
                        {on && <Check className="w-3.5 h-3.5 text-white" />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && <p className="text-center text-sm text-slate-500 py-8">Nessun risultato</p>}
        </div>

        {tab === "group" && (
          <div className="px-5 py-3 border-t border-white/10">
            <button onClick={makeGroup} disabled={busy || !title.trim() || selectedIds.length === 0}
              className="primary-btn w-full disabled:opacity-40 disabled:cursor-not-allowed">
              Crea gruppo{selectedIds.length ? ` · ${selectedIds.length} membri` : ""}
            </button>
          </div>
        )}
        {tab === "broadcast" && (
          <div className="px-5 py-3 border-t border-white/10">
            <button onClick={sendBroadcast} disabled={busy || !bcBody.trim() || selectedIds.length === 0}
              className="primary-btn w-full disabled:opacity-40 disabled:cursor-not-allowed">
              {busy
                ? "Invio…"
                : selectedIds.length === 0
                  ? "Seleziona i destinatari"
                  : !bcBody.trim()
                    ? "Scrivi il messaggio"
                    : `Invia a ${selectedIds.length} person${selectedIds.length === 1 ? "a" : "e"}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
