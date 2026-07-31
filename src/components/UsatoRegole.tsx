"use client";

// REGOLE USATO (Luca 31/07, mig. 113): i tempi del laboratorio e il malus
// €/giorno stanno a DB (usati_regole). La tabella vive DENTRO la Gestione
// Usati (bottone ⚙️ Regole, solo admin/dev) — come le regole del tracking
// PDA vivono nel tracking, non in Amministrazione. Le regole guidano il
// countdown nella scheda del telefono e la maturazione degli episodi in
// usati_malus — il passato gia' maturato non viene ricalcolato a ritroso.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Loader2 } from "lucide-react";

type Regola = { fase: string; etichetta: string; giorni: number; malus_giorno: number };

export function UsatoRegoleView() {
    const [regole, setRegole] = useState<Regola[]>([]);
    const [loading, setLoading] = useState(true);
    const [errore, setErrore] = useState<string | null>(null);
    const [salvato, setSalvato] = useState<string | null>(null);

    useEffect(() => {
        supabase.from("usati_regole").select("*").order("fase")
            .then(({ data, error }) => {
                if (error) setErrore(/relation|schema/i.test(error.message) ? "Tabella usati_regole assente: applica la mig. 113." : error.message);
                else setRegole((data ?? []) as Regola[]);
                setLoading(false);
            });
    }, []);

    const salva = async (r: Regola) => {
        const { error } = await supabase.from("usati_regole")
            .update({ giorni: r.giorni, malus_giorno: r.malus_giorno, updated_at: new Date().toISOString() })
            .eq("fase", r.fase);
        if (error) { setErrore(error.message); return; }
        setErrore(null);
        setSalvato(r.fase);
        setTimeout(() => setSalvato(null), 1500);
    };

    if (loading) return <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;

    return (
        <div className="max-w-2xl space-y-4">
            <p className="text-xs text-slate-500">
                Giorni <b>lavorativi</b> (lun–sab) concessi al laboratorio per ogni fase; oltre soglia matura il malus
                €/giorno sul dispositivo. Il telefono sanato (portato in Pronto) smette di maturare ma l&apos;importo resta
                attivo finché non viene compensato nella gara di commissioning — storico nel pulsante ⏱ Malus della
                Gestione Usato.
            </p>
            {errore && <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">{errore}</div>}
            {regole.map((r, i) => (
                <div key={r.fase} className="glass-card p-5 rounded-2xl space-y-3">
                    <div className="text-sm font-bold text-white capitalize">{r.fase === "lavorazione" ? "⏱ Presa in carico (in lavorazione)" : "🔧 Riparazione (dal ricambio arrivato)"}</div>
                    <p className="text-xs text-slate-500">{r.etichetta}</p>
                    <div className="flex items-end gap-4 flex-wrap">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Giorni concessi</label>
                            <input type="number" min={1} max={60} value={r.giorni}
                                onChange={(e) => setRegole((p) => p.map((x, j) => j === i ? { ...x, giorni: parseInt(e.target.value || "0", 10) } : x))}
                                onBlur={() => salva(regole[i])}
                                className="glass-input w-28 text-sm py-2" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Malus €/giorno oltre soglia</label>
                            <input type="number" min={0} step="0.5" value={r.malus_giorno}
                                onChange={(e) => setRegole((p) => p.map((x, j) => j === i ? { ...x, malus_giorno: parseFloat(e.target.value || "0") } : x))}
                                onBlur={() => salva(regole[i])}
                                className="glass-input w-28 text-sm py-2" />
                        </div>
                        {salvato === r.fase && <span className="text-xs font-bold text-emerald-400 pb-2">✓ salvato</span>}
                    </div>
                </div>
            ))}
            <p className="text-[11px] text-slate-600">
                Chi può <b>lavorare</b> l&apos;usato, chi vede <b>tempi e malus</b> e chi vede i <b>costi</b> si decide dalla
                rotellina su Gestione Usato in Utenti → Permessi (default: tecnico senior per il laboratorio,
                amministrativo in su per malus e costi).
            </p>
        </div>
    );
}
