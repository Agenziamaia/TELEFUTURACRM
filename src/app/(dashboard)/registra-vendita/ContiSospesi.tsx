"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

/* Conti in sospeso (spec Francesco): pulsante ROSSO ben visibile in Registra Vendita.
   Compare quando ci sono vendite registrate ma con lo scontrino ANCORA da fare (il
   cliente deve tornare a pagare). Cliccando si apre la lista: "Riprendi" riapre il
   modale Incasso & Scontrino su quelle voci per fare scontrino + cassa. Lo scontrino
   va sempre emesso: da qui non si "perde" una vendita. */

export interface SospesoRow {
    id: string;
    negozio: string | null;
    cliente: string | null;
    items: any[];
    totale: number | null;
    azienda: string | null;
    created_at: string;
}

const eur = (n: number | null) => "€ " + (Number(n) || 0).toFixed(2).replace(".", ",");

export function ContiSospesi({ negozio, onRiprendi, reloadKey }: {
    negozio: string | null;
    onRiprendi: (s: SospesoRow) => void;
    reloadKey?: number;
}) {
    const [list, setList] = useState<SospesoRow[]>([]);
    const [open, setOpen] = useState(false);

    const load = useCallback(async () => {
        if (!negozio) { setList([]); return; }
        try {
            const res = await fetch("/api/vendita/sospendi?negozio=" + encodeURIComponent(negozio));
            const j = await res.json().catch(() => ({}));
            setList(Array.isArray(j.sospesi) ? j.sospesi : []);
        } catch { setList([]); }
    }, [negozio]);

    useEffect(() => { load(); }, [load, reloadKey]);
    // aggiornamento leggero: un altro banco può aggiungerne uno.
    useEffect(() => {
        const t = setInterval(load, 30000);
        return () => clearInterval(t);
    }, [load]);

    const annulla = async (id: string) => {
        if (!window.confirm("Annullare questo conto in sospeso? La vendita resta registrata ma NON verrà emesso lo scontrino.")) return;
        try {
            await fetch("/api/vendita/sospendi", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, stato: "annullata" }) });
            load();
        } catch { /* noop */ }
    };

    const n = list.length;
    if (!negozio || n === 0) return null;

    return createPortal(
        <>
            <button type="button" onClick={() => setOpen(true)}
                className="fixed bottom-5 left-5 z-[115] flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-semibold shadow-lg shadow-rose-900/40 border border-rose-400/50 animate-pulse">
                <span className="text-lg leading-none">🕗</span>
                <span className="text-sm">Conti in sospeso</span>
                <span className="ml-0.5 min-w-5 h-5 px-1.5 rounded-full bg-white text-rose-600 text-xs font-bold flex items-center justify-center tabular-nums">{n}</span>
            </button>

            {open && (
                <div className="fixed inset-0 z-[122] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
                    <div className="glass-panel w-full max-w-lg p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-baseline justify-between">
                            <h3 className="text-lg font-bold text-white">🕗 Conti in sospeso</h3>
                            <span className="text-xs text-slate-400">{negozio} · {n}</span>
                        </div>
                        <p className="text-[11px] text-slate-500">Riprendi un conto quando il cliente torna a pagare: si riapre Incasso &amp; Scontrino su quelle voci.</p>
                        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                            {list.map((s) => {
                                const nItems = Array.isArray(s.items) ? s.items.length : 0;
                                const when = (() => { try { return new Date(s.created_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } })();
                                return (
                                    <div key={s.id} className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm text-slate-100 font-semibold truncate">{s.cliente || "Cliente non indicato"}</div>
                                            <div className="text-[11px] text-slate-400">{when} · {nItems} voci{s.azienda ? ` · ${s.azienda}` : ""}</div>
                                        </div>
                                        <div className="text-white font-bold tabular-nums whitespace-nowrap">{eur(s.totale)}</div>
                                        <button type="button" onClick={() => { setOpen(false); onRiprendi(s); }}
                                            className="shrink-0 primary-btn px-3 py-1.5 text-xs font-semibold">Riprendi</button>
                                        <button type="button" onClick={() => annulla(s.id)} title="Annulla conto"
                                            className="shrink-0 w-7 h-7 rounded-lg border border-white/10 text-slate-500 hover:text-rose-300 hover:bg-white/10 text-base leading-none">×</button>
                                    </div>
                                );
                            })}
                        </div>
                        <button type="button" onClick={() => setOpen(false)} className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 text-sm">Chiudi</button>
                    </div>
                </div>
            )}
        </>,
        document.body
    );
}
