"use client";

// VERIFICA "SPETTRO" (Luca 12/08): cliccando Apri da /verifiche si arriva
// sulla sezione col testo della verifica ancora leggibile — card fluttuante
// e traslucida in alto a destra, da chiudere quando ha finito di testare.
import { useEffect, useState } from "react";

export function VerificaSpettro() {
    const [v, setV] = useState<{ titolo: string; dettaglio: string | null } | null>(null);
    useEffect(() => {
        try {
            const raw = sessionStorage.getItem("verifica_spettro");
            if (raw) setV(JSON.parse(raw));
        } catch { /* niente spettro */ }
    }, []);
    if (!v) return null;
    const chiudi = () => { try { sessionStorage.removeItem("verifica_spettro"); } catch { } setV(null); };
    return (
        <div className="fixed top-16 right-4 z-[1500] w-[380px] max-w-[92vw] rounded-2xl border border-indigo-500/40 bg-[#0f111a]/85 backdrop-blur-xl shadow-2xl p-4 opacity-90 hover:opacity-100 transition-opacity">
            <div className="flex items-start justify-between gap-2 mb-2">
                <div className="text-[13px] font-bold text-white leading-snug">🔎 {v.titolo}</div>
                <button onClick={chiudi} className="text-slate-400 hover:text-white text-sm shrink-0" title="Chiudi la verifica">✕</button>
            </div>
            {v.dettaglio && (
                <div className="text-[12px] text-slate-300 whitespace-pre-line max-h-[50vh] overflow-y-auto leading-relaxed">{v.dettaglio}</div>
            )}
        </div>
    );
}
