"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import { arrotonda5, totaleRighe, FORME_PAGAMENTO, isFormaCash, type RigaScontrino, type RigaPagamento } from "@/lib/pos";

/* Modale "Incasso & Scontrino" — l'output fiscale di Registra Vendita.
   Si apre a vendita registrata: si compone il pagamento (fino a 3 forme, spec #2),
   per la quota CONTANTI mette in coda un incasso sulla cassa automatica pagAmico
   (l'agente locale del negozio la comanda e riporta incassato/resto), poi mette in
   coda lo scontrino fiscale sul RT con una riga di pagamento per forma.
   Tutto passa dalla coda cloud (print_jobs) → l'agente del negozio esegue sul LAN:
   funziona da qualsiasi dispositivo, nessun collegamento diretto dal browser.
   Solo la quota Contanti guida la macchina; Carta/Bonifico = solo scontrino (POS a
   parte); Finanziamento/Non Riscosso = a credito, nessun incasso fisico.
   Il reset della vendita avviene alla chiusura (onDone). */

export interface ScontrinoData {
    items: RigaScontrino[];
    negozio: string | null;
    deviceUrl?: string;
    cliente?: string | null;   // per salvare/ritrovare il conto in sospeso
    azienda?: string | null;   // ragione sociale preselezionata (es. ripresa da sospeso)
    sospesoId?: string;        // se valorizzato: si sta COMPLETANDO un conto in sospeso
}

const eur = (n: number) => "€ " + (Number(n) || 0).toFixed(2).replace(".", ",");
const POLL_MS = 1500;
const CASH_TIMEOUT_MS = 240000; // 4 min: il cliente inserisce i contanti

type Fase = "scelta" | "incasso" | "stampa" | "fatto" | "errore";

