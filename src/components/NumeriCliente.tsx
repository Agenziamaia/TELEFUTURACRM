"use client";

// NUMERI MULTIPLI del cliente (Luca 31/07, mig. 121): il PRINCIPALE resta
// clients.cellulare; i secondari (moglie, figlio, lavoro...) vivono in
// client_numeri con un'etichetta libera. "Rendi principale" scambia i due:
// il vecchio principale scende tra gli aggiuntivi.
import { useCallback, useEffect, useState } from "react";
import { Trash2, Star, Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { numeroNazionale } from "@/lib/telefono";

type Numero = { id: number; numero: string; etichetta: string | null };

export function NumeriCliente({ clientId, principale }: { clientId: string; principale: string }) {
    const [numeri, setNumeri] = useState<Numero[]>([]);
    const [principaleVivo, setPrincipaleVivo] = useState(principale);
    const [nuovo, setNuovo] = useState("");
    const [etich, setEtich] = useState("");
    const [tabAssente, setTabAssente] = useState(false);

    const carica = useCallback(() => {
        supabase.from("client_numeri").select("id, numero, etichetta").eq("client_id", clientId).order("id")
            .then(({ data, error }) => {
                if (error) { if (/(relation|table)/i.test(error.message)) setTabAssente(true); return; }
                setNumeri((data ?? []) as Numero[]);
            });
    }, [clientId]);
    useEffect(() => { setPrincipaleVivo(principale); carica(); }, [carica, principale]);

    const aggiungi = async () => {
        const n = numeroNazionale(nuovo) || nuovo.trim();
        if (!n) return;
        const { error } = await supabase.from("client_numeri").insert({ client_id: clientId, numero: n, etichetta: etich.trim() || null });
        if (error) {
            alert(/(relation|table)/i.test(error.message) ? "Manca la migrazione 121 (client_numeri)."
                : /duplicate/i.test(error.message) ? "Questo numero è già tra quelli del cliente." : "Numero NON aggiunto: " + error.message);
            return;
        }
        setNuovo(""); setEtich("");
        carica();
    };

    const salvaEtichetta = async (r: Numero, v: string) => {
        await supabase.from("client_numeri").update({ etichetta: v.trim() || null }).eq("id", r.id);
    };

    const rimuovi = async (r: Numero) => {
        if (!window.confirm(`Rimuovere il numero ${r.numero}${r.etichetta ? ` (${r.etichetta})` : ""}?`)) return;
        await supabase.from("client_numeri").delete().eq("id", r.id);
        carica();
    };

    const rendiPrincipale = async (r: Numero) => {
        // il cellulare principale e' un dato UNIVOCO tra i clienti: si controlla
        const { data: dup } = await supabase.from("clients").select("id").eq("cellulare", r.numero).neq("id", clientId).limit(1);
        if (dup?.length) { alert("Questo numero è il principale di un ALTRO cliente: non può diventare principale qui."); return; }
        if (!window.confirm(`Rendere ${r.numero} il numero PRINCIPALE?${principaleVivo ? `\nL'attuale principale (${principaleVivo}) resta tra i numeri aggiuntivi.` : ""}`)) return;
        const { error } = await supabase.from("clients").update({ cellulare: r.numero }).eq("id", clientId);
        if (error) { alert("Cambio non riuscito: " + error.message); return; }
        await supabase.from("client_numeri").delete().eq("id", r.id);
        if (principaleVivo) await supabase.from("client_numeri").upsert({ client_id: clientId, numero: principaleVivo, etichetta: null }, { onConflict: "client_id,numero" });
        setPrincipaleVivo(r.numero);
        carica();
    };

    if (tabAssente) return null;

    return (
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Numeri di telefono</p>
            <div className="flex items-center gap-2 text-sm">
                <Star className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="font-mono text-slate-200">{principaleVivo || "—"}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold">Principale</span>
            </div>
            {numeri.map((r) => (
                <div key={r.id} className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm text-slate-300">{r.numero}</span>
                    <input defaultValue={r.etichetta || ""} onBlur={(e) => salvaEtichetta(r, e.target.value)} placeholder="etichetta (moglie, figlio, lavoro…)"
                        className="flex-1 min-w-[140px] bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-300 outline-none focus:border-indigo-500/50" />
                    <button onClick={() => rendiPrincipale(r)} title="Rendi questo il numero principale"
                        className="p-1.5 rounded-lg text-slate-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"><Star className="w-3.5 h-3.5" /></button>
                    <button onClick={() => rimuovi(r)} title="Rimuovi il numero"
                        className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
            ))}
            <div className="flex items-center gap-2 pt-1">
                <input value={nuovo} onChange={(e) => setNuovo(e.target.value)} placeholder="Nuovo numero…"
                    className="w-[150px] bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-mono text-slate-200 outline-none focus:border-indigo-500/50" />
                <input value={etich} onChange={(e) => setEtich(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") aggiungi(); }} placeholder="etichetta (facoltativa)"
                    className="flex-1 min-w-[120px] bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-indigo-500/50" />
                <button onClick={aggiungi} disabled={!nuovo.trim()} title="Aggiungi il numero"
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-bold hover:bg-indigo-500/25 disabled:opacity-40 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Aggiungi</button>
            </div>
        </div>
    );
}
