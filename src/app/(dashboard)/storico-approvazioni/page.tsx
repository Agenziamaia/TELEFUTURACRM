"use client";

/**
 * STORICO APPROVAZIONI (dal fulmine ⚡ delle task urgenti) — pack direzionale.
 * Tre code in un'unica cronologia: modifiche contratto approvate/rifiutate,
 * accessi ai dati cliente decisi, task urgenti completate. Chi ha deciso, cosa
 * e quando: cosi' "il primo che approva vale per tutti" resta verificabile.
 */

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/utils";
import { SelectOpzioni, SelectMulti } from "@/components/SelectPersona";

interface Voce {
    id: string;
    tipo: "contratto" | "cliente" | "task";
    titolo: string;
    richiedente: string;
    esito: "approved" | "rejected" | "done";
    decisore: string;
    quando: string;
    nota?: string | null;
}

const ESITO = {
    approved: { label: "Approvata", cls: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" },
    rejected: { label: "Rifiutata", cls: "bg-rose-500/15 border-rose-500/40 text-rose-300" },
    done: { label: "Completata", cls: "bg-indigo-500/15 border-indigo-500/40 text-indigo-300" },
} as const;

const TIPO = {
    contratto: "📄 Modifica contratto",
    cliente: "🔓 Accesso cliente",
    task: "⚡ Task urgente",
} as const;

export default function StoricoApprovazioni() {
    const { user } = useAuth();
    const router = useRouter();
    const [voci, setVoci] = useState<Voce[]>([]);
    const [loading, setLoading] = useState(true);
    const isDirezione = !!user && ["admin", "dev", "amministrativo", "direttore_generale"].includes(user.role);

    useEffect(() => {
        if (user && !isDirezione) router.push("/dashboard");
    }, [user, isDirezione, router]);

    useEffect(() => {
        if (!isDirezione) return;
        (async () => {
            const [ccr, car, tk] = await Promise.all([
                supabase.from("contract_change_requests")
                    .select("id,contract_id,requested_by_name,status,reviewed_by_name,reviewed_at,review_note,created_at")
                    .neq("status", "pending").order("reviewed_at", { ascending: false }).limit(200),
                supabase.from("client_access_requests")
                    .select("id,requested_by_name,status,decided_by,decided_at,created_at,motivo,clients(nome,cognome,ragione_sociale,tipo)")
                    .neq("status", "pending").order("decided_at", { ascending: false }).limit(200),
                supabase.from("admin_tasks")
                    .select("id,titolo,created_by,done_by,done_at")
                    .eq("done", true).order("done_at", { ascending: false }).limit(200),
            ]);
            const out: Voce[] = [];
            (ccr.data ?? []).forEach((r: Record<string, unknown>) => out.push({
                id: `c-${r.id}`, tipo: "contratto",
                titolo: `Contratto ${String(r.contract_id)}`,
                richiedente: String(r.requested_by_name || "—"),
                esito: r.status === "approved" ? "approved" : "rejected",
                decisore: String(r.reviewed_by_name || "—"),
                quando: String(r.reviewed_at || r.created_at || ""),
                nota: (r.review_note as string) || null,
            }));
            (car.data ?? []).forEach((r: Record<string, unknown>) => {
                const cl = r.clients as Record<string, unknown> | null;
                const nome = cl ? (cl.tipo === "business" && cl.ragione_sociale ? String(cl.ragione_sociale) : `${cl.nome || ""} ${cl.cognome || ""}`.trim()) : "—";
                out.push({
                    id: `a-${r.id}`, tipo: "cliente",
                    titolo: `Dati del cliente ${nome}`,
                    richiedente: String(r.requested_by_name || "—"),
                    esito: r.status === "approved" ? "approved" : "rejected",
                    decisore: String(r.decided_by || "—"),
                    quando: String(r.decided_at || r.created_at || ""),
                    // motivo della richiesta (mig. 137): stessa colonna nota dei contratti
                    nota: (r.motivo as string) || null,
                });
            });
            (tk.data ?? []).forEach((r: Record<string, unknown>) => out.push({
                id: `t-${r.id}`, tipo: "task",
                titolo: String(r.titolo),
                richiedente: String(r.created_by || "—"),
                esito: "done",
                decisore: String(r.done_by || "—"),
                quando: String(r.done_at || ""),
            }));
            out.sort((x, y) => (y.quando || "").localeCompare(x.quando || ""));
            setVoci(out);
            setLoading(false);
        })();
    }, [isDirezione]);

    // FILTRI (Luca 02/08): per APPROVATORE (chi ha deciso) e per TIPOLOGIA
    const [fDecisori, setFDecisori] = useState<string[]>([]);
    const [fTipo, setFTipo] = useState("");
    const TIPO_FILTRO: Record<string, Voce["tipo"]> = { "Modifiche contratto": "contratto", "Accessi cliente": "cliente", "Task": "task" };
    const decisori = useMemo(() => [...new Set(voci.map(v => v.decisore).filter(d => d && d !== "—"))].sort(), [voci]);
    const vociFiltrate = useMemo(() => voci.filter(v => {
        if (fDecisori.length && !fDecisori.includes(v.decisore)) return false;
        if (fTipo && v.tipo !== TIPO_FILTRO[fTipo]) return false;
        return true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [voci, fDecisori, fTipo]);

    if (!isDirezione) return null;
    return (
        <div className="max-w-4xl mx-auto space-y-5">
            <div className="flex items-center gap-3">
                <button onClick={() => router.back()} className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">
                    <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-amber-300" /> Storico approvazioni</h1>
                    <p className="text-sm text-slate-400">Tutte le decisioni del pack direzionale: modifiche contratto, accessi cliente e task completate.</p>
                </div>
            </div>

            <div className="glass-panel p-3.5 flex flex-wrap gap-2 items-center">
                <div className="w-60"><SelectMulti values={fDecisori} onChange={setFDecisori} opzioni={decisori} placeholder="Approvatori — scrivi per filtrare" /></div>
                <div className="w-48"><SelectOpzioni value={fTipo} onChange={setFTipo} opzioni={Object.keys(TIPO_FILTRO)} placeholder="Tutte le tipologie" /></div>
                {(fDecisori.length > 0 || fTipo) && (
                    <button onClick={() => { setFDecisori([]); setFTipo(""); }} className="text-xs text-slate-400 hover:text-white px-2">↺ azzera</button>
                )}
                <span className="ml-auto text-xs text-slate-500">{vociFiltrate.length} decision{vociFiltrate.length === 1 ? "e" : "i"}</span>
            </div>

            {loading ? (
                <div className="p-10 text-center text-slate-400">Caricamento…</div>
            ) : vociFiltrate.length === 0 ? (
                <div className="p-10 text-center text-slate-500 rounded-xl bg-white/[0.02] border border-white/5">Nessuna decisione con questi filtri.</div>
            ) : (
                <div className="space-y-2">
                    {vociFiltrate.map((v) => (
                        <div key={v.id} className="p-4 rounded-xl bg-white/[0.02] border border-white/8 flex items-start gap-3 flex-wrap">
                            <div className="flex-1 min-w-[240px]">
                                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{TIPO[v.tipo]}</div>
                                <div className="text-sm font-semibold text-white mt-0.5">{v.titolo}</div>
                                <div className="text-xs text-slate-400 mt-1">
                                    Richiesta da <strong className="text-slate-300">{v.richiedente}</strong> · decisa da <strong className="text-slate-300">{v.decisore}</strong>
                                </div>
                                {v.nota && <div className="text-xs text-slate-500 mt-1 italic">“{v.nota}”</div>}
                            </div>
                            <div className="text-right space-y-1">
                                <span className={cn("inline-block text-[11px] font-bold px-2.5 py-1 rounded-full border", ESITO[v.esito].cls)}>{ESITO[v.esito].label}</span>
                                <div className="text-[11px] text-slate-500">{v.quando ? new Date(v.quando).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
