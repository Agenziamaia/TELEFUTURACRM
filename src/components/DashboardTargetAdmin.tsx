"use client";

// Obiettivi Home (dashboard fase 2b). L'Admin imposta i target CONTRATTI per
// ambito (rete / per negozio / per venditore); il widget "Obiettivo" della Home
// mostra la barra reale per l'ambito dell'utente loggato. Salvataggio "replace".
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Target, Save, Loader2, Check, Plus, Trash2, Globe, Store as StoreIcon, User } from "lucide-react";
import { cn } from "@/utils";

type T = { tipo: string; riferimento: string | null; valore: number };

export function DashboardTargetAdmin() {
  const [tab, setTab] = useState<"rete" | "negozio" | "venditore">("rete");
  const [stores, setStores] = useState<string[]>([]);
  const [vendList, setVendList] = useState<string[]>([]);
  const [rete, setRete] = useState<number>(0);
  const [negozi, setNegozi] = useState<Record<string, number>>({});
  const [vend, setVend] = useState<{ nome: string; valore: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: st }, { data: us }, { data: tg }] = await Promise.all([
        supabase.from("stores").select("name").order("name"),
        supabase.from("app_users").select("full_name").eq("active", true).order("full_name"),
        supabase.from("dashboard_targets").select("*"),
      ]);
      setStores((st ?? []).map((s: any) => s.name).filter(Boolean));
      setVendList((us ?? []).map((u: any) => u.full_name).filter(Boolean));
      const rows = (tg ?? []) as T[];
      setRete(rows.find((r) => r.tipo === "rete")?.valore || 0);
      const ng: Record<string, number> = {};
      rows.filter((r) => r.tipo === "negozio" && r.riferimento).forEach((r) => { ng[r.riferimento!] = r.valore; });
      setNegozi(ng);
      setVend(rows.filter((r) => r.tipo === "venditore" && r.riferimento).map((r) => ({ nome: r.riferimento!, valore: r.valore })));
      setLoading(false);
    })();
  }, []);

  const salva = async () => {
    setSaving(true);
    await supabase.from("dashboard_targets").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const payload: any[] = [];
    if (rete > 0) payload.push({ tipo: "rete", riferimento: null, valore: rete });
    Object.entries(negozi).forEach(([n, v]) => { if (v > 0) payload.push({ tipo: "negozio", riferimento: n, valore: v }); });
    vend.forEach((x) => { if (x.nome && x.valore > 0) payload.push({ tipo: "venditore", riferimento: x.nome, valore: x.valore }); });
    if (payload.length) await supabase.from("dashboard_targets").insert(payload);
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const TABS = [
    { id: "rete" as const, label: "Rete", icon: Globe },
    { id: "negozio" as const, label: "Per negozio", icon: StoreIcon },
    { id: "venditore" as const, label: "Per venditore", icon: User },
  ];

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 flex items-center gap-3">
        <Target className="w-5 h-5 text-indigo-400" />
        <div>
          <div className="text-sm font-bold text-white">Obiettivi Home</div>
          <div className="text-xs text-slate-500">Target CONTRATTI del mese per ambito — alimentano la barra "Obiettivo" nella Home (Consulente=proprio, Manager=negozio, Admin=rete).</div>
        </div>
      </div>

      <div className="flex gap-2">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn("flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border", tab === t.id ? "bg-indigo-500/15 text-indigo-200 border-indigo-500/30" : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10")}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="glass-card p-5">
        {loading ? <div className="py-8 text-center text-slate-500"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carico…</div> : (
          <>
            {tab === "rete" && (
              <div className="max-w-sm">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Obiettivo contratti — intera rete</label>
                <input type="number" min={0} value={rete || ""} onChange={(e) => setRete(parseInt(e.target.value) || 0)} className="glass-input w-full text-lg font-bold mt-1" placeholder="es. 600" />
              </div>
            )}
            {tab === "negozio" && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {stores.map((s) => (
                  <div key={s}>
                    <label className="text-[11px] font-semibold text-slate-400">{s}</label>
                    <input type="number" min={0} value={negozi[s] || ""} onChange={(e) => setNegozi((p) => ({ ...p, [s]: parseInt(e.target.value) || 0 }))} className="glass-input w-full text-sm mt-0.5" placeholder="0" />
                  </div>
                ))}
              </div>
            )}
            {tab === "venditore" && (
              <div className="space-y-2">
                {vend.map((x, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select value={x.nome} onChange={(e) => setVend((p) => p.map((y, j) => j === i ? { ...y, nome: e.target.value } : y))} className="glass-input !h-9 text-xs flex-1">
                      <option value="">— scegli venditore —</option>
                      {vendList.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <input type="number" min={0} value={x.valore || ""} onChange={(e) => setVend((p) => p.map((y, j) => j === i ? { ...y, valore: parseInt(e.target.value) || 0 } : y))} className="glass-input !h-9 text-xs w-28" placeholder="obiettivo" />
                    <button onClick={() => setVend((p) => p.filter((_, j) => j !== i))} className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
                <button onClick={() => setVend((p) => [...p, { nome: "", valore: 0 }])} className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10"><Plus className="w-3.5 h-3.5" /> Aggiungi venditore</button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex justify-end">
        <button onClick={salva} disabled={saving} className="flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? "Salvato" : "Salva obiettivi"}
        </button>
      </div>
    </div>
  );
}
