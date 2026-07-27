"use client";

/* INCARICHI (Luca 29/07) — permessi "di capacità": funzioni operative
   assegnate a persone specifiche, non semplice visibilità (per quella c'è
   Permessi). Primo incarico: la GESTIONE FERIE. Pensato per la rivendita:
   il cliente decide CHI è designato e se, oltre al pallino sulla sezione,
   deve arrivare anche il task nel fulmine ⚡ (indirizzato solo ai designati).
   Ogni salvataggio scrive su `incarichi` e RILEGGE dal DB. */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/utils";
import { Loader2, Zap, Users } from "lucide-react";
import { notify, dbError } from "./toast";

interface Incarico { chiave: string; titolo: string; descrizione: string; assegnatari: string[]; fulmine: boolean }
interface Persona { id: string; full_name: string; role: string }

export function IncarichiView() {
    const [loading, setLoading] = useState(true);
    const [incarichi, setIncarichi] = useState<Incarico[]>([]);
    const [persone, setPersone] = useState<Persona[]>([]);
    const [busy, setBusy] = useState(false);

    const carica = async () => {
        const [inc, pers] = await Promise.all([
            supabase.from("incarichi").select("*").order("chiave"),
            supabase.from("app_users").select("id, full_name, role").eq("active", true).order("full_name"),
        ]);
        if (dbError("Caricamento incarichi", inc.error)) return;
        setIncarichi((inc.data ?? []) as Incarico[]);
        setPersone((pers.data ?? []) as Persona[]);
        setLoading(false);
    };
    useEffect(() => { carica(); }, []);

    const salva = async (chiave: string, patch: Partial<Incarico>) => {
        if (busy) return;
        setBusy(true);
        try {
            const { error } = await supabase.from("incarichi").update({ ...patch, updated_at: new Date().toISOString() }).eq("chiave", chiave);
            if (dbError("Salvataggio incarico", error)) return;
            await carica();                       // rilettura: quello che vedi è ciò che vale
            notify("Incarico aggiornato ✓", "ok");
        } finally { setBusy(false); }
    };

    const togAssegnatario = (inc: Incarico, id: string) => {
        const next = inc.assegnatari.includes(id) ? inc.assegnatari.filter((x) => x !== id) : [...inc.assegnatari, id];
        salva(inc.chiave, { assegnatari: next });
    };

    if (loading) return <div className="flex items-center gap-3 text-slate-400 py-16 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Caricamento incarichi…</div>;

    // in prima fila chi fa parte dell'amministrazione, ma OGNI utente è designabile
    const ordinate = [...persone].sort((a, b) => {
        const pa = ["amministrativo", "admin", "direttore_generale"].includes(a.role) ? 0 : 1;
        const pb = ["amministrativo", "admin", "direttore_generale"].includes(b.role) ? 0 : 1;
        return pa - pb || a.full_name.localeCompare(b.full_name);
    });

    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-400 max-w-3xl">
                Qui si decide <b className="text-slate-200">chi è designato</b> alle funzioni operative
                (non è visibilità: per quella c&apos;è Permessi). I designati ricevono il
                <b className="text-slate-200"> pallino</b> sulla sezione interessata; con il fulmine attivo
                anche il <b className="text-slate-200">task ⚡</b>, indirizzato solo a loro.
                Senza designati, le notifiche seguono il comportamento standard (tutta l&apos;amministrazione).
            </p>
            {incarichi.map((inc) => (
                <div key={inc.chiave} className="glass-card p-5 space-y-3">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <h3 className="text-base font-bold text-white flex items-center gap-2"><Users className="w-4 h-4 text-violet-400" /> {inc.titolo}</h3>
                            <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">{inc.descrizione}</p>
                        </div>
                        <button onClick={() => salva(inc.chiave, { fulmine: !inc.fulmine })}
                            title="Con il fulmine attivo, ogni nuova richiesta genera anche un task ⚡ indirizzato ai designati"
                            className={cn("flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all",
                                inc.fulmine ? "border-amber-400/70 bg-amber-500/15 text-amber-200" : "border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/25")}>
                            <Zap className="w-4 h-4" /> Task nel fulmine: {inc.fulmine ? "ATTIVO" : "spento"}
                        </button>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                            Designati <span className="normal-case font-normal">({inc.assegnatari.length || "nessuno — vale il comportamento standard"})</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {ordinate.map((p) => (
                                <button key={p.id} onClick={() => togAssegnatario(inc, p.id)}
                                    className={cn("px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all",
                                        inc.assegnatari.includes(p.id)
                                            ? "border-violet-400/70 bg-violet-500/20 text-violet-100"
                                            : "border-white/10 text-slate-400 hover:border-white/25")}>
                                    {inc.assegnatari.includes(p.id) ? "✓ " : ""}{p.full_name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
