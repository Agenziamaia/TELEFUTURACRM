"use client";

// MODALE "Scegli il messaggio" (CAL-01, Luca 04/08): step intermedio a MODELLI
// tra la pratica del caller e WhatsApp. Vive in un file separato per non
// ingrassare caller/page.tsx. Comportamento deciso da Luca:
//   - click su "Invia ora" = INVIO IMMEDIATO dal numero DEL caller (route
//     /api/whatsapp/send-template); la pratica resta APERTA e il flag
//     "WhatsApp inviato" si auto-setta (onInviato);
//   - caller senza istanza connessa: la route risponde 409 col messaggio
//     chiaro, qui lo si mostra senza ripieghi su numeri altrui;
//   - "Apri la chat" = fallback col testo precompilato via ?testo= (la lettura
//     del parametro in /chat e' di un altro cantiere: qui si genera solo l'URL).
// Rotazione anti-ban: mai la variante usata per ULTIMA su quel numero
// (letta da wa_template_invii); il log invii lo scrive la route.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fasciaLabel } from "@/lib/fasce";
import { MessageSquare, X, RefreshCw, Send, ExternalLink, Loader2, CheckCheck } from "lucide-react";

// «saltato» = il cliente non si e' presentato all'appuntamento e non risponde
// (Luca 31/08): prima riceveva i testi del «non risposto», che parlano d'altro
export type ScenarioWa = "nr" | "richiamo" | "appuntamento" | "saltato" | "generico";

// i soli campi della pratica che servono ai placeholder: tipizzazione
// STRUTTURALE, la Call della pagina li possiede tutti
export interface PraticaWa {
    // l'indirizzo NON sta sulla pratica: arriva dall'anagrafica del negozio
    // (stores.address) e lo carica il modale — vedi `indirizziNegozi`
    id: string;
    tipo_cliente: string;
    nome: string;
    cognome: string;
    ragione_sociale: string;
    brand: string;
    obiettivo: string;
    provenienza: string;
    tipologia: string;
    caller: string;
    negozio_appuntamento: string;
    negozio_pertinenza: string;
    negozio_provenienza: string;
    data_appuntamento: string;
    fascia_appuntamento: string;
    data_richiamo: string;
    fascia_richiamo: string;
    dataAppuntamentoNew?: string;
    dataRichiamoNew?: string;
    negozioAppNew?: string;
}

type Template = {
    id: string; gruppo: string; titolo: string | null; corpo: string; scenario: string;
    brand: string | null; obiettivo: string | null; provenienza: string | null; tipologia: string | null;
    attivo: boolean; ordine: number;
};

const SCENARIO_LABEL: Record<ScenarioWa, string> = {
    nr: "📵 Non risposto", richiamo: "☎ Richiamo", appuntamento: "📅 Appuntamento",
    saltato: "🚪 Appuntamento saltato", generico: "💬 Generico",
};

const norm = (v: string) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
/** IL NOME BASE DEL NEGOZIO. Alcuni punti vendita hanno due schede — «Acilia
 *  Multi» e «Acilia VS», «Collatina Multi» e «Collatina W3», «Magliana Multi»
 *  e «Magliana W3» — perché sono due codici nello stesso posto, e nelle
 *  pratiche il negozio a volte è scritto senza il suffisso («Acilia»).
 *
 *  ATTENZIONE, il presupposto «tanto l'indirizzo è lo stesso» è FALSO su due
 *  coppie su tre (rilevato dal revisore 31/08): Acilia è al 9 e al 9/a,
 *  Collatina addirittura al 80/80a e al 78A. Luca ha detto «prendine
 *  tranquillamente una delle due», e va bene — ma dev'essere SEMPRE LA STESSA:
 *  prima si ordinava per niente, cioè per l'ordine fisico della tabella, e
 *  bastava salvare un orario perché l'indirizzo mandato ai clienti cambiasse
 *  da solo. Adesso l'ordine è alfabetico e vince la prima: Acilia Multi,
 *  Collatina Multi. */
