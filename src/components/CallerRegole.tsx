"use client";

// REGOLE e ARCHIVIO del motore Da Lavorare/Warning/Malus del call center
// (Luca 31/07, stile Dragon PDA). Le regole vivono in caller_regole (soglie in
// giorni lavorativi lun-sab + € al giorno, per stato); gli episodi maturati in
// caller_malus (in_corso → attivo alla sanatoria → compensato in gara).
import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { EpisodioCaller } from "@/lib/callerMalus";

type Riga = { stato: string; giorni_lavorare: number | null; giorni_warning: number | null; giorni_malus: number | null; malus_giorno: number | null; esente: boolean };

export function CallerRegoleModal({ stati, soloLettura = false, onClose, onSaved }: { stati: string[]; soloLettura?: boolean; onClose: () => void; onSaved: () => void }) {
    const [righe, setRighe] = useState<Record<string, Riga>>({});
    const [caricato, setCaricato] = useState(false);
    useEffect(() => {
        supabase.from("caller_regole").select("*").then(({ data }) => {
            const m: Record<string, Riga> = {};
            (data ?? []).forEach((r: Record<string, unknown>) => {
                m[String(r.stato)] = {
                    stato: String(r.stato),
                    giorni_lavorare: r.giorni_lavorare == null ? null : Number(r.giorni_lavorare),
                    giorni_warning: r.giorni_warning == null ? null : Number(r.giorni_warning),
                    giorni_malus: r.giorni_malus == null ? null : Number(r.giorni_malus),
                    malus_giorno: r.malus_giorno == null ? null : Number(r.malus_giorno),
                    esente: !!r.esente,
                };
            });
            setRighe(m); setCaricato(true);
        });
    }, []);
    const tutti = Array.from(new Set([...stati, ...Object.keys(righe)]));
    const salva = async (stato: string, campo: keyof Riga, valore: number | boolean | null) => {
        setRighe((p) => ({ ...p, [stato]: { ...(p[stato] || { stato, giorni_lavorare: null, giorni_warning: null, giorni_malus: null, malus_giorno: null, esente: false }), [campo]: valore } as Riga }));
        const { error } = await supabase.from("caller_regole").upsert({ stato, [campo]: valore }, { onConflict: "stato" });
        if (error) alert("Regola NON salvata: " + error.message + (/(relation|table)/i.test(error.message) ? " — manca la migrazione 119?" : ""));
        else onSaved();
    };
    const CellaGiorni = ({ stato, campo }: { stato: string; campo: "giorni_lavorare" | "giorni_warning" | "giorni_malus" | "malus_giorno" }) => {
        const r = righe[stato];
        const [v, setV] = useState<string>(r && r[campo] != null ? String(r[campo]) : "");
        useEffect(() => { setV(r && r[campo] != null ? String(r[campo]) : ""); }, [r, campo]);
        // visibilita' per TUTTI, modifica solo admin (Luca 31/07)
        if (soloLettura) return <span className={r?.esente ? "text-xs text-slate-600" : "text-xs font-semibold text-slate-200"}>{r?.esente ? "—" : (r && r[campo] != null ? `${r[campo]}${campo === "malus_giorno" ? " €" : ""}` : "—")}</span>;
        return (
            <input type="number" min="0" step={campo === "malus_giorno" ? "0.5" : "1"} value={v} disabled={!!r?.esente}
                onChange={(e) => setV(e.target.value)}
                onBlur={() => { const n = v.trim() === "" ? null : (parseFloat(v.replace(",", ".")) || 0); salva(stato, campo, n); }}
                className="w-20 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-200 outline-none disabled:opacity-30 text-center" />
        );
    };
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="glass-card w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
                    <h3 className="text-lg font-bold text-white">⚙️ Regole Da Lavorare / Warning / Malus</h3>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg text-slate-400"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-4 overflow-y-auto">
                    <p className="text-[11px] text-slate-500 mb-3">Giorni OPERATIVI del caller: conta solo un giorno in cui ha badgiato l&apos;inizio turno (anche un minuto). Per richiami e appuntamenti il conteggio parte dal giorno fissato sul calendario. Esente = lo stato non invecchia mai.{soloLettura ? " Le regole le modifica l'amministrazione." : ""}</p>
                    {!caricato ? <p className="text-sm text-slate-500">Carico…</p> : (
                        <table className="w-full text-sm">
                            <thead><tr className="text-[10px] uppercase tracking-wider text-slate-500 text-left">
                                <th className="py-2 pr-2">Stato</th><th className="py-2 px-1 text-center">Da lavorare</th><th className="py-2 px-1 text-center">Warning</th><th className="py-2 px-1 text-center">Malus</th><th className="py-2 px-1 text-center">€ / giorno</th><th className="py-2 px-1 text-center">Esente</th>
                            </tr></thead>
                            <tbody>
                                {tutti.map((s) => {
                                    const r = righe[s];
                                    return (
                                        <tr key={s} className="border-t border-white/5">
                                            <td className="py-1.5 pr-2 text-slate-200 font-semibold whitespace-nowrap">{s}</td>
                                            <td className="py-1.5 px-1 text-center"><CellaGiorni stato={s} campo="giorni_lavorare" /></td>
                                            <td className="py-1.5 px-1 text-center"><CellaGiorni stato={s} campo="giorni_warning" /></td>
                                            <td className="py-1.5 px-1 text-center"><CellaGiorni stato={s} campo="giorni_malus" /></td>
                                            <td className="py-1.5 px-1 text-center"><CellaGiorni stato={s} campo="malus_giorno" /></td>
                                            <td className="py-1.5 px-1 text-center">
                                                {soloLettura ? (
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${r?.esente ? "bg-slate-500/15 text-slate-400 border-slate-500/30" : "bg-emerald-500/10 text-emerald-400/70 border-emerald-500/20"}`}>{r?.esente ? "Esente" : "Attivo"}</span>
                                                ) : (
                                                    <button onClick={() => salva(s, "esente", !r?.esente)} title={r?.esente ? "Esente — clicca per farlo invecchiare" : "Clicca per esentarlo"}
                                                        className={`relative w-9 h-5 rounded-full transition-colors ${r?.esente ? "bg-slate-500/70" : "bg-white/10"}`}>
                                                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${r?.esente ? "left-[18px]" : "left-0.5"}`} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

const CHIP: Record<string, string> = {
    in_corso: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    attivo: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    archiviato: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    compensato: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};
const LABEL: Record<string, string> = { in_corso: "⏳ In corso", attivo: "🟠 Attivo (da compensare)", archiviato: "📦 Archiviato", compensato: "✅ Compensato" };

export function ArchivioMalusCallerModal({ puoCompensare, utente, soloCaller, onClose }: { puoCompensare: boolean; utente: string; soloCaller?: string; onClose: () => void }) {
    const [episodi, setEpisodi] = useState<EpisodioCaller[]>([]);
    const [caricato, setCaricato] = useState(false);
    const carica = useCallback(() => {
        // soloCaller (Luca 31/07, come il tracking PDA): il caller vede SOLO il
        // proprio storico — in corso, attivi e compensati
        // esclude i tombstone (malus annullati dal match vendita, mig. 192)
        let q = supabase.from("caller_malus").select("*").or("eliminato.is.null,eliminato.eq.false").order("created_at", { ascending: false }).limit(500);
        if (soloCaller) q = q.eq("caller", soloCaller);
        q.then(({ data }) => { setEpisodi((data ?? []) as EpisodioCaller[]); setCaricato(true); });
    }, [soloCaller]);
    useEffect(() => { carica(); }, [carica]);
    const compensa = async (ep: EpisodioCaller) => {
        if (!window.confirm(`Segnare COMPENSATO il malus di ${ep.importo} € (${ep.caller || "—"}, ${ep.stato_pratica || "—"})?\nDa fare solo quando viene pagato nelle gare di commissioning.`)) return;
        await supabase.from("caller_malus").update({ stato: "compensato", compensato_il: new Date().toISOString(), compensato_da: utente }).eq("id", ep.id);
        carica();
    };
    const tot = (st: string) => episodi.filter((e) => e.stato === st).reduce((s, e) => s + Number(e.importo || 0), 0);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="glass-card w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
                    <h3 className="text-lg font-bold text-white">{soloCaller ? "⏱ Il mio storico malus" : "⏱ Archivio Malus Call Center"}</h3>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg text-slate-400"><X className="w-5 h-5" /></button>
                </div>
                <div className="px-4 pt-3 flex gap-2 flex-wrap text-[11px]">
                    {(["in_corso", "attivo", "archiviato", "compensato"] as const).map((st) => (
                        <span key={st} className={`px-2.5 py-1 rounded-full border font-semibold ${CHIP[st]}`}>{LABEL[st]}: {tot(st).toFixed(2).replace(".", ",")} €</span>
                    ))}
                </div>
                <div className="p-4 overflow-y-auto space-y-2">
                    {!caricato ? <p className="text-sm text-slate-500">Carico…</p>
                        : episodi.length === 0 ? <p className="text-sm text-slate-500">Nessun episodio di malus registrato.</p>
                            : episodi.map((ep) => (
                                <div key={ep.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 flex-wrap">
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${CHIP[ep.stato]}`}>{LABEL[ep.stato]}</span>
                                    <span className="text-sm text-slate-200 font-semibold">{ep.caller || "—"}</span>
                                    <span className="text-xs text-slate-400">{ep.stato_pratica || "—"}</span>
                                    <span className="text-xs text-slate-500">dal {ep.dal}{ep.al ? ` al ${ep.al}` : ""} · {ep.giorni} gg</span>
                                    <span className="ml-auto text-sm font-bold text-rose-300">−{Number(ep.importo).toFixed(2).replace(".", ",")} €</span>
                                    {(ep.stato === "attivo" || ep.stato === "archiviato") && puoCompensare && (
                                        <button onClick={() => compensa(ep)} className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold hover:bg-emerald-500/25">Compensa</button>
                                    )}
                                    {ep.stato === "compensato" && ep.compensato_da && <span className="text-[10px] text-slate-600">da {ep.compensato_da}</span>}
                                </div>
                            ))}
                </div>
            </div>
        </div>
    );
}
