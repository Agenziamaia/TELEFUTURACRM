"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import { arrotonda5, totaleRighe, PAGAMENTO, type RigaScontrino, type MetodoPagamento } from "@/lib/pos";

/* Modale "Incasso & Scontrino" — l'output fiscale di Registra Vendita.
   Si apre a vendita registrata: sceglie il pagamento, per i CONTANTI mette in coda
   un incasso sulla cassa automatica pagAmico (l'agente locale del negozio la comanda
   e riporta incassato/resto), poi mette in coda lo scontrino fiscale sul RT.
   Tutto passa dalla coda cloud (print_jobs) → l'agente del negozio esegue sul LAN:
   funziona da qualsiasi dispositivo, nessun collegamento diretto dal browser.
   Contanti = guida la macchina; Carta/Finanziamento = solo scontrino (il POS è a
   parte). Il reset della vendita avviene alla chiusura (onDone). */

export interface ScontrinoData {
    items: RigaScontrino[];
    negozio: string | null;
    deviceUrl?: string;
}

const eur = (n: number) => "€ " + (Number(n) || 0).toFixed(2).replace(".", ",");
const POLL_MS = 1500;
const CASH_TIMEOUT_MS = 240000; // 4 min: il cliente inserisce i contanti

type Fase = "scelta" | "incasso" | "stampa" | "fatto" | "errore";

