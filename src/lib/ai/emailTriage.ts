// TRIAGE AI delle EMAIL (Luca 26/08, fase 2 di Email-come-WhatsApp): motore
// server-side gemello di waTriage — legge le conversazioni email e le smista
// per natura, con un'AZIONE AUTOMATICA sulla spazzatura. SOLO server.
//
// Stati (tabella email_triage, una riga per conversazione):
//   rispondere  → un cliente o una pratica aspetta NOI (lista rossa del widget)
//   da_leggere  → informativa che conta (operatore, fornitore, corriere,
//                 contabilità): nessuna risposta dovuta, ma va vista
//   niente      → newsletter, marketing, notifiche di routine: silenzio
//   spazzatura  → spam/phishing/truffe → CESTINATA in automatico (direttiva
//                 Luca 26/08: «cancellale»), tranne che sulle caselle
//                 PROTETTE (ai_protetta, es. amministrazione@) dove finisce
//                 in quarantena Spam. Il cestino del CRM è ripristinabile e
//                 ogni azione resta nel registro Attività AI del pannello.
//
// GUARDIE DURE nel codice (mai delegate al modello): una conversazione dove
// ABBIAMO SCRITTO NOI, o col cliente censito in anagrafica (client_id), o
// stellata, non viene MAI cestinata — al massimo resta classificata.

import { supabase } from "@/lib/supabaseClient";
import { chat, estimateCost, hasKey, MODEL_FAST } from "./deepseek";

export const EMAIL_TRIAGE_VERSIONE = 1;    // alzarla = riclassificare tutto
const FINESTRA_GG = 35;
const MAX_PER_CORSA = 60;
const CONCORRENZA = 4;
export const TOLLERANZA_MS = 2000;         // il widget confronta a 2500 (≥, mai il contrario)
const SCADENZA_CORSA_MS = 150000;          // sempre sotto i 3' del lock morto

const PROMPT_EMAIL = `Sei il triage della posta elettronica di Telefutura (negozi di telefonia WindTre/Vodafone/Fastweb/Sky a Roma; le caselle sono dei punti vendita o personali dei collaboratori). Leggi UNA conversazione email e classificala.

Rispondi SOLO con un oggetto JSON: {"stato": "...", "azione": "..."}

I quattro stati:

1. "rispondere" — un CLIENTE o una PRATICA aspetta una nostra risposta: domanda o richiesta esplicita (prezzo, disponibilità, problema, appuntamento), documenti mandati per una pratica, reclamo o disdetta, un cliente già in conversazione con noi che riscrive. Anche un fornitore/operatore che chiede a NOI qualcosa di operativo (un documento, una conferma) è "rispondere".

2. "da_leggere" — informativa che CONTA ma senza risposta dovuta: comunicazioni degli operatori (WindTre, Vodafone, Fastweb, Sky) su listini, gare, attivazioni, storni; corrieri con tracking di spedizioni; fatture e contabilità; PEC; avvisi di sistemi che usiamo davvero. Chi la riceve deve vederla, non rispondere.

3. "niente" — rumore innocuo: newsletter e marketing di fornitori legittimi, promozioni di servizi, notifiche automatiche di routine (social, conferme d'iscrizione), auguri circolari. Non serve né leggere con urgenza né rispondere.

4. "spazzatura" — spam e phishing: finti corrieri che chiedono pagamenti per «sbloccare il pacco», finte banche/poste che chiedono credenziali, finte bollette o rimborsi con link sospetti, sedicenti eredità/lotterie/investimenti, mittenti camuffati (dominio che imita un marchio vero), estorsioni. Verrà eliminata in automatico.

Regole d'oro:
- IL MITTENTE PESA PIÙ DEL TONO. Un dominio ufficiale vero (windtre.it, vodafone.it, fastweb.it, sky.it, brt.it, gls-italy.com, poste.it, aruba.it, pec.it…) non è mai "spazzatura". Un dominio che IMITA (windtre-promo.xyz, poste-verifica.net) è il segnale principe del phishing.
- SPAZZATURA = SOLO CERTEZZA. La cancellazione è automatica: se un'email potrebbe anche essere legittima (un fornitore vero che scrive male, una promo aggressiva ma reale), scegli "niente", MAI "spazzatura". Nel dubbio tra spazzatura e niente vince SEMPRE niente.
- Se nella conversazione ci sono NOSTRI messaggi di risposta, non è spazzatura per definizione: qualcuno di noi ci sta lavorando.
- Un cliente vero che scrive alla casella del negozio è quasi sempre "rispondere", anche solo per cortesia commerciale.
- Le richieste legate a un momento ormai passato («siete aperti oggi?» di dieci giorni fa) scivolano a "niente".

"azione": una riga in italiano, max 90 caratteri, utile a chi lavora ("Rispondere: chiede un preventivo fibra per l'ufficio", "Da leggere: BRT, in consegna domani il pacco della Magliana", "phishing: finto corriere che chiede 2€"). Per "niente" una motivazione telegrafica ("newsletter fornitore", "promo circolare").`;

