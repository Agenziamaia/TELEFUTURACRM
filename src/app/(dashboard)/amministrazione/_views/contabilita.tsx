"use client";

/* ═══ HUB CONTABILITÀ ══════════════════════════════════════════════════════
   Luca 02/09: «creiamo la sezione contabilità, rendiamolo un hub, e dentro
   mettiamoci la sezione Usati — così dopo andremo a creare sicuramente altre
   sezioni dedicate».

   È il posto dove nasce quello che va al commercialista. Oggi c'è una sezione
   sola; è fatto per averne altre senza rifare niente.

   ⚠️ SOLO AMMINISTRAZIONE. Costi d'acquisto, margini, documenti fiscali: la
   rotta lo ricontrolla lato server, questa è solo la porta. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { NOME_SOCIETA } from "@/lib/societa";
import { Loader2, RefreshCw, Download, ChevronLeft, Receipt, Smartphone, ChevronDown, Send } from "lucide-react";
import { cn } from "@/utils";

type Riga = {
    id: number; imei: string; modello: string; negozio: string | null;
    aziendaAcquisto: string | null; aziendaVendita: string | null;
    daFatturare: boolean; daConfermare: boolean;
    acquistoReale: number; acquistoFile: number | null; vendita: number | null; venditaFile: number | null;
    origineCosto: "reale" | "regola" | "mano" | "ignoto";
    origineVendita: "reale" | "mano" | "nessuna";
    corretti: { chi: string; quando: string } | null;
    lato: "venduto" | "comprato";
    compratoIl: string | null; vendutoIl: string | null; documentoAcquisto: string | null;
    corretta: { chi: string; quando: string } | null;
};
type Preview = {
    mese: string; da: string; a: string; venduti: number; comprati: number;
    daConfermare: number; daFatturare: number; parteIl: number; giorniAllInvio: number; fallito?: boolean;
    gia: { esito: string; inviato_il: string; destinatari: string[] | null; da_confermare: number | null } | null;
};
type Dati = {
    da: string; a: string; venduti: Riga[]; comprati: Riga[]; preview: Preview | null;
    riepilogo: { venduti: number; daFatturare: number; daConfermare: number; comprati: number; valoreVenduto: number; valoreAcquistoFile: number };
};

const SOC: Record<string, string> = { T1: "Telefutura", T2: "Telefutura 2" };
const eur = (n: number) => (Number(n) || 0).toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const giorno = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short" }) : "—";
/* ⚠️ IL MESE IN CORSO, non quello chiuso. Chi apre questa sezione durante il
   mese vuole vedere quello che sta succedendo e completare le righe prima che
   il file parta; il mese da mandare ha il suo riquadro in cima. E si conta col
   giorno di Roma, che è il mese contabile: con `getUTCMonth()` il 1° alle 00:30
   italiane si sarebbe ancora nel mese prima. */
