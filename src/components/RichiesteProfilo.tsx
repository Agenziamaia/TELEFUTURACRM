"use client";

// RICHIESTE DI MODIFICA PROFILO (Luca 31/07, mig. 120): quando un utente
// chiede di cambiare un dato GIA' presente (il completamento dei campi vuoti
// non passa da qui), l'amministrazione approva o rifiuta da questo box nel
// pannello Utenti. All'approvazione il dato si scrive su app_users.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Richiesta = {
    id: number; user_id: string; user_name: string | null; campo: string;
    etichetta: string | null; valore_attuale: string | null; valore_nuovo: string;
    richiesta_il: string | null;
};

export function RichiesteProfiloBox({ gestore }: { gestore: string }) {
    const [righe, setRighe] = useState<Richiesta[]>([]);
    const carica = useCallback(() => {
        supabase.from("profilo_richieste").select("*").eq("stato", "in_attesa").order("richiesta_il")
            .then(({ data, error }) => { if (!error) setRighe((data ?? []) as Richiesta[]); });
    }, []);
    useEffect(() => { carica(); }, [carica]);

    const gestisci = async (r: Richiesta, approva: boolean) => {
        if (approva) {
            const { error } = await supabase.from("app_users").update({ [r.campo]: r.valore_nuovo }).eq("id", r.user_id);
            if (error) { alert("Aggiornamento utente NON riuscito: " + error.message); return; }
        }
        await supabase.from("profilo_richieste").update({ stato: approva ? "approvata" : "rifiutata", gestita_da: gestore, gestita_il: new Date().toISOString() }).eq("id", r.id);
        carica();
    };

    if (!righe.length) return null;
    return (
        <div className="glass-card p-4 mb-5 border-l-4 border-l-sky-500">
            <p className="text-sm font-bold text-white mb-3">📨 Richieste di modifica profilo <span className="text-sky-300">({righe.length})</span></p>
            <div className="space-y-2">
                {righe.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 flex-wrap">
                        <span className="text-sm font-semibold text-slate-200">{r.user_name || r.user_id}</span>
                        <span className="text-xs text-slate-500">{r.etichetta || r.campo}:</span>
                        <span className="text-xs text-slate-400 line-through">{r.valore_attuale || "—"}</span>
                        <span className="text-xs text-slate-500">→</span>
                        <span className="text-sm font-semibold text-sky-300">{r.valore_nuovo}</span>
                        <span className="ml-auto flex gap-2">
                            <button onClick={() => gestisci(r, true)} className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold hover:bg-emerald-500/30">✓ Approva</button>
                            <button onClick={() => gestisci(r, false)} className="px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold hover:bg-rose-500/25">✕ Rifiuta</button>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