type StatoEmail = "rispondere" | "da_leggere" | "niente" | "spazzatura";
const STATI: StatoEmail[] = ["rispondere", "da_leggere", "niente", "spazzatura"];

type RigaMsg = { direction: string; from_addr: string | null; from_name: string | null; subject: string | null; body_text: string | null; attachments: any; email_date: string | null; created_at: string };
type Conv = { id: string; account_id: string; customer_email: string; customer_name: string | null; client_id: string | null; subject: string | null; last_message_at: string; starred: boolean | null; spam: boolean | null; trashed: boolean | null };

function oggiRoma(): string {
    const d = new Date();
    return `Oggi è ${d.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" })}.`;
}
function quandoRoma(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: "Europe/Rome" })
        + " " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
}
function estraiJson(testo: string): any | null {
    const m = String(testo || "").match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
}
// il corpo testo delle email porta firme e disclaimer chilometrici: 500 char
// bastano a capire la natura; l'HTML non serve (body_text c'è quasi sempre)
function corpoCompatto(m: RigaMsg): string {
    const testo = String(m.body_text || "").replace(/\s+/g, " ").trim().slice(0, 500);
    const nAll = Array.isArray(m.attachments) ? m.attachments.length : 0;
    return (testo || "(senza testo)") + (nAll ? ` [${nAll} allegati]` : "");
}