export function ScontrinoCassa({ data, onDone }: { data: ScontrinoData | null; onDone: () => void }) {
    const totale = data ? totaleRighe(data.items) : 0;

    // Pagamento come lista di forme (max 3). Default: tutto in contanti.
    const [righe, setRighe] = useState<RigaPagamento[]>([{ forma: "CONTANTI", importo: 0 }]);
    const [fase, setFase] = useState<Fase>("scelta");
    const [incassato, setIncassato] = useState(0);
    const [resto, setResto] = useState(0);
    const [msg, setMsg] = useState("");
    const [esclusi, setEsclusi] = useState<{ description: string; motivo: string }[]>([]);
    // Contanti già incassati: evita il DOPPIO incasso se lo scontrino fallisce e si riprova.
    const [cashDone, setCashDone] = useState(false);
    const [paidCash, setPaidCash] = useState(0);
    const [isTest, setIsTest] = useState(false);
    // Multi-societario: ragioni sociali/RT del negozio; se >1, l'operatore sceglie
    // quale EMETTE (default = azienda del negozio; i prodotti con azienda fissa
    // vanno comunque al loro RT).
    const [aziende, setAziende] = useState<{ code: string; label: string }[]>([]);
    const [aziendaSel, setAziendaSel] = useState<string | null>(null);
    // Coupon sconto (spec Francesco): abbassa l'imponibile. Il residuo rigenera un nuovo coupon.
    const [couponInput, setCouponInput] = useState("");
    const [coupon, setCoupon] = useState<{ code: string; valore: number; sconto: number } | null>(null);
    const [couponMsg, setCouponMsg] = useState("");
    const [nuovoCoupon, setNuovoCoupon] = useState<{ code: string; valore: number } | null>(null);

    // Firma STABILE della vendita. Il reset qui sotto azzera anche la ragione sociale
    // scelta dall'operatore: deve scattare SOLO quando cambia DAVVERO la vendita, non a
    // ogni re-render del prop `data` (bug: la scelta Telefutura/Telefutura 2 tornava al
    // default → lo scontrino usciva sull'RT sbagliato). Con la firma-stringa, un re-render
    // con lo stesso contenuto NON rifa' il reset.
    const saleSig = JSON.stringify(data);
    // reset all'apertura di una NUOVA vendita (o alla chiusura del modale)
    useEffect(() => {
        const t = data ? totaleRighe(data.items) : 0;
        setRighe([{ forma: "CONTANTI", importo: t }]);
        setFase("scelta"); setIncassato(0); setResto(0);
        setMsg(""); setEsclusi([]); setCashDone(false); setPaidCash(0); setIsTest(false);
        setAziende([]); setAziendaSel(null);
        setCouponInput(""); setCoupon(null); setCouponMsg(""); setNuovoCoupon(null);
        const neg = data?.negozio;
        if (!neg) return;
        supabase.from("pos_rt").select("azienda, ragione_sociale, is_default").eq("negozio", neg).then(({ data: rows }) => {
            const list = (rows || []).map((r: any) => ({ code: r.azienda, label: r.ragione_sociale || r.azienda, isDef: !!r.is_default }));
            setAziende(list.map((x) => ({ code: x.code, label: x.label })));
            // se si RIPRENDE un sospeso con azienda già scelta, rispettala; altrimenti default.
            const preset = data?.azienda && list.find((x) => x.code === data.azienda);
            const def = preset || list.find((x) => x.isDef) || list[0];
            setAziendaSel(def ? def.code : null);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saleSig]);

    // Sconto coupon (capato al totale) → quanto resta DA PAGARE con le forme.
    const scontoCoupon = coupon ? Math.min(coupon.sconto, totale) : 0;
    const totaleDaPagare = +(totale - scontoCoupon).toFixed(2);
    const coperto = totaleDaPagare <= 0.005; // coupon copre tutto: niente pagamento

    // Somme / bilancio del pagamento (sul netto da pagare).
    const sommaPag = +righe.reduce((s, r) => s + (Number(r.importo) || 0), 0).toFixed(2);
    const rimanente = +(totaleDaPagare - sommaPag).toFixed(2);
    const bilanciato = coperto || (Math.abs(rimanente) < 0.005 && righe.every((r) => Number(r.importo) > 0));
    const cashPortion = coperto ? 0 : +righe.filter((r) => isFormaCash(r.forma)).reduce((s, r) => s + (Number(r.importo) || 0), 0).toFixed(2);
    const cashRounded = arrotonda5(cashPortion);
    const arrotondamento = +(cashRounded - cashPortion).toFixed(2);

    // Forme di pagamento da inviare al RT: la quota contanti va arrotondata a 5 cent
    // (la macchina lavora a ≥5c); le altre forme all'importo esatto. Se il coupon copre
    // tutto, nessun tender (lo sconto azzera il netto).
    const pagamentiSend = (): RigaPagamento[] =>
        coperto ? [] : righe.filter((r) => Number(r.importo) > 0)
            .map((r) => ({
                forma: r.forma,
                importo: isFormaCash(r.forma) ? arrotonda5(Number(r.importo)) : +Number(r.importo).toFixed(2),
            }));

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

    const stampaScontrino = useCallback(async (pagamenti: RigaPagamento[], couponPayload?: { code: string; sconto: number }) => {
        setFase("stampa");
        setMsg("Emissione scontrino fiscale…");
        try {
            const res = await fetch("/api/vendita/scontrino", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    negozio: data?.negozio ?? null,
                    deviceUrl: data?.deviceUrl,
                    items: data?.items ?? [],
                    azienda: aziendaSel,
                    pagamenti,
                    coupon: couponPayload,
                }),
            });
            const j = await res.json().catch(() => ({}));
            return { ok: res.ok && j.ok, ...j };
        } catch (e: any) {
            return { ok: false, error: String(e?.message || e) };
        }
    }, [data, aziendaSel]);

    if (!data) return null;

    const conferma = async () => {
        if (!bilanciato) {
            setFase("errore");
            setMsg(rimanente > 0 ? `Manca ${eur(rimanente)} da assegnare a una forma di pagamento.` : `Pagamento eccedente di ${eur(-rimanente)}.`);
            return;
        }
        const pagamenti = pagamentiSend();
        /* PRE-CHECK PRIMA DI QUALUNQUE INCASSO (revisore 29/08).
           Stava DENTRO il ramo dei contanti: pagando con carta si andava
           dritti alla stampa, e il POS fisico l'importo intero l'aveva già
           preso. La regola è la stessa per ogni forma di pagamento — non si
           incassa nulla che non si possa certificare — quindi la verifica
           esce dal ramo e si fa sempre. */
        setFase("stampa"); setMsg("Verifico lo scontrino…");
        let chk: any = {};
        try {
            const res = await fetch("/api/vendita/scontrino", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ negozio: data.negozio, items: data.items, azienda: aziendaSel, dryRun: true }),
            });
            chk = await res.json().catch(() => ({}));
            if (!res.ok) chk.ok = false;
            if (chk?.testMode) setIsTest(true);
        } catch (e: any) { chk = { ok: false, error: String(e?.message || e) }; }
        if (!chk.ok) {
            setFase("errore");
            setMsg("Scontrino non emettibile (" + (chk.error || "voci senza reparto") + "). Incasso NON avviato.");
            return;
        }
        // Incasso contanti (una sola volta) se c'è una quota contanti e non è già fatta.
        if (cashRounded > 0 && !cashDone) {
            const r = await incassaContanti(cashRounded, data.negozio);
            if (!r || !r.ok) {
                setFase("errore");
                setMsg("Incasso non riuscito: " + (r?.erroreMsg || "annullato"));
                return;
            }
            setIncassato(r.incassato ?? cashRounded);
            setResto(r.resto ?? 0);
            setCashDone(true);
            setPaidCash(cashRounded);
        }
        const p = await stampaScontrino(pagamenti, coupon ? { code: coupon.code, sconto: scontoCoupon } : undefined);
        setEsclusi(Array.isArray(p.esclusi) ? p.esclusi : []);
        if (!p.ok) {
            setFase("errore");
            setMsg("Scontrino non emesso: " + (p.error || "errore"));
            return;
        }
        if (p.testMode) setIsTest(true);
        if (p.nuovoCoupon) setNuovoCoupon(p.nuovoCoupon);
        // Se si stava COMPLETANDO un conto in sospeso, chiudilo.
        if (data.sospesoId) {
            try { await fetch("/api/vendita/sospendi", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: data.sospesoId, stato: "completata" }) }); } catch { /* non bloccare l'esito */ }
        }
        setFase("fatto");
        setMsg((p.testMode ? "Documento NON fiscale in stampa (prova)" : "Scontrino fiscale in stampa") + (p.esclusi?.length ? ` — ${p.esclusi.length} voci senza reparto NON stampate` : ""));
    };

    // "Tieni in sospeso": salva il conto per completarlo dopo (il cliente torna a pagare).
    const tieniInSospeso = async () => {
        setFase("stampa"); setMsg("Salvo il conto in sospeso…");
        try {
            const res = await fetch("/api/vendita/sospendi", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ negozio: data.negozio, cliente: data.cliente ?? null, items: data.items, totale, azienda: aziendaSel }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok || !j.ok) throw new Error(j.error || "salvataggio non riuscito");
            setFase("fatto");
            setMsg("Conto tenuto in sospeso — riprendilo dal pulsante «Conti in sospeso» in Registra Vendita.");
        } catch (e: any) {
            setFase("errore"); setMsg("Sospensione non riuscita: " + String(e?.message || e));
        }
    };

    // ── coupon ────────────────────────────────────────────────────────────────
    const applyCoupon = async () => {
        setCouponMsg("");
        const code = couponInput.trim().toUpperCase();
        if (!code) return;
        try {
            const res = await fetch("/api/vendita/coupon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "valida", code }) });
            const j = await res.json().catch(() => ({}));
            if (!j.valido) { setCouponMsg("Coupon non valido: " + (j.motivo || "sconosciuto")); return; }
            const valore = Number(j.valore_residuo) || 0;
            const sconto = +Math.min(valore, totale).toFixed(2);
            setCoupon({ code: j.code || code, valore, sconto });
            setRighe([{ forma: "CONTANTI", importo: +(totale - sconto).toFixed(2) }]);
            setCouponInput("");
        } catch { setCouponMsg("Errore nella verifica del coupon."); }
    };
    const removeCoupon = () => { setCoupon(null); setCouponMsg(""); setRighe([{ forma: "CONTANTI", importo: totale }]); };

    // ── gestione righe pagamento ──────────────────────────────────────────────
    const setForma = (i: number, forma: string) => setRighe((rs) => rs.map((r, k) => (k === i ? { ...r, forma } : r)));
    const setImporto = (i: number, val: string) => {
        const n = Math.max(0, Number(String(val).replace(",", ".")) || 0);
        setRighe((rs) => rs.map((r, k) => (k === i ? { ...r, importo: n } : r)));
    };
    const addRiga = () => setRighe((rs) => {
        if (rs.length >= 3) return rs;
        const usate = new Set(rs.map((r) => r.forma));
        const next = FORME_PAGAMENTO.find((f) => !usate.has(f.code)) || FORME_PAGAMENTO[1];
        const manca = +(totaleDaPagare - rs.reduce((s, r) => s + (Number(r.importo) || 0), 0)).toFixed(2);
        return [...rs, { forma: next.code, importo: manca > 0 ? manca : 0 }];
    });
    const removeRiga = (i: number) => setRighe((rs) => (rs.length <= 1 ? rs : rs.filter((_, k) => k !== i)));

    return createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="glass-panel w-full max-w-md p-5 space-y-4">
                <div className="flex items-baseline justify-between">
                    <h3 className="text-lg font-bold text-white">🧾 Incasso &amp; Scontrino</h3>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">{data.negozio || "—"}{isTest ? " · PROVA (non fiscale)" : ""}</span>
                        {/* X per uscire dal modale PRIMA di emettere (spec Francesco): non durante
                            l'incasso/stampa in corso, per non lasciare un'operazione a metà. */}
                        {fase !== "incasso" && fase !== "stampa" && (
                            <button type="button" onClick={onDone} title="Chiudi senza emettere" aria-label="Chiudi"
                                className="shrink-0 w-7 h-7 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 text-lg leading-none flex items-center justify-center">×</button>
                        )}
                    </div>
                </div>

                <div className="rounded-xl bg-white/5 border border-white/10 divide-y divide-white/5 max-h-40 overflow-y-auto">
                    {data.items.map((r, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-1.5 text-sm">
                            <span className="text-slate-200 truncate mr-2">{r.description}{(r.qty ?? 1) > 1 ? ` ×${r.qty}` : ""}</span>
                            <span className="text-slate-100 tabular-nums whitespace-nowrap">{eur((Number(r.unitPrice) || 0) * (Number(r.qty) > 0 ? Number(r.qty) : 1))}</span>
                        </div>
                    ))}
                </div>

                <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Totale</span>
                    <span className={"font-bold tabular-nums " + (scontoCoupon > 0 ? "text-slate-500 line-through text-base" : "text-white text-xl")}>{eur(totale)}</span>
                </div>
                {scontoCoupon > 0 && (
                    <div className="flex items-center justify-between text-sm -mt-2">
                        <span className="text-emerald-300">🎟️ Sconto coupon {eur(-scontoCoupon)} · da pagare</span>
                        <span className="text-white font-bold text-xl tabular-nums">{eur(totaleDaPagare)}</span>
                    </div>
                )}

                {fase === "scelta" && (
                    <>
                        {aziende.length > 1 && (
                            <div>
                                <p className="text-[11px] text-slate-500 mb-1">Ragione sociale (chi emette lo scontrino)</p>
                                <div className="flex gap-2">
                                    {aziende.map((a) => (
                                        <button key={a.code} type="button" onClick={() => setAziendaSel(a.code)}
                                            className={"flex-1 py-2 rounded-xl border text-xs font-semibold transition " + (aziendaSel === a.code ? "bg-sky-500/25 border-sky-400/60 text-white" : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10")}>
                                            {a.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Coupon: sconto che abbassa l'imponibile (sostituisce "Altro") */}
                        <div className="space-y-1.5">
                            <p className="text-[11px] text-slate-500">Coupon sconto (dal ritiro usato)</p>
                            {!coupon ? (
                                <div className="flex gap-2">
                                    <input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") applyCoupon(); }}
                                        placeholder="CPN-XXX-XXXX" spellCheck={false}
                                        className="flex-1 rounded-xl bg-white/5 border border-white/10 text-slate-100 text-sm px-3 py-2 outline-none focus:border-emerald-400/60 uppercase tracking-wide" />
                                    <button type="button" onClick={applyCoupon} disabled={!couponInput.trim()}
                                        className="shrink-0 px-4 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-sm font-semibold hover:bg-emerald-500/30 disabled:opacity-40">Applica</button>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-400/30 px-3 py-2">
                                    <span className="text-sm text-emerald-200">🎟️ {coupon.code} — sconto {eur(scontoCoupon)}{coupon.valore > scontoCoupon ? ` (di ${eur(coupon.valore)})` : ""}</span>
                                    <button type="button" onClick={removeCoupon} className="text-emerald-300/70 hover:text-rose-300 text-lg leading-none">×</button>
                                </div>
                            )}
                            {couponMsg && <p className="text-[11px] text-rose-300">{couponMsg}</p>}
                        </div>

                        {coperto ? (
                            <p className="text-sm text-emerald-300 text-center py-1">Coperto interamente dal coupon — nessun pagamento da incassare.</p>
                        ) : (
                        <div className="space-y-2">
                            <p className="text-[11px] text-slate-500">Forme di pagamento (max 3)</p>
                            {righe.map((r, i) => (
                                <div key={i} className="flex gap-2 items-center">
                                    <select value={r.forma} onChange={(e) => setForma(i, e.target.value)}
                                        className="flex-1 min-w-0 rounded-xl bg-white/5 border border-white/10 text-slate-100 text-sm px-2.5 py-2 outline-none focus:border-violet-400/60">
                                        {FORME_PAGAMENTO.map((f) => (
                                            <option key={f.code} value={f.code} className="bg-slate-800">{f.label}</option>
                                        ))}
                                    </select>
                                    <div className="relative w-28 shrink-0">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-sm">€</span>
                                        <input type="number" min={0} step={0.05} value={r.importo || ""} onChange={(e) => setImporto(i, e.target.value)}
                                            className="w-full rounded-xl bg-white/5 border border-white/10 text-slate-100 text-sm text-right tabular-nums pl-5 pr-2 py-2 outline-none focus:border-violet-400/60" />
                                    </div>
                                    <button type="button" onClick={() => removeRiga(i)} disabled={righe.length <= 1}
                                        className="shrink-0 w-8 h-8 rounded-lg border border-white/10 text-slate-400 hover:text-rose-300 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent text-lg leading-none">×</button>
                                </div>
                            ))}
                            <div className="flex items-center justify-between">
                                {righe.length < 3 ? (
                                    <button type="button" onClick={addRiga} className="text-xs text-violet-300 hover:text-violet-200">+ Aggiungi pagamento</button>
                                ) : <span />}
                                <span className={"text-xs tabular-nums " + (bilanciato ? "text-emerald-400" : "text-amber-300")}>
                                    {bilanciato ? "✓ Bilanciato" : `Rimanente ${eur(rimanente)}`}
                                </span>
                            </div>
                        </div>
                        )}

                        {cashRounded > 0 && (
                            <p className="text-[11px] text-slate-500 text-center">
                                La cassa automatica chiederà {eur(cashRounded)} in contanti ed erogherà il resto.
                                {arrotondamento !== 0 && <> Arrotondamento {arrotondamento > 0 ? "+" : ""}{eur(arrotondamento)}.</>}
                            </p>
                        )}

                        <div className="space-y-2 pt-1">
                            <div className="flex gap-2">
                                {!data.sospesoId && (
                                    <button type="button" onClick={tieniInSospeso} className="flex-1 py-2.5 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-200 hover:bg-amber-500/25 text-sm font-semibold">
                                        Tieni in sospeso
                                    </button>
                                )}
                                <button type="button" onClick={conferma} disabled={!bilanciato} className="flex-1 primary-btn py-2.5 text-sm font-semibold disabled:opacity-40">
                                    {cashRounded > 0 ? "Incassa ed emetti" : "Emetti scontrino"}
                                </button>
                            </div>
                            <button type="button" onClick={onDone} className="w-full text-[11px] text-slate-500 hover:text-slate-300">
                                {data.sospesoId ? "Chiudi (resta in sospeso)" : "Chiudi senza scontrino"}
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
                        {cashPortion > 0 && <p className="text-sm text-slate-300">Incassato {eur(incassato)} · Resto <span className="text-white font-bold">{eur(resto)}</span></p>}
                        {nuovoCoupon && (
                            <div className="text-left text-[12px] text-emerald-100 bg-emerald-500/10 border border-emerald-400/30 rounded-lg p-2">
                                🎟️ Nuovo coupon resto: <b className="tracking-wide">{nuovoCoupon.code}</b> ({eur(nuovoCoupon.valore)}) — consegnalo al cliente.
                            </div>
                        )}
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
                        {cashDone && <p className="text-[12px] text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg p-2">Contanti GIÀ incassati: {eur(incassato)} · Resto {eur(resto)} (quota {eur(paidCash)}). NON reincassare — usa «Ristampa scontrino».</p>}
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
