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
import { useStores } from "@/lib/org";
import { useRouter, useSearchParams } from "next/navigation";
import { mandaInCassa } from "@/lib/accontoInCassa";
import { stessoMagazzino } from "@/lib/negoziNomi";
import PopupCarta from "@/components/PopupCarta";
import CanaleFirma, { type Canale } from "@/components/CanaleFirma";
import { RicercaCliente, etichettaCliente, type ClienteTrovato } from "@/components/RicercaCliente";
import { stampaModulo, type DatiModulo } from "@/lib/moduloPratica";
import { SelectOpzioni } from "@/components/SelectPersona";
import { brandsDispositivi, modelliDispositivi, BRAND_COMUNI, type CategoriaDispositivo } from "@/lib/dispositivi";
import {
    TIPOLOGIE, tipologieDi, APPROVVIGIONAMENTO, etichettaApprovv, siFaSubito,
    statiDi, flussoDi, firmaCompleta, eur, giorniLavorativi,
    TERMINE_MAX_GG, GIORNI_RITIRO, GIORNI_CESSIONE, tempoMedio,
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
    tracking: string | null; avviso_pronto_il: string | null; attesa_da: string | null;
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
    /* ⚠️ SI ARRIVA QUI DA FUORI. La timeline del cliente porta alla pratica
       con ?p=<protocollo>: senza questo, il link atterrava sull'elenco e
       toccava ricercarla a mano. Una volta sola, altrimenti riaprirebbe la
       scheda ogni volta che si torna all'elenco. */
    const parametri = useSearchParams();
    const giaAperta = useRef(false);
    const [cerca, setCerca] = useState("");
    /* DUE FILTRI DIVERSI, non uno solo. `filtro` è uno STATO della pratica;
       `vista` è un taglio trasversale — «fuori tempo», «da comprare», «da
       avvisare» non sono stati, e infilarli nella stessa variabile faceva
       confrontare «__tarde» con `p.stato`: la tabella si svuotava e sembrava
       che non ci fosse niente (rilievo del revisore, provato). */
    const [filtro, setFiltro] = useState("");
    const [vista, setVista] = useState<"" | "tarde" | "ordinare" | "avvisare">("");
    const [msg, setMsg] = useState<string | null>(null);
    const STATI = statiDi(sezione);
    const tuttiNegozi = useStores();
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
        const viva = (p: Pratica) => p.stato !== "consegnato" && p.stato !== "consegnata" && p.stato !== "annullato" && p.stato !== "non_riuscita";
        return (pratiche ?? []).filter((p) => {
            if (filtro && p.stato !== filtro) return false;
            if (vista === "tarde" && !(viva(p) && giorniLavorativi(p.created_at, oggiIso()) > TERMINE_MAX_GG)) return false;
            if (vista === "ordinare" && !(p.approvvigionamento === "da_ordinare" || p.approvvigionamento === "altro_negozio")) return false;
            if (vista === "avvisare" && !((p.stato === "in_negozio" || p.stato === "pronta") && !p.avviso_pronto_il)) return false;
            if (!q) return true;
            const blob = [p.protocollo, p.negozio, p.imei, JSON.stringify(p.cliente), (p.righe || []).map((r) => r.descrizione).join(" ")].join(" ").toLowerCase();
            return blob.indexOf(q) >= 0;
        });
    }, [pratiche, cerca, filtro, vista]);

    const conta = useMemo(() => {
        const m: Record<string, number> = {};
        (pratiche ?? []).forEach((p) => { m[p.stato] = (m[p.stato] || 0) + 1; });
        return m;
    }, [pratiche]);

    /* ⚠️ QUESTO EFFETTO STA PRIMA DEI RETURN, e non è pignoleria: messo dopo
       il `if (nuova)`, il numero di hook cambiava fra un render e l'altro e
       React buttava giù la schermata («Rendered fewer hooks than expected»)
       appena si premeva «Nuova richiesta». */
    useEffect(() => {
        if (giaAperta.current || !pratiche || !pratiche.length) return;
        const proto = (parametri.get("p") || "").trim().toUpperCase();
        if (!proto) return;
        const trovata = pratiche.find((p) => (p.protocollo || "").toUpperCase() === proto);
        giaAperta.current = true;
        if (trovata) setApri(trovata.id);
        // l'elenco è filtrato per negozio: se la pratica è di un altro punto
        // vendita, il link atterrava qui senza aprire niente e senza dire perché
        else avvisa(`${proto} non è fra le pratiche che vedi: forse è di un altro punto vendita.`);
    }, [pratiche, parametri]);

    if (nuova) {
        return <Wizard sezione={sezione} negozio={negozio} operatore={operatore} negozi={tuttiNegozi}
            onAnnulla={() => setNuova(false)}
            onFatto={async (t) => { setNuova(false); await carica(); avvisa(t); }} />;
    }
    const aperta = apri ? (pratiche || []).find((p) => p.id === apri) : null;
    if (aperta) {
        return <Dettaglio pratica={aperta} ruolo={ruolo} eAdmin={eAdmin} operatore={operatore}
            onChiudi={() => setApri(null)}
            onFatto={async (t) => { await carica(); avvisa(t); }} />;
    }

    const tinta = sezione === "ordini" ? "rvT-indaco" : "rvT-ciano";
    const nMie = (pratiche ?? []).filter((p) => p.stato !== "consegnato" && p.stato !== "consegnata" && p.stato !== "annullato" && p.stato !== "non_riuscita").length;
    const nTarde = (pratiche ?? []).filter((p) => giorniLavorativi(p.created_at, oggiIso()) > TERMINE_MAX_GG && p.stato !== "consegnato" && p.stato !== "consegnata").length;
    const nDaOrdinare = (pratiche ?? []).filter((p) => p.approvvigionamento === "da_ordinare" || p.approvvigionamento === "altro_negozio").length;
    const nDaAvvisare = (pratiche ?? []).filter((p) => (p.stato === "in_negozio" || p.stato === "pronta") && !p.avviso_pronto_il).length;

    return (
        <div className={cn("max-w-[1500px]", tinta)}>
            {msg && <div className="rvSub mb-3" style={{ borderColor: "rgba(52,211,153,.38)" }}><span className="text-[12.5px] text-emerald-200">{msg}</span></div>}

            {/* I NUMERI CHE FANNO AGIRE, non quelli che riempiono: quante ne
                hai aperte, quante hanno sforato, quante aspettano un acquisto,
                a quanti clienti devi dire che è pronto. Premi e filtri. */}
            <div className="rvRapidoG rvRapidoG-kpi mb-4">
                {([
                    { id: "" as const, ico: "📋", et: "Tutte", n: (pratiche ?? []).length, sotto: `${nMie} ancora aperte`, tinta: "" },
                    { id: "tarde" as const, ico: "⏱", et: "Fuori tempo", n: nTarde, sotto: `oltre ${TERMINE_MAX_GG} gg lavorativi`, tinta: "rvT-rosso" },
                    { id: "ordinare" as const, ico: "📙", et: "Da comprare", n: nDaOrdinare, sotto: "aspettano l'acquisto", tinta: "rvT-ambra" },
                    { id: "avvisare" as const, ico: "🔔", et: "Da avvisare", n: nDaAvvisare, sotto: "pronte, non avvisate", tinta: "rvT-verde" },
                ]).map((k) => {
                    const on = vista === k.id;
                    return (
                        <button key={k.et} type="button" onClick={() => { setVista(on ? "" : k.id); setFiltro(""); }}
                            title={k.id === "" ? "Tutte le pratiche" : `Vedi solo: ${k.et.toLowerCase()}`}
                            className={cn("rvRapido", k.tinta, on && "rvRapido-on", !on && !k.n && "rvRapido-off")}>
                            <em className={String(k.n).length > 3 ? "rvNum-m" : undefined}>{k.n}</em>
                            <b>{k.ico} {k.et}{on ? " ✓" : ""}</b>
                            <small>{k.sotto}</small>
                        </button>
                    );
                })}
            </div>

            <div className="rvTesta">
                <button type="button" onClick={() => setNuova(true)} className="rvAzione" style={{ order: 2 }}>
                    ＋ Nuova {sezione === "ordini" ? "richiesta" : "assistenza"}
                </button>
                <span className="rvCerca" style={{ flex: "1 1 320px" }}>
                    <Search size={16} />
                    <input value={cerca} onChange={(e) => setCerca(e.target.value)} className="rvIn"
                        placeholder="Protocollo, cliente, IMEI, articolo…" />
                </span>
                <div className="rvPillRow">
                    {/* le pastiglie a ZERO restano a schermo, spente: zero è
                        un'informazione, e una fila che cambia forma ogni giorno
                        costringe a rileggerla ogni volta (regola del Magazzino) */}
                    {flussoDi(sezione).concat(sezione === "ordini" ? ["annullato"] : ["non_riuscita"]).map((k) => (
                        <button key={k} type="button" disabled={!conta[k]} onClick={() => { setFiltro(filtro === k ? "" : k); setVista(""); }}
                            className={cn("rvPill rvPill-sm", filtro === k && "rvPill-on")}>
                            {STATI[k].icona} {STATI[k].label} <b className="rvPillN">{conta[k] || 0}</b>
                        </button>
                    ))}
                </div>
            </div>

            {pratiche === null ? (
                <div className="rvCarico"><Loader2 className="w-5 h-5 animate-spin" /> Carico le pratiche…</div>
            ) : viste.length === 0 ? (
                <div className="rvTabBox"><div className="rvVuoto">
                    <span style={{ fontSize: 34 }}>{sezione === "ordini" ? "📦" : "🔧"}</span>
                    <b>{(pratiche ?? []).length === 0 ? "Nessuna pratica, ancora" : "Nessuna pratica con questi filtri"}</b>
                    <small>{(pratiche ?? []).length === 0 ? "Il tasto «Nuova» qui sopra apre la prima." : "Togli un filtro per vederne di più."}</small>
                </div></div>
            ) : (
                <div className="rvTabBox">
                    <table className="rvTab">
                        <thead>
                            <tr>
                                <th>Protocollo</th>
                                <th>Cliente</th>
                                <th>Tipo</th>
                                <th>Negozio</th>
                                <th className="rvTab-c">Valore</th>
                                <th className="rvTab-c">Stato</th>
                                <th className="rvTab-c">Aperta da</th>
                            </tr>
                        </thead>
                        <tbody>
                            {viste.map((p) => {
                                const tp = TIPOLOGIE[p.tipologia];
                                const stt = STATI[p.stato] || { label: p.stato, icona: "•", classe: "", chi: null };
                                const gg = giorniLavorativi(p.created_at, oggiIso());
                                const viva = p.stato !== "consegnato" && p.stato !== "consegnata" && p.stato !== "annullato" && p.stato !== "non_riuscita";
                                const tardi = viva && gg > TERMINE_MAX_GG;
                                const quasi = viva && !tardi && gg > TERMINE_MAX_GG - 7;
                                return (
                                    <tr key={p.id} onClick={() => setApri(p.id)} className="rvTab-riga rvTab-cl">
                                        <td className="rvTab-cod">{p.protocollo}</td>
                                        <td className="rvTab-nome">
                                            {String((p.cliente as { etichetta?: string }).etichetta || "—")}
                                            {p.acconto ? <span className="rvBadge rvBadge-ok ml-2 align-middle">acconto</span> : null}
                                            {p.buono ? <span className="rvBadge rvBadge-acc ml-2 align-middle">buono</span> : null}
                                        </td>
                                        <td className="rvTab-min">{tp ? tp.icona + " " + tp.label : p.tipologia}</td>
                                        <td className="rvTab-min">{p.negozio}</td>
                                        <td className="rvTab-n">{eur(Number(p.valore))}</td>
                                        <td className="rvTab-c">
                                            <span className={cn("rvBadge", p.stato === "annullato" || p.stato === "non_riuscita" ? "rvBadge-ko"
                                                : p.stato === "consegnato" || p.stato === "consegnata" ? "rvBadge-ok" : "rvBadge-acc")}>
                                                {stt.icona} {stt.label}
                                            </span>
                                        </td>
                                        <td className="rvTab-c">
                                            <span className={cn("rvTab-min", tardi && "text-rose-300 font-bold", quasi && "text-amber-300")}>
                                                {viva ? gg + " gg" : dataIt(p.created_at)}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

/* ── IL WIZARD ──────────────────────────────────────────────────────────
   Cliente → Tipo → Contenuto → Acconto → Firma → In coda.
   Ogni passo si apre solo quando il precedente è a posto, e il motivo è
   sempre scritto: un tasto spento senza spiegazione è un tasto rotto. */
function Wizard({ sezione, negozio, operatore, negozi, onAnnulla, onFatto }: {
    sezione: Sezione; negozio: string; operatore: string; negozi: string[];
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
    const [attesaDa, setAttesaDa] = useState("");
    const [noteInt, setNoteInt] = useState("");
    const [pctAcconto, setPctAcconto] = useState<number | null>(null);
    const [accLibero, setAccLibero] = useState("");
    const [firma, setFirma] = useState<Firma>({});
    /* ⚠️ IL PROTOCOLLO SI PRENDE PRIMA DELLA FIRMA. Nasceva al salvataggio, e
       così il foglio firmato al banco e l'oggetto della mail dicevano
       «(da assegnare)»: fra la carta e il database non restava nessun aggancio.
       Si prende entrando nel passo Firma, una volta sola, e da lì in poi è
       quello — sulla stampa, nella busta di DocuSeal e nel database. */
    const [protocollo, setProtocollo] = useState("");
    const protoPreso = useRef(false);
    useEffect(() => {
        if (step !== 4 || protoPreso.current) return;
        protoPreso.current = true;
        supabase.rpc("pratica_protocollo", { sez: sezione }).then(({ data, error }) => {
            if (error || !data) { protoPreso.current = false; return; }
            setProtocollo(String(data));
        });
    }, [step, sezione]);
    const [salvo, setSalvo] = useState(false);
    const [errore, setErrore] = useState<string | null>(null);
    const router = useRouter();

    const t = TIPOLOGIE[tipologia];
    const perArticoli = !!t && t.contenuto === "articoli";
    /* ⚠️ NON SI CHIEDE QUELLO CHE SI SA GIÀ (Luca 01/09: «se seleziono un
       articolo che non c'è, come fa a dirmi che il pezzo c'è già in
       magazzino?»). La giacenza del negozio è dentro le righe: se anche una
       sola non c'è, «il pezzo c'è già» è una risposta falsa e va spenta. */
    const inCasa = perArticoli && righe.length > 0 && righe.every((r) => r.da_magazzino && (r.giacenza || 0) >= r.qta);
    const mancanti = perArticoli ? righe.filter((r) => !r.da_magazzino || (r.giacenza || 0) < r.qta) : [];
    const bloccaDisponibile = perArticoli && righe.length > 0 && !inCasa;
    const motivoBlocco = mancanti.length === 0 ? "" :
        mancanti.length === 1
            ? `«${mancanti[0].descrizione}» non è in magazzino qui: va ordinato.`
            : `${mancanti.length} articoli non sono in magazzino qui: vanno ordinati.`;
    /* la risposta giusta si preseleziona da sola, e se cambi il carrello e
       quella scelta non regge più, si toglie invece di restare lì a mentire */
    useEffect(() => {
        if (!perArticoli || righe.length === 0) return;
        if (inCasa) { setApprovv((v) => (v ? v : "disponibile")); return; }
        setApprovv((v) => (v === "disponibile" ? "da_ordinare" : v));
    }, [perArticoli, righe.length, inCasa]);
    const totale = perArticoli ? totaleRighe(righe) : (Number(String(valore).replace(",", ".")) || 0);
    /* la voce che finirà sullo scontrino: la sceglie il contenuto della
       pratica, non l'operatore */
    const voceAcconto = sezione === "assistenze" ? "Acconto-Assistenza"
        : tipologia === "ord_telefono" ? "Acconto-Cliente" : "Acconto-Accessorio";
    const accLiberoN = Math.round((Number(String(accLibero).replace(",", ".")) || 0) * 100) / 100;
    const accImporto = pctAcconto === -1 ? accLiberoN : (pctAcconto ? Math.ceil(totale * pctAcconto * 100) / 100 : 0);

    const clienteOk = !!cliente && emailOk(String(cliente.email || ""));
    const serveImei = !!t && t.imei === "apertura";
    const contenutoOk = !t ? false : (perArticoli
        ? righe.length > 0
        : !!(dev.brand.trim() && dev.modello.trim() && totale > 0 && (!serveImei || imei.trim().length >= 6)))
        && (!t.approvvigionamento || (!!approvv && (approvv !== "altro_negozio" || !!attesaDa)))
        && (t.noteInterne !== "obbligatorie" || noteInt.trim().length > 0);
    const accontoOk = pctAcconto === null ? false
        : pctAcconto === 0 ? true
            : accImporto > 0 && accImporto <= totale;
    /* ⚠️ UNA FIRMA VALE PER QUELLO CHE È STATO FIRMATO. Si poteva firmare, poi
       tornare indietro, cambiare tipologia, carrello, importo o perfino
       cliente, e salvare: il modulo diceva «Riparazione» e il database
       «Backup». Adesso la firma si annulla quando cambia una cosa che sta
       scritta nel modulo — e lo si dice, invece di farlo di nascosto. */
    const [firmaScaduta, setFirmaScaduta] = useState(false);
    const impronta = JSON.stringify([
        cliente ? cliente.id : "", tipologia, totale,
        perArticoli ? righe.map((r) => [r.descrizione, r.qta, r.prezzo]) : [dev.brand, dev.modello, imei],
        accImporto,
    ]);
    const improntaFirmata = useRef<string | null>(null);
    useEffect(() => {
        if (!firmaCompleta(firma)) return;
        if (improntaFirmata.current === null) { improntaFirmata.current = impronta; return; }
        if (improntaFirmata.current !== impronta) {
            setFirma({});
            improntaFirmata.current = null;
            setFirmaScaduta(true);
        }
    }, [impronta, firma]);

    const firmaOk = firmaCompleta(firma);

    const PASSI = [
        { t: "Cliente", ico: cliente ? (cliente.tipo === "business" ? "🏢" : "👤") : "🧑‍💼", ok: clienteOk },
        { t: "Tipo", ico: t ? t.icona : "🏷️", ok: !!tipologia },
        { t: sezione === "ordini" ? "Articoli" : "Dispositivo", ico: sezione === "ordini" ? "🛒" : "📱", ok: contenutoOk },
        { t: "Acconto", ico: "💶", ok: accontoOk },
        { t: "Firma", ico: "✍️", ok: firmaOk },
        { t: "Riepilogo", ico: "📋", ok: false },
    ];
    const railPct = Math.min(100, (PASSI.filter((p) => p.ok).length / (PASSI.length - 1)) * 100);

    const salva = async () => {
        if (!cliente || !t) return;
        setSalvo(true); setErrore(null);
        let creata: { id: string; protocollo: string } | null = null;
        try {
            let proto = protocollo;
            if (!proto) {
                const { data, error: ep } = await supabase.rpc("pratica_protocollo", { sez: sezione });
                if (ep) throw new Error(ep.message);
                proto = String(data);
            }
            const statoIniziale = sezione === "ordini" ? "inviato" : "aperta";
            const storia = [{ at: oggiIso(), chi: operatore, txt: sezione === "ordini" ? "Richiesta inviata all'amministrazione" : "Assistenza aperta al banco" }];
            if (accImporto > 0) storia.push({ at: oggiIso(), chi: operatore, txt: `Acconto di ${eur(accImporto)} da incassare in Registra Vendita` });
            storia.push({ at: oggiIso(), chi: operatore, txt: `Modulo firmato ${firma.via === "otp" ? "col codice" : "su carta"}, documento d'identità archiviato` });
            const payload = {
                protocollo: proto, sezione, tipologia,
                client_id: cliente.id,
                cliente: {
                    etichetta: etichettaCliente(cliente), email: cliente.email, cellulare: cliente.cellulare,
                    cf_piva: cliente.cf_piva, indirizzo: cliente.indirizzo, cap: cliente.cap, citta: cliente.citta,
                },
                negozio, operatore, stato: statoIniziale, valore: totale,
                approvvigionamento: t.approvvigionamento ? approvv : null,
                attesa_da: approvv === "altro_negozio" ? attesaDa : null,
                note_interne: noteInt.trim() || null,
                dispositivo: perArticoli ? null : dev,
                imei: imei.trim() || null,
                acconto: accImporto > 0 ? { importo: accImporto, pct: pctAcconto === -1 ? null : pctAcconto, voce: voceAcconto, stato: "da_incassare" } : null,
                firma, storia,
            };
            const { data: nuovaP, error } = await supabase.from("pratiche").insert(payload).select("id, protocollo").single();
            if (error) throw new Error(error.message);
            creata = nuovaP as { id: string; protocollo: string };

            /* ⚠️ I DOCUMENTI VANNO ANCHE NELLA SCHEDA DEL CLIENTE.
               Restavano solo dentro la pratica: aprendo il cliente, del
               contratto che aveva appena firmato non c'era traccia. Si fa qui
               — dove ci sono cliente, protocollo e percorsi tutti insieme — e
               non nella rotta della firma, che di una pratica salvata non sa
               niente e sparerebbe righe anche per i giri abbandonati. */
            try {
                const eti = sezione === "assistenze" ? "Assistenza" : "Ordine";
                /* una categoria sua, non il cassetto «Altro»: chi apre il
                   fascicolo di un cliente deve trovare «Assistenze» e «Ordini
                   cliente» accanto a «Dichiarazioni usato», non un mucchio */
                const cat = sezione === "assistenze" ? "assistenza" : "ordine";
                const righeDoc = [
                    firma.firmato && { p: firma.firmato.path, n: `Modulo firmato — ${eti} ${creata.protocollo}`, t: cat },
                    firma.modulo && { p: firma.modulo.path, n: `Modulo firmato — ${eti} ${creata.protocollo}`, t: cat },
                    firma.registro && { p: firma.registro.path, n: `Registro di firma — ${eti} ${creata.protocollo}`, t: cat },
                    firma.identita && { p: firma.identita.path, n: `Documento identità — ${eti} ${creata.protocollo}`, t: "documento" },
                ].filter(Boolean) as { p: string; n: string; t: string }[];
                if (righeDoc.length) await supabase.from("contract_attachments").upsert(righeDoc.map((r) => ({
                    contract_id: null, client_id: cliente.id,
                    file_url: `/api/file/pratiche-allegati/${r.p}`, file_name: r.n, file_type: r.t,
                })), { onConflict: "client_id,file_url" });
            } catch { /* la pratica è salva: i documenti restano comunque in archivio */ }

            if (perArticoli && righe.length) {
                const { error: er } = await supabase.from("pratiche_righe").insert(righe.map((r) => ({
                    pratica_id: creata!.id, tipo: "articolo", codice: r.codice || null,
                    descrizione: r.descrizione, qta: r.qta, prezzo: r.prezzo, note: r.note || null, da_magazzino: r.da_magazzino,
                })));
                /* ⚠️ ROLLBACK. Senza, restava in tabella una pratica col valore
                   pieno e zero righe: l'operatore vedeva un errore, ripremeva
                   «Invia» e nasceva un doppione con un secondo protocollo.
                   Meglio niente che una pratica a metà — il protocollo bruciato
                   è il prezzo, ed è il meno caro dei due. */
                if (er) {
                    try {
                        await supabase.from("contract_attachments").delete()
                            .eq("client_id", cliente.id)
                            .like("file_name", `%${creata.protocollo}`);
                    } catch { }
                    await supabase.from("pratiche").delete().eq("id", creata.id);
                    creata = null;
                    throw new Error("gli articoli non si sono salvati (" + er.message + "): non è stata creata nessuna pratica, riprova.");
                }
            }

            /* L'ACCONTO SI INCASSA IN REGISTRA VENDITA, non qui: la pratica
               passa la mano col suo importo già pronto per il carrello. */
            if (accImporto > 0) {
                mandaInCassa({
                    praticaId: creata.id, protocollo: creata.protocollo, sezione,
                    voce: voceAcconto, importo: accImporto,
                    clienteId: cliente.id, clienteEtichetta: etichettaCliente(cliente),
                    negozio, operatore,
                });
                await onFatto(`✅ ${creata.protocollo} aperta — vai in cassa a incassare ${eur(accImporto)}`);
                router.push("/registra-vendita");
                return;
            }
            await onFatto(`✅ ${creata.protocollo} aperta`);
        } catch (e) {
            setErrore(e instanceof Error ? e.message : "salvataggio non riuscito");
            setSalvo(false);
        }
    };

    return (
        <div className={cn("max-w-[1500px]", sezione === "ordini" ? "rvT-indaco" : "rvT-ciano")}>
            <div className="rvTesta">
                <div>
                    <h1 className="rvTit">{sezione === "ordini" ? "📦" : "🔧"} Nuova {sezione === "ordini" ? "richiesta" : "assistenza"}</h1>
                    <span className="rvDove">{negozio} · {operatore}</span>
                </div>
                <button onClick={onAnnulla} className="rvPill">
                    <ArrowLeft className="w-4 h-4 inline mr-1.5 -mt-0.5" /> Torna all&apos;elenco
                </button>
            </div>

            {/* La barra a nodi di Registra Vendita: stessa classe, stesso
                comportamento — il filo si riempie, il cerchio si chiude, e
                sotto c'è scritto a che punto sei invece di doverlo indovinare. */}
            <div className="rvsteps">
                <div className="rvsteps-rail"><i style={{ width: railPct + "%" }} /></div>
                {PASSI.map((p, i) => {
                    const attivo = step === i;
                    const fatto = p.ok;
                    const abil = i === 0 || PASSI.slice(0, i).every((x) => x.ok);
                    const ring = fatto ? "#22c55e" : "#6d5cff";
                    const sub = fatto ? "Completo" : attivo ? "Sei qui" : abil ? "Da fare" : "Bloccato";
                    return (
                        <button key={p.t} type="button" disabled={!abil}
                            className={cn("rvnode-step", attivo && "is-active", fatto && "is-done", !abil && "is-locked")}
                            onClick={() => { if (abil) setStep(i); }}
                            title={!abil ? "Completa prima i passi precedenti" : attivo ? "Sei qui" : "Vai a " + p.t}>
                            <span className="rvnode-ring" style={{ background: `conic-gradient(${ring} ${fatto ? 100 : attivo ? 45 : 0}%, var(--rv-track) 0)` }}>
                                <span className="rvnode"><span style={{ fontSize: 22 }}>{p.ico}</span></span>
                                {fatto && <span className="rvnode-check">✓</span>}
                            </span>
                            <span className="rvnode-lab">{p.t}</span>
                            <span className="rvnode-sub">{sub}</span>
                        </button>
                    );
                })}
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
                    {t.approvvigionamento && <PassoApprovvigionamento tipologia={tipologia} valore={approvv} onCambia={setApprovv}
                        ruolo="negozio" bloccaDisponibile={bloccaDisponibile} motivoBlocco={motivoBlocco} inCasa={inCasa}
                        attesaDa={attesaDa} onAttesaDa={setAttesaDa} negozi={negozi} mioNegozio={negozio} />}
                    <NoteInterneBox tipologia={tipologia} valore={noteInt} onCambia={setNoteInt} />
                </div>
            )}

            {step === 3 && <PassoAcconto totale={totale} pct={pctAcconto} onPct={setPctAcconto}
                libero={accLibero} onLibero={setAccLibero} importo={accImporto} />}

            {step === 4 && firmaScaduta && (
                <div className="rvSub" style={{ marginBottom: 12, borderColor: "rgba(245,158,11,.45)" }}>
                    <span className="text-[12px] text-amber-200 leading-relaxed">
                        ⚠️ <b>Hai cambiato qualcosa dopo la firma.</b> Il modulo che il cliente aveva firmato non dice più
                        quello che dice la pratica adesso, quindi la firma è stata annullata: va rifatta. È la ragione per cui
                        il modulo esiste — deve corrispondere.
                    </span>
                </div>
            )}
            {step === 4 && <PassoFirma cliente={cliente} firma={firma} onCambia={(f) => { setFirmaScaduta(false); setFirma(f); }} protocollo={protocollo || "nuova"}
                modulo={{
                    protocollo: protocollo || "(in assegnazione)", tipologia, negozio, operatore,
                    cliente: cliente ? {
                        etichetta: etichettaCliente(cliente), email: cliente.email || "", cellulare: cliente.cellulare || "",
                        cf_piva: cliente.cf_piva || "", indirizzo: cliente.indirizzo || "", cap: cliente.cap || "", citta: cliente.citta || "",
                    } : {},
                    valore: totale,
                    acconto: accImporto > 0 ? { importo: accImporto } : null,
                    righe: perArticoli ? righe.map((r) => ({ descrizione: r.descrizione, qta: r.qta, prezzo: r.prezzo, note: r.note })) : [],
                    dispositivo: perArticoli ? null : dev, imei,
                    tempoMedio: tempoMedio(tipologia, approvv),
                }} />}

            {step === 5 && (
                <Riepilogo protocollo={protocollo} sezione={sezione} tipologia={tipologia} cliente={cliente} righe={righe} dev={dev} imei={imei}
                    totale={totale} accImporto={accImporto} voceAcconto={voceAcconto}
                    approvv={approvv} noteInt={noteInt} firma={firma} negozio={negozio} operatore={operatore} />
            )}

            {errore && <div className="rvSub" style={{ marginTop: 12, borderColor: "rgba(239,68,68,.40)" }}>
                <span className="text-[12px] text-rose-200">⛔ {errore}</span>
            </div>}

            <div className="rvBarra" style={{ marginTop: 16, justifyContent: "space-between" }}>
                <button onClick={() => (step === 0 ? onAnnulla() : setStep(step - 1))} className="rvPill">
                    {step === 0 ? "Annulla" : "← Indietro"}
                </button>
                {step < 5 ? (
                    <button onClick={() => setStep(step + 1)} disabled={!PASSI[step].ok}
                        title={!PASSI[step].ok ? "Manca qualcosa in questo passo" : ""}
                        className={cn("rvPill", PASSI[step].ok && "rvPill-on")}>Avanti →</button>
                ) : (
                    <button onClick={salva} disabled={salvo || !clienteOk || !contenutoOk || !accontoOk || !firmaOk} className="rvAzione">
                        {salvo ? <Loader2 className="w-4 h-4 animate-spin inline mr-1.5 -mt-0.5" /> : null}
                        {accImporto > 0
                            ? `Salva e vai in cassa — ${eur(accImporto)}`
                            : sezione === "ordini" ? "Invia all'amministrazione" : "Apri l'assistenza"}
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
            <div className="rvBox" style={{ borderColor: "rgba(245,158,11,.45)" }}>
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
                    <button onClick={() => onScelto(null)} className="rvPill rvPill-sm">Cambia cliente</button>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                    <input value={emailNuova} onChange={(e) => setEmailNuova(e.target.value)} type="email"
                        placeholder="nome@dominio.it" className="rvIn" style={{ flex: "1 1 240px" }} />
                    <button onClick={onSalvaEmail} disabled={!emailOk(emailNuova) || salvo}
                        className="rvAzione">
                        {salvo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Salva sull&apos;anagrafica
                    </button>
                </div>
                {emailNuova.trim() && !emailOk(emailNuova) && <p className="text-[11px] text-rose-300">Questo non sembra un indirizzo email.</p>}
            </div>
        );
    }
    if (cliente) {
        return (
            <div className="rvBox" style={{ borderColor: "rgba(52,211,153,.42)" }}>
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-2xl">{cliente.tipo === "business" ? "🏢" : "👤"}</span>
                    <div className="flex-1 min-w-[220px]">
                        <p className="text-sm font-black text-white">{etichettaCliente(cliente)}</p>
                        <p className="text-[12px] text-slate-400 mt-0.5">
                            {[cliente.cf_piva, cliente.cellulare, cliente.email].filter(Boolean).join("  ·  ")}
                        </p>
                    </div>
                    <button onClick={() => onScelto(null)} className="rvPill rvPill-sm">Cambia</button>
                </div>
            </div>
        );
    }
    return (
        <div className="rvBox">
            <div className="rvBoxT">Cerca l&apos;anagrafica</div>
            <RicercaCliente onScelto={onScelto} className="w-full" />
            <p className="rvTab-min" style={{ marginTop: 8, lineHeight: 1.5 }}>
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
            <div className="rvBox">
                <div className="rvBoxT">Che tipo di intervento è?</div>
                <p className="rvSotto" style={{ margin: "-6px 0 12px" }}>
                    Da questa scelta dipende tutto il resto: quali campi compaiono, quali sono obbligatori e quando.
                </p>
                <div className="rvPillRow" style={{ gap: 10 }}>
                    {tipologieDi(sezione).map((k) => {
                        const x = TIPOLOGIE[k];
                        const on = tipologia === k;
                        return (
                            <button key={k} type="button" onClick={() => onCambia(k)}
                                className={cn("rvScelta", on && "rvScelta-on")} style={{ flex: "1 1 250px", textAlign: "left" }}>
                                <b>{x.icona} {x.label}</b>
                                <span className="rvTab-min" style={{ display: "block", marginTop: 4, lineHeight: 1.35 }}>{x.cosa}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
            {t && (
                <div className="rvTabBox" style={{ marginTop: 12 }}>
                    <div style={{ padding: "10px 14px", background: "var(--tf-w30)", borderBottom: "1px solid var(--tf-w60)" }}>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--tf-f8fafc)" }}>{t.icona} {t.label} — come funziona</span>
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
                        <div key={r.et} style={{ padding: "9px 14px", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "baseline",
                            borderBottom: i < arr.length - 1 ? "1px solid var(--tf-w60)" : "none" }}>
                            <span style={{ width: 180, flexShrink: 0, fontSize: 10, fontWeight: 800, letterSpacing: ".7px", textTransform: "uppercase", color: "var(--tf-8892b0)" }}>{r.et}</span>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--tf-f8fafc)" }}>{r.v}</span>
                            <span className="rvTab-min" style={{ flex: "1 1 200px", lineHeight: 1.4 }}>{r.n}</span>
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
    const [errCerca, setErrCerca] = useState<string | null>(null);
    const [aMano, setAMano] = useState(false);
    const [libero, setLibero] = useState({ descrizione: "", prezzo: "", qta: "1", note: "" });
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        const v = q.trim();
        if (v.length < 2) { setHits([]); return; }
        timer.current = setTimeout(async () => {
            setCerco(true);
            /* ⚠️ LA VIRGOLA SPACCAVA LA RICERCA. Il filtro `.or()` di PostgREST
               separa le condizioni con la virgola: cercando «cover, nera» il
               server rispondeva 400, l'errore veniva buttato via e a schermo
               compariva «in magazzino non c'è» — così si ordinava una cosa che
               stava a scaffale. Le virgole e le parentesi si tolgono dalla
               chiave, e l'errore adesso si vede. */
            const chiave = v.replace(/[(),*]/g, " ").replace(/\s+/g, " ").trim();
            if (!chiave) { setHits([]); setCerco(false); return; }
            const { data, error } = await supabase.from("mag_articoli")
                .select("codice, descrizione, prezzo, marca")
                .eq("attivo", true)
                .or(`descrizione.ilike.%${chiave}%,codice.ilike.%${chiave}%,marca.ilike.%${chiave}%`)
                .order("descrizione")
                .limit(8);
            if (error) { setErrCerca(error.message); setHits([]); setCerco(false); return; }
            setErrCerca(null);
            const arts = (data ?? []) as { codice: string; descrizione: string; prezzo: number; marca: string | null }[];
            /* ⚠️ LA GIACENZA VA SOMMATA, E IL GEMELLO CONTA.
               Due difetti che si sommavano: la chiave di `mag_giacenze` è
               (codice, negozio, AZIENDA), quindi lo stesso articolo nello
               stesso negozio può avere due righe (T1 e T2) e assegnare invece
               di sommare ne perdeva una; e sei negozi su sedici — Acilia,
               Collatina, Magliana — condividono un magazzino solo, quindi il
               pezzo dell'altra insegna, a tre metri, risultava «da ordinare».
               Il resto del CRM lo sa già: `stessoMagazzino` è la stessa regola
               usata dallo scarico. */
            const gia: Record<string, number> = {};
            if (arts.length) {
                const { data: g } = await supabase.from("mag_giacenze").select("codice, quantita, negozio")
                    .in("codice", arts.map((a) => a.codice));
                ((g ?? []) as { codice: string; quantita: number; negozio: string }[]).forEach((x) => {
                    if (!stessoMagazzino(x.negozio, negozio)) return;
                    gia[x.codice] = (gia[x.codice] || 0) + (Number(x.quantita) || 0);
                });
            }
            setHits(arts.map((a) => ({ ...a, giacenza: gia[a.codice] || 0 })));
            setCerco(false);
        }, 300);
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [q, negozio]);

    /* IL PREZZO SI SCRIVE, NON SI CONVERTE A OGNI TASTO (revisore 01/09).
       Il campo mostrava il NUMERO e convertiva a ogni battuta: digitando
       «12,50», appena si arriva alla virgola `Number("12.")` fa 12, la virgola
       sparisce dal campo, e il «5» che segue costruisce 125. Un ordine da
       12,50 € diventava da 125,00 €, sull'acconto e sul modulo che il cliente
       firma. Qui il testo resta com'è scritto finché non si esce dal campo. */
    const [prezzoTxt, setPrezzoTxt] = useState<Record<number, string>>({});
    const aggiungi = (r: Riga) => { onCambia(righe.concat([r])); setQ(""); setHits([]); };
    const cambia = (i: number, patch: Partial<Riga>) => { const c = righe.slice(); c[i] = { ...c[i], ...patch }; onCambia(c); };
    const liberoOk = libero.descrizione.trim().length > 1 && Number(String(libero.prezzo).replace(",", ".")) > 0;

    return (
        <div className="space-y-4">
            <div className="rvBox">
                <div className="rvBoxT">Cerca l&apos;articolo in magazzino</div>
                <span className="rvCerca">
                    <Search size={16} />
                    <input value={q} onChange={(e) => setQ(e.target.value)}
                        placeholder="Nome, codice o marca — «cover», «power bank», «AURICOLARI»…"
                        className="rvIn" style={{ paddingLeft: 36 }} />
                    {cerco && <Loader2 className="w-4 h-4 animate-spin" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--tf-8892b0)" }} />}
                </span>

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
                {errCerca && (
                    <div className="rvSub" style={{ marginTop: 10, borderColor: "rgba(239,68,68,.40)" }}>
                        <span className="text-[11.5px] text-rose-200">⛔ La ricerca non ha funzionato: {errCerca}. Riprova, o scrivi l&apos;articolo a mano qui sotto.</span>
                    </div>
                )}
                {!errCerca && q.trim().length >= 2 && !cerco && hits.length === 0 && (
                    <p className="text-[12px] text-amber-300">In magazzino non c&apos;è: scrivilo a mano qui sotto, com&apos;è che lo chiede il cliente.</p>
                )}

                <div className="border-t border-white/10 pt-3">
                    {!aMano ? (
                        <button onClick={() => setAMano(true)} className="rvPill">
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
                                    className="rvIn" style={{ flex: "1 1 240px" }} />
                                <input value={libero.prezzo} onChange={(e) => setLibero({ ...libero, prezzo: e.target.value })}
                                    inputMode="decimal" placeholder="Prezzo €" className="rvIn" style={{ width: 112 }} />
                                <input value={libero.qta} onChange={(e) => setLibero({ ...libero, qta: e.target.value })}
                                    inputMode="numeric" placeholder="Q.tà" className="rvIn" style={{ width: 82 }} />
                                <button onClick={() => {
                                    aggiungi({
                                        codice: "", descrizione: libero.descrizione.trim(),
                                        qta: Math.max(1, Number(libero.qta) || 1),
                                        prezzo: Number(String(libero.prezzo).replace(",", ".")) || 0,
                                        note: libero.note.trim(), da_magazzino: false,
                                    });
                                    setLibero({ descrizione: "", prezzo: "", qta: "1", note: "" }); setAMano(false);
                                }} disabled={!liberoOk}
                                    className="rvPill rvPill-on">Aggiungi</button>
                                <button onClick={() => setAMano(false)} className="rvPill rvPill-sm">Annulla</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {righe.length > 0 && (
                <div className="rvTabBox">
                    <div style={{ padding: "10px 14px", background: "var(--tf-w30)", borderBottom: "1px solid var(--tf-w60)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--tf-f8fafc)" }}>🛒 Articoli ({righe.length})</span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--rv-acc)" }}>{eur(totaleRighe(righe))}</span>
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
                                inputMode="numeric" className="rvIn" style={{ width: 70, padding: "7px 9px", fontSize: 12.5 }} />
                            <input value={prezzoTxt[i] ?? String(r.prezzo ?? "")}
                                onChange={(e) => {
                                    const t = e.target.value;
                                    setPrezzoTxt((p) => ({ ...p, [i]: t }));
                                    cambia(i, { prezzo: Number(t.replace(",", ".")) || 0 });
                                }}
                                onBlur={() => setPrezzoTxt((p) => { const n = { ...p }; delete n[i]; return n; })}
                                inputMode="decimal" className="rvIn" style={{ width: 104, padding: "7px 9px", fontSize: 12.5 }} />
                            <input value={r.note} onChange={(e) => cambia(i, { note: e.target.value })}
                                placeholder="colore, taglia…" className="rvIn" style={{ flex: "1 1 120px", padding: "7px 9px", fontSize: 12.5 }} />
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

/* ── ③b DISPOSITIVO ─────────────────────────────────────────────────────
   Marca e modello dalla STESSA anagrafica degli Usati (Luca 01/09: «il menù
   totale che usiamo anche per gli usati, che ha tutto dentro»): un elenco
   scritto a mano qui sarebbe la terza lista di telefoni del CRM, e la terza
   lista è quella che nessuno aggiorna. Si può comunque scrivere un modello che
   non c'è — la tendina accetta il testo libero. */
const CATEGORIE_DEV: { k: CategoriaDispositivo; l: string; i: string }[] = [
    { k: "smartphone", l: "Smartphone", i: "📱" },
    { k: "tablet", l: "Tablet", i: "📲" },
    { k: "watch", l: "Smartwatch", i: "⌚" },
    { k: "computer", l: "Computer", i: "💻" },
];

function PassoDispositivo({ dev, onCambia, imei, onImei, serveImei, valore, onValore, etichettaValore, nota }: {
    dev: Record<string, string>; onCambia: (d: Record<string, string>) => void;
    imei: string; onImei: (v: string) => void; serveImei: boolean;
    valore: string; onValore: (v: string) => void; etichettaValore: string; nota: string;
}) {
    const set = (k: string, v: string) => onCambia({ ...dev, [k]: v });
    const cat = (dev.categoria || "smartphone") as CategoriaDispositivo;
    const [brands, setBrands] = useState<string[]>([...BRAND_COMUNI]);
    const [modelli, setModelli] = useState<string[]>([]);
    useEffect(() => {
        let vivo = true;
        brandsDispositivi(cat, [...BRAND_COMUNI]).then((b) => { if (vivo) setBrands(b.length ? b : [...BRAND_COMUNI]); });
        return () => { vivo = false; };
    }, [cat]);
    useEffect(() => {
        let vivo = true;
        if (!dev.brand) { setModelli([]); return; }
        modelliDispositivi(cat, dev.brand, []).then((m) => { if (vivo) setModelli(m); });
        return () => { vivo = false; };
    }, [cat, dev.brand]);
    const imeiCorto = serveImei && imei.trim().length < 6;

    return (
        <div className="space-y-3">
            <div className="rvBox">
                <div className="rvBoxT">Il dispositivo</div>
                <div className="rvPillRow" style={{ marginBottom: 12 }}>
                    {CATEGORIE_DEV.map((c) => (
                        <button key={c.k} type="button"
                            onClick={() => onCambia({ ...dev, categoria: c.k, brand: "", modello: "" })}
                            className={cn("rvPill rvPill-sm", cat === c.k && "rvPill-on")}>{c.i} {c.l}</button>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 200px" }}>
                        <div className="rvBoxT" style={{ marginBottom: 5 }}>Marca *</div>
                        <SelectOpzioni value={dev.brand || ""} onChange={(v: string) => onCambia({ ...dev, brand: v, modello: "" })}
                            opzioni={brands} placeholder="Scrivi o scegli la marca…" className="rvIn" />
                    </div>
                    <div style={{ flex: "1 1 240px" }}>
                        <div className="rvBoxT" style={{ marginBottom: 5 }}>Modello *</div>
                        <SelectOpzioni value={dev.modello || ""} onChange={(v: string) => set("modello", v)}
                            opzioni={modelli} placeholder={dev.brand ? "Scrivi o scegli il modello…" : "Prima la marca"} className="rvIn" />
                    </div>
                    <div style={{ flex: "0 1 150px" }}>
                        <div className="rvBoxT" style={{ marginBottom: 5 }}>Colore</div>
                        <input value={dev.colore || ""} onChange={(e) => set("colore", e.target.value)} className="rvIn" placeholder="nero, blu…" />
                    </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                    <div style={{ flex: "1 1 220px" }}>
                        <div className="rvBoxT" style={{ marginBottom: 5 }}>IMEI {serveImei ? "*" : ""}</div>
                        <input value={imei} onChange={(e) => onImei(e.target.value)}
                            className={cn("rvIn", imeiCorto && "rvIn-mod")} style={{ fontFamily: "ui-monospace,monospace" }}
                            placeholder="*#06# sul telefono, o dalla scatola" />
                    </div>
                    <div style={{ flex: "1 1 200px" }}>
                        <div className="rvBoxT" style={{ marginBottom: 5 }}>PIN o sequenza di sblocco</div>
                        <input value={dev.pin || ""} onChange={(e) => set("pin", e.target.value)} className="rvIn" placeholder="senza, il collaudo non si fa" />
                    </div>
                </div>
                {imeiCorto && (
                    <div className="rvSub" style={{ marginTop: 10, borderColor: "rgba(245,158,11,.38)" }}>
                        <span className="text-[11.5px] text-amber-200 leading-relaxed">
                            ⚠️ <b>L&apos;IMEI è obbligatorio.</b> Il dispositivo resta in negozio: senza, non si può dire di quale
                            apparecchio si parla, e i termini dei {GIORNI_RITIRO} e dei {GIORNI_CESSIONE} giorni non reggono.
                        </span>
                    </div>
                )}
                <div style={{ marginTop: 12 }}>
                    <div className="rvBoxT" style={{ marginBottom: 5 }}>Condizioni estetiche all&apos;accettazione</div>
                    <textarea value={dev.condizioni || ""} onChange={(e) => set("condizioni", e.target.value)} rows={2}
                        className="rvIn" placeholder="graffi, vetro crepato, ammaccature… — è quello che ci difende alla riconsegna" />
                </div>
                <div style={{ marginTop: 10 }}>
                    <div className="rvBoxT" style={{ marginBottom: 5 }}>Il difetto, come lo racconta il cliente</div>
                    <textarea value={dev.difetto || ""} onChange={(e) => set("difetto", e.target.value)} rows={2}
                        className="rvIn" placeholder="«è caduto e non si accende più»" />
                </div>
            </div>

            <div className="rvBox">
                <div className="rvBoxT">{etichettaValore} *</div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <input value={valore} onChange={(e) => onValore(e.target.value)} inputMode="decimal" placeholder="0,00"
                        className="rvIn" style={{ maxWidth: 170, fontSize: 21, fontWeight: 800 }} />
                    <span className="rvTab-min" style={{ flex: "1 1 220px", lineHeight: 1.45 }}>{nota}</span>
                </div>
            </div>
        </div>
    );
}

/* ── DA DOVE ARRIVA IL PEZZO ────────────────────────────────────────────
   «Il pezzo c'è già» sta per primo: è il caso migliore e non fa aspettare
   nessuno. «Ordinato» è spento per il negozio — lo mette l'amministrazione,
   perché è l'unico dei quattro che dice che i soldi sono usciti. */
function PassoApprovvigionamento({ tipologia, valore, onCambia, ruolo, bloccaDisponibile, motivoBlocco, inCasa, attesaDa, onAttesaDa, negozi, mioNegozio }: {
    tipologia: string; valore: string; onCambia: (v: string) => void; ruolo: string;
    bloccaDisponibile?: boolean; motivoBlocco?: string; inCasa?: boolean;
    attesaDa: string; onAttesaDa: (v: string) => void; negozi: string[]; mioNegozio: string;
}) {
    const t = TIPOLOGIE[tipologia];
    if (!t || !t.approvvigionamento) return null;
    return (
        <div className="rvBox">
            <div className="rvBoxT">Da dove arriva *</div>
            <div className="rvPillRow" style={{ gap: 10 }}>
                {/* ⚠️ «ORDINATO» NON SI SCEGLIE QUI (Luca 01/09): non è una
                    risposta alla domanda «da dove arriva», è quello che diventa
                    «da ordinare» quando l'amministrazione compra davvero il
                    pezzo. Si mette dal dettaglio della pratica, da chi ordina. */}
                {APPROVVIGIONAMENTO.filter((a) => a.chi !== "admin").map((a) => {
                    const on = valore === a.k;
                    /* «Il pezzo c'è già» si spegne da solo quando il magazzino
                       dice il contrario: chiedere una cosa che sappiamo già è
                       il modo migliore per farsi rispondere una bugia. */
                    const spento = a.k === "disponibile" && !!bloccaDisponibile;
                    return (
                        <button key={a.k} type="button" disabled={spento} onClick={() => onCambia(a.k)}
                            title={spento && a.k === "disponibile" ? motivoBlocco : undefined}
                            className={cn("rvScelta", on && "rvScelta-on")}
                            style={{ flex: "1 1 200px", textAlign: "left", opacity: spento ? .38 : 1, cursor: spento ? "not-allowed" : "pointer" }}>
                            <b>{a.icona} {a.label}</b>
                            <span className="rvTab-min" style={{ display: "block", marginTop: 3, lineHeight: 1.35 }}>{a.nota}</span>
                        </button>
                    );
                })}
            </div>
            {/* QUALE negozio ce l'ha (Luca 01/09). «Lo sposta un altro» non dice
                niente a chi deve andarlo a prendere: senza il nome, la riga
                resta ferma finché qualcuno non telefona in giro. */}
            {valore === "altro_negozio" && (
                <div style={{ marginTop: 12 }}>
                    <div className="rvBoxT" style={{ marginBottom: 5 }}>Quale punto vendita ce l&apos;ha? *</div>
                    <div className="rvPillRow">
                        {negozi.filter((n) => n !== mioNegozio).map((n) => (
                            <button key={n} type="button" onClick={() => onAttesaDa(n)}
                                className={cn("rvPill rvPill-sm", attesaDa === n && "rvPill-on")}>{n}</button>
                        ))}
                    </div>
                    {!attesaDa && <p className="rvTab-min" style={{ marginTop: 7 }}>Scegli il negozio: è quello a cui verrà chiesto il trasferimento.</p>}
                </div>
            )}
            {bloccaDisponibile && (
                <div className="rvSub" style={{ marginTop: 10, borderColor: "rgba(245,158,11,.38)" }}>
                    <span className="text-[11.5px] text-amber-200 leading-relaxed">
                        📙 {motivoBlocco} «Il pezzo c&apos;è già» è spento: il magazzino di questo negozio dice di no.
                    </span>
                </div>
            )}
            {inCasa && siFaSubito(valore) && (
                <div className="rvSub" style={{ marginTop: 10, borderColor: "rgba(52,211,153,.38)" }}>
                    <span className="text-[11.5px] text-emerald-200 leading-relaxed">
                        ✅ <b>Non c&apos;è niente da aspettare.</b> È tutto in magazzino qui: la pratica non passa
                        dall&apos;amministrazione per l&apos;acquisto e la lavorazione parte subito.
                    </span>
                </div>
            )}
        </div>
    );
}

/* ── LE NOTE CHE IL CLIENTE NON LEGGE MAI ───────────────────────────────── */
function NoteInterneBox({ tipologia, valore, onCambia }: { tipologia: string; valore: string; onCambia: (v: string) => void }) {
    const t = TIPOLOGIE[tipologia];
    const obbl = !!t && t.noteInterne === "obbligatorie";
    return (
        <div className="rvBox" style={obbl && !valore.trim() ? { borderColor: "rgba(245,158,11,.45)" } : undefined}>
            <div className="rvBoxT">Note interne {obbl ? "— obbligatorie *" : ""}</div>
            <textarea value={valore} onChange={(e) => onCambia(e.target.value)} rows={3}
                placeholder={obbl
                    ? "Che cosa ha chiesto il cliente e che cosa gli hai promesso. Scrivilo come lo diresti a voce."
                    : "Urgenze, accordi presi a voce, cose che l'amministrazione deve sapere…"}
                className="rvIn" />
            <p className="rvTab-min" style={{ marginTop: 8, lineHeight: 1.5 }}>
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
function PassoAcconto({ totale, pct, onPct, libero, onLibero, importo }: {
    totale: number; pct: number | null; onPct: (v: number | null) => void;
    libero: string; onLibero: (v: string) => void; importo: number;
}) {
    const SCELTE = [
        { p: 0, l: "Nessun acconto", e: "", n: "niente cassa adesso: esce il riepilogo e si va avanti" },
        { p: 0.2, l: "20%", e: eur(Math.ceil(totale * 0.2 * 100) / 100), n: "il minimo che possiamo accettare" },
        { p: 0.5, l: "50%", e: eur(Math.ceil(totale * 0.5 * 100) / 100), n: "metà adesso, metà al ritiro" },
        { p: 1, l: "100%", e: eur(totale), n: "il cliente paga tutto subito" },
    ];
    const troppo = pct === -1 && importo > totale;
    return (
        <div className="space-y-3">
            <div className="rvBox">
                <div className="rvBoxT">💶 Il cliente lascia un acconto?</div>
                <p className="rvSotto" style={{ margin: "-6px 0 12px" }}>
                    Valore della pratica <b style={{ color: "var(--tf-f8fafc)" }}>{eur(totale)}</b>. Se lascia un acconto si incassa
                    in cassa e da lì esce lo scontrino; se non lo lascia, si stampa il riepilogo e la pratica parte lo stesso.
                </p>
                <div className="rvPillRow" style={{ gap: 10 }}>
                    {SCELTE.map((s) => (
                        <button key={s.l} type="button" onClick={() => onPct(s.p)} disabled={totale <= 0 && s.p > 0}
                            className={cn("rvScelta", pct === s.p && "rvScelta-on")} style={{ flex: "1 1 150px" }}>
                            <b>{s.l}</b>
                            {s.e && <em style={{ fontSize: 17, marginTop: 2, color: "var(--tf-f8fafc)" }}>{s.e}</em>}
                            <span className="rvTab-min" style={{ display: "block", marginTop: 3, lineHeight: 1.3 }}>{s.n}</span>
                        </button>
                    ))}
                    {/* L'IMPORTO SCRITTO A MANO (Luca 01/09). Le percentuali
                        coprono i casi normali; il cliente che lascia «cinquanta
                        euro tondi» è il caso vero, e senza questo campo
                        l'operatore avrebbe scelto la percentuale più vicina
                        scrivendo un numero falso sulla pratica. */}
                    <button type="button" onClick={() => onPct(-1)} disabled={totale <= 0}
                        className={cn("rvScelta", pct === -1 && "rvScelta-on")} style={{ flex: "1 1 170px" }}>
                        <b>✍️ Altro importo</b>
                        <span className="rvTab-min" style={{ display: "block", marginTop: 3, lineHeight: 1.3 }}>lo dice lui, lo scrivi tu</span>
                    </button>
                </div>
                {pct === -1 && (
                    <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <input value={libero} onChange={(e) => onLibero(e.target.value)} inputMode="decimal"
                            placeholder="0,00" className="rvIn" style={{ maxWidth: 170, fontSize: 20, fontWeight: 800 }} />
                        <span className="rvTab-min">euro · saldo alla consegna {eur(Math.max(0, Math.round((totale - importo) * 100) / 100))}</span>
                        {troppo && <span className="rvBadge rvBadge-ko">non può superare {eur(totale)}</span>}
                    </div>
                )}
            </div>

            {pct !== null && pct !== 0 && (
                <div className="rvSub" style={{ borderColor: "rgba(129,140,248,.42)" }}>
                    <span className="text-[12px] text-indigo-200 leading-relaxed">
                        🛒 <b>L&apos;acconto si incassa in Registra Vendita.</b> Appena il cliente ha firmato, la pratica si
                        salva e ti porta in cassa con <b>{eur(importo)}</b> già nel carrello: lì puoi aggiungere quello che
                        compra oggi — una SIM, una ricarica, un&apos;assicurazione — e si fa <b>un pagamento solo</b>, con un
                        documento commerciale solo. Alla consegna se ne emette un secondo sul solo saldo, che richiama questo.
                    </span>
                </div>
            )}
            {pct === 0 && (
                <div className="rvSub" style={{ borderColor: "rgba(14,165,233,.35)" }}>
                    <span className="text-[12px] text-sky-200 leading-relaxed">
                        📄 Senza acconto non si emette niente di fiscale: il cliente si porta a casa il riepilogo della pratica,
                        e paga tutto alla consegna.
                    </span>
                </div>
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
function PassoFirma({ cliente, firma, onCambia, protocollo, modulo }: {
    cliente: ClienteTrovato | null; firma: Firma;
    onCambia: (f: Firma | ((prec: Firma) => Firma)) => void;
    protocollo: string; modulo: DatiModulo;
}) {
    const [su, setSu] = useState<"modulo" | "identita" | null>(null);
    const [chiediCarta, setChiediCarta] = useState(false);
    const [canale, setCanale] = useState<Canale>("email");
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

    const [manda, setManda] = useState(false);
    const [errFirma, setErrFirma] = useState<string | null>(null);
    const polling = useRef<ReturnType<typeof setInterval> | null>(null);

    /* La richiesta parte dal SERVER: la chiave DocuSeal non passa mai dal
       browser. Il codice arriva sull'email dell'anagrafica — il firmatario è
       il cliente, non un indirizzo scelto qui. */
    const mandaOtp = async () => {
        setManda(true); setErrFirma(null);
        try {
            const r = await fetch("/api/pratiche/firma", {
                method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ azione: "manda", dati: modulo, canale, clienteId: cliente ? cliente.id : "" }),
            });
            const j = await r.json();
            if (!r.ok || j.error) throw new Error(j.error || "invio non riuscito");
            onCambia({ ...firma, via: "otp", otp: "inviata", submissionId: j.submissionId, link: j.link, canale });
            if (j.mailErrore) setErrFirma("La richiesta è stata creata, ma l'email non è partita: " + j.mailErrore + ". Usa il link qui sotto, oppure mandagliela su WhatsApp.");
            /* il messaggio WhatsApp lo manda il BROWSER: così esce dal numero del
               negozio e resta nello storico delle chat come ogni altro messaggio. */
            if (j.whatsapp && j.whatsapp.numero) {
                const w = await fetch("/api/whatsapp/notify", {
                    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ number: j.whatsapp.numero, text: j.whatsapp.testo }),
                }).then((x) => x.json()).catch(() => ({ error: "rete" }));
                if (w?.error) setErrFirma("La richiesta è pronta, ma il messaggio WhatsApp non è partito (" + w.error + "): usa il link qui sotto.");
            }
        } catch (e) { setErrFirma(e instanceof Error ? e.message : "invio non riuscito"); }
        setManda(false);
    };

    /* Si controlla ogni otto secondi finché il cliente non ha firmato: nessun
       webhook da configurare, e chi sta al banco vede il verde comparire da
       solo mentre il cliente ha ancora il telefono in mano. */
    useEffect(() => {
        if (firma.via !== "otp" || !firma.submissionId) return;
        if (firma.otp === "fatta" && firma.firmato) return;
        /* ⚠️ UN GIRO PER VOLTA. Il giro completo scarica due PDF da DocuSeal,
           li carica nel nostro secchio e spedisce la copia al cliente: può
           durare più degli otto secondi dell'intervallo, e il secondo giro
           rifarebbe tutto da capo — compresa la mail al cliente. */
        let dentro = false;
        const guarda = async () => {
            if (dentro) return;
            dentro = true;
            try {
                const r = await fetch("/api/pratiche/firma", {
                    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ azione: "stato", submissionId: firma.submissionId, protocollo,
                        email: cliente ? cliente.email : "", clienteId: cliente ? cliente.id : "" }),
                });
                const j = await r.json();
                /* ⚠️ AGGIORNAMENTO FUNZIONALE, non `{...firma}`. `firma` qui è
                   la copia catturata quando l'effetto è nato: al banco si manda
                   la richiesta, POI si scansiona la carta d'identità mentre il
                   cliente armeggia col telefono — e quella copia vecchia la
                   cancellava, lasciando «firmato» e «manca il documento»
                   insieme (rilievo del revisore, provato). */
                if (j?.firmato) {
                    onCambia((prec) => ({
                        ...prec, otp: "fatta", firmata_il: j.completatoIl || new Date().toISOString(),
                        firmato: j.archiviato || null, registro: j.registro || null,
                        dispositivo: j.dispositivo || null, daComputer: !!j.daComputer,
                    }));
                    /* se il documento non è ancora nel nostro archivio si continua
                       a guardare: prima ci si fermava qui, e la riga «sto portando
                       il documento nel nostro archivio» restava lì per sempre. */
                    if (j.archiviato && polling.current) { clearInterval(polling.current); polling.current = null; }
                }
            } catch { /* rete che sbanda: si riprova al giro dopo */ }
            finally { dentro = false; }
        };
        polling.current = setInterval(guarda, 8000);
        guarda();
        return () => { if (polling.current) clearInterval(polling.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [firma.via, firma.otp, firma.submissionId, firma.firmato]);

    return (
        <div className="space-y-3">
            <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={carica} className="hidden" />

            <div className="rvBox">
                <div className="rvBoxT">✍️ Come firma il cliente</div>
                <p className="rvSotto rvSotto-neg">
                    Senza firma la pratica <b className="rvSotto-f">non si salva</b>: non è un passaggio, è un cancello.
                </p>
                <button type="button" onClick={() => onCambia({ ...firma, via: "otp" })}
                    className={cn("rvFirmaG", firma.via === "otp" && "rvFirmaG-on")}>
                    <span className="rvFirmaG-ic" aria-hidden>📲</span>
                    <span>
                        <span className="rvFirmaG-t">Firma digitale</span>
                        <span className="rvFirmaG-s">
                            Gli arriva un link e un codice di verifica: apre, legge, firma con il dito. Trenta secondi,
                            e il documento è già archiviato nella sua scheda.
                        </span>
                        <span className="rvFirmaG-chip">⚡ 30 secondi</span>
                        <span className="rvFirmaG-chip">🔒 con prova di identità</span>
                        <span className="rvFirmaG-chip">📁 archiviata da sola</span>
                    </span>
                </button>
                {firma.via !== "cartacea" && (
                    <button type="button" className="rvFirmaMini" onClick={() => setChiediCarta(true)}>
                        oppure firma cartacea
                    </button>
                )}
            </div>
            {chiediCarta && <PopupCarta
                onResta={() => { setChiediCarta(false); onCambia({ ...firma, via: "otp" }); }}
                onProsegui={() => { setChiediCarta(false); onCambia({ ...firma, via: "cartacea" }); }} />}

            {firma.via === "otp" && (
                <div className="rvBox">
                    {firma.otp === "fatta" ? (
                        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ fontSize: 26 }}>✅</span>
                            <div style={{ flex: "1 1 240px" }}>
                                <div style={{ fontSize: 14, fontWeight: 800, color: "var(--tf-34d399)" }}>Firmato dal cliente</div>
                                <div className="rvTab-min">identità verificata col codice inviato a {cliente ? cliente.email : "—"}</div>
                                {firma.dispositivo && (
                                    <div className={cn("rvTab-min", firma.daComputer && "rvFirmaBanco")}>
                                        {firma.daComputer ? "⚠️ firmata da un computer" : "📱 firmata da"} {firma.dispositivo}
                                        {firma.daComputer ? " — se il link l'ha aperto il banco, quella firma non è del cliente" : ""}
                                    </div>
                                )}
                                <div className="rvTab-min">
                                    {firma.firmato
                                        ? "📄 modulo firmato e registro delle firme archiviati sulla pratica · copia inviata al cliente"
                                        : "⏳ sto portando il documento firmato nel nostro archivio…"}
                                </div>
                            </div>
                        </div>
                    ) : firma.otp === "inviata" ? (
                        <div>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--tf-818cf8)" }}>
                                <Loader2 className="w-4 h-4 animate-spin inline mr-2 -mt-0.5" />
                                Richiesta inviata a {cliente ? cliente.email : "—"} — aspetto che firmi
                            </div>
                            <p className="rvTab-min" style={{ marginTop: 7, lineHeight: 1.5 }}>
                                Prima gli arriva il <b>codice</b>, poi si apre il documento. Le firme sono due: la seconda è per
                                le clausole della sezione 7. Questa schermata diventa verde da sola appena ha finito.
                            </p>
                            <div className="rvSub rvSub-att">
                                ⚠️ Il link deve aprirlo <b>il cliente, sul suo telefono</b>. Se lo apri tu al banco e ti fai
                                dettare il codice, la firma che resta sul documento è la tua: il registro annota il
                                dispositivo, e in una contestazione è la prima cosa che si guarda.
                            </div>
                            {firma.link && (
                                <p className="rvTab-min" style={{ marginTop: 7 }}>
                                    Se preferisce firmare qui al banco sul suo telefono:{" "}
                                    <a href={firma.link} target="_blank" rel="noreferrer" style={{ color: "var(--tf-818cf8)", fontWeight: 700 }}>apri il documento</a>
                                </p>
                            )}
                        </div>
                    ) : (
                        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                            <div style={{ flex: "1 1 240px" }}>
                                <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--tf-f8fafc)" }}>
                                    Si manda a <b>{cliente ? cliente.email : "—"}</b>
                                </div>
                                <p className="rvTab-min" style={{ marginTop: 4, lineHeight: 1.5 }}>
                                    È l&apos;email della sua anagrafica: il codice arriva lì, e solo dopo averlo digitato può
                                    leggere e firmare il documento.
                                </p>
                            </div>
                            <CanaleFirma canale={canale} onCambia={setCanale}
                                email={cliente ? String(cliente.email || "") : ""} cellulare={cliente ? String(cliente.cellulare || "") : ""} />
                            <button type="button" className="rvAzione rvAzione-su" disabled={manda || !cliente || !cliente.email} onClick={mandaOtp}>
                                {manda ? <Loader2 className="w-4 h-4 animate-spin inline mr-1.5 -mt-0.5" /> : null}
                                Manda la richiesta di firma
                            </button>
                        </div>
                    )}
                    {errFirma && <div className="rvSub" style={{ marginTop: 10, borderColor: "rgba(239,68,68,.40)" }}>
                        <span className="text-[11.5px] text-rose-200">⛔ {errFirma}</span>
                    </div>}
                </div>
            )}

            {firma.via === "cartacea" && (
                <div className="rvBox">
                    <div className="rvBoxT">🖊️ Firma su carta</div>
                    <button type="button" className="rvFirmaMini rvFirmaMini-su" onClick={() => onCambia({ ...firma, via: "otp" })}>
                        ← torna alla firma digitale
                    </button>
                    <button onClick={() => stampaModulo(modulo)} className="rvPill" style={{ marginBottom: 12 }}>
                        <Printer className="w-4 h-4 inline mr-1.5 -mt-0.5" /> Stampa il modulo da firmare
                    </button>
                    <AllegatoRiga etichetta="Il modulo firmato" nota="le due firme devono esserci entrambe"
                        file={firma.modulo} caricando={su === "modulo"} onScegli={() => scegli("modulo")} />
                </div>
            )}

            {firma.via && (
                <div className="rvBox">
                    <div className="rvBoxT">🪪 Documento d&apos;identità</div>
                    <p className="rvSotto" style={{ margin: "-6px 0 11px" }}>
                        Serve <b style={{ color: "var(--tf-f8fafc)" }}>in tutti e due i casi</b>, anche quando firma col codice: lo
                        archiviamo noi sulla pratica, come già si fa quando si registra una vendita.
                    </p>
                    <AllegatoRiga etichetta="Carta d'identità o patente" nota="fronte e retro, leggibile"
                        file={firma.identita} caricando={su === "identita"} onScegli={() => scegli("identita")} />
                </div>
            )}

            {!completa && (
                <div className="rvSub" style={{ borderColor: "rgba(245,158,11,.38)" }}>
                    <span className="text-[12px] text-amber-200">⚠️ La pratica non si salva finché manca: <b>{manca.join(", ")}</b>.</span>
                </div>
            )}
            {completa && firma.via === "cartacea" && (
                <div className="rvSub" style={{ borderColor: "rgba(14,165,233,.35)" }}>
                    <span className="text-[11.5px] text-sky-200 leading-relaxed">
                        🔎 <b>Controllo del documento: da fare.</b> Per ora lo guarda una persona. Il controllo automatico — che il
                        modulo sia quello giusto e che le due firme ci siano entrambe — si aggiunge dopo.
                    </span>
                </div>
            )}
        </div>
    );
}

function AllegatoRiga({ etichetta, nota, file, caricando, onScegli }: {
    etichetta: string; nota: string; file?: { nome: string } | null; caricando: boolean; onScegli: () => void;
}) {
    return (
        <div className="rvSub" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, borderColor: file ? "rgba(52,211,153,.42)" : undefined }}>
            <span className="text-lg">{file ? "✅" : "📎"}</span>
            <div className="flex-1 min-w-[180px]">
                <p className={cn("text-[13px] font-bold", file ? "text-emerald-300" : "text-white")}>{etichetta}</p>
                <p className="text-[11px] text-slate-500 truncate">{file ? file.nome : nota}</p>
            </div>
            <button onClick={onScegli} disabled={caricando}
                className="rvPill rvPill-sm">
                {caricando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
                {file ? "Sostituisci" : "Carica"}
            </button>
        </div>
    );
}

/* ── ⑥ RIEPILOGO ────────────────────────────────────────────────────────── */
function Riepilogo({ protocollo, sezione, tipologia, cliente, righe, dev, imei, totale, accImporto, voceAcconto, approvv, noteInt, firma, negozio, operatore }: {
    protocollo: string; sezione: Sezione; tipologia: string; cliente: ClienteTrovato | null; righe: Riga[];
    dev: Record<string, string>; imei: string; totale: number; accImporto: number; voceAcconto: string;
    approvv: string; noteInt: string; firma: Firma; negozio: string; operatore: string;
}) {
    const t = TIPOLOGIE[tipologia];
    const saldo = Math.round((totale - accImporto) * 100) / 100;
    const medio = tempoMedio(tipologia, approvv);
    const dato = (et: string, v: string, n?: string, cls?: string) => (
        <div>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: ".7px", textTransform: "uppercase", color: "var(--tf-8892b0)" }}>{et}</p>
            <p className={cn("text-[13.5px] font-bold", cls || "text-white")} style={{ margin: "2px 0 0" }}>{v}</p>
            {n && <p className="rvTab-min" style={{ margin: "2px 0 0" }}>{n}</p>}
        </div>
    );
    return (
        <div className="rvTabBox">
            <div style={{ padding: "12px 16px", background: "var(--tf-w30)", borderBottom: "1px solid var(--tf-w60)" }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "var(--tf-f8fafc)" }}>📋 Riepilogo della pratica</p>
                <p className="rvTab-min" style={{ margin: "3px 0 0" }}>Questo è quello che vede l&apos;amministrazione, e quello che il cliente si porta a casa.</p>
            </div>
            <div className="p-5 grid gap-4 border-b border-white/10" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
                {dato("Protocollo", protocollo || "—", "è il numero che sta sul modulo firmato")}
                {dato("Cliente", cliente ? etichettaCliente(cliente) : "—", [cliente?.cellulare, cliente?.email].filter(Boolean).join(" · "))}
                {dato("Punto vendita", negozio, operatore)}
                {dato("Tipo di intervento", t ? t.icona + " " + t.label : "—", t && t.approvvigionamento ? etichettaApprovv(approvv) : undefined)}
                {dato(t ? t.valoreLabel : "Valore", eur(totale), sezione === "ordini" ? righe.length + (righe.length === 1 ? " riga" : " righe") : `${dev.brand} ${dev.modello}`.trim())}
                {dato("Acconto", accImporto > 0 ? eur(accImporto) : "nessuno",
                    accImporto > 0 ? `${voceAcconto} · da incassare in cassa` : "riepilogo, niente di fiscale",
                    accImporto > 0 ? "text-emerald-300" : "text-slate-400")}
                {dato("Saldo alla consegna", eur(saldo), accImporto > 0 ? "secondo documento, richiama il primo" : "tutto alla consegna")}
                {imei ? dato("IMEI", imei) : null}
                {dato("Firma", firma.via === "otp" ? "📲 col codice" : "🖊️ su carta",
                    firma.dispositivo ? `${firma.daComputer ? "⚠️ da un computer" : "da"} ${firma.dispositivo} · documento archiviato` : "documento d'identità archiviato",
                    "text-emerald-300")}
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

    /* il secchio è privato: si apre con un indirizzo firmato che vale un'ora,
       non con un link pubblico — questi sono documenti d'identità */
    const apriAllegato = async (path: string) => {
        const { data, error } = await supabase.storage.from("pratiche-allegati").createSignedUrl(path, 3600);
        if (error || !data?.signedUrl) { window.alert("Non riesco ad aprire il documento: " + (error?.message || "riprova")); return; }
        window.open(data.signedUrl, "_blank", "noopener");
    };

    /* ═══ CANCELLARE UNA PRATICA (Luca 01/09) ══════════════════════════════
       Solo admin — il database lo permetteva già (`tf_pratiche_del`), ma in
       schermata non c'era il modo. Si porta via TUTTO quello che la pratica
       si è lasciata dietro: le righe (in cascata), i documenti dal secchio e
       le righe che li mostrano nella scheda del cliente. Lasciare i file
       orfani vorrebbe dire un documento d'identità che resta in giro senza
       più niente a cui appartenere.
       Si scrive il protocollo per confermare: un clic solo, su una lista, è
       come si cancella la pratica sbagliata. */
    const cancella = async () => {
        const conferma = window.prompt(
            `Cancellare ${pratica.protocollo}?\n\nSparisce la pratica, i suoi documenti e le righe nella scheda del cliente. Non si torna indietro.\n\nScrivi il protocollo per confermare:`);
        if (!conferma) return;
        if (conferma.trim().toUpperCase() !== pratica.protocollo.toUpperCase()) { window.alert("Protocollo diverso: non ho cancellato niente."); return; }
        setBusy(true);
        try {
            /* la fa il SERVER: dal browser i depositi sono chiusi, e la
               rimozione dei file veniva negata in silenzio lasciando in giro
               documenti d'identità senza più niente a cui appartenere */
            const chiedi = async (forza: boolean) => {
                const r = await fetch("/api/pratiche/cancella", {
                    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: pratica.id, forza }),
                });
                return r.json();
            };
            let j = await chiedi(false);
            if (j?.ferma) {
                const ok = window.confirm(
                    `Attenzione su ${pratica.protocollo}:\n\n· ${(j.ferma as string[]).join("\n· ")}\n\nVuoi cancellarla lo stesso?`);
                if (!ok) { setBusy(false); return; }
                j = await chiedi(true);
            }
            if (j?.error) throw new Error(j.error);
            await onFatto(`🗑️ ${pratica.protocollo} cancellata${j?.avanzi ? " — " + j.avanzi : ""}`);
            onChiudi();
        } catch (e) {
            window.alert("Non sono riuscito a cancellarla: " + (e instanceof Error ? e.message : "riprova"));
        }
        setBusy(false);
    };

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
                <div className="flex items-center gap-2">
                    {eAdmin && (
                        <button onClick={cancella} disabled={busy} className="rvPill rvPill-ko" title="Cancella la pratica e i suoi documenti">
                            🗑️ Cancella
                        </button>
                    )}
                    <button onClick={onChiudi} className="rvPill">
                        <ArrowLeft className="w-4 h-4 inline mr-1.5 -mt-0.5" /> Elenco
                    </button>
                </div>
            </div>

            {/* pipeline */}
            <div className="rvBox" style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
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
                <div className="rvBox">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">La pratica</p>
                    <Voce et={t ? t.valoreLabel : "Valore"} v={eur(Number(pratica.valore))} />
                    <Voce et="Acconto" v={accImporto > 0 ? `${eur(accImporto)} · ${acc.forma || ""} · 🧾 ${acc.scontrino || ""}` : "nessuno"} />
                    <Voce et="Saldo alla consegna" v={eur(saldo)} forte />
                    {t && t.approvvigionamento && (
                        <Voce et="Da dove arriva" v={etichettaApprovv(pratica.approvvigionamento)
                            + (pratica.attesa_da ? " — da " + pratica.attesa_da : "")} />
                    )}
                    {pratica.imei && <Voce et="IMEI" v={pratica.imei} />}
                    {pratica.dispositivo && <Voce et="Dispositivo" v={`${pratica.dispositivo.brand || ""} ${pratica.dispositivo.modello || ""}`.trim()} />}
                    {pratica.dispositivo?.condizioni && <Voce et="Condizioni" v={pratica.dispositivo.condizioni} />}
                    {pratica.dispositivo?.difetto && <Voce et="Difetto" v={pratica.dispositivo.difetto} />}
                </div>

                <div className="rvBox">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Firma e documenti</p>
                    <Voce et="Firmato" v={pratica.firma?.via === "otp" ? "📲 col codice" : "🖊️ su carta"} />
                    {/* DA DOVE (Luca 01/09). Il registro DocuSeal dice il dispositivo,
                        ma bisognava aprire il PDF: qui si legge a colpo d'occhio, e un
                        computer — mentre il link è partito verso un telefono — vuol
                        dire quasi sempre che ha firmato il banco. */}
                    {pratica.firma?.via === "otp" && (
                        pratica.firma.dispositivo
                            ? <Voce et="Firmato da" v={`${pratica.firma.daComputer ? "⚠️ " : "📱 "}${pratica.firma.dispositivo}`}
                                avviso={pratica.firma.daComputer ? "un computer: se il link l'ha aperto il negozio, la firma non è del cliente" : undefined} />
                            : <Voce et="Firmato da" v="— non rilevato" avviso="il registro delle firme non si è potuto leggere: non vuol dire che sia tutto a posto" />
                    )}
                    <Voce et="Documento d'identità" v={pratica.firma?.identita ? "✅ archiviato" : "⛔ mancante"} />
                    {pratica.firma?.via === "cartacea" && <Voce et="Modulo firmato" v={pratica.firma?.modulo ? "✅ allegato" : "⛔ mancante"} />}
                    {/* I DOCUMENTI SI APRONO. Un archivio che non si può aprire
                        è un archivio che nessuno controlla: il giorno della
                        contestazione serve il foglio, non la casella spuntata. */}
                    <div className="rvPillRow">
                        {([
                            ["Modulo firmato", pratica.firma?.firmato?.path || pratica.firma?.modulo?.path],
                            ["Registro delle firme", pratica.firma?.registro?.path],
                            ["Documento d'identità", pratica.firma?.identita?.path],
                        ] as [string, string | undefined][]).map(([et, path]) => (
                            path ? (
                                <button key={et} type="button" className="rvPill rvPill-sm" onClick={() => apriAllegato(path)}>
                                    📄 {et}
                                </button>
                            ) : null
                        ))}
                    </div>
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
                <div className="rvBox">
                    <p className="rvBoxT">🔒 Note interne — non le vede il cliente</p>
                    <p className="text-[12.5px] text-slate-300 whitespace-pre-wrap leading-relaxed mt-1.5">{pratica.note_interne}</p>
                </div>
            )}

            {(pratica.righe || []).length > 0 && (
                <div className="rvTabBox">
                    <div style={{ padding: "10px 14px", background: "var(--tf-w30)", borderBottom: "1px solid var(--tf-w60)", fontSize: 12.5, fontWeight: 800, color: "var(--tf-f8fafc)" }}>🛒 Articoli</div>
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
                <div className="rvBox">
                    {serveImeiArrivo && (
                        <div className="rounded-xl border border-amber-400/40 bg-amber-500/[0.07] p-3.5 space-y-2">
                            <p className="text-[12px] text-amber-100 leading-relaxed">
                                📲 <b>Il telefono è arrivato: scrivi l&apos;IMEI adesso.</b> Su un ordine telefono il seriale non
                                c&apos;era all&apos;apertura — si prende qui, prima di consegnarlo, altrimenti la garanzia non si
                                aggancia a nessun apparecchio. Si legge con <b>*#06#</b> o dalla scatola.
                            </p>
                            <input value={imei} onChange={(e) => setImei(e.target.value)} placeholder="IMEI"
                                className="rvIn" style={{ maxWidth: 280, fontFamily: "ui-monospace,monospace" }} />
                        </div>
                    )}
                    {prossimo === "spedito" && (
                        <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Tracking della spedizione (facoltativo)"
                            className="rvIn" style={{ maxWidth: 340 }} />
                    )}
                    {/* CAMBIARE «DA DOVE ARRIVA» dal dettaglio: prima si poteva
                        scrivere solo all'apertura, quindi «Ordinato» — l'unica
                        voce che dice che i soldi sono usciti — era
                        irraggiungibile, e il riquadro «Da comprare» poteva solo
                        crescere. */}
                    {t && t.approvvigionamento && (
                        <div className="rvPillRow" style={{ marginBottom: 10 }}>
                            <span className="rvTab-min" style={{ alignSelf: "center", marginRight: 4 }}>Da dove arriva:</span>
                            {APPROVVIGIONAMENTO.map((a) => {
                                const on = pratica.approvvigionamento === a.k;
                                const spento = a.chi === "admin" && !eAdmin;
                                return (
                                    <button key={a.k} type="button" disabled={busy || spento || on}
                                        onClick={() => scrivi({ approvvigionamento: a.k }, "Approvvigionamento: " + a.label, a.icona + " " + a.label)}
                                        className={cn("rvPill rvPill-sm", on && "rvPill-on")}>{a.icona} {a.label}</button>
                                );
                            })}
                        </div>
                    )}
                    <div className="flex flex-wrap gap-2 items-center">
                        {prossimo && mioTurno && (
                            <button onClick={avanza} disabled={busy || (serveImeiArrivo && imei.trim().length < 6)}
                                title={serveImeiArrivo && imei.trim().length < 6 ? "Serve l'IMEI del telefono arrivato" : ""}
                                className="rvAzione">
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
                        <button type="button" className="rvPill rvPill-sm" onClick={() => stampaModulo({
                            protocollo: pratica.protocollo, tipologia: pratica.tipologia, negozio: pratica.negozio, operatore: pratica.operatore,
                            cliente: pratica.cliente as DatiModulo["cliente"], valore: Number(pratica.valore),
                            acconto: pratica.acconto as DatiModulo["acconto"],
                            righe: (pratica.righe || []).map((r) => ({ descrizione: r.descrizione, qta: r.qta, prezzo: r.prezzo, note: r.note })),
                            dispositivo: pratica.dispositivo, imei: pratica.imei,
                            tempoMedio: tempoMedio(pratica.tipologia, pratica.approvvigionamento),
                        })}>
                            <Printer className="w-3.5 h-3.5 inline mr-1 -mt-0.5" /> Ristampa il modulo
                        </button>
                        {(pratica.stato === "in_negozio" || pratica.stato === "pronta") && !pratica.avviso_pronto_il && (
                            <button onClick={avvisaPronto} disabled={busy}
                                className="rvPill rvPill-si">
                                🔔 Avvisa il cliente che è pronto
                            </button>
                        )}
                        {pratica.sezione === "assistenze" && !chiusa && (
                            <button onClick={() => { if (window.confirm(`Segno «${pratica.protocollo}» come NON RIUSCITA?\n\nLa pratica si chiude e nel CRM non si riapre. Se c'è un acconto, si emette il buono al cliente.`)) scrivi({ stato: "non_riuscita" }, "Lavorazione non riuscita", "⛔ Segnata non riuscita"); }} disabled={busy}
                                className="rvPill rvPill-no">
                                Non riuscita
                            </button>
                        )}
                        {pratica.sezione === "ordini" && eAdmin && (
                            <button onClick={() => { if (window.confirm("Annullo l'ordine " + pratica.protocollo + "?")) scrivi({ stato: "annullato" }, "Ordine annullato", "❌ Annullato"); }} disabled={busy}
                                className="rvPill rvPill-no">
                                Annulla ordine
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* il buono, quando il lavoro non si conclude */}
            {pratica.stato === "non_riuscita" && (
                pratica.buono ? (
                    <div className="rvBox" style={{ borderColor: "rgba(20,184,166,.45)" }}>
                        <p className="text-sm font-black text-teal-300">🎟️ Buono {eur(Number((pratica.buono as { importo?: number }).importo) || 0)} — {String((pratica.buono as { codice?: string }).codice)}</p>
                        <p className="text-[11.5px] text-slate-400 mt-1">
                            emesso il {dataIt(String((pratica.buono as { emesso_il?: string }).emesso_il))} · scade il {dataIt(String((pratica.buono as { scade_il?: string }).scade_il))}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                            Spendibile in negozio in una o più volte, escluse {BUONO_ESCLUSI}. Non si converte in denaro.
                        </p>
                    </div>
                ) : accImporto > 0 ? (
                    <div className="rvBox" style={{ borderColor: "rgba(245,158,11,.45)" }}>
                        <p className="text-sm font-black text-amber-200">Il lavoro non si è concluso: l&apos;acconto di {eur(accImporto)} non resta a noi</p>
                        <p className="text-[12px] text-slate-400 leading-relaxed">
                            Il cliente non salda e il tentativo non si paga. Lo scontrino sull&apos;acconto però è già stato emesso:
                            si emette un <b className="text-slate-200">buono di pari importo</b>, valido {BUONO_MESI} mesi, spendibile in negozio
                            in una o più volte — escluse {BUONO_ESCLUSI}. È la clausola 7.6 del modulo che il cliente ha firmato.
                        </p>
                        <button onClick={emettiBuono} disabled={busy}
                            className="rvAzione">
                            🎟️ Emetti il buono da {eur(accImporto)}
                        </button>
                    </div>
                ) : (
                    <p className="rvSub text-[12px] text-slate-400">Non c&apos;era acconto: non c&apos;è niente da restituire e nessun buono da emettere.</p>
                )
            )}

            <div className="rvBox">
                <div className="rvBoxT">Storia</div>
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

function Voce({ et, v, forte, avviso }: { et: string; v: string; forte?: boolean; avviso?: string }) {
    return (
        <div className="flex flex-wrap gap-2 items-baseline">
            <span className="w-[160px] shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-500">{et}</span>
            <span className={cn("text-[13px] flex-1 min-w-[120px]", forte ? "font-black text-white" : "text-slate-200")}>
                {v}
                {avviso && <span className="rvFirmaBanco block text-[11px] mt-0.5">{avviso}</span>}
            </span>
        </div>
    );
}