async function classificaUna(conv: Conv, casellaNome: string) {
    const { data: msgs } = await supabase.from("email_messages")
        .select("direction, from_addr, from_name, subject, body_text, attachments, email_date, created_at")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(6);
    const righe = ((msgs || []) as RigaMsg[])
        .map((m) => ({ ...m, t: new Date(m.email_date || m.created_at).getTime() }))
        .filter((m) => !isNaN(m.t))
        .sort((a, b) => a.t - b.t);
    // CLAMP a adesso (rilievo M3): email_date è l'header del MITTENTE — uno
    // spam con Date 2030 produrrebbe un fingerprint futuro che congela la
    // conversazione per sempre (i messaggi veri non lo superano più)
    const fingerprint = new Date(Math.min(Date.now(), Math.max(
        righe.length ? righe[righe.length - 1].t : 0,
        new Date(conv.last_message_at).getTime()
    ))).toISOString();
    const base = {
        conversation_id: conv.id, versione: EMAIL_TRIAGE_VERSIONE, modello: MODEL_FAST,
        ultimo_msg_ts: fingerprint, errore: null as string | null, classificato_il: new Date().toISOString(),
    };
    if (!righe.length) return { riga: { ...base, stato: "niente" as StatoEmail, azione: "conversazione senza messaggi" }, usage: null, abbiamoRisposto: false };

    // guardia sull'INTERA conversazione, non sulle ultime 6 righe (rilievo
    // M1): una nostra risposta oltre la finestra bucava la protezione
    let abbiamoRisposto = righe.some((m) => m.direction === "out");
    if (!abbiamoRisposto) {
        const { count } = await supabase.from("email_messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conv.id).eq("direction", "out");
        abbiamoRisposto = (count ?? 0) > 0;
    }
    const trascr = righe.map((m) =>
        `[${quandoRoma(m.email_date || m.created_at)}] ${m.direction === "in" ? `DA ${m.from_name || ""} <${m.from_addr || "?"}>` : "NOI (risposta)"}: ${corpoCompatto(m)}`
    ).join("\n");
    const user = [
        oggiRoma(),
        `Casella ricevente: ${casellaNome}`,
        `Mittente della conversazione: ${conv.customer_name || "?"} <${conv.customer_email}>`,
        conv.client_id ? "Il mittente è un CLIENTE CENSITO nell'anagrafica del CRM." : "",
        `Oggetto: ${conv.subject || "(senza oggetto)"}`,
        `Messaggi (dal più vecchio):`,
        trascr,
    ].filter(Boolean).join("\n");

    const res = await chat({
        messages: [{ role: "system", content: PROMPT_EMAIL }, { role: "user", content: user }],
        // 1600: deepseek-v4-flash è un modello REASONING — il ragionamento
        // consuma il budget prima del content (lezione del triage WhatsApp)
        model: MODEL_FAST, maxTokens: 1600, temperature: 0.1, timeoutMs: 25000, responseFormat: "json_object",
    });
    const out = estraiJson(res.message.content || "");
    if (!out || !STATI.includes(out.stato)) return { riga: null, usage: res.usage, abbiamoRisposto };
    return {
        riga: { ...base, stato: out.stato as StatoEmail, azione: String(out.azione || "").slice(0, 140) || null },
        usage: res.usage, abbiamoRisposto,
    };
}

export type EsitoCorsaEmail = {
    ok: boolean; saltata?: string;
    classificate: number; dirette: number; cestinate: number; quarantene: number;
    errori: number; rimanenti: number; costoUsd: number; esito: string;
};

// Un giro di triage email: conversazioni con messaggi nuovi (o mai viste, o
// di versione vecchia). Lock+debounce su email_triage_stato — gemello di
// corsaTriage, chiamabile insieme da widget/cron/curl senza doppioni.
export async function corsaTriageEmail(opts?: { force?: boolean; max?: number }): Promise<EsitoCorsaEmail> {
    const inizio = Date.now();
    const vuoto = (saltata: string): EsitoCorsaEmail => ({ ok: true, saltata, classificate: 0, dirette: 0, cestinate: 0, quarantene: 0, errori: 0, rimanenti: 0, costoUsd: 0, esito: saltata });
    if (!hasKey()) return vuoto("DEEPSEEK_API_KEY non configurata");

    const { data: statoRow } = await supabase.from("email_triage_stato").select("in_corsa_da, ultima_corsa, ultimo_esito").eq("id", 1).maybeSingle();
    if (!opts?.force && statoRow?.ultimo_esito?.includes("senza credito")
        && statoRow.ultima_corsa && Date.now() - new Date(statoRow.ultima_corsa).getTime() < 60 * 60000) {
        return vuoto("DeepSeek senza credito (riprovo tra un'ora)");
    }
    const adessoIso = new Date().toISOString();
    const { data: claim } = await supabase.from("email_triage_stato")
        .update({ in_corsa_da: adessoIso })
        .eq("id", 1)
        .or(`in_corsa_da.is.null,in_corsa_da.lt.${new Date(Date.now() - 3 * 60000).toISOString()}`)
        .or(`ultima_corsa.is.null,ultima_corsa.lt.${new Date(Date.now() - (opts?.force ? 0 : 4 * 60000)).toISOString()}`)
        .select("id");
    if (!claim?.length) return vuoto("corsa già in atto o troppo ravvicinata");

    let classificate = 0, dirette = 0, cestinate = 0, quarantene = 0, errori = 0, rimanenti = 0;
    let promptTok = 0, complTok = 0;
    let primoErrore: string | null = null;
    let senzaCredito = false;
    try {
        // caselle: nome (per il prompt) e flag protetta (per l'auto-azione)
        const { data: accs } = await supabase.from("email_accounts").select("id, email_address, display_name, ai_protetta");
        const caselle = new Map((accs || []).map((a) => [a.id, a]));

        const cutoff = new Date(Date.now() - FINESTRA_GG * 86400000).toISOString();
        // fino a 3 pagine da 1000: il parco email è più largo del WhatsApp
        // (~2.800 conversazioni/35gg) — niente tagli silenziosi
        const tutte: Conv[] = [];
        for (let p = 0; p < 3; p++) {
            const { data: pag } = await supabase.from("email_conversations")
                .select("id, account_id, customer_email, customer_name, client_id, subject, last_message_at, starred, spam, trashed")
                .gt("last_message_at", cutoff)
                .order("last_message_at", { ascending: false })
                .range(p * 1000, p * 1000 + 999);
            tutte.push(...((pag || []) as Conv[]));
            if (!pag || pag.length < 1000) break;
        }

        const triMap = new Map<string, { ultimo_msg_ts: string; versione: number; ripristinata_il: string | null }>();
        for (let i = 0; i < tutte.length; i += 100) {
            const blocco = tutte.slice(i, i + 100).map((c) => c.id);
            const { data: rows } = await supabase.from("email_triage")
                .select("conversation_id, ultimo_msg_ts, versione, ripristinata_il").in("conversation_id", blocco);
            (rows || []).forEach((r) => triMap.set(r.conversation_id, r));
        }
        const daFare = tutte.filter((c) => {
            if (c.trashed) return false;                    // il cestino non si classifica
            const t = triMap.get(c.id);
            return !t || t.versione !== EMAIL_TRIAGE_VERSIONE
                || new Date(t.ultimo_msg_ts).getTime() < new Date(c.last_message_at).getTime() - TOLLERANZA_MS;
        });
        const max = Math.min(Math.max(1, opts?.max || MAX_PER_CORSA), MAX_PER_CORSA);
        const lotto = daFare.slice(0, max);

        let idx = 0;
        const lavora = async () => {
            while (idx < lotto.length && !senzaCredito && Date.now() - inizio < SCADENZA_CORSA_MS) {
                const conv = lotto[idx++];
                try {
                    const acc = caselle.get(conv.account_id);
                    const { riga, usage, abbiamoRisposto } = await classificaUna(conv, acc?.display_name || acc?.email_address || "negozio");
                    if (usage) { promptTok += usage.prompt_tokens || 0; complTok += usage.completion_tokens || 0; }
                    if (!riga) { errori++; if (!primoErrore) primoErrore = "risposta non JSON"; continue; }

                    // ── AZIONE AUTOMATICA sulla spazzatura, con le GUARDIE DURE:
                    // mai su conversazioni con nostre risposte, cliente censito,
                    // stella, GIÀ marcate spam a mano (rilievo B3: il primo giro
                    // le traslocava di cartella) o RIPRISTINATE da un admin
                    // (rilievo alto A1: il giudizio umano non si scavalca mai —
                    // la classificazione resta, la mano no). Le guardie su
                    // stella/cliente sono ANCHE nel WHERE (rilievo M2: tra
                    // fetch e azione passano fino a 150s, i flag possono essere
                    // cambiati nel frattempo); protette → quarantena Spam.
                    const ripristinata = !!triMap.get(conv.id)?.ripristinata_il;
                    if (riga.stato === "spazzatura" && !abbiamoRisposto && !conv.client_id && !conv.starred && !conv.spam && !ripristinata) {
                        const protetta = !!acc?.ai_protetta;
                        const { data: agite, error: e2 } = await supabase.from("email_conversations")
                            .update(protetta ? { spam: true } : { trashed: true })
                            .eq("id", conv.id).eq("starred", false).is("client_id", null)
                            .select("id");
                        if (!e2 && (agite || []).length > 0) {
                            (riga as any).azione_auto = protetta ? "quarantena" : "cestinata";
                            (riga as any).azione_auto_il = new Date().toISOString();
                            if (protetta) quarantene++; else cestinate++;
                        }
                    }
                    // il ripristino dell'admin sopravvive all'upsert (l'upsert
                    // rimpiazza la riga intera: senza questo il campo si perdeva)
                    if (ripristinata) (riga as any).ripristinata_il = triMap.get(conv.id)?.ripristinata_il;
                    const { error } = await supabase.from("email_triage").upsert(riga, { onConflict: "conversation_id" });
                    if (error) { errori++; if (!primoErrore) primoErrore = error.message; continue; }
                    if (usage) classificate++; else dirette++;
                } catch (e: any) {
                    errori++;
                    const msg = String(e?.message || e);
                    if (!primoErrore) primoErrore = msg.slice(0, 200);
                    if (msg.includes("Insufficient Balance") || msg.startsWith("DeepSeek 402")) senzaCredito = true;
                }
            }
        };
        await Promise.all(Array.from({ length: CONCORRENZA }, lavora));
        rimanenti = Math.max(0, daFare.length - classificate - dirette - errori);

        const costoUsd = estimateCost(MODEL_FAST, promptTok, complTok);
        const esito = senzaCredito
            ? `${quandoRoma(adessoIso)} · DeepSeek senza credito: da ricaricare (classificate ${classificate})`
            : `${quandoRoma(adessoIso)} · ${classificate} con AI + ${dirette} dirette · 🗑 ${cestinate} cestinate · ${quarantene} in quarantena · ${errori} errori · ${rimanenti} in coda · $${costoUsd.toFixed(4)}`;
        if (classificate > 0 || (errori > 0 && !senzaCredito)) {
            supabase.from("ai_usage").insert({
                user_id: null, model: MODEL_FAST, prompt_tokens: promptTok, completion_tokens: complTok,
                cost_usd: costoUsd, latency_ms: Date.now() - inizio, tool_calls: 0,
                ok: errori === 0, error: primoErrore,
            }).then(() => { }, () => { });
        }
        await supabase.from("email_triage_stato").update({ in_corsa_da: null, ultima_corsa: new Date().toISOString(), ultimo_esito: esito }).eq("id", 1);
        return { ok: errori === 0, classificate, dirette, cestinate, quarantene, errori, rimanenti, costoUsd, esito };
    } catch (e: any) {
        const esito = `${quandoRoma(adessoIso)} · corsa fallita: ${String(e?.message || e).slice(0, 160)}`;
        await supabase.from("email_triage_stato").update({ in_corsa_da: null, ultima_corsa: new Date().toISOString(), ultimo_esito: esito }).eq("id", 1);
        return { ok: false, classificate, dirette, cestinate, quarantene, errori: errori + 1, rimanenti, costoUsd: estimateCost(MODEL_FAST, promptTok, complTok), esito };
    }
}
