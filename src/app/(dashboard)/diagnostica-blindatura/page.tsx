"use client";
// DIAGNOSTICA BLINDATURA (Luca 28/08) — pagina temporanea, si smonta a
// cantiere chiuso. Prova dal BROWSER se il lasciapassare arriva davvero al
// database: legge la tabella-cavia, che è chiusa a chi non ce l'ha.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { tokenTf } from "@/lib/tokenClient";

export default function DiagnosticaBlindatura() {
    const [esito, setEsito] = useState<string>("controllo in corso…");
    const [dettaglio, setDettaglio] = useState<string[]>([]);
    useEffect(() => {
        (async () => {
            const righe: string[] = [];
            const t = await tokenTf();
            righe.push(t ? `lasciapassare ricevuto (${t.length} caratteri)` : "nessun lasciapassare");
            const { data, error } = await supabase.from("_blindatura_prova").select("*");
            righe.push(error ? `lettura cavia: errore — ${error.message}` : `lettura cavia: ${data?.length ?? 0} righe`);
            setDettaglio(righe);
            setEsito(!t ? "❌ Il browser NON riceve il lasciapassare: fermarsi"
                : (data?.length ?? 0) > 0 ? "✅ Tutto a posto: il browser presenta il lasciapassare e il database lo riconosce"
                    : "❌ Il lasciapassare c'è ma il database non lo vede: fermarsi");
        })();
    }, []);
    return (
        <div className="p-8 space-y-4">
            <h1 className="text-2xl font-black text-white">🔒 Diagnostica blindatura</h1>
            <div className="glass-card p-5 space-y-2">
                <p className="text-lg font-bold text-white">{esito}</p>
                {dettaglio.map((d, i) => <p key={i} className="text-sm text-slate-400 font-mono">· {d}</p>)}
            </div>
            <p className="text-xs text-slate-500">Pagina di servizio: sparirà a fine cantiere.</p>
        </div>
    );
}