export function ScontrinoCassa({ data, onDone }: { data: ScontrinoData | null; onDone: () => void }) {
    const [metodo, setMetodo] = useState<MetodoPagamento>("CONTANTI");
    const [fase, setFase] = useState<Fase>("scelta");
    const [incassato, setIncassato] = useState(0);
    const [resto, setResto] = useState(0);
    const [msg, setMsg] = useState("");
    const [esclusi, setEsclusi] = useState<{ description: string; motivo: string }[]>([]);
    // Contanti già incassati: evita il DOPPIO incasso se lo scontrino fallisce e si riprova.
    const [cashDone, setCashDone] = useState(false);
    const [paidAmount, setPaidAmount] = useState(0);
    // reset a ogni apertura (nuova vendita) o chiusura del modale
    useEffect(() => {
        setMetodo("CONTANTI"); setFase("scelta"); setIncassato(0); setResto(0);
        setMsg(""); setEsclusi([]); setCashDone(false); setPaidAmount(0);
    }, [data]);

    // Incasso contanti via coda: enqueue → poll del job finché done/error.
    const incassaContanti = useCallback(async (amount: number, negozio: string | null) => {
        setFase("incasso");
        setMsg(`In attesa di ${eur(amount)} — il cliente inserisce i contanti nella cassa.`);
        try {
            const res = await fetch("/api/vendita/incasso", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ negozio, amount }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok || !j.jobId) throw new Error(j.error || "cassa non disponibile");
            const jobId = j.jobId as string;
            const start = Date.now();
            for (;;) {
                await new Promise((r) => setTimeout(r, POLL_MS));
                const { data: row } = await supabase.from("print_jobs").select("status, result").eq("id", jobId).single();
                if (row && (row.status === "done" || row.status === "error")) {
                    let out: any = {};
                    try { out = JSON.parse(row.result || "{}"); } catch { /* result non-JSON */ }
                    const ok = row.status === "done" && out.ok !== false && !out.errore;
                    return { ok, incassato: out.incassato ?? (ok ? amount : 0), resto: out.resto ?? 0, erroreMsg: out.msg || (row.status === "error" ? "errore cassa" : "") };
                }
                if (Date.now() - start > CASH_TIMEOUT_MS) return { ok: false, erroreMsg: "tempo scaduto: agente non attivo o cassa non risponde" };
            }
        } catch (e: any) {
            return { ok: false, erroreMsg: String(e?.message || e) };
        }
    }, []);

    const stampaScontrino = useCallback(async (paidAmount?: number) => {
        setFase("stampa");
        setMsg("Emissione scontrino fiscale…");
        const pag = PAGAMENTO[metodo];
        try {
            const res = await fetch("/api/vendita/scontrino", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    negozio: data?.negozio ?? null,
                    deviceUrl: data?.deviceUrl,
                    items: data?.items ?? [],
                    paymentType: pag.paymentType,
                    paymentDescription: pag.description,
                    paidAmount,
                }),
            });
            const j = await res.json().catch(() => ({}));
            return { ok: res.ok && j.ok, ...j };
        } catch (e: any) {
            return { ok: false, error: String(e?.message || e) };
        }
    }, [metodo, data]);

    if (!data) return null;
    const totale = totaleRighe(data.items);
    const daPagare = metodo === "CONTANTI" ? arrotonda5(totale) : totale;
    const arrotondamento = +(daPagare - totale).toFixed(2);

    const conferma = async () => {
        let paid: number | undefined = cashDone ? paidAmount : undefined;
        if (metodo === "CONTANTI" && !cashDone) {
            // PRE-CHECK: lo scontrino è emettibile? Se no, NON si incassa (mai prendere
            // contanti senza poter emettere lo scontrino).
            setFase("stampa"); setMsg("Verifico lo scontrino…");
            let chk: any = {};
            try {
                const res = await fetch("/api/vendita/scontrino", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ negozio: data.negozio, items: data.items, dryRun: true }),
                });
                chk = await res.json().catch(() => ({}));
                if (!res.ok) chk.ok = false;
            } catch (e: any) { chk = { ok: false, error: String(e?.message || e) }; }
            if (!chk.ok) {
                setFase("errore");
                setMsg("Scontrino non emettibile (" + (chk.error || "voci senza reparto") + "). Incasso NON avviato.");
                return;
            }
            const r = await incassaContanti(daPagare, data.negozio);
            if (!r || !r.ok) {
                setFase("errore");
                setMsg("Incasso non riuscito: " + (r?.erroreMsg || "annullato"));
                return;
            }
            setIncassato(r.incassato ?? daPagare);
            setResto(r.resto ?? 0);
            setCashDone(true);
            setPaidAmount(daPagare);
            paid = daPagare;
        }
        const p = await stampaScontrino(paid);
        setEsclusi(Array.isArray(p.esclusi) ? p.esclusi : []);
        if (!p.ok) {
            setFase("errore");
            setMsg("Scontrino non emesso: " + (p.error || "errore"));
            return;
        }
        setFase("fatto");
        setMsg("Scontrino in stampa" + (p.esclusi?.length ? ` — ${p.esclusi.length} voci senza reparto NON stampate` : ""));
    };

    const btnMetodo = (m: MetodoPagamento, label: string, emoji: string) => (
        <button
            key={m}
            type="button"
            onClick={() => setMetodo(m)}
            className={
                "flex-1 py-2.5 rounded-xl border text-sm font-semibold transition " +
                (metodo === m ? "bg-violet-500/25 border-violet-400/60 text-white" : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10")
            }
        >
            <span className="mr-1.5">{emoji}</span>{label}
        </button>
    );

    return createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="glass-panel w-full max-w-md p-5 space-y-4">
                <div className="flex items-baseline justify-between">
                    <h3 className="text-lg font-bold text-white">🧾 Incasso &amp; Scontrino</h3>
                    <span className="text-xs text-slate-400">{data.negozio || "—"}</span>
                </div>

                <div className="rounded-xl bg-white/5 border border-white/10 divide-y divide-white/5 max-h-44 overflow-y-auto">
                    {data.items.map((r, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-1.5 text-sm">
                            <span className="text-slate-200 truncate mr-2">{r.description}{(r.qty ?? 1) > 1 ? ` ×${r.qty}` : ""}</span>
                            <span className="text-slate-100 tabular-nums whitespace-nowrap">{eur((Number(r.unitPrice) || 0) * (Number(r.qty) > 0 ? Number(r.qty) : 1))}</span>
                        </div>
                    ))}
                </div>

                <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Totale</span>
                    <span className="text-white font-bold text-xl tabular-nums">{eur(daPagare)}</span>
                </div>
                {metodo === "CONTANTI" && arrotondamento !== 0 && (
                    <p className="text-[11px] text-slate-500 -mt-2 text-right">arrotondamento contanti {arrotondamento > 0 ? "+" : ""}{eur(arrotondamento)} (su {eur(totale)})</p>
                )}

                {fase === "scelta" && (
                    <>
                        <div className="flex gap-2">
                            {btnMetodo("CONTANTI", "Contanti", "💶")}
                            {btnMetodo("CARTA", "Carta", "💳")}
                            {btnMetodo("FINANZIAMENTO", "Finanz.", "📄")}
                        </div>
                        {metodo === "CONTANTI" && <p className="text-[11px] text-slate-500 text-center">La cassa automatica chiederà {eur(daPagare)} ed erogherà il resto.</p>}
                        <div className="flex gap-2 pt-1">
                            <button type="button" onClick={onDone} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 text-sm">Salta scontrino</button>
                            <button type="button" onClick={conferma} className="flex-1 primary-btn py-2.5 text-sm font-semibold">
                                {metodo === "CONTANTI" ? "Incassa ed emetti" : "Emetti scontrino"}
                            </button>
                        </div>
                    </>
                )}

                {fase === "incasso" && (
                    <div className="space-y-3 text-center py-3">
                        <div className="text-3xl animate-pulse">💶</div>
                        <p className="text-sm text-slate-300">{msg}</p>
                        <p className="text-[11px] text-slate-500">Per annullare, usa lo schermo della cassa.</p>
                    </div>
                )}

                {fase === "stampa" && (
                    <div className="text-center py-4 text-slate-300 text-sm animate-pulse">{msg}</div>
                )}

                {fase === "fatto" && (
                    <div className="space-y-3 text-center py-1">
                        <div className="text-4xl">✅</div>
                        <p className="text-emerald-300 font-semibold">{msg}</p>
                        {metodo === "CONTANTI" && <p className="text-sm text-slate-300">Incassato {eur(incassato)} · Resto <span className="text-white font-bold">{eur(resto)}</span></p>}
                        {!!esclusi.length && (
                            <div className="text-left text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded-lg p-2">
                                Voci NON stampate (reparto non assegnato in Catalogo): {esclusi.map((e) => e.description).join(", ")}
                            </div>
                        )}
                        <button type="button" onClick={onDone} className="primary-btn w-full py-2.5 text-sm font-semibold">Chiudi</button>
                    </div>
                )}

                {fase === "errore" && (
                    <div className="space-y-3 text-center py-1">
                        <div className="text-4xl">⚠️</div>
                        <p className="text-rose-300 text-sm">{msg}</p>
                        {cashDone && <p className="text-[12px] text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg p-2">Contanti GIÀ incassati: {eur(incassato)} · Resto {eur(resto)}. NON reincassare — usa «Ristampa scontrino».</p>}
                        <div className="flex gap-2">
                            <button type="button" onClick={onDone} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 text-sm">Chiudi</button>
                            <button type="button" onClick={conferma} className="flex-1 primary-btn py-2.5 text-sm font-semibold">{cashDone ? "Ristampa scontrino" : "Riprova"}</button>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
