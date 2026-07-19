"use client";

import { useEffect, useState } from "react";
import { X, Search, User, FileText, CalendarDays, Loader2 } from "lucide-react";
import { searchEntities, type ChatRef, type RefKind } from "@/lib/chat";

const TABS: { id: RefKind; label: string; Icon: any }[] = [
  { id: "cliente", label: "Cliente", Icon: User },
  { id: "contratto", label: "Contratto", Icon: FileText },
  { id: "appuntamento", label: "Appuntamento", Icon: CalendarDays },
];

export function TagPicker({ onClose, onPick }: { onClose: () => void; onPick: (r: ChatRef) => void }) {
  const [kind, setKind] = useState<RefKind>("cliente");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ChatRef[]>([]);
  const [loading, setLoading] = useState(false);

  // ricerca con debounce
  useEffect(() => {
    if (!q.trim()) { setRows([]); return; }
    setLoading(true);
    const t = setTimeout(() => {
      searchEntities(kind, q).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
    }, 250);
    return () => { clearTimeout(t); setLoading(false); };
  }, [q, kind]);

  const Icon = TABS.find((t) => t.id === kind)!.Icon;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl border border-white/10 bg-[#141824] shadow-2xl overflow-hidden"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4">
          <h3 className="text-white font-semibold">Tagga un record</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 px-5 mt-3">
          {TABS.map(({ id, label, Icon: I }) => (
            <button type="button" key={id} onClick={() => { setKind(id); setRows([]); }}
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded-t-lg border-b-2 transition-colors ${kind === id ? "border-indigo-400 text-white" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
              <I className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        <div className="px-5 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} className="glass-input w-full pl-9"
              placeholder={
                kind === "cliente" ? "Nome, cognome, ragione sociale o CF/P.IVA…"
                  : kind === "contratto" ? "Brand, prodotto, stato, negozio o codice…"
                    : "Cliente, agente o negozio…"} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {loading && (
            <p className="flex items-center gap-2 justify-center text-sm text-slate-500 py-6">
              <Loader2 className="w-4 h-4 animate-spin" /> Ricerca…
            </p>
          )}
          {!loading && q.trim() && rows.length === 0 && (
            <p className="text-center text-sm text-slate-500 py-8">Nessun risultato</p>
          )}
          {!loading && !q.trim() && (
            <p className="text-center text-sm text-slate-500 py-8">Scrivi per cercare.</p>
          )}
          {rows.map((r) => (
            <button type="button" key={`${r.type}-${r.id}`} onClick={() => onPick(r)}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left hover:bg-white/5 transition-colors">
              <span className="w-8 h-8 shrink-0 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
                <Icon className="w-4 h-4 text-indigo-300" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-white truncate">{r.label}</span>
                <span className="block text-[11px] text-slate-500 truncate">{r.type} · {r.id}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
