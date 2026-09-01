"use client";

/* ═══ ORDINI CLIENTE · ASSISTENZE ═════════════════════════════════════════
   Una sola vista per due sezioni: cambia `sezione` e cambiano tipologie,
   stati e contenuto. La logica sta in `lib/pratiche.ts`, qui c'è come si vede.

   Il percorso, in una riga: cliente (email obbligatoria) → tipo di intervento
   → cosa ordina o quale dispositivo → da dove arriva il pezzo → acconto →
   firma → in coda all'amministrazione. La firma è un CANCELLO: senza, non si
   salva niente — è il documento che regge l'acconto trattenuto, i 14 giorni e
   i 90. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, Plus, ArrowLeft, ArrowRight, Check, X, Printer, Paperclip, Clock } from "lucide-react";
import { cn } from "@/utils";
import { supabase } from "@/lib/supabaseClient";
import { RicercaCliente, etichettaCliente, type ClienteTrovato } from "@/components/RicercaCliente";
import {
    TIPOLOGIE, tipologieDi, APPROVVIGIONAMENTO, etichettaApprovv, siFaSubito,
    statiDi, flussoDi, firmaCompleta, eur, giorniLavorativi,
    TERMINE_MAX_GG, GIORNI_RITIRO, GIORNI_CESSIONE, TEMPO_MEDIO,
    BUONO_MESI, BUONO_ESCLUSI,
    type Sezione, type Firma,
} from "@/lib/pratiche";

type Riga = { id?: string; codice: string; descrizione: string; qta: number; prezzo: number; note: string; da_magazzino: boolean; giacenza?: number };
type Pratica = {
    id: string; protocollo: string; sezione: Sezione; tipologia: string;
    client_id: string | null; cliente: Record<string, unknown>;
    negozio: string; operatore: string; stato: string; valore: number;
    approvvigionamento: string | null; note_interne: string | null;
    dispositivo: Record<string, string> | null; imei: string | null;
    acconto: Record<string, unknown> | null; firma: Firma | null; buono: Record<string, unknown> | null;
    tracking: string | null; avviso_pronto_il: string | null;
    storia: { at: string; chi: string; txt: string }[];
    created_at: string; updated_at: string;
    righe?: Riga[];
};

const oggiIso = () => new Date().toISOString();
const dataIt = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" }) : "—");
const dataOraIt = (v: string | null | undefined) => (v ? new Date(v).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const emailOk = (v: string) => /^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(String(v || "").trim());
const totaleRighe = (r: Riga[]) => Math.round(r.reduce((t, x) => t + (Number(x.prezzo) || 0) * (Number(x.qta) || 1), 0) * 100) / 100;

/* ── PAGINA ─────────────────────────────────────────────────────────── */
export function PraticheSezione({ sezione, negozio, negoziVisibili, operatore, ruolo, seesAll }: {
    sezione: Sezione; negozio: string; negoziVisibili: string[]; operatore: string; ruolo: string; seesAll: boolean;
}) {
    const [pratiche, setPratiche] = useState<Pratica[] | null>(null);
    const [nuova, setNuova] = useState(false);
    const [apri, setApri] = useState<string | null>(null);
    const [cerca, setCerca] = useState("");
    const [filtro, setFiltro] = useState("");
    const [msg, setMsg] = useState<string | null>(null);
    const STATI = statiDi(sezione);
    const eAdmin = ruolo === "admin" || ruolo === "dev" || ruolo === "direttore_generale" || ruolo === "amministrativo";

    const avvisa = useCallback((t: string) => { setMsg(t); setTimeout(() => setMsg(null), 4000); }, []);

    const carica = useCallback(async () => {
        let q = supabase.from("pratiche").select("*").eq("sezione", sezione).order("created_at", { ascending: false }).limit(500);
        // chi non vede tutto vede le pratiche dei propri negozi: un cliente può
        // passare a ritirare altrove, ma l'elenco resta quello di casa
        if (!seesAll && negoziVisibili.length) q = q.in("negozio", negoziVisibili);
        const { data, error } = await q;
        if (error) { avvisa("⛔ " + error.message); setPratiche([]); return; }
        const lista = (data ?? []) as Pratica[];
        if (lista.length) {
            const { data: righe } = await supabase.from("pratiche_righe").select("*").in("pratica_id", lista.map((p) => p.id));
            const per = new Map<string, Riga[]>();
            ((righe ?? []) as (Riga & { pratica_id: string })[]).forEach((r) => {
                const arr = per.get(r.pratica_id) || [];
                arr.push(r); per.set(r.pratica_id, arr);
            });
            lista.forEach((p) => { p.righe = per.get(p.id) || []; });
        }
        setPratiche(lista);
    }, [sezione, seesAll, negoziVisibili, avvisa]);
    useEffect(() => { carica(); }, [carica]);

    const viste = useMemo(() => {
        const q = cerca.trim().toLowerCase();
        return (pratiche ?? []).filter((p) => {
            if (filtro && p.stato !== filtro) return false;
            if (!q) return true;
            const blob = [p.protocollo, p.negozio, p.imei, JSON.stringify(p.cliente), (p.righe || []).map((r) => r.descrizione).join(" ")].join(" ").toLowerCase();
            return blob.indexOf(q) >= 0;
        });
    }, [pratiche, cerca, filtro]);

    const conta = useMemo(() => {
        const m: Record<string, number> = {};
        (pratiche ?? []).forEach((p) => { m[p.stato] = (m[p.stato] || 0) + 1; });
        return m;
    }, [pratiche]);

    if (nuova) {
        return <Wizard sezione={sezione} negozio={negozio} operatore={operatore}
            onAnnulla={() => setNuova(false)}
            onFatto={async (t) => { setNuova(false); await carica(); avvisa(t); }} />;
    }
    const aperta = apri ? (pratiche || []).find((p) => p.id === apri) : null;
    if (aperta) {
        return <Dettaglio pratica={aperta} ruolo={ruolo} eAdmin={eAdmin} operatore={operatore}
            onChiudi={() => setApri(null)}
            onFatto={async (t) => { await carica(); avvisa(t); }} />;
    }

    return (
        <div className="space-y-4">
            {msg && <p className="text-[12px] rounded-xl px-3 py-2 border text-emerald-200 bg-emerald-500/10 border-emerald-500/25">{msg}</p>}

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px]">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input value={cerca} onChange={(e) => setCerca(e.target.value)}
                        placeholder="Protocollo, cliente, IMEI, articolo…"
                        className="glass-input w-full pl-9 pr-3 py-2 text-sm rounded-xl" />
                </div>
                <button onClick={() => setNuova(true)}
                    className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs uppercase tracking-widest flex items-center gap-1.5">
                    <Plus className="w-4 h-4" /> Nuova {sezione === "ordini" ? "richiesta" : "assistenza"}
                </button>
            </div>

            <div className="flex flex-wrap gap-2">
                <button onClick={() => setFiltro("")}
                    className={cn("px-3 py-2 rounded-xl text-[11px] font-bold border",
                        !filtro ? "border-indigo-400/60 bg-indigo-500/20 text-indigo-100" : "border-white/10 text-slate-400 hover:border-white/25")}>
                    Tutte · {(pratiche ?? []).length}
                </button>
                {flussoDi(sezione).concat(sezione === "ordini" ? ["annullato"] : ["non_riuscita"]).map((k) => (
                    conta[k] ? (
                        <button key={k} onClick={() => setFiltro(filtro === k ? "" : k)}
                            className={cn("px-3 py-2 rounded-xl text-[11px] font-bold border",
                                filtro === k ? "border-indigo-400/60 bg-indigo-500/20 text-indigo-100" : "border-white/10 text-slate-400 hover:border-white/25")}>
                            {STATI[k].icona} {STATI[k].label} · {conta[k]}
                        </button>
                    ) : null
                ))}
            </div>

            {pratiche === null ? (
                <div className="glass-card p-8 text-center text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carico…</div>
            ) : viste.length === 0 ? (
                <div className="glass-card p-8 text-center text-sm text-slate-500">
                    {(pratiche ?? []).length === 0
                        ? <>Nessuna pratica ancora. Il tasto <b className="text-slate-300">Nuova</b> qui sopra apre la prima.</>
                        : "Nessuna pratica con questi filtri."}
                </div>
            ) : (
                <div className="glass-card overflow-hidden">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead>
                                <tr className="text-[10px] uppercase tracking-widest text-slate-500 border-b border-white/10">
                                    <th className="py-2.5 px-3">Protocollo</th>
                                    <th className="py-2.5 px-2">Cliente</th>
                                    <th className="py-2.5 px-2">Tipo</th>
                                    <th className="py-2.5 px-2">Negozio</th>
                                    <th className="py-2.5 px-2 text-right">Valore</th>
                                    <th className="py-2.5 px-2">Stato</th>
                                    <th className="py-2.5 px-2">Aperta</th>
                                </tr>
                            </thead>
                            <tbody>
                                {viste.map((p) => {
                                    const t = TIPOLOGIE[p.tipologia];
                                    const st = STATI[p.stato] || { label: p.stato, icona: "•", classe: "text-slate-300 bg-white/5 border-white/15", chi: null };
                                    const gg = giorniLavorativi(p.created_at, oggiIso());
                                    const tardi = gg > TERMINE_MAX_GG && p.stato !== "consegnato" && p.stato !== "consegnata";
                                    return (
                                        <tr key={p.id} onClick={() => setApri(p.id)}
                                            className="border-t border-white/5 hover:bg-white/[0.03] cursor-pointer">
                                            <td className="py-2.5 px-3 font-mono text-xs text-slate-200">{p.protocollo}</td>
                                            <td className="py-2.5 px-2 text-slate-100 font-semibold">{String((p.cliente as { etichetta?: string }).etichetta || "—")}</td>
                                            <td className="py-2.5 px-2 text-slate-400 text-xs">{t ? t.icona + " " + t.label : p.tipologia}</td>
                                            <td className="py-2.5 px-2 text-slate-400 text-xs">{p.negozio}</td>
                                            <td className="py-2.5 px-2 text-right tabular-nums text-slate-200">{eur(p.valore)}</td>
                                            <td className="py-2.5 px-2">
                                                <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap", st.classe)}>{st.icona} {st.label}</span>
                                            </td>
                                            <td className="py-2.5 px-2 text-xs text-slate-500">
                                                {dataIt(p.created_at)}
                                                {tardi && <span className="text-rose-300 ml-1.5" title={`Aperta da ${gg} giorni lavorativi: oltre il termine di ${TERMINE_MAX_GG}`}>· {gg}g</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ── IL WIZARD ──────────────────────────────────────────────────────────
   Cliente → Tipo → Contenuto → Acconto → Firma → In coda.
   Ogni passo si apre solo quando il precedente è a posto, e il motivo è
   sempre scritto: un tasto spento senza spiegazione è un tasto rotto. */
function Wizard({ sezione, negozio, operatore, onAnnulla, onFatto }: {
    sezione: Sezione; negozio: string; operatore: string;
    onAnnulla: () => void; onFatto: (msg: string) => Promise<void>;
}) {
    const [step, setStep] = useState(0);
    const [cliente, setCliente] = useState<ClienteTrovato | null>(null);
    const [emailNuova, setEmailNuova] = useState("");
    const [salvoEmail, setSalvoEmail] = useState(false);
    const [tipologia, setTipologia] = useState("");
    const [righe, setRighe] = useState<Riga[]>([]);
    const [dev, setDev] = useState<Record<string, string>>({ brand: "", modello: "", colore: "", pin: "", condizioni: "", difetto: "" });
    const [imei, setImei] = useState("");
    const [valore, setValore] = useState("");
    const [approvv, setApprovv] = useState("");
    const [noteInt, setNoteInt] = useState("");
    const [pctAcconto, setPctAcconto] = useState<number | null>(null);
    const [accForma, setAccForma] = useState("CONTANTI");
    const [accScontrino, setAccScontrino] = useState("");
    const [firma, setFirma] = useState<Firma>({});
    const [salvo, setSalvo] = useState(false);
    const [errore, setErrore] = useState<string | null>(null);

    const t = TIPOLOGIE[tipologia];
    const perArticoli = !!t && t.contenuto === "articoli";
    const totale = perArticoli ? totaleRighe(righe) : (Number(String(valore).replace(",", ".")) || 0);
    const accImporto = pctAcconto ? Math.ceil(totale * pctAcconto * 100) / 100 : 0;

    const clienteOk = !!cliente && emailOk(String(cliente.email || ""));
    const serveImei = !!t && t.imei === "apertura";
    const contenutoOk = !t ? false : (perArticoli
        ? righe.length > 0
        : !!(dev.brand.trim() && dev.modello.trim() && totale > 0 && (!serveImei || imei.trim().length >= 6)))
        && (!t.approvvigionamento || !!approvv)
        && (t.noteInterne !== "obbligatorie" || noteInt.trim().length > 0);
    const accontoOk = pctAcconto === null ? false : (pctAcconto === 0 ? true : accScontrino.trim().length > 0);
    const firmaOk = firmaCompleta(firma);

    const PASSI = [
        { t: "Cliente", ok: clienteOk },
        { t: "Tipo", ok: !!tipologia },
        { t: sezione === "ordini" ? "Articoli" : "Dispositivo", ok: contenutoOk },
        { t: "Acconto", ok: accontoOk },
        { t: "Firma", ok: firmaOk },
        { t: "Riepilogo", ok: false },
    ];

    const salva = async () => {
        if (!cliente || !t) return;
        setSalvo(true); setErrore(null);
        try {
            const { data: proto, error: ep } = await supabase.rpc("pratica_protocollo", { sez: sezione });
            if (ep) throw new Error(ep.message);
            const statoIniziale = sezione === "ordini" ? "inviato" : "aperta";
            const storia = [{ at: oggiIso(), chi: operatore, txt: sezione === "ordini" ? "Richiesta inviata all'amministrazione" : "Assistenza aperta al banco" }];
            if (accImporto > 0) storia.push({ at: oggiIso(), chi: operatore, txt: `Acconto ${eur(accImporto)} incassato (${accForma}) — scontrino ${accScontrino}` });
            storia.push({ at: oggiIso(), chi: operatore, txt: `Modulo firmato ${firma.via === "otp" ? "col codice via email" : "su carta"}, documento d'identità archiviato` });
            const payload = {
                protocollo: String(proto), sezione, tipologia,
                client_id: cliente.id,
                cliente: {
                    etichetta: etichettaCliente(cliente), email: cliente.email, cellulare: cliente.cellulare,
                    cf_piva: cliente.cf_piva, indirizzo: cliente.indirizzo, cap: cliente.cap, citta: cliente.citta,
                },
                negozio, operatore, stato: statoIniziale, valore: totale,
                approvvigionamento: t.approvvigionamento ? approvv : null,
                note_interne: noteInt.trim() || null,
                dispositivo: perArticoli ? null : dev,
                imei: imei.trim() || null,
                acconto: accImporto > 0 ? { importo: accImporto, pct: pctAcconto, forma: accForma, scontrino: accScontrino.trim(), incassato_il: oggiIso() } : null,
                firma, storia,
            };
            const { data: nuovaP, error } = await supabase.from("pratiche").insert(payload).select("id, protocollo").single();
            if (error) throw new Error(error.message);
            if (perArticoli && righe.length) {
                const { error: er } = await supabase.from("pratiche_righe").insert(righe.map((r) => ({
                    pratica_id: nuovaP.id, tipo: "articolo", codice: r.codice || null,
                    descrizione: r.descrizione, qta: r.qta, prezzo: r.prezzo, note: r.note || null, da_magazzino: r.da_magazzino,
                })));
                if (er) throw new Error(er.message);
            }
            await onFatto(`✅ ${nuovaP.protocollo} aperta`);
        } catch (e) {
            setErrore(e instanceof Error ? e.message : "salvataggio non riuscito");
            setSalvo(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-black text-white">Nuova {sezione === "ordini" ? "richiesta cliente" : "assistenza"}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">{negozio} · {operatore}</p>
                </div>
                <button onClick={onAnnulla} className="px-4 py-2 rounded-xl border border-white/10 text-slate-300 text-xs font-bold uppercase tracking-widest hover:bg-white/5 flex items-center gap-1.5">
                    <ArrowLeft className="w-4 h-4" /> Torna all&apos;elenco
                </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
                {PASSI.map((p, i) => (
                    <button key={p.t} onClick={() => { if (i <= step || PASSI.slice(0, i).every((x) => x.ok)) setStep(i); }}
                        className={cn("px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors",
                            i === step ? "border-indigo-400/60 bg-indigo-500/20 text-indigo-100"
                                : p.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                    : "border-white/10 text-slate-500")}>
                        {p.ok ? "✓ " : ""}{i + 1}. {p.t}
                    </button>
                ))}
            </div>

            {step === 0 && (
                <PassoCliente cliente={cliente} onScelto={setCliente} emailNuova={emailNuova} setEmailNuova={setEmailNuova}
                    salvo={salvoEmail}
                    onSalvaEmail={async () => {
                        if (!cliente) return;
                        setSalvoEmail(true);
                        const { error } = await supabase.from("clients").update({ email: emailNuova.trim() }).eq("id", cliente.id);
                        setSalvoEmail(false);
                        if (error) { setErrore(error.message); return; }
                        setCliente({ ...cliente, email: emailNuova.trim() });
                        setEmailNuova("");
                    }} />
            )}

            {step === 1 && <PassoTipologia sezione={sezione} tipologia={tipologia} onCambia={(k) => { setTipologia(k); setApprovv(""); }} />}

            {step === 2 && t && (
                <div className="space-y-4">
                    {perArticoli
                        ? <PassoArticoli righe={righe} onCambia={setRighe} negozio={negozio} />
                        : <PassoDispositivo dev={dev} onCambia={setDev} imei={imei} onImei={setImei} serveImei={serveImei}
                            valore={valore} onValore={setValore} etichettaValore={t.valoreLabel} nota={t.valoreNota} />}
                    {t.approvvigionamento && <PassoApprovvigionamento tipologia={tipologia} valore={approvv} onCambia={setApprovv} ruolo="negozio" />}
                    <NoteInterneBox tipologia={tipologia} valore={noteInt} onCambia={setNoteInt} />
                </div>
            )}

            {step === 3 && <PassoAcconto totale={totale} pct={pctAcconto} onPct={setPctAcconto}
                forma={accForma} onForma={setAccForma} scontrino={accScontrino} onScontrino={setAccScontrino} />}

            {step === 4 && <PassoFirma cliente={cliente} firma={firma} onCambia={setFirma} protocollo="nuova" />}

            {step === 5 && (
                <Riepilogo sezione={sezione} tipologia={tipologia} cliente={cliente} righe={righe} dev={dev} imei={imei}
                    totale={totale} accImporto={accImporto} accForma={accForma} accScontrino={accScontrino}
                    approvv={approvv} noteInt={noteInt} firma={firma} negozio={negozio} operatore={operatore} />
            )}

            {errore && <p className="text-[12px] rounded-xl px-3 py-2 border text-rose-200 bg-rose-500/10 border-rose-500/25">⛔ {errore}</p>}

            <div className="flex justify-between gap-3 pt-2">
                <button onClick={() => (step === 0 ? onAnnulla() : setStep(step - 1))}
                    className="px-5 py-2.5 rounded-xl border border-white/10 text-slate-300 text-xs font-bold uppercase tracking-widest hover:bg-white/5">
                    {step === 0 ? "Annulla" : "Indietro"}
                </button>
                {step < 5 ? (
                    <button onClick={() => setStep(step + 1)} disabled={!PASSI[step].ok}
                        title={!PASSI[step].ok ? "Manca qualcosa in questo passo" : ""}
                        className="px-7 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
                        Avanti <ArrowRight className="w-4 h-4" />
                    </button>
                ) : (
                    <button onClick={salva} disabled={salvo || !clienteOk || !contenutoOk || !accontoOk || !firmaOk}
                        className="px-7 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-widest disabled:opacity-40 flex items-center gap-2">
                        {salvo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        {sezione === "ordini" ? "Invia all'amministrazione" : "Apri l'assistenza"}
                    </button>
                )}
            </div>
        </div>
    );
}

/* ── ① CLIENTE — l'email non è facoltativa ─────────────────────────────
   La pratica si apre con una mail al cliente e l'avviso di pronta consegna
   parte da lì: da quel messaggio decorrono i 14 e i 90 giorni. Senza
   indirizzo la pratica nasce muta, e i termini non decorrono da niente. */
function PassoCliente({ cliente, onScelto, emailNuova, setEmailNuova, onSalvaEmail, salvo }: {
    cliente: ClienteTrovato | null; onScelto: (c: ClienteTrovato | null) => void;
    emailNuova: string; setEmailNuova: (v: string) => void; onSalvaEmail: () => Promise<void>; salvo: boolean;
}) {
    if (cliente && !emailOk(String(cliente.email || ""))) {
        return (
            <div className="glass-card p-5 border-amber-400/40 bg-amber-500/[0.07] space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-2xl">✉️</span>
                    <div className="flex-1 min-w-[240px]">
                        <p className="text-sm font-black text-white">{etichettaCliente(cliente)} non ha un&apos;email in anagrafica</p>
                        <p className="text-[12px] text-slate-400 mt-1 leading-relaxed">
                            Serve per forza: la pratica si apre con una mail al cliente e l&apos;avviso di pronta consegna
                            parte da lì — da quel messaggio decorrono i {GIORNI_RITIRO} giorni per il ritiro e i {GIORNI_CESSIONE}.
                            Scrivila una volta sola: la salvo sulla sua anagrafica e non te la richiedo più.
                        </p>
                    </div>
                    <button onClick={() => onScelto(null)} className="px-3 py-2 rounded-xl border border-white/10 text-slate-300 text-[11px] font-bold hover:bg-white/5">Cambia cliente</button>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                    <input value={emailNuova} onChange={(e) => setEmailNuova(e.target.value)} type="email"
                        placeholder="nome@dominio.it" className="glass-input flex-1 min-w-[240px] px-3 py-2 text-sm rounded-xl" />
                    <button onClick={onSalvaEmail} disabled={!emailOk(emailNuova) || salvo}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-widest disabled:opacity-40 flex items-center gap-1.5">
                        {salvo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Salva sull&apos;anagrafica
                    </button>
                </div>
                {emailNuova.trim() && !emailOk(emailNuova) && <p className="text-[11px] text-rose-300">Questo non sembra un indirizzo email.</p>}
            </div>
        );
    }
    if (cliente) {
        return (
            <div className="glass-card p-5 border-emerald-500/30 bg-emerald-500/[0.05]">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-2xl">{cliente.tipo === "business" ? "🏢" : "👤"}</span>
                    <div className="flex-1 min-w-[220px]">
                        <p className="text-sm font-black text-white">{etichettaCliente(cliente)}</p>
                        <p className="text-[12px] text-slate-400 mt-0.5">
                            {[cliente.cf_piva, cliente.cellulare, cliente.email].filter(Boolean).join("  ·  ")}
                        </p>
                    </div>
                    <button onClick={() => onScelto(null)} className="px-3 py-2 rounded-xl border border-white/10 text-slate-300 text-[11px] font-bold hover:bg-white/5">Cambia</button>
                </div>
            </div>
        );
    }
    return (
        <div className="glass-card p-5 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Cerca l&apos;anagrafica</p>
            <RicercaCliente onScelto={onScelto} className="w-full" />
            <p className="text-[11px] text-slate-500">
                È la stessa anagrafica di Registra Vendita: codice fiscale, cellulare, nome e cognome o ragione sociale.
                Se il cliente non c&apos;è ancora, si crea da Registra Vendita e si torna qui.
            </p>
        </div>
    );
}

/* ── ② TIPO — comanda tutto il resto ───────────────────────────────────── */
function PassoTipologia({ sezione, tipologia, onCambia }: { sezione: Sezione; tipologia: string; onCambia: (k: string) => void }) {
    const t = TIPOLOGIE[tipologia];
    return (
        <div className="space-y-4">
            <div className="glass-card p-5">
                <p className="text-sm font-black text-white">Che tipo di intervento è?</p>
                <p className="text-[12px] text-slate-400 mt-1 leading-relaxed">
                    Da questa scelta dipende tutto il resto: quali campi compaiono, quali sono obbligatori e quando.
                </p>
                <div className="flex flex-wrap gap-2.5 mt-4">
                    {tipologieDi(sezione).map((k) => {
                        const x = TIPOLOGIE[k];
                        const on = tipologia === k;
                        return (
                            <button key={k} onClick={() => onCambia(k)}
                                className={cn("flex-1 min-w-[240px] text-left p-4 rounded-xl border transition-colors",
                                    on ? "border-indigo-400/60 bg-indigo-500/15" : "border-white/10 bg-white/[0.03] hover:border-white/25")}>
                                <p className={cn("text-sm font-black", on ? "text-indigo-200" : "text-white")}>{x.icona} {x.label}</p>
                                <p className="text-[11px] text-slate-500 mt-1 leading-snug">{x.cosa}</p>
                            </button>
                        );
                    })}
                </div>
            </div>
            {t && (
                <div className="glass-card overflow-hidden">
                    <div className="px-4 py-2.5 bg-white/[0.04] border-b border-white/10">
                        <span className="text-[12px] font-black text-white">{t.icona} {t.label} — come funziona</span>
                    </div>
                    {[
                        { et: "Valore economico", v: t.valoreLabel, n: t.valoreNota },
                        {
                            et: "IMEI / seriale",
                            v: t.imei === "no" ? "non serve" : t.imei === "arrivo" ? "si prende all'arrivo della merce" : "obbligatorio adesso",
                            n: t.imei === "no" ? "non c'è un apparecchio da identificare"
                                : t.imei === "arrivo" ? "il telefono non c'è ancora: si scrive quando arriva, prima di consegnarlo"
                                    : `il dispositivo resta qui: senza IMEI non si può dire di quale apparecchio si parla, e i termini dei ${GIORNI_RITIRO} e ${GIORNI_CESSIONE} giorni non reggono`,
                        },
                        { et: "Note interne", v: t.noteInterne === "obbligatorie" ? "obbligatorie" : "facoltative", n: "le legge solo il negozio e l'amministrazione — mai il cliente" },
                        {
                            et: "Da dove arriva il pezzo", v: t.approvvigionamento ? "obbligatorio" : "non previsto",
                            n: t.approvvigionamento ? (t.approvvDaConfermare ? "acceso perché spesso serve un pezzo per far ripartire l'apparecchio" : "questa tipologia comporta un acquisto") : "non si compra niente",
                        },
                        { et: "Documento firmato", v: "sempre", n: "col codice o su carta, con il documento d'identità del cliente" },
                    ].map((r, i, arr) => (
                        <div key={r.et} className={cn("px-4 py-2.5 flex flex-wrap gap-3 items-baseline", i < arr.length - 1 && "border-b border-white/5")}>
                            <span className="w-[180px] shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-500">{r.et}</span>
                            <span className="text-[12px] font-bold text-white">{r.v}</span>
                            <span className="flex-1 min-w-[200px] text-[11px] text-slate-500 leading-snug">{r.n}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ── ③a ARTICOLI — si cercano in MAGAZZINO, non si scelgono da un listino
   Le schede di categoria non coprono mai il caso vero: il cliente chiede una
   cosa che non c'è nell'elenco e l'operatore si arrende. Qui si cerca fra i
   17.000 articoli veri, con la giacenza del proprio negozio accanto; e se non
   c'è, si scrive a mano quello che il cliente vuole. */
function PassoArticoli({ righe, onCambia, negozio }: { righe: Riga[]; onCambia: (r: Riga[]) => void; negozio: string }) {
    const [q, setQ] = useState("");
    const [hits, setHits] = useState<{ codice: string; descrizione: string; prezzo: number; marca: string | null; giacenza: number }[]>([]);
    const [cerco, setCerco] = useState(false);
    const [aMano, setAMano] = useState(false);
    const [libero, setLibero] = useState({ descrizione: "", prezzo: "", qta: "1", note: "" });
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        const v = q.trim();
        if (v.length < 2) { setHits([]); return; }
        timer.current = setTimeout(async () => {
            setCerco(true);
            const { data } = await supabase.from("mag_articoli")
                .select("codice, descrizione, prezzo, marca")
                .eq("attivo", true)
                .or(`descrizione.ilike.%${v}%,codice.ilike.%${v}%,marca.ilike.%${v}%`)
                .limit(8);
            const arts = (data ?? []) as { codice: string; descrizione: string; prezzo: number; marca: string | null }[];
            let gia: Record<string, number> = {};
            if (arts.length) {
                const { data: g } = await supabase.from("mag_giacenze").select("codice, quantita")
                    .eq("negozio", negozio).in("codice", arts.map((a) => a.codice));
                ((g ?? []) as { codice: string; quantita: number }[]).forEach((x) => { gia[x.codice] = Number(x.quantita) || 0; });
            }
            setHits(arts.map((a) => ({ ...a, giacenza: gia[a.codice] || 0 })));
            setCerco(false);
        }, 300);
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [q, negozio]);

    const aggiungi = (r: Riga) => { onCambia(righe.concat([r])); setQ(""); setHits([]); };
    const cambia = (i: number, patch: Partial<Riga>) => { const c = righe.slice(); c[i] = { ...c[i], ...patch }; onCambia(c); };
    const liberoOk = libero.descrizione.trim().length > 1 && Number(String(libero.prezzo).replace(",", ".")) > 0;

    return (
        <div className="space-y-4">
            <div className="glass-card p-5 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Cerca l&apos;articolo in magazzino</p>
                <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input value={q} onChange={(e) => setQ(e.target.value)}
                        placeholder="Nome, codice o marca — «cover», «power bank», «AURICOLARI»…"
                        className="glass-input w-full pl-9 pr-3 py-2.5 text-sm rounded-xl" />
                    {cerco && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />}
                </div>

                {hits.length > 0 && (
                    <div className="rounded-xl border border-white/10 overflow-hidden">
                        {hits.map((a) => (
                            <button key={a.codice} onClick={() => aggiungi({
                                codice: a.codice, descrizione: a.descrizione, qta: 1,
                                prezzo: Number(a.prezzo) || 0, note: "", da_magazzino: true, giacenza: a.giacenza,
                            })}
                                className="w-full flex items-center gap-3 text-left px-3.5 py-2.5 bg-white/[0.02] border-b border-white/5 last:border-0 hover:bg-white/[0.06]">
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[13px] font-bold text-slate-100 truncate">{a.descrizione}</span>
                                    <span className="text-[11px] text-slate-500">{a.codice}{a.marca ? " · " + a.marca : ""}</span>
                                </span>
                                <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap",
                                    a.giacenza > 0 ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" : "text-amber-300 bg-amber-500/10 border-amber-400/30")}>
                                    {a.giacenza > 0 ? a.giacenza + " qui" : "da ordinare"}
                                </span>
                                <span className="w-[86px] text-right text-[13px] font-black text-white tabular-nums">{eur(Number(a.prezzo) || 0)}</span>
                            </button>
                        ))}
                    </div>
                )}
                {q.trim().length >= 2 && !cerco && hits.length === 0 && (
                    <p className="text-[12px] text-amber-300">In magazzino non c&apos;è: scrivilo a mano qui sotto, com&apos;è che lo chiede il cliente.</p>
                )}

                <div className="border-t border-white/10 pt-3">
                    {!aMano ? (
                        <button onClick={() => setAMano(true)} className="px-3 py-2 rounded-xl border border-white/10 text-slate-300 text-[11px] font-bold hover:bg-white/5">
                            ✍️ Non lo trovo: scrivo io cosa ordinare
                        </button>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-[12px] text-slate-400 leading-relaxed">
                                Quello che il cliente vuole, com&apos;è che te lo chiede. L&apos;amministrazione legge questo:
                                più sei preciso — marca, modello, colore — meno giri servono per comprarlo.
                            </p>
                            <div className="flex flex-wrap gap-2 items-end">
                                <input value={libero.descrizione} onChange={(e) => setLibero({ ...libero, descrizione: e.target.value })}
                                    placeholder="Cover Spigen Ultra Hybrid per Pixel 9 Pro, nera"
                                    className="glass-input flex-1 min-w-[240px] px-3 py-2 text-sm rounded-xl" />
                                <input value={libero.prezzo} onChange={(e) => setLibero({ ...libero, prezzo: e.target.value })}
                                    inputMode="decimal" placeholder="Prezzo €" className="glass-input w-[110px] px-3 py-2 text-sm rounded-xl" />
                                <input value={libero.qta} onChange={(e) => setLibero({ ...libero, qta: e.target.value })}
                                    inputMode="numeric" placeholder="Q.tà" className="glass-input w-[80px] px-3 py-2 text-sm rounded-xl" />
                                <button onClick={() => {
                                    aggiungi({
                                        codice: "", descrizione: libero.descrizione.trim(),
                                        qta: Math.max(1, Number(libero.qta) || 1),
                                        prezzo: Number(String(libero.prezzo).replace(",", ".")) || 0,
                                        note: libero.note.trim(), da_magazzino: false,
                                    });
                                    setLibero({ descrizione: "", prezzo: "", qta: "1", note: "" }); setAMano(false);
                                }} disabled={!liberoOk}
                                    className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs disabled:opacity-40">Aggiungi</button>
                                <button onClick={() => setAMano(false)} className="px-3 py-2 rounded-xl border border-white/10 text-slate-400 text-[11px] font-bold hover:bg-white/5">Annulla</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {righe.length > 0 && (
                <div className="glass-card overflow-hidden">
                    <div className="px-4 py-2.5 bg-white/[0.04] border-b border-white/10 flex justify-between items-center">
                        <span className="text-[12px] font-black text-white">🛒 Articoli ({righe.length})</span>
                        <span className="text-sm font-black text-violet-300">{eur(totaleRighe(righe))}</span>
                    </div>
                    {righe.map((r, i) => (
                        <div key={i} className="px-4 py-2.5 border-b border-white/5 last:border-0 flex flex-wrap gap-2 items-end">
                            <div className="flex-1 min-w-[200px]">
                                <p className="text-[13px] font-bold text-slate-100">{r.da_magazzino ? "📦" : "✍️"} {r.descrizione}</p>
                                <p className="text-[11px] text-slate-500">
                                    {r.codice ? r.codice + " · " : ""}
                                    {r.da_magazzino ? ((r.giacenza || 0) > 0 ? "c'è in magazzino" : "da ordinare") : "scritto a mano"}
                                </p>
                            </div>
                            <input value={r.qta} onChange={(e) => cambia(i, { qta: Math.max(1, Number(e.target.value) || 1) })}
                                inputMode="numeric" className="glass-input w-[70px] px-2 py-1.5 text-xs rounded-lg" />
                            <input value={r.prezzo} onChange={(e) => cambia(i, { prezzo: Number(String(e.target.value).replace(",", ".")) || 0 })}
                                inputMode="decimal" className="glass-input w-[100px] px-2 py-1.5 text-xs rounded-lg" />
                            <input value={r.note} onChange={(e) => cambia(i, { note: e.target.value })}
                                placeholder="colore, taglia…" className="glass-input flex-1 min-w-[120px] px-2 py-1.5 text-xs rounded-lg" />
                            <span className="w-[86px] text-right text-[13px] font-black text-white tabular-nums">{eur(r.prezzo * r.qta)}</span>
                            <button onClick={() => onCambia(righe.filter((_, k) => k !== i))}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-300 hover:bg-rose-500/10"><X className="w-3.5 h-3.5" /></button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ── ③b DISPOSITIVO ─────────────────────────────────────────────────────── */
function PassoDispositivo({ dev, onCambia, imei, onImei, serveImei, valore, onValore, etichettaValore, nota }: {
    dev: Record<string, string>; onCambia: (d: Record<string, string>) => void;
    imei: string; onImei: (v: string) => void; serveImei: boolean;
    valore: string; onValore: (v: string) => void; etichettaValore: string; nota: string;
}) {
    const set = (k: string, v: string) => onCambia({ ...dev, [k]: v });
    const imeiCorto = serveImei && imei.trim().length < 6;
    return (
        <div className="space-y-4">
            <div className="glass-card p-5 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Il dispositivo</p>
                <div className="flex flex-wrap gap-2">
                    <input value={dev.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Marca *" className="glass-input flex-1 min-w-[150px] px-3 py-2 text-sm rounded-xl" />
                    <input value={dev.modello} onChange={(e) => set("modello", e.target.value)} placeholder="Modello *" className="glass-input flex-1 min-w-[180px] px-3 py-2 text-sm rounded-xl" />
                    <input value={dev.colore} onChange={(e) => set("colore", e.target.value)} placeholder="Colore" className="glass-input w-[130px] px-3 py-2 text-sm rounded-xl" />
                </div>
                <div className="flex flex-wrap gap-2">
                    <input value={imei} onChange={(e) => onImei(e.target.value)} placeholder={serveImei ? "IMEI *" : "IMEI"}
                        className={cn("glass-input flex-1 min-w-[200px] px-3 py-2 text-sm rounded-xl font-mono", imeiCorto && "border-amber-400/50")} />
                    <input value={dev.pin} onChange={(e) => set("pin", e.target.value)} placeholder="PIN o sequenza di sblocco" className="glass-input flex-1 min-w-[200px] px-3 py-2 text-sm rounded-xl" />
                </div>
                {imeiCorto && (
                    <p className="text-[12px] text-amber-200 bg-amber-500/10 border border-amber-400/30 rounded-xl px-3 py-2 leading-relaxed">
                        ⚠️ <b>L&apos;IMEI è obbligatorio.</b> Il dispositivo resta in negozio: senza, non si può dire di quale
                        apparecchio si parla, e i termini dei {GIORNI_RITIRO} e dei {GIORNI_CESSIONE} giorni non reggono.
                        Si legge con <b>*#06#</b> o dalla scatola.
                    </p>
                )}
                <textarea value={dev.condizioni} onChange={(e) => set("condizioni", e.target.value)} rows={2}
                    placeholder="Condizioni estetiche all'accettazione: graffi, vetro crepato, ammaccature…"
                    className="glass-input w-full px-3 py-2 text-sm rounded-xl" />
                <textarea value={dev.difetto} onChange={(e) => set("difetto", e.target.value)} rows={2}
                    placeholder="Il difetto, come lo racconta il cliente"
                    className="glass-input w-full px-3 py-2 text-sm rounded-xl" />
            </div>
            <div className="glass-card p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{etichettaValore} *</p>
                <div className="flex flex-wrap items-end gap-3 mt-2">
                    <input value={valore} onChange={(e) => onValore(e.target.value)} inputMode="decimal" placeholder="0,00"
                        className="glass-input w-[160px] px-3 py-2 text-lg font-black rounded-xl" />
                    <p className="flex-1 min-w-[220px] text-[11px] text-slate-500 leading-snug">{nota}</p>
                </div>
            </div>
        </div>
    );
}

/* ── DA DOVE ARRIVA IL PEZZO ────────────────────────────────────────────
   «Il pezzo c'è già» sta per primo: è il caso migliore e non fa aspettare
   nessuno. «Ordinato» è spento per il negozio — lo mette l'amministrazione,
   perché è l'unico dei quattro che dice che i soldi sono usciti. */
function PassoApprovvigionamento({ tipologia, valore, onCambia, ruolo }: {
    tipologia: string; valore: string; onCambia: (v: string) => void; ruolo: string;
}) {
    const t = TIPOLOGIE[tipologia];
    if (!t || !t.approvvigionamento) return null;
    return (
        <div className={cn("glass-card p-5", !valore && "border-amber-400/40")}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Da dove arriva *</p>
            <div className="flex flex-wrap gap-2">
                {APPROVVIGIONAMENTO.map((a) => {
                    const on = valore === a.k;
                    const soloAdmin = a.chi === "admin" && ruolo !== "admin";
                    return (
                        <button key={a.k} disabled={soloAdmin} onClick={() => onCambia(a.k)}
                            className={cn("flex-1 min-w-[190px] text-left p-3 rounded-xl border transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                                on ? "border-indigo-400/60 bg-indigo-500/15" : "border-white/10 bg-white/[0.03] hover:border-white/25")}>
                            <p className={cn("text-[12.5px] font-bold", on ? "text-indigo-200" : "text-white")}>{a.icona} {a.label}</p>
                            <p className="text-[10.5px] text-slate-500 mt-1 leading-snug">{a.nota}</p>
                        </button>
                    );
                })}
            </div>
            {siFaSubito(valore) && (
                <p className="text-[11.5px] text-emerald-200 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-3 py-2 mt-3 leading-relaxed">
                    ✅ <b>Non c&apos;è niente da aspettare.</b> Il pezzo è qui: la pratica non passa dall&apos;amministrazione
                    per l&apos;acquisto e la lavorazione parte subito.
                </p>
            )}
        </div>
    );
}

/* ── LE NOTE CHE IL CLIENTE NON LEGGE MAI ───────────────────────────────── */
function NoteInterneBox({ tipologia, valore, onCambia }: { tipologia: string; valore: string; onCambia: (v: string) => void }) {
    const t = TIPOLOGIE[tipologia];
    const obbl = !!t && t.noteInterne === "obbligatorie";
    return (
        <div className={cn("glass-card p-5", obbl && !valore.trim() && "border-amber-400/40")}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                Note interne {obbl ? "— obbligatorie *" : ""}
            </p>
            <textarea value={valore} onChange={(e) => onCambia(e.target.value)} rows={3}
                placeholder={obbl
                    ? "Che cosa ha chiesto il cliente e che cosa gli hai promesso. Scrivilo come lo diresti a voce."
                    : "Urgenze, accordi presi a voce, cose che l'amministrazione deve sapere…"}
                className="glass-input w-full px-3 py-2 text-sm rounded-xl" />
            <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                🔒 Le vedono <b className="text-slate-400">solo il negozio e l&apos;amministrazione</b>: non finiscono nel modulo
                che firma il cliente né nelle email che gli arrivano.
                {obbl && <span className="text-amber-300"> Su questa tipologia sono obbligatorie: senza, fra un mese nessuno sa cosa è stato fatto.</span>}
            </p>
        </div>
    );
}

/* ── ④ ACCONTO — prima la percentuale ───────────────────────────────────
   Qui non si incassa: si decide. L'incasso si fa in cassa come sempre, e qui
   si scrive il numero del documento commerciale — così l'acconto della pratica
   e lo scontrino sono la stessa cosa e non due verità diverse. */
function PassoAcconto({ totale, pct, onPct, forma, onForma, scontrino, onScontrino }: {
    totale: number; pct: number | null; onPct: (v: number | null) => void;
    forma: string; onForma: (v: string) => void; scontrino: string; onScontrino: (v: string) => void;
}) {
    const SCELTE = [{ p: 0, l: "Nessun acconto", n: "niente cassa adesso: esce il riepilogo e si va avanti" },
    { p: 0.2, l: "20%", n: "il minimo che possiamo accettare" },
    { p: 0.5, l: "50%", n: "metà adesso, metà al ritiro" },
    { p: 1, l: "100%", n: "il cliente paga tutto subito" }];
    const importo = pct ? Math.ceil(totale * pct * 100) / 100 : 0;
    return (
        <div className="space-y-4">
            <div className="glass-card p-5">
                <p className="text-sm font-black text-white">💶 Il cliente lascia un acconto?</p>
                <p className="text-[12px] text-slate-400 mt-1 leading-relaxed">
                    Valore della pratica <b className="text-white">{eur(totale)}</b>. Se lascia un acconto si incassa in cassa
                    e da lì esce lo scontrino; se non lo lascia, si stampa il riepilogo e la pratica parte lo stesso.
                </p>
                <div className="flex flex-wrap gap-2.5 mt-4">
                    {SCELTE.map((s) => {
                        const on = pct === s.p;
                        return (
                            <button key={s.l} onClick={() => onPct(s.p)} disabled={totale <= 0 && s.p > 0}
                                className={cn("flex-1 min-w-[170px] text-left p-4 rounded-xl border transition-colors disabled:opacity-40",
                                    on ? (s.p === 0 ? "border-emerald-500/50 bg-emerald-500/15" : "border-indigo-400/60 bg-indigo-500/15") : "border-white/10 bg-white/[0.03] hover:border-white/25")}>
                                <p className={cn("text-base font-black", on ? (s.p === 0 ? "text-emerald-300" : "text-indigo-200") : "text-white")}>{s.l}</p>
                                {s.p > 0 && <p className="text-sm font-black text-white mt-0.5">{eur(Math.ceil(totale * s.p * 100) / 100)}</p>}
                                <p className="text-[10.5px] text-slate-500 mt-1 leading-snug">{s.n}</p>
                            </button>
                        );
                    })}
                </div>
            </div>

            {pct !== null && pct > 0 && (
                <div className="glass-card p-5 space-y-3">
                    <p className="text-[12px] text-slate-300 leading-relaxed">
                        🧾 Incassa <b className="text-white">{eur(importo)}</b> in cassa come sempre, poi scrivi qui il numero
                        del documento commerciale: così l&apos;acconto della pratica e lo scontrino sono la stessa cosa.
                        Alla consegna si emette un secondo documento sul <b>solo saldo</b>, che richiama questo.
                    </p>
                    <div className="flex flex-wrap gap-2 items-end">
                        <div className="flex gap-1.5">
                            {[{ k: "CONTANTI", l: "💶 Contanti" }, { k: "CARTA", l: "💳 Carta / POS" }].map((f) => (
                                <button key={f.k} onClick={() => onForma(f.k)}
                                    className={cn("px-3 py-2 rounded-xl text-[12px] font-bold border",
                                        forma === f.k ? "border-indigo-400/60 bg-indigo-500/20 text-indigo-100" : "border-white/10 text-slate-400 hover:border-white/25")}>{f.l}</button>
                            ))}
                        </div>
                        <input value={scontrino} onChange={(e) => onScontrino(e.target.value)}
                            placeholder="Numero documento commerciale *" className="glass-input flex-1 min-w-[220px] px-3 py-2 text-sm rounded-xl font-mono" />
                    </div>
                    <p className="text-[11px] text-slate-500">
                        Niente bonifico sugli acconti: l&apos;incasso dev&apos;essere contestuale all&apos;emissione del documento.
                    </p>
                </div>
            )}
            {pct === 0 && (
                <p className="text-[12px] text-sky-200 bg-sky-500/10 border border-sky-500/25 rounded-xl px-3 py-2.5 leading-relaxed">
                    📄 Senza acconto non si emette niente di fiscale: il cliente si porta a casa il riepilogo della pratica,
                    e paga tutto alla consegna.
                </p>
            )}
        </div>
    );
}

/* ── ⑤ FIRMA — è un cancello, non un passaggio ──────────────────────────
   Senza firma la pratica non si salva: è il documento che regge l'acconto
   trattenuto, i 14 giorni e i 90. Due strade che valgono uguale — cambia solo
   dove firma — e in tutte e due il documento d'identità, che archiviamo noi
   come già si fa in Registra Vendita.
   ⚠️ La firma col codice (DocuSeal) arriva subito dopo: oggi si firma su
   carta, che è la strada che funziona anche col telefono del cliente rotto. */
function PassoFirma({ cliente, firma, onCambia, protocollo }: {
    cliente: ClienteTrovato | null; firma: Firma; onCambia: (f: Firma) => void; protocollo: string;
}) {
    const [su, setSu] = useState<"modulo" | "identita" | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const [quale, setQuale] = useState<"modulo" | "identita">("modulo");

    const carica = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files && e.target.files[0];
        e.target.value = "";
        if (!f) return;
        setSu(quale);
        const safe = f.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
        const path = `pratiche/${protocollo}/${Date.now()}_${quale}_${safe}`;
        const { error } = await supabase.storage.from("pratiche-allegati").upload(path, f);
        setSu(null);
        if (error) { window.alert("Caricamento non riuscito: " + error.message); return; }
        onCambia({ ...firma, via: firma.via || "cartacea", [quale]: { nome: f.name, path } });
    };
    const scegli = (q: "modulo" | "identita") => { setQuale(q); setTimeout(() => { const el = fileRef.current; if (el) el.click(); }, 0); };

    const completa = firmaCompleta(firma);
    const manca: string[] = [];
    if (!firma.via) manca.push("scegli come firma");
    else if (firma.via === "cartacea" && !firma.modulo) manca.push("il modulo firmato");
    else if (firma.via === "otp" && firma.otp !== "fatta") manca.push("il cliente deve ancora firmare");
    if (firma.via && !firma.identita) manca.push("il documento d'identità");

    return (
        <div className="space-y-4">
            <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={carica} className="hidden" />

            <div className="glass-card p-5">
                <p className="text-sm font-black text-white">✍️ Come firma il cliente</p>
                <p className="text-[12px] text-slate-400 mt-1 leading-relaxed">
                    Senza firma la pratica <b className="text-slate-200">non si salva</b>: non è un passaggio, è un cancello.
                </p>
                <div className="flex flex-wrap gap-2.5 mt-4">
                    <button onClick={() => onCambia({ ...firma, via: "cartacea" })}
                        className={cn("flex-1 min-w-[240px] text-left p-4 rounded-xl border transition-colors",
                            firma.via === "cartacea" ? "border-indigo-400/60 bg-indigo-500/15" : "border-white/10 bg-white/[0.03] hover:border-white/25")}>
                        <p className={cn("text-sm font-black", firma.via === "cartacea" ? "text-indigo-200" : "text-white")}>🖊️ Firma su carta</p>
                        <p className="text-[11px] text-slate-500 mt-1 leading-snug">Si stampa il modulo, firma al banco nei due punti, si fotografa. Funziona sempre, anche col telefono rotto.</p>
                    </button>
                    <div className="flex-1 min-w-[240px] p-4 rounded-xl border border-white/10 bg-white/[0.02] opacity-60">
                        <p className="text-sm font-black text-slate-400">📲 Firma sul telefono <span className="text-[10px] font-bold text-amber-300 ml-1">in arrivo</span></p>
                        <p className="text-[11px] text-slate-600 mt-1 leading-snug">Codice via email e firma dal telefono del cliente. Si accende appena il modello DocuSeal è pronto.</p>
                    </div>
                </div>
            </div>

            {firma.via === "cartacea" && (
                <div className="glass-card p-5 space-y-3">
                    <button onClick={() => window.print()} className="px-4 py-2 rounded-xl border border-white/10 text-slate-200 text-xs font-bold hover:bg-white/5 flex items-center gap-1.5">
                        <Printer className="w-4 h-4" /> Stampa il modulo
                    </button>
                    <AllegatoRiga etichetta="Il modulo firmato" nota="le due firme devono esserci entrambe"
                        file={firma.modulo} caricando={su === "modulo"} onScegli={() => scegli("modulo")} />
                </div>
            )}

            {firma.via && (
                <div className="glass-card p-5 space-y-3">
                    <p className="text-[12px] text-slate-400 leading-relaxed">
                        🪪 Il <b className="text-slate-200">documento d&apos;identità</b> serve in tutti i casi: lo archiviamo noi
                        sulla pratica, come già si fa quando si registra una vendita.
                    </p>
                    <AllegatoRiga etichetta="Carta d'identità o patente" nota="fronte e retro, leggibile"
                        file={firma.identita} caricando={su === "identita"} onScegli={() => scegli("identita")} />
                </div>
            )}

            {!completa && (
                <p className="text-[12px] text-amber-200 bg-amber-500/10 border border-amber-400/30 rounded-xl px-3 py-2.5">
                    ⚠️ La pratica non si salva finché manca: <b>{manca.join(", ")}</b>.
                </p>
            )}
            {completa && firma.via === "cartacea" && (
                <p className="text-[11.5px] text-sky-200 bg-sky-500/10 border border-sky-500/25 rounded-xl px-3 py-2.5 leading-relaxed">
                    🔎 <b>Controllo del documento: da fare.</b> Per ora lo guarda una persona. Il controllo automatico — che il
                    modulo sia quello giusto, che le due firme ci siano entrambe e che somiglino a quella del documento — si
                    aggiunge dopo.
                </p>
            )}
        </div>
    );
}

function AllegatoRiga({ etichetta, nota, file, caricando, onScegli }: {
    etichetta: string; nota: string; file?: { nome: string } | null; caricando: boolean; onScegli: () => void;
}) {
    return (
        <div className={cn("flex flex-wrap items-center gap-3 px-3.5 py-3 rounded-xl border",
            file ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "border-white/10 bg-white/[0.03]")}>
            <span className="text-lg">{file ? "✅" : "📎"}</span>
            <div className="flex-1 min-w-[180px]">
                <p className={cn("text-[13px] font-bold", file ? "text-emerald-300" : "text-white")}>{etichetta}</p>
                <p className="text-[11px] text-slate-500 truncate">{file ? file.nome : nota}</p>
            </div>
            <button onClick={onScegli} disabled={caricando}
                className="px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 text-[11px] font-bold hover:bg-white/5 disabled:opacity-40 flex items-center gap-1.5">
                {caricando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
                {file ? "Sostituisci" : "Carica"}
            </button>
        </div>
    );
}

/* ── ⑥ RIEPILOGO ────────────────────────────────────────────────────────── */
function Riepilogo({ sezione, tipologia, cliente, righe, dev, imei, totale, accImporto, accForma, accScontrino, approvv, noteInt, firma, negozio, operatore }: {
    sezione: Sezione; tipologia: string; cliente: ClienteTrovato | null; righe: Riga[];
    dev: Record<string, string>; imei: string; totale: number; accImporto: number; accForma: string; accScontrino: string;
    approvv: string; noteInt: string; firma: Firma; negozio: string; operatore: string;
}) {
    const t = TIPOLOGIE[tipologia];
    const saldo = Math.round((totale - accImporto) * 100) / 100;
    const medio = TEMPO_MEDIO[tipologia] || 3;
    const dato = (et: string, v: string, n?: string, cls?: string) => (
        <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{et}</p>
            <p className={cn("text-[13.5px] font-bold", cls || "text-white")}>{v}</p>
            {n && <p className="text-[11px] text-slate-500 mt-0.5">{n}</p>}
        </div>
    );
    return (
        <div className="glass-card overflow-hidden">
            <div className="px-5 py-3.5 bg-white/[0.04] border-b border-white/10">
                <p className="text-sm font-black text-white">📋 Riepilogo della pratica</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Questo è quello che vede l&apos;amministrazione, e quello che il cliente si porta a casa.</p>
            </div>
            <div className="p-5 grid gap-4 border-b border-white/10" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
                {dato("Cliente", cliente ? etichettaCliente(cliente) : "—", [cliente?.cellulare, cliente?.email].filter(Boolean).join(" · "))}
                {dato("Punto vendita", negozio, operatore)}
                {dato("Tipo di intervento", t ? t.icona + " " + t.label : "—", t && t.approvvigionamento ? etichettaApprovv(approvv) : undefined)}
                {dato(t ? t.valoreLabel : "Valore", eur(totale), sezione === "ordini" ? righe.length + (righe.length === 1 ? " riga" : " righe") : `${dev.brand} ${dev.modello}`.trim())}
                {dato("Acconto", accImporto > 0 ? eur(accImporto) : "nessuno", accImporto > 0 ? `${accForma} · 🧾 ${accScontrino}` : "riepilogo, niente di fiscale", accImporto > 0 ? "text-emerald-300" : "text-slate-400")}
                {dato("Saldo alla consegna", eur(saldo), accImporto > 0 ? "secondo documento, richiama il primo" : "tutto alla consegna")}
                {imei ? dato("IMEI", imei) : null}
                {dato("Firma", firma.via === "otp" ? "📲 col codice" : "🖊️ su carta", "documento d'identità archiviato", "text-emerald-300")}
                {dato("Tempi", `${medio} gg medi`, `termine massimo ${TERMINE_MAX_GG} giorni lavorativi`)}
            </div>
            {righe.length > 0 && (
                <div className="px-5 py-2">
                    {righe.map((r, i) => (
                        <div key={i} className="py-2 border-b border-white/5 last:border-0 flex gap-3 items-baseline">
                            <span className="flex-1 text-[13px] text-slate-200">{r.da_magazzino ? "📦" : "✍️"} {r.descrizione}{r.note ? <span className="text-slate-500"> — {r.note}</span> : null}</span>
                            <span className="text-[11px] text-slate-500">×{r.qta}</span>
                            <span className="w-[84px] text-right text-[13px] font-bold text-white tabular-nums">{eur(r.prezzo * r.qta)}</span>
                        </div>
                    ))}
                </div>
            )}
            {noteInt.trim() && (
                <div className="px-5 py-3 bg-white/[0.03] border-t border-white/10">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Note interne — non le vede il cliente</p>
                    <p className="text-[12.5px] text-slate-400 whitespace-pre-wrap leading-relaxed mt-1">{noteInt}</p>
                </div>
            )}
        </div>
    );
}

/* ── IL DETTAGLIO ───────────────────────────────────────────────────────
   La pipeline, chi deve muovere la riga, e i due gesti che contano: l'avviso
   di pronta consegna (da cui decorrono i 14 e i 90 giorni, e per questo la
   data si scrive sulla pratica) e il buono, quando il lavoro non si conclude. */
function Dettaglio({ pratica, ruolo, eAdmin, operatore, onChiudi, onFatto }: {
    pratica: Pratica; ruolo: string; eAdmin: boolean; operatore: string;
    onChiudi: () => void; onFatto: (msg: string) => Promise<void>;
}) {
    const [busy, setBusy] = useState(false);
    const [imei, setImei] = useState(pratica.imei || "");
    const [tracking, setTracking] = useState(pratica.tracking || "");
    const STATI = statiDi(pratica.sezione);
    const FLUSSO = flussoDi(pratica.sezione);
    const t = TIPOLOGIE[pratica.tipologia];
    const st = STATI[pratica.stato] || { label: pratica.stato, icona: "•", classe: "text-slate-300 bg-white/5 border-white/15", chi: null };
    const idx = FLUSSO.indexOf(pratica.stato);
    const prossimo = idx >= 0 && idx < FLUSSO.length - 1 ? FLUSSO[idx + 1] : null;
    const chiMuove = prossimo ? STATI[prossimo].chi : null;
    const mioTurno = !!prossimo && (chiMuove === "admin" ? eAdmin : chiMuove === "tecnico" ? (eAdmin || ruolo === "tecnico") : true);
    const chiusa = pratica.stato === "consegnato" || pratica.stato === "consegnata" || pratica.stato === "annullato" || pratica.stato === "non_riuscita";
    const acc = (pratica.acconto || {}) as { importo?: number; forma?: string; scontrino?: string };
    const accImporto = Number(acc.importo) || 0;
    const saldo = Math.round((Number(pratica.valore) - accImporto) * 100) / 100;
    const serveImeiArrivo = !!t && t.imei === "arrivo" && prossimo === "in_negozio";
    const ggAperta = giorniLavorativi(pratica.created_at, oggiIso());
    const ggAvviso = pratica.avviso_pronto_il ? giorniLavorativi(pratica.avviso_pronto_il, oggiIso()) : null;

    const scrivi = async (patch: Record<string, unknown>, testo: string, msg: string) => {
        setBusy(true);
        const storia = (pratica.storia || []).concat([{ at: oggiIso(), chi: operatore, txt: testo }]);
        const { error } = await supabase.from("pratiche").update({ ...patch, storia, updated_at: oggiIso() }).eq("id", pratica.id);
        setBusy(false);
        if (error) { window.alert("Non riuscito: " + error.message); return; }
        await onFatto(msg);
    };

    const avanza = async () => {
        if (!prossimo) return;
        const patch: Record<string, unknown> = { stato: prossimo };
        let testo = STATI[prossimo].label;
        if (prossimo === "spedito" && tracking.trim()) { patch.tracking = tracking.trim(); testo += " — " + tracking.trim(); }
        if (prossimo === "in_negozio" && imei.trim()) { patch.imei = imei.trim(); testo += " · IMEI " + imei.trim(); }
        await scrivi(patch, testo, STATI[prossimo].icona + " " + STATI[prossimo].label);
    };

    const avvisaPronto = async () => {
        const quando = oggiIso();
        await scrivi({ avviso_pronto_il: quando },
            `Avviso di pronta consegna inviato al cliente — da oggi decorrono i ${GIORNI_RITIRO} giorni per il ritiro e i ${GIORNI_CESSIONE}`,
            "🔔 Avviso registrato: i termini decorrono da adesso");
    };

    const emettiBuono = async () => {
        const scad = new Date(); scad.setMonth(scad.getMonth() + BUONO_MESI);
        const codice = "BUO-" + String(new Date().getFullYear()).slice(2) + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
        const buono = { codice, importo: accImporto, residuo: accImporto, emesso_il: oggiIso(), scade_il: scad.toISOString(), esclusi: BUONO_ESCLUSI };
        await scrivi({ buono },
            `Lavorazione non conclusa: acconto ${eur(accImporto)} trasformato nel buono ${codice}, valido fino al ${dataIt(scad.toISOString())} (escluse ${BUONO_ESCLUSI})`,
            "🎟️ Buono " + codice + " emesso");
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-black text-white font-mono">{pratica.protocollo}</h2>
                        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border", st.classe)}>{st.icona} {st.label}</span>
                        {t && <span className="text-[11px] text-slate-500">{t.icona} {t.label}</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                        {String((pratica.cliente as { etichetta?: string }).etichetta || "")} · {pratica.negozio} · aperta {dataIt(pratica.created_at)}
                        {!chiusa && <span className={ggAperta > TERMINE_MAX_GG ? "text-rose-300" : ""}> · {ggAperta} giorni lavorativi</span>}
                    </p>
                </div>
                <button onClick={onChiudi} className="px-4 py-2 rounded-xl border border-white/10 text-slate-300 text-xs font-bold uppercase tracking-widest hover:bg-white/5 flex items-center gap-1.5">
                    <ArrowLeft className="w-4 h-4" /> Elenco
                </button>
            </div>

            {/* pipeline */}
            <div className="glass-card p-4 flex flex-wrap gap-1.5">
                {FLUSSO.map((k, i) => {
                    const fatto = idx >= i;
                    const ora = pratica.stato === k;
                    return (
                        <div key={k} className={cn("flex-1 min-w-[110px] px-2.5 py-2 rounded-xl border text-center",
                            ora ? STATI[k].classe : fatto ? "text-slate-300 bg-white/[0.05] border-white/15" : "text-slate-600 bg-transparent border-white/5")}>
                            <div className="text-sm">{STATI[k].icona}</div>
                            <div className="text-[10px] font-bold leading-tight mt-0.5">{STATI[k].label}</div>
                        </div>
                    );
                })}
            </div>

            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
                <div className="glass-card p-5 space-y-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">La pratica</p>
                    <Voce et={t ? t.valoreLabel : "Valore"} v={eur(Number(pratica.valore))} />
                    <Voce et="Acconto" v={accImporto > 0 ? `${eur(accImporto)} · ${acc.forma || ""} · 🧾 ${acc.scontrino || ""}` : "nessuno"} />
                    <Voce et="Saldo alla consegna" v={eur(saldo)} forte />
                    {t && t.approvvigionamento && <Voce et="Da dove arriva" v={etichettaApprovv(pratica.approvvigionamento)} />}
                    {pratica.imei && <Voce et="IMEI" v={pratica.imei} />}
                    {pratica.dispositivo && <Voce et="Dispositivo" v={`${pratica.dispositivo.brand || ""} ${pratica.dispositivo.modello || ""}`.trim()} />}
                    {pratica.dispositivo?.condizioni && <Voce et="Condizioni" v={pratica.dispositivo.condizioni} />}
                    {pratica.dispositivo?.difetto && <Voce et="Difetto" v={pratica.dispositivo.difetto} />}
                </div>

                <div className="glass-card p-5 space-y-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Firma e documenti</p>
                    <Voce et="Firmato" v={pratica.firma?.via === "otp" ? "📲 col codice" : "🖊️ su carta"} />
                    <Voce et="Documento d'identità" v={pratica.firma?.identita ? "✅ archiviato" : "⛔ mancante"} />
                    {pratica.firma?.via === "cartacea" && <Voce et="Modulo firmato" v={pratica.firma?.modulo ? "✅ allegato" : "⛔ mancante"} />}
                    {pratica.avviso_pronto_il ? (
                        <>
                            <Voce et="Avviso di pronta consegna" v={dataOraIt(pratica.avviso_pronto_il)} />
                            <p className={cn("text-[11.5px] leading-relaxed rounded-xl px-3 py-2 border",
                                (ggAvviso || 0) >= GIORNI_CESSIONE ? "text-rose-200 bg-rose-500/10 border-rose-500/25"
                                    : (ggAvviso || 0) >= GIORNI_RITIRO ? "text-amber-200 bg-amber-500/10 border-amber-400/25"
                                        : "text-slate-400 bg-white/[0.03] border-white/10")}>
                                Sono passati <b>{ggAvviso}</b> giorni lavorativi dall&apos;avviso.
                                {(ggAvviso || 0) >= GIORNI_CESSIONE ? ` Oltre i ${GIORNI_CESSIONE}: il dispositivo si intende ceduto (clausola 7.3).`
                                    : (ggAvviso || 0) >= GIORNI_RITIRO ? ` Oltre i ${GIORNI_RITIRO}: l'acconto è definitivamente acquisito (clausola 7.2).`
                                        : ` Il ritiro è dovuto entro ${GIORNI_RITIRO} giorni.`}
                            </p>
                        </>
                    ) : (
                        <p className="text-[11.5px] text-slate-500 leading-relaxed">
                            L&apos;avviso di pronta consegna non è ancora partito: <b className="text-slate-400">finché non parte, i {GIORNI_RITIRO} e i {GIORNI_CESSIONE} giorni non decorrono da niente.</b>
                        </p>
                    )}
                </div>
            </div>

            {pratica.note_interne && (
                <div className="glass-card p-5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">🔒 Note interne — non le vede il cliente</p>
                    <p className="text-[12.5px] text-slate-300 whitespace-pre-wrap leading-relaxed mt-1.5">{pratica.note_interne}</p>
                </div>
            )}

            {(pratica.righe || []).length > 0 && (
                <div className="glass-card overflow-hidden">
                    <div className="px-4 py-2.5 bg-white/[0.04] border-b border-white/10 text-[12px] font-black text-white">🛒 Articoli</div>
                    {(pratica.righe || []).map((r, i) => (
                        <div key={i} className="px-4 py-2.5 border-b border-white/5 last:border-0 flex gap-3 items-baseline">
                            <span className="flex-1 text-[13px] text-slate-200">{r.da_magazzino ? "📦" : "✍️"} {r.descrizione}{r.note ? <span className="text-slate-500"> — {r.note}</span> : null}</span>
                            <span className="text-[11px] text-slate-500">×{r.qta}</span>
                            <span className="w-[84px] text-right text-[13px] font-bold text-white tabular-nums">{eur(r.prezzo * r.qta)}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* azioni */}
            {!chiusa && (
                <div className="glass-card p-5 space-y-3">
                    {serveImeiArrivo && (
                        <div className="rounded-xl border border-amber-400/40 bg-amber-500/[0.07] p-3.5 space-y-2">
                            <p className="text-[12px] text-amber-100 leading-relaxed">
                                📲 <b>Il telefono è arrivato: scrivi l&apos;IMEI adesso.</b> Su un ordine telefono il seriale non
                                c&apos;era all&apos;apertura — si prende qui, prima di consegnarlo, altrimenti la garanzia non si
                                aggancia a nessun apparecchio. Si legge con <b>*#06#</b> o dalla scatola.
                            </p>
                            <input value={imei} onChange={(e) => setImei(e.target.value)} placeholder="IMEI"
                                className="glass-input w-full max-w-[280px] px-3 py-2 text-sm rounded-xl font-mono" />
                        </div>
                    )}
                    {prossimo === "spedito" && (
                        <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Tracking della spedizione (facoltativo)"
                            className="glass-input w-full max-w-[340px] px-3 py-2 text-sm rounded-xl" />
                    )}
                    <div className="flex flex-wrap gap-2 items-center">
                        {prossimo && mioTurno && (
                            <button onClick={avanza} disabled={busy || (serveImeiArrivo && imei.trim().length < 6)}
                                title={serveImeiArrivo && imei.trim().length < 6 ? "Serve l'IMEI del telefono arrivato" : ""}
                                className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs uppercase tracking-widest disabled:opacity-40 flex items-center gap-2">
                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>{STATI[prossimo].icona}</span>}
                                Porta a «{STATI[prossimo].label}»
                            </button>
                        )}
                        {prossimo && !mioTurno && (
                            <p className="text-[12px] text-slate-400">
                                <Clock className="w-3.5 h-3.5 inline mr-1" />
                                Tocca {chiMuove === "admin" ? "all'amministrazione" : chiMuove === "tecnico" ? "al laboratorio" : "al negozio"}: «{STATI[prossimo].label}».
                            </p>
                        )}
                        {(pratica.stato === "in_negozio" || pratica.stato === "pronta") && !pratica.avviso_pronto_il && (
                            <button onClick={avvisaPronto} disabled={busy}
                                className="px-4 py-2.5 rounded-xl border border-teal-500/40 bg-teal-500/15 text-teal-200 font-bold text-xs uppercase tracking-widest disabled:opacity-40">
                                🔔 Avvisa il cliente che è pronto
                            </button>
                        )}
                        {pratica.sezione === "assistenze" && !chiusa && (
                            <button onClick={() => scrivi({ stato: "non_riuscita" }, "Lavorazione non riuscita", "⛔ Segnata non riuscita")} disabled={busy}
                                className="px-4 py-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-200 font-bold text-xs uppercase tracking-widest disabled:opacity-40">
                                Non riuscita
                            </button>
                        )}
                        {pratica.sezione === "ordini" && eAdmin && (
                            <button onClick={() => { if (window.confirm("Annullo l'ordine " + pratica.protocollo + "?")) scrivi({ stato: "annullato" }, "Ordine annullato", "❌ Annullato"); }} disabled={busy}
                                className="px-4 py-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-200 font-bold text-xs uppercase tracking-widest disabled:opacity-40">
                                Annulla ordine
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* il buono, quando il lavoro non si conclude */}
            {pratica.stato === "non_riuscita" && (
                pratica.buono ? (
                    <div className="glass-card p-5 border-teal-500/40 bg-teal-500/[0.06]">
                        <p className="text-sm font-black text-teal-300">🎟️ Buono {eur(Number((pratica.buono as { importo?: number }).importo) || 0)} — {String((pratica.buono as { codice?: string }).codice)}</p>
                        <p className="text-[11.5px] text-slate-400 mt-1">
                            emesso il {dataIt(String((pratica.buono as { emesso_il?: string }).emesso_il))} · scade il {dataIt(String((pratica.buono as { scade_il?: string }).scade_il))}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                            Spendibile in negozio in una o più volte, escluse {BUONO_ESCLUSI}. Non si converte in denaro.
                        </p>
                    </div>
                ) : accImporto > 0 ? (
                    <div className="glass-card p-5 border-amber-400/40 bg-amber-500/[0.07] space-y-3">
                        <p className="text-sm font-black text-amber-200">Il lavoro non si è concluso: l&apos;acconto di {eur(accImporto)} non resta a noi</p>
                        <p className="text-[12px] text-slate-400 leading-relaxed">
                            Il cliente non salda e il tentativo non si paga. Lo scontrino sull&apos;acconto però è già stato emesso:
                            si emette un <b className="text-slate-200">buono di pari importo</b>, valido {BUONO_MESI} mesi, spendibile in negozio
                            in una o più volte — escluse {BUONO_ESCLUSI}. È la clausola 7.6 del modulo che il cliente ha firmato.
                        </p>
                        <button onClick={emettiBuono} disabled={busy}
                            className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs uppercase tracking-widest disabled:opacity-40">
                            🎟️ Emetti il buono da {eur(accImporto)}
                        </button>
                    </div>
                ) : (
                    <p className="text-[12px] text-slate-400 glass-card p-4">Non c&apos;era acconto: non c&apos;è niente da restituire e nessun buono da emettere.</p>
                )
            )}

            <div className="glass-card p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Storia</p>
                <div className="space-y-1.5">
                    {(pratica.storia || []).slice().reverse().map((r, i) => (
                        <div key={i} className="flex flex-wrap gap-2 items-baseline text-[11.5px]">
                            <span className="text-slate-500 tabular-nums w-[92px] shrink-0">{dataOraIt(r.at)}</span>
                            <span className="text-slate-300 font-bold">{r.chi}</span>
                            <span className="text-slate-400 flex-1 min-w-[200px]">{r.txt}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function Voce({ et, v, forte }: { et: string; v: string; forte?: boolean }) {
    return (
        <div className="flex flex-wrap gap-2 items-baseline">
            <span className="w-[160px] shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-500">{et}</span>
            <span className={cn("text-[13px] flex-1 min-w-[120px]", forte ? "font-black text-white" : "text-slate-200")}>{v}</span>
        </div>
    );
}
