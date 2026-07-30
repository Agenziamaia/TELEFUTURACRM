"use client";

// Direzione Inserimento (#dashboard fase 2). L'Admin mappa, per ogni NEGOZIO, su
// quale CODICE va inserito ogni brand/categoria (tabella direzione_inserimento).
// Il widget "bussola" della Home la mostra in SOLA LETTURA per il negozio dell'utente.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Compass, Plus, Trash2, Loader2, Check, Save } from "lucide-react";
import { cn } from "@/utils";

export const DIR_BRANDS = [
  { id: "windtre", label: "WindTre", color: "#FF6B00" },
  { id: "vodafone", label: "Vodafone", color: "#E60000" },
  { id: "fastweb", label: "Fastweb", color: "#CC9900" },
  { id: "tim", label: "TIM", color: "#0050FF" },
  { id: "iliad", label: "Iliad", color: "#C00028" },
  { id: "sky", label: "Sky", color: "#0072C6" },
  { id: "very", label: "Very Mobile", color: "#1FA300" },
  { id: "ho", label: "Ho. Mobile", color: "#E6007E" },
  { id: "kena", label: "Kena Mobile", color: "#F5A623" },
  { id: "s4", label: "S4 Energia", color: "#28a745" },
  { id: "dojo", label: "Dojo", color: "#14b8a6" },
];
const brandOf = (id: string) => DIR_BRANDS.find((b) => b.id === id) || { id, label: id, color: "#818cf8" };

type Row = { id?: string; brand: string; categoria: string; codice: string | null; attivo: boolean; ordine?: number };

