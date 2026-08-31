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

export function ContiSospesi({ negozio, onRiprendi, reloadKey, cassaAccesa, stessoBanco }: {
    /** il punto vendita in cui si sta lavorando adesso */
    negozio: string | null;
    onRiprendi: (s: SospesoRow) => void;
    reloadKey?: number;
    /** in questo negozio lo scontrino fiscale è configurato? */
    cassaAccesa: (neg: string | null) => boolean;
    /** questo negozio è lo stesso bancone di quello in cui sto? */
    stessoBanco: (a: string | null, b: string | null) => boolean;
}) {
    const [list, setList] = useState<SospesoRow[]>([]);
    const [open, setOpen] = useState(false);

    /* NON SI CHIEDE PIÙ UN NEGOZIO (Luca 31/08). Qui si passava il negozio
       SCELTO NEL MODULO, che è un campo modificabile: lo store manager di
       Magliana, con «Donna» selezionato, si vedeva i conti aperti di Donna.
       Adesso decide il server, che sa chi sei: l'amministrazione li vede
       tutti, gli altri vedono i propri. */
    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/vendita/sospendi");
            const j = await res.json().catch(() => ({}));
            setList(Array.isArray(j.sospesi) ? j.sospesi : []);
        } catch { setList([]); }
    }, []);

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
    if (n === 0) return null;

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
                            {/* l'elenco può attraversare più negozi: si nomina quello
                                solo quando è davvero uno solo, se no si dice quanti */}
                            <span className="text-xs text-slate-400">
                                {(() => { const ns = [...new Set(list.map(x => x.negozio).filter(Boolean))];
                                    return ns.length === 1 ? `${ns[0]} · ${n}` : `${ns.length} punti vendita · ${n}`; })()}
                            </span>
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
                                            {/* IL NEGOZIO SULLA RIGA: l'amministrazione ne vede di
                                                più d'uno, e senza il nome non saprebbe dove sono i
                                                soldi da incassare */}
                                            <div className="text-[11px] text-slate-400">{when} · {nItems} voci{s.negozio ? ` · ${s.negozio}` : ""}{s.azienda ? ` · ${s.azienda}` : ""}</div>
                                        </div>
                                        <div className="text-white font-bold tabular-nums whitespace-nowrap">{eur(s.totale)}</div>
                                        {/* SI RIPRENDE SOLO DAL BANCONE GIUSTO (revisore 31/08).
                                            Due pericoli veri, tutti e due misurati:
                                            · un negozio SENZA scontrino fiscale configurato — Collatina
                                              Multi — stampava un documento NON fiscale sul suo
                                              registratore e segnava il conto «completata»: dieci euro
                                              incassati e chiusi senza scontrino;
                                            · l'amministrazione, che adesso li vede tutti, poteva
                                              accodare un incasso in contanti sulla cassa di Promontori
                                              stando in ufficio, mentre in negozio non c'è nessun cliente.
                                            Chi non è al bancone giusto legge e basta. */}
                                        {stessoBanco(s.negozio, negozio) && cassaAccesa(s.negozio) ? (
                                            <>
                                                <button type="button" onClick={() => { setOpen(false); onRiprendi(s); }}
                                                    className="shrink-0 primary-btn px-3 py-1.5 text-xs font-semibold">Riprendi</button>
                                                <button type="button" onClick={() => annulla(s.id)} title="Annulla conto"
                                                    className="shrink-0 w-7 h-7 rounded-lg border border-white/10 text-slate-500 hover:text-rose-300 hover:bg-white/10 text-base leading-none">×</button>
                                            </>
                                        ) : (
                                            <span className="shrink-0 text-[10px] text-slate-500 max-w-[132px] leading-tight text-right">
                                                {!cassaAccesa(s.negozio)
                                                    ? "qui lo scontrino non è ancora configurato"
                                                    : `si riprende da ${s.negozio}`}
                                            </span>
                                        )}
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