const baseNegozio = (v: string) => norm(v).replace(/\s+(multi|vs|w3|wind ?3|vodafone|store)$/i, "");
/** l'indirizzo del negozio: prima il nome esatto, poi il nome base (la scheda
 *  gemella dello stesso posto). */
const indirizzoDi = (m: Map<string, string>, nome: string) =>
    m.get(norm(nome)) || m.get(baseNegozio(nome)) || "";
/** un negozio, non un elenco: con le virgole dentro è una multiselezione */
const unNegozio = (v?: string | null) => (String(v || "").includes(",") ? "" : String(v || "").trim());

function fmtData(v?: string): string {
    if (!v) return "";
    const d = new Date(v);
    if (isNaN(d.getTime())) return "";
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function fmtOra(v?: string): string {
    if (!v || !v.includes("T")) return "";
    const hhmm = v.split("T")[1].slice(0, 5);
    // MEZZANOTTE NON E' UN ORARIO, e' un appuntamento A FASCIA. Il CRM prende
    // gli appuntamenti anche su «Mattina/Pomeriggio», e li' salva la sola data:
    // a database diventa 00:00, e un messaggio che dice «alle ore 🕐 00:00» al
    // cliente non e' un dettaglio, e' un errore. Tornando vuoto il segnaposto
    // risulta MANCANTE, quindi il modale sceglie da solo la variante a fascia
    // e — se non ce ne fossero — non lascia partire l'invio.
    return hhmm === "00:00" ? "" : hhmm;
}

// SOLO IL NOME, mai il cognome (Luca 06/08): verso il cliente ci si firma col
// primo nome dell'utente loggato e lo si chiama col suo primo nome — i cognomi
// non devono comparire in nessun caso nei messaggi preimpostati.
const primoNome = (s: string) => (s || "").trim().split(/\s+/)[0] || "";

// valori della pratica per i placeholder del corpo modello
function valoriPlaceholder(call: PraticaWa, callerName: string, indirizzi: Map<string, string>): Record<string, string> {
    const dataApp = call.dataAppuntamentoNew || call.data_appuntamento;
    const dataRic = call.dataRichiamoNew || call.data_richiamo;
    const negozioApp = call.negozioAppNew || call.negozio_appuntamento;
    return {
        nome: primoNome(call.nome),
        cognome: "",   // neutralizzato: il cognome del cliente non si scrive mai
        ragione_sociale: (call.ragione_sociale || "").trim(),
        brand: call.brand || "",
        obiettivo: call.obiettivo || "",
        caller: primoNome(callerName || call.caller || ""),
        // UN NEGOZIO SOLO. Su 938 pratiche il campo di provenienza porta la
        // MULTISELEZIONE salvata come stringa — «Collatina W3, Donna,
        // Garbatella, …» — e il messaggio sarebbe partito cosi': «Sono Sandra
        // del negozio Collatina W3, Donna, Garbatella, Libia, …». Un valore
        // con le virgole non e' un negozio: si tratta come assente, il
        // segnaposto risulta mancante e l'invio si blocca finche' la pratica
        // non viene sistemata.
        negozio: unNegozio(negozioApp) || unNegozio(call.negozio_pertinenza) || unNegozio(call.negozio_provenienza),
        // INDIRIZZO del negozio in gioco. Se non e' compilato in
        // Amministrazione → Negozi resta vuoto, e il testo si richiude da solo
        // sulla preposizione che lo precede (vedi `risolvi`).
        indirizzo: indirizzoDi(indirizzi, unNegozio(negozioApp) || unNegozio(call.negozio_pertinenza) || unNegozio(call.negozio_provenienza)),
        negozio_pertinenza: call.negozio_pertinenza || call.negozio_provenienza || "",
        data_appuntamento: fmtData(dataApp),
        ora_appuntamento: fmtOra(dataApp),
        fascia_appuntamento: fasciaLabel(call.fascia_appuntamento) || "",
        data_richiamo: fmtData(dataRic),
        fascia_richiamo: fasciaLabel(call.fascia_richiamo) || "",
    };
}

// risolve i {placeholder}: testo pronto all'invio + parti per l'anteprima
// (i placeholder senza dato restano nel testo e si evidenziano in ambra)
function risolvi(corpo: string, vals: Record<string, string>): {
    testo: string; mancanti: string[]; parti: { t: string; ph?: "ok" | "manca" }[];
} {
    const parti: { t: string; ph?: "ok" | "manca" }[] = [];
    const mancanti: string[] = [];
    let testo = "";
    // SEGNAPOSTO CHE POSSONO MANCARE senza rovinare la frase. Non basta
    // toglierli: se sparisce l'indirizzo resta «del negozio Mazzini di 📍»,
    // cioe' una preposizione a vuoto e un segnalino che non indica piu'
    // niente. Si toglie il PEZZO INTERO — la preposizione che lo reggeva, il
    // segnaposto e l'eventuale spillo dopo — prima di risolvere il resto.
    // ⚠️ lo spillo va messo in gruppo — `(?:📍)?` e non `📍?`: senza il flag `u`
    // il punto interrogativo si applica solo alla SECONDA meta' della coppia
    // che compone l'emoji, e la prima resta obbligatoria. Con `📍?` la pulizia
    // funzionava solo dove lo spillo c'era davvero, e il {cognome} — che non
    // ce l'ha mai — sarebbe finito nel messaggio al cliente.
    // Il cognome c'era gia' (Luca 06/08: verso il cliente si usa solo il nome);
    // l'indirizzo si aggiunge perche' finche' le anagrafiche dei negozi non
    // sono compilate meglio una frase piu' corta di un {indirizzo} spedito.
    for (const ph of ["cognome", "indirizzo"]) {
        // SOLO SE IL SEGNAPOSTO C'E' DAVVERO. Girava su ogni testo — anche su
        // quelli che non lo nominano — e le sue riscritture di punteggiatura
        // rovinavano le virgole buone: «la promo Sky, Netflix e Disney»
        // diventava «la promo Sky. Netflix e Disney».
        if (vals[ph] || !corpo.includes(`{${ph}}`)) continue;
        // si porta via il segno che lo reggeva (preposizione, virgola,
        // lineetta) e lo spillo che lo seguiva, poi RICUCE la frase: se dopo
        // comincia una maiuscola ci vuole un punto, altrimenti uno spazio.
        // Senza la ricucitura restavano frasi saldate — «del punto vendita
        // Mazzini L'ho cercata poco fa» — perche' a fare da punto era proprio
        // il pezzo che abbiamo tolto.
        const re = new RegExp(`([^ \u00a0])?[ \u00a0]*(?:[,;—–-][ \u00a0]*)?(?:\\b(?:di|in|presso|da)\\b[ \u00a0]*)?\\{${ph}\\}[ \u00a0]*(?:📍)?[ \u00a0]*`, "g");
        corpo = corpo.replace(re, (m, pre = "", off: number, testoIntero: string) => {
            const dopo = testoIntero.slice(off + m.length);
            const chiudi = /^[A-ZÀ-Ý]/.test(dopo) && !/[.!?:;,]$/.test(pre);
            return pre + (chiudi ? ". " : dopo ? " " : "");
        });
        corpo = corpo.replace(/[ \u00a0]*,[ \u00a0]*([.,!?])/g, "$1")
            .replace(/[ \u00a0]*([.,!?])/g, "$1")
            .replace(/[ \u00a0]{2,}/g, " ").trim();
    }
    const re = /\{([a-z_]+)\}/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(corpo))) {
        if (m.index > last) { const t = corpo.slice(last, m.index); parti.push({ t }); testo += t; }
        const v = vals[m[1]];
        if (v) { parti.push({ t: v, ph: "ok" }); testo += v; }

        else { parti.push({ t: `{${m[1]}}`, ph: "manca" }); mancanti.push(m[1]); testo += `{${m[1]}}`; }
        last = m.index + m[0].length;
    }
    if (last < corpo.length) { const t = corpo.slice(last); parti.push({ t }); testo += t; }
    return { testo, mancanti, parti };
}