const oggiRoma = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
const primoDelMese = () => oggiRoma().slice(0, 8) + "01";
const ultimoDelMese = () => {
    const [y, m] = oggiRoma().split("-").map(Number);
    const u = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(u).padStart(2, "0")}`;
};

/* ── LE SEZIONI DELL'HUB. Oggi una; la lista è qui perché aggiungerne una
      seconda sia una riga, non un lavoro. ─────────────────────────────────── */
const SEZIONI = [
    {
        id: "usati", label: "Usati fra società", icon: Smartphone,
        desc: "I telefoni usati comprati da una società e venduti dall'altra: il file da portare al commercialista perché faccia le fatture fra Telefutura e Telefutura 2.",
    },
];

export function ContabilitaView() {
    const [sez, setSez] = useState<string | null>(null);
    if (sez === "usati") return <UsatiContabilita onIndietro={() => setSez(null)} />;
    return (
        <div className="space-y-5 an-in">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0d1022]/80 p-5 sm:p-6 an-scuro">
                <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-25 blur-3xl"
                    style={{ background: "radial-gradient(circle,#34d399,transparent 70%)" }} />
                <div className="relative">
                    <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                        <Receipt className="w-6 h-6 text-emerald-300" /> Contabilità
                    </h1>
                    <p className="text-[11px] text-slate-500 mt-1">
                        Quello che esce da qui va al commercialista: numeri che diventano fatture, non riepiloghi da leggere.
                    </p>
                </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {SEZIONI.map((s) => (
                    <button key={s.id} onClick={() => setSez(s.id)}
                        className="glass-card an-card rounded-2xl p-4 text-left hover:bg-white/5 transition">
                        <div className="flex items-center gap-2 mb-1.5">
                            <s.icon className="w-4 h-4 text-emerald-300" />
                            <span className="text-sm font-bold text-white">{s.label}</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-slate-500">{s.desc}</p>
                    </button>
                ))}
            </div>
        </div>
    );
}

function UsatiContabilita({ onIndietro }: { onIndietro: () => void }) {
    const [da, setDa] = useState(primoDelMese());
    const [a, setA] = useState(ultimoDelMese());
    const [d, setD] = useState<Dati | null>(null);
    const [caricando, setCaricando] = useState(true);
    const [ko, setKo] = useState("");
    /* ⚠️ DUE LISTE, NON UN INTERRUTTORE (Luca 02/09): «lasciami i dati di
       queste informazioni, divise in due sezioni (liste) esplodibili e
       controllabili». Con un interruttore solo si vede una cosa per volta e
       per confrontarle bisogna ricordarsele. */
    const [aperta, setAperta] = useState<Record<string, boolean>>({ venduti: true, comprati: false });
    const [soloDaFatturare, setSoloDaFatturare] = useState(false);
    const [salvo, setSalvo] = useState<number | null>(null);

    const carica = useCallback(async () => {
        setCaricando(true); setKo("");
        try {
            const r = await fetch(`/api/contabilita/usati?da=${da}&a=${a}`).then((x) => x.json());
            if (!r?.ok) throw new Error(r?.error || "non riesco a leggere");
            setD(r);
        } catch (e) { setKo((e as Error).message); }
        finally { setCaricando(false); }
    }, [da, a]);
    useEffect(() => { void carica(); }, [carica]);

    /** Correggere una società a mano: è il modo di completare i telefoni che il
     *  file storico non conosceva. */
    const cambia = async (id: number, campo: string, valore: string) => {
        setSalvo(id);
        try {
            const r = await fetch("/api/contabilita/usati", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, [campo]: valore === "" ? null : valore }),
            }).then((x) => x.json());
            if (!r?.ok) throw new Error(r?.error || "non salvata");
            await carica();
        } catch (e) { setKo((e as Error).message); }
        finally { setSalvo(null); }
    };

    const filtra = (base: Riga[]) => soloDaFatturare ? base.filter((r) => r.daFatturare || r.daConfermare) : base;
    const corretteInPeriodo = useMemo(
        () => d ? [...d.venduti, ...d.comprati].filter((r) => r.corretta).length : 0, [d]);

    return (
        <div className="space-y-5 an-in">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0d1022]/80 p-5 sm:p-6 an-scuro">
                <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-25 blur-3xl"
                    style={{ background: "radial-gradient(circle,#34d399,transparent 70%)" }} />
                <div className="relative flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <button onClick={onIndietro} className="rvPill rvPill-sm mb-2"><ChevronLeft className="w-3 h-3" /> Contabilità</button>
                        <h1 className="text-xl sm:text-2xl font-black text-white">📱 Usati fra società</h1>
                        <p className="text-[11px] text-slate-500 mt-1 max-w-2xl">
                            Un usato non ha magazzino, quindi non ha una società automatica: chi lo compra è il documento
                            d'acquisto, chi lo vende è la cassa dello scontrino. Quando le due non coincidono, fra
                            Telefutura e Telefutura 2 ci va una fattura — e questo è il file che lo dice.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <input type="date" value={da} max={a} onChange={(e) => setDa(e.target.value)}
                            className="an-data glass-input px-2.5 py-1.5 rounded-lg text-xs" />
                        <span className="text-[11px] text-slate-500">→</span>
                        <input type="date" value={a} min={da} onChange={(e) => setA(e.target.value)}
                            className="an-data glass-input px-2.5 py-1.5 rounded-lg text-xs" />
                        <a href={`/api/contabilita/usati?da=${da}&a=${a}&excel=1`}
                            className="rvPill rvPill-tinta rvT-verde"><Download className="w-3.5 h-3.5" /> Excel</a>
                        <button onClick={() => void carica()} disabled={caricando}
                            className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10">
                            <RefreshCw className={cn("w-4 h-4", caricando && "animate-spin")} />
                        </button>
                    </div>
                </div>
            </div>

            {ko && <div className="rvNota rvNota-ko"><div className="rvNota-s">{ko}</div></div>}

            {/* ═══ LA PREVIEW DELL'INVIO ═══════════════════════════════════════
                Luca 02/09: «spostiamo l'automazione al 3 del mese, e dal 1° dai
                visibilità in questa sezione della preview, che sarebbe l'invio
                dei file». Fra il 1° e il 3 il mese è chiuso e il file non è
                ancora partito: è la finestra per sistemare le righe rosse. */}
            {d?.preview && (
                <div className={cn("glass-card an-card rounded-2xl p-4",
                    d.preview.daConfermare ? "border-amber-400/40" : "border-emerald-400/30")}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                                <Send className="w-3 h-3" /> Cosa partirà per il commercialista
                            </div>
                            <div className="text-lg font-black text-white mt-1">
                                {new Date(d.preview.mese + "T12:00:00").toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
                                {" — "}
                                <span className="text-slate-400 font-bold text-sm">
                                    {d.preview.venduti} vendut{d.preview.venduti === 1 ? "o" : "i"} · {d.preview.comprati} comprat{d.preview.comprati === 1 ? "o" : "i"}
                                    {d.preview.daFatturare ? ` · ${d.preview.daFatturare} da fatturare fra società` : ""}
                                </span>
                            </div>
                            {d.preview.fallito && (
                                <div className="rvNota rvNota-ko" style={{ marginTop: 8 }}>
                                    <div className="rvNota-t">⛔ L'ultimo invio è fallito</div>
                                    <div className="rvNota-s">
                                        Il commercialista non ha ricevuto niente. Si rimanda dall'hub Automatismi
                                        → «Telefoni usati al commercialista».
                                    </div>
                                </div>
                            )}
                            <p className="text-[11px] text-slate-500 mt-1">
                                {d.preview.gia?.esito === "inviato"
                                    ? `Già inviato il ${new Date(d.preview.gia.inviato_il).toLocaleDateString("it-IT")}${d.preview.gia.destinatari?.length ? ` a ${d.preview.gia.destinatari.join(", ")}` : ""}.`
                                    : d.preview.giorniAllInvio > 0
                                        ? `Parte da solo il ${d.preview.parteIl} del mese: ${d.preview.giorniAllInvio === 1 ? "manca un giorno" : `mancano ${d.preview.giorniAllInvio} giorni`} per sistemare quello che manca.`
                                        : `Doveva partire il ${d.preview.parteIl}: se non risulta inviato, controlla l'automatismo.`}
                            </p>
                        </div>
                        {!!d.preview.daConfermare && (
                            <div className="rvNota rvNota-att" style={{ marginTop: 0, maxWidth: 420 }}>
                                <div className="rvNota-t">⚠️ {d.preview.daConfermare} rig{d.preview.daConfermare === 1 ? "a" : "he"} senza società</div>
                                <div className="rvNota-s">
                                    Nel file usciranno con un punto interrogativo, e il commercialista non potrà
                                    fatturarle. Sistemale qui sotto prima del {d.preview.parteIl}: dopo, il file
                                    è già in mano sua.
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {caricando && !d ? (
                <div className="glass-card an-card rounded-2xl p-8 text-center text-slate-500 text-sm">
                    <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" /> leggo…
                </div>
            ) : d ? (<>
                <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                    {[
                        { t: "Venduti nel periodo", v: String(d.riepilogo.venduti), c: "#818cf8", n: "Telefoni usati usciti in questo periodo." },
                        { t: "Fattura tra società", v: String(d.riepilogo.daFatturare), c: "#fbbf24", n: "Comprati da una società e venduti dall'altra: sono questi che il commercialista deve sistemare." },
                        { t: "Da confermare", v: String(d.riepilogo.daConfermare), c: "#f87171", n: "Manca una delle due società. Finché manca, la riga esce col punto interrogativo: meglio incompleta che indovinata." },
                        { t: "Incassato", v: eur(d.riepilogo.valoreVenduto), c: "#34d399", n: "La somma dei prezzi di vendita effettivi." },
                    ].map((k) => (
                        <div key={k.t} className="glass-card an-card rounded-2xl p-4" title={k.n}>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{k.t}</div>
                            <div className="text-2xl font-black mt-1" style={{ color: k.c }}>{k.v}</div>
                            <p className="text-[10px] text-slate-600 mt-1 leading-snug">{k.n}</p>
                        </div>
                    ))}
                </div>

                <div className="rvPillRow items-center">
                    <button onClick={() => setSoloDaFatturare((v) => !v)}
                        className={cn("rvPill rvPill-tinta rvT-ambra", soloDaFatturare && "rvPill-on")}>
                        {soloDaFatturare ? "✓ " : ""}solo quelli da sistemare
                    </button>
                    {!!corretteInPeriodo && (
                        <span className="rvBadge rvBadge-acc" title="Righe in cui una società è stata scritta a mano da una persona">
                            ✍️ {corretteInPeriodo} corrett{corretteInPeriodo === 1 ? "a" : "e"} a mano
                        </span>
                    )}
                </div>

                {/* le due liste, ognuna si apre e si chiude per conto suo */}
                {([
                    { id: "venduti", et: "Venduti", righe: d.venduti, quando: "vendutoIl" as const },
                    { id: "comprati", et: "Comprati", righe: d.comprati, quando: "compratoIl" as const },
                ]).map((lista) => {
                    const righe = filtra(lista.righe);
                    const aperto = !!aperta[lista.id];
                    const daSistemare = lista.righe.filter((r) => r.daFatturare || r.daConfermare).length;
                    return (
                        <div key={lista.id} className="glass-card an-card rounded-2xl overflow-hidden">
                            <button onClick={() => setAperta((v) => ({ ...v, [lista.id]: !v[lista.id] }))}
                                className="w-full flex items-center justify-between gap-3 p-4 hover:bg-white/[0.03] transition text-left">
                                <div className="flex items-center gap-2.5">
                                    <ChevronDown className={cn("w-4 h-4 text-slate-500 transition-transform", !aperto && "-rotate-90")} />
                                    <span className="text-sm font-bold text-white">{lista.et}</span>
                                    <span className="rvBadge rvBadge-empty">{lista.righe.length}</span>
                                    {!!daSistemare && <span className="rvBadge rvBadge-warn">{daSistemare} da sistemare</span>}
                                </div>
                                <span className="text-[11px] text-slate-600">
                                    {aperto ? "chiudi" : "apri"}
                                </span>
                            </button>
                            {aperto && (
                                <div className="px-4 pb-4">
                                    <div className="overflow-x-auto">
                                        <table className="ctbTab">
                                            <thead>
                                                <tr>
                                                    <th className="ctbC-tel">Telefono</th>
                                                    <th className="ctbC-soc">Comprato da</th>
                                                    <th className="ctbC-soc">Venduto da</th>
                                                    <th className="ctbC-eur">Costo</th>
                                                    <th className="ctbC-eur" title="Il costo come va nel file: mai sotto 100 €, oppure quello che scrivi tu">Per il file</th>
                                                    {/* ⚠️ SUI COMPRATI QUESTA COLONNA NON ESISTE. Un telefono
                                                        ancora in negozio non ha un prezzo di vendita, e una
                                                        colonna piena di trattini è rumore che allarga la
                                                        tabella e basta. */}
                                                    {lista.id === "venduti" && <th className="ctbC-eur">Venduto a</th>}
                                                    <th className="ctbC-data">{lista.id === "venduti" ? "Venduto il" : "Comprato il"}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {righe.map((r) => (
                                                    <tr key={r.id} className={cn(r.daConfermare ? "ctbConf" : r.daFatturare && "ctbFatt")}>
                                                        <td>
                                                            <div className="ctbTel">
                                                                {r.modello || "—"}
                                                                {r.corretta && (
                                                                    <span className="rvBadge rvBadge-acc" title={`${r.corretta.chi} — ${new Date(r.corretta.quando).toLocaleString("it-IT")}`}>✍️</span>
                                                                )}
                                                            </div>
                                                            <div className="ctbImei">{r.imei}</div>
                                                            {r.corretta && (
                                                                <div className="ctbMano">società scritta a mano da {r.corretta.chi.split(" — ")[0]}</div>
                                                            )}
                                                        </td>
                                                        {(["aziendaAcquisto", "aziendaVendita"] as const).map((campo) => (
                                                            <td key={campo}>
                                                                {/* ⚠️ SI PUÒ SCRIVERE, ma resta segnato chi l'ha fatto:
                                                                    questa società finisce su una fattura fra due
                                                                    società vere. */}
                                                                <select value={r[campo] || ""} disabled={salvo === r.id}
                                                                    onChange={(e) => void cambia(r.id, campo, e.target.value)}
                                                                    className={cn("ctbSel", !r[campo] && "ctbSel-vuoto")}>
                                                                    <option value="">— da confermare</option>
                                                                    <option value="T1">{SOC.T1}</option>
                                                                    <option value="T2">{SOC.T2}</option>
                                                                </select>
                                                            </td>
                                                        ))}
                                                        <td className="ctbC-eur text-slate-400">
                                                            {r.acquistoReale > 0 ? eur(r.acquistoReale) : <span className="text-rose-300/80 text-[11px]">non registrato</span>}
                                                        </td>
                                                        <td>
                                                            <PrezzoContabile r={r} campo="costoContabile"
                                                                valore={r.acquistoFile} origine={r.origineCosto}
                                                                inCorso={salvo === r.id} onCambia={cambia} />
                                                        </td>
                                                        {lista.id === "venduti" && (
                                                            <td>
                                                                <PrezzoContabile r={r} campo="venditaContabile"
                                                                    valore={r.venditaFile} origine={r.origineVendita === "mano" ? "mano" : "reale"}
                                                                    inCorso={salvo === r.id} onCambia={cambia} />
                                                            </td>
                                                        )}
                                                        <td className="ctbC-data text-[11px] text-slate-500">{giorno(r[lista.quando])}</td>
                                                    </tr>
                                                ))}
                                                {!righe.length && (
                                                    <tr><td colSpan={lista.id === "venduti" ? 7 : 6} className="text-center text-slate-600 py-6 text-xs">
                                                        {soloDaFatturare ? "Niente da sistemare qui." : "Nessun telefono in questo periodo."}
                                                    </td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                <div className="rvHint">
                    Le righe <b className="text-amber-300">gialle</b> sono comprate da una società e vendute
                    dall'altra: sono le fatture da fare. Le <b className="text-rose-300">rosse</b> hanno una società
                    che manca — la si può scrivere qui, e resta segnato chi l'ha messa (✍️).
                    {" "}⚠️ Nella colonna «per il file» il costo non scende mai sotto <b>100 €</b>: è la regola
                    concordata, e vale solo per il commercialista — l'archivio conserva la cifra vera, che è quella
                    accanto.
                </div>
            </>) : null}
        </div>
    );
}

/* ═══ UN PREZZO CHE VA AL COMMERCIALISTA ═══════════════════════════════════
   Si legge, si corregge, e dice sempre da dove viene.

   ⚠️ IL COLORE NON È DECORAZIONE. Un costo alzato dalla regola dei 100 € e uno
   deciso da una persona sono due cose diverse davanti a una fattura, e da un
   numero secco non si distinguono. Ambra = alzato dalla regola · indaco =
   deciso a mano · rosso = costo che non abbiamo · grigio = la cifra pagata.

   ⚠️ E SI SCRIVE SOLO QUANDO SI ESCE DAL CAMPO. Salvare a ogni tasto vorrebbe
   dire mandare al server «1», «12», «120» mentre uno digita 1200 — e ogni
   passaggio marcherebbe la riga come corretta a mano. */
function PrezzoContabile({ r, campo, valore, origine, inCorso, onCambia }: {
    r: Riga; campo: string; valore: number | null;
    origine: "reale" | "regola" | "mano" | "ignoto";
    inCorso: boolean; onCambia: (id: number, campo: string, valore: string) => void;
}) {
    const [bozza, setBozza] = useState<string | null>(null);
    const mostrato = bozza ?? (valore == null ? "" : String(valore));
    const tinta = origine === "mano" ? "ctbNum-mano"
        : origine === "regola" ? "ctbNum-regola"
            : origine === "ignoto" ? "ctbNum-ignoto" : "";
    const perche = origine === "mano" ? `Deciso a mano${r.corretti ? ` da ${r.corretti.chi}` : ""} — vince sulla regola`
        : origine === "regola" ? `Comprato a ${eur(r.acquistoReale)}: portato al minimo di 100 € come da regola. Scrivi qui per decidere un'altra cifra.`
            : origine === "ignoto" ? "Nessun costo registrato: nel file esce vuoto. Scrivi qui la cifra giusta."
                : "È la cifra vera. Si può cambiare: quello che scrivi finisce nel file.";
    return (
        <span title={perche}>
            <input
                value={mostrato} disabled={inCorso} inputMode="decimal" placeholder="—"
                onChange={(e) => setBozza(e.target.value)}
                onBlur={() => {
                    if (bozza == null) return;
                    const pulito = bozza.trim();
                    const uguale = pulito === (valore == null ? "" : String(valore));
                    setBozza(null);
                    if (!uguale) onCambia(r.id, campo, pulito);
                }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setBozza(null); }}
                className={cn("ctbNum", tinta)} />
        </span>
    );
}