// ─────────────────────────────────────────────────────────────────────────────
// PANNELLO ADMIN — configura la mappa per ogni negozio
// ─────────────────────────────────────────────────────────────────────────────
export function DirezioneInserimentoAdmin() {
  const [stores, setStores] = useState<string[]>([]);
  const [negozio, setNegozio] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.from("stores").select("name").order("name").then(({ data }) => {
      const ns = (data ?? []).map((s: any) => s.name).filter(Boolean);
      setStores(ns);
      setNegozio((n) => n || ns[0] || "");
    });
  }, []);

  useEffect(() => {
    if (!negozio) { setRows([]); return; }
    setLoading(true);
    supabase.from("direzione_inserimento").select("*").eq("negozio", negozio).order("ordine").then(({ data }) => {
      setRows((data ?? []).map((r: any) => ({ id: r.id, brand: r.brand, categoria: r.categoria, codice: r.codice, attivo: r.attivo })));
      setLoading(false);
    });
  }, [negozio]);

  const addRow = () => setRows((p) => [...p, { brand: "windtre", categoria: "", codice: "", attivo: true }]);
  const upd = (i: number, k: keyof Row, v: any) => setRows((p) => p.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const rm = (i: number) => setRows((p) => p.filter((_, j) => j !== i));

  const salva = async () => {
    if (!negozio) return;
    setSaving(true);
    // "replace" delle righe del negozio: cancella e reinserisci (semplice e robusto)
    await supabase.from("direzione_inserimento").delete().eq("negozio", negozio);
    const payload = rows.filter((r) => r.categoria.trim()).map((r, i) => ({
      negozio, brand: r.brand, categoria: r.categoria.trim(), codice: (r.codice || "").trim() || null, attivo: !!r.attivo, ordine: i,
    }));
    if (payload.length) await supabase.from("direzione_inserimento").insert(payload);
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <Compass className="w-5 h-5 text-sky-400" />
          <div>
            <div className="text-sm font-bold text-white">Direzione Inserimento</div>
            <div className="text-xs text-slate-500">Per ogni negozio: su quale <b>codice</b> va inserito ogni brand/categoria. Alimenta la bussola in Home (sola lettura).</div>
          </div>
        </div>
        <select value={negozio} onChange={(e) => setNegozio(e.target.value)} className="glass-input text-sm !h-10 min-w-[180px]">
          {stores.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-slate-500 bg-white/[0.02] border-b border-white/5">
                <th className="py-3 px-4 text-left w-44">Brand</th>
                <th className="py-3 px-4 text-left">Categoria / Pista</th>
                <th className="py-3 px-4 text-left w-48">Codice inserimento</th>
                <th className="py-3 px-4 text-center w-24">Attivo</th>
                <th className="py-3 px-4 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-8 text-center text-slate-500"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carico…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-slate-500 text-sm">Nessuna voce per <b>{negozio || "—"}</b>. Aggiungine una qui sotto.</td></tr>
              ) : rows.map((r, i) => {
                const b = brandOf(r.brand);
                return (
                  <tr key={i} className="border-b border-white/[0.03]">
                    <td className="py-2 px-4">
                      <select value={r.brand} onChange={(e) => upd(i, "brand", e.target.value)} className="glass-input !h-9 text-xs w-full" style={{ borderLeft: `3px solid ${b.color}` }}>
                        {DIR_BRANDS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                      </select>
                    </td>
                    <td className="py-2 px-4"><input value={r.categoria} onChange={(e) => upd(i, "categoria", e.target.value)} placeholder="es. Mobili/MNP, Fissi, Luce e Gas" className="glass-input !h-9 text-xs w-full" /></td>
                    <td className="py-2 px-4"><input value={r.codice || ""} onChange={(e) => upd(i, "codice", e.target.value)} placeholder="es. Magliana" className="glass-input !h-9 text-xs w-full" /></td>
                    <td className="py-2 px-4 text-center">
                      <button onClick={() => upd(i, "attivo", !r.attivo)} className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold", r.attivo ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "bg-white/5 text-slate-500 border border-white/10")}>{r.attivo ? "Sì" : "No"}</button>
                    </td>
                    <td className="py-2 px-4 text-center"><button onClick={() => rm(i)} className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-white/5 flex items-center justify-between gap-3">
          <button onClick={addRow} className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10"><Plus className="w-3.5 h-3.5" /> Aggiungi voce</button>
          <button onClick={salva} disabled={saving} className="flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? "Salvato" : `Salva ${negozio || ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WIDGET BUSSOLA (Home) — sola lettura, per il negozio dell'utente.
// Ritorna solo il CONTENUTO (chi lo usa lo avvolge nella sua card/header).
// ─────────────────────────────────────────────────────────────────────────────
export function BussolaWidget({ negozio }: { negozio?: string | null }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tab, setTab] = useState<string>("");

  useEffect(() => {
    if (!negozio) { setRows([]); return; }
    supabase.from("direzione_inserimento").select("*").eq("negozio", negozio).eq("attivo", true).order("ordine")
      .then(({ data }) => setRows((data ?? []) as Row[]));
  }, [negozio]);

  const brandsPresenti = useMemo(() => {
    if (!rows) return [];
    const ids = [...new Set(rows.map((r) => r.brand))];
    return DIR_BRANDS.filter((b) => ids.includes(b.id));
  }, [rows]);

  useEffect(() => { if (brandsPresenti.length && !brandsPresenti.some((b) => b.id === tab)) setTab(brandsPresenti[0].id); }, [brandsPresenti]); // eslint-disable-line

  if (rows === null) return <div className="p-5 flex items-center justify-center h-full min-h-[160px] text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  if (!negozio || brandsPresenti.length === 0) {
    return (
      <div className="p-5 text-center flex flex-col items-center justify-center gap-2 h-full min-h-[160px]">
        <Compass className="w-8 h-8 text-slate-600" />
        <p className="text-xs text-slate-400">{negozio ? `Nessuna direzione configurata per ${negozio}.` : "Nessun negozio associato al tuo profilo."}</p>
      </div>
    );
  }

  const active = brandOf(tab);
  const piste = (rows || []).filter((r) => r.brand === tab);
  return (
    <div className="flex flex-col">
      <div className="flex overflow-x-auto border-b border-white/5 px-2">
        {brandsPresenti.map((b) => (
          <button key={b.id} onClick={() => setTab(b.id)} className="shrink-0 px-3 py-2.5 text-[11px] font-bold transition-colors border-b-2"
            style={{ color: tab === b.id ? b.color : "#64748b", borderBottomColor: tab === b.id ? b.color : "transparent" }}>
            {b.label}
          </button>
        ))}
      </div>
      <div className="px-4 py-2">
        {piste.map((p, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
            <span className="text-xs text-slate-300">{p.categoria}</span>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-md" style={{ color: active.color, background: `${active.color}18` }}>{p.codice || "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