export function ModaleTemplateWa({ call, numero, scenario, userId, callerName, onClose, onInviato, salvaBozza }: {
    call: PraticaWa;
    numero: string;                    // sole cifre del destinatario
    scenario: ScenarioWa;
    userId: string | null;
    callerName: string;
    onClose: () => void;
    onInviato: () => void;             // auto-set del flag "WhatsApp inviato"
    salvaBozza: () => void;            // bozza pratica per il fallback "Apri la chat"
}) {
    const router = useRouter();
    const [templates, setTemplates] = useState<Template[] | null>(null);
    const [usatiRecenti, setUsatiRecenti] = useState<string[]>([]);   // template_id, dal piu' recente
    const [errore, setErrore] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);            // gruppo in invio
    const [fatto, setFatto] = useState(false);
    const [indirizzi, setIndirizzi] = useState<Map<string, string>>(new Map());

    // gli indirizzi dei negozi, per il segnaposto {indirizzo}: una query sola,
    // e se la colonna e' vuota il testo si richiude da solo
    useEffect(() => {
        (async () => {
            // L'INDIRIZZO ARRIVA DA AMMINISTRAZIONE → ORARI E CHIUSURE, dove le
            // schede dei negozi hanno via, civico, CAP e città (servono al DDT).
            // Nel messaggio bastano via e civico: «di via Nomentana» senza il
            // numero non aiuta nessuno, e il CAP allunga e basta.
            // ORDINE ALFABETICO, non l'ordine dell'heap: è quello che rende
            // stabile la scelta fra le due schede gemelle (vedi `baseNegozio`)
            const { data } = await supabase.from("stores").select("name, address, civico").order("name");
            const m = new Map<string, string>();
            for (const r of ((data ?? []) as { name: string; address: string | null; civico?: string | null }[])) {
                if (!r.address?.trim()) continue;
                const via = [r.address.trim(), (r.civico || "").trim()].filter(Boolean).join(" ");
                m.set(norm(r.name), via);
                // il nome base vale come ripiego per la scheda gemella e per le
                // pratiche che scrivono il negozio senza suffisso: la prima che
                // ha l'indirizzo vince, le altre non lo sovrascrivono
                const b = baseNegozio(r.name);
                if (b && !m.has(b)) m.set(b, via);
            }
            setIndirizzi(m);
        })();
    }, []);

    useEffect(() => {
        (async () => {
            const { data, error } = await supabase.from("wa_templates").select("*")
                .eq("attivo", true).order("ordine").order("created_at");
            if (error) {
                setErrore(/wa_templates/i.test(error.message) ? "Modelli non disponibili: manca la migrazione wa_templates." : error.message);
                setTemplates([]);
                return;
            }
            setTemplates((data ?? []) as Template[]);
            // ultimi invii su QUESTO numero: servono alla rotazione delle varianti
            const { data: inv } = await supabase.from("wa_template_invii")
                .select("template_id").eq("numero", numero)
                .order("inviato_at", { ascending: false }).limit(30);
            setUsatiRecenti(((inv ?? []) as { template_id: string | null }[])
                .map((r) => r.template_id).filter(Boolean) as string[]);
        })();
    }, [numero]);

    const vals = useMemo(() => valoriPlaceholder(call, callerName, indirizzi), [call, callerName, indirizzi]);

    // modelli pertinenti: scenario + jolly su brand/obiettivo/provenienza/tipologia
    // (campo del modello NULL = vale per tutti); senza modelli dello scenario si
    // ripiega sui generici. Raggruppati per "gruppo" (varianti dello stesso tipo).
    const gruppi = useMemo(() => {
        const all = templates ?? [];
        const compat = (t: Template) =>
            (!t.brand || t.brand === call.brand) &&
            (!t.obiettivo || t.obiettivo === call.obiettivo) &&
            (!t.provenienza || t.provenienza === call.provenienza) &&
            (!t.tipologia || t.tipologia === call.tipologia);
        let pert = all.filter((t) => t.scenario === scenario && compat(t));
        if (!pert.length) pert = all.filter((t) => t.scenario === "generico" && compat(t));
        const m = new Map<string, Template[]>();
        pert.forEach((t) => { const arr = m.get(t.gruppo) || []; arr.push(t); m.set(t.gruppo, arr); });
        return [...m.entries()];
    }, [templates, scenario, call.brand, call.obiettivo, call.provenienza, call.tipologia]);

    // variante selezionata per gruppo. Scelta iniziale = ROTAZIONE anti-ban:
    // mai la variante usata per ULTIMA su questo numero; a parita', si
    // preferisce la prima con tutti i placeholder coperti dai dati pratica.
    const [varSel, setVarSel] = useState<Record<string, number>>({});
    useEffect(() => {
        if (!gruppi.length) return;
        setVarSel((prev) => {
            const next = { ...prev };
            gruppi.forEach(([g, vars]) => {
                if (next[g] != null) return;
                // ROTAZIONE VERA (revisione 31/08): si evitavano solo le
                // varianti usate per ULTIME su quel numero, e per un cliente
                // mai contattato si partiva sempre dalla prima — con nove
                // varianti se ne usava una. Adesso il punto di partenza lo
                // decide il numero stesso, quindi clienti diversi ricevono
                // testi diversi, ed evita TUTTE le varianti già usate con lui.
                const semi = [...numero].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 9973, 7);
                const usate = new Set(usatiRecenti);
                let scelto = semi % vars.length;
                for (let k = 0; k < vars.length; k++) {
                    const i = (semi + k) % vars.length;
                    if (usate.has(vars[i].id) && vars.length > usate.size) continue;
                    if (!risolvi(vars[i].corpo, vals).mancanti.length) { scelto = i; break; }
                }
                next[g] = scelto;
            });
            return next;
        });
    }, [gruppi, usatiRecenti, vals, numero]);

    const invia = async (gruppo: string, t: Template, testo: string) => {
        if (busy || fatto) return;
        if (!userId) { setErrore("Utente non riconosciuto: rientra nel CRM."); return; }
        setBusy(gruppo);
        setErrore(null);
        try {
            const res = await fetch("/api/whatsapp/send-template", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, number: numero, text: testo, templateId: t.id, callId: call.id }),
            });
            const j = await res.json();
            if (!res.ok || j?.error) { setErrore(j?.error || "invio non riuscito"); return; }
            setFatto(true);
            onInviato();                          // flag "WhatsApp inviato" sulla pratica (resta aperta)
            setTimeout(onClose, 1300);
        } catch (e) {
            setErrore(e instanceof Error ? e.message : "invio non riuscito");
        } finally {
            setBusy(null);
        }
    };

    // fallback: chat col testo precompilato (?testo= la legge la pagina chat)
    const apriChat = (testo?: string) => {
        salvaBozza();
        router.push("/chat?wa=" + numero + (testo ? "&testo=" + encodeURIComponent(testo) : ""));
    };

    return (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="glass-card w-full max-w-xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex-none px-5 py-4 border-b border-white/10 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ background: "var(--tf-25d366)" }}>
                        <MessageSquare className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-white">Scrivi su WhatsApp — scegli il messaggio</h3>
                        <p className="text-[11px] text-slate-400 truncate">a +{numero} · scenario {SCENARIO_LABEL[scenario]} · dal TUO numero collegato</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"><X className="w-5 h-5" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {errore && (
                        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
                            {errore}
                            {/collega il QR/i.test(errore) && (
                                <button onClick={() => apriChat()} className="block mt-2 text-xs font-bold underline text-rose-200 hover:text-white">
                                    Vai alla chat per collegare il QR →
                                </button>
                            )}
                        </div>
                    )}

                    {fatto ? (
                        <div className="py-10 text-center text-emerald-300 font-bold flex flex-col items-center gap-2">
                            <CheckCheck className="w-10 h-10" /> Messaggio inviato! Flag &quot;WhatsApp inviato&quot; impostato.
                        </div>
                    ) : templates === null ? (
                        <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
                    ) : gruppi.length === 0 ? (
                        <div className="py-8 text-center text-slate-400 text-sm space-y-3">
                            <p>Nessun modello per questo scenario.<br />Si aggiungono da Amministrazione → Call Center → Modelli WhatsApp.</p>
                            <button onClick={() => apriChat()} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/15 text-slate-200 text-xs font-bold hover:bg-white/10">
                                <ExternalLink className="w-3.5 h-3.5" /> Apri la chat
                            </button>
                        </div>
                    ) : gruppi.map(([g, vars]) => {
                        const idx = Math.min(varSel[g] ?? 0, vars.length - 1);
                        const t = vars[idx];
                        const { testo, mancanti, parti } = risolvi(t.corpo, vals);
                        return (
                            <div key={g} className="p-4 rounded-xl border border-white/10 bg-white/[0.03] space-y-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="flex-1 text-xs font-bold text-emerald-300 uppercase tracking-widest truncate">{t.titolo || g}</span>
                                    {vars.length > 1 && (
                                        <button onClick={() => setVarSel((p) => ({ ...p, [g]: (idx + 1) % vars.length }))}
                                            title="Cambia variante (le varianti ruotano da sole per non mandare sempre lo stesso testo)"
                                            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-white/10 text-[10px] font-bold text-slate-300 hover:bg-white/10">
                                            <RefreshCw className="w-3 h-3" /> variante {idx + 1}/{vars.length}
                                        </button>
                                    )}
                                </div>
                                <p className="text-sm text-slate-100 leading-relaxed whitespace-pre-wrap bg-black/25 border border-white/5 rounded-lg p-3">
                                    {parti.map((p, i) => p.ph === "manca"
                                        ? <mark key={i} className="bg-amber-500/25 text-amber-200 rounded px-0.5" title="Dato mancante sulla pratica">{p.t}</mark>
                                        : p.ph === "ok"
                                            ? <strong key={i} className="text-emerald-200 font-semibold">{p.t}</strong>
                                            : <span key={i}>{p.t}</span>)}
                                </p>
                                {mancanti.length > 0 && (
                                    <p className="text-[11px] text-amber-300/90">
                                        Mancano: {mancanti.map((x) => `{${x}}`).join(", ")} — completa la pratica o cambia variante.
                                    </p>
                                )}
                                <div className="flex items-center gap-2 pt-0.5">
                                    <button onClick={() => invia(g, t, testo)} disabled={!!busy || mancanti.length > 0}
                                        title={mancanti.length ? "Placeholder senza dato: il testo partirebbe monco" : "Invia SUBITO dal tuo numero — la pratica resta aperta"}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed">
                                        {busy === g ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Invia ora
                                    </button>
                                    <button onClick={() => apriChat(testo)}
                                        title="Apri la conversazione con questo testo gia' scritto (lo confermi tu)"
                                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-white/15 text-slate-300 text-xs font-bold hover:bg-white/10">
                                        <ExternalLink className="w-3.5 h-3.5" /> Apri la chat
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {!fatto && templates !== null && gruppi.length > 0 && (
                    <div className="flex-none px-5 py-3 border-t border-white/10 flex items-center justify-between">
                        <p className="text-[10px] text-slate-500">Invio 1-a-1 dal tuo numero: niente raffiche, le varianti ruotano da sole.</p>
                        <button onClick={() => apriChat()} className="text-[11px] font-bold text-slate-400 hover:text-white underline">
                            Apri la chat senza modello
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
