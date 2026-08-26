// TRIAGE AI delle chat WhatsApp (Luca 26/08): un motore server-side che legge
// le conversazioni coi clienti e decide, chat per chat, se OGGI serve un'azione
// e di chi è la palla. Sostituisce le regex del widget «WhatsApp del team» come
// fonte delle liste rossa/azzurra (le regex restano il ripiego quando una chat
// non è ancora classificata). SOLO server: usa DeepSeek via ./deepseek.
//
// Stati prodotti (tabella wa_triage, una riga per conversazione):
//   rispondere     → il cliente aspetta NOI (lista rossa)
//   attesa_cliente → richiesta NOSTRA pendente su una pratica viva (lista azzurra)
//   programmata    → rinvio esplicito nel tempo: dorme fino a rinvio_fino,
//                    poi riemerge tra i solleciti («riprendere…»)
//   niente         → conclusa/rifiuto/promozione senza risposta: fuori dalle liste
//
// La lezione che ha fatto nascere tutto: i negozi mandano MOLTI follow-up a
// freddo («ho provato a chiamarla per una promo», «sei riuscito a passare?»)
// e per le regex ogni punto interrogativo nostro era un'«attesa cliente» —
// ma un cliente che non ha mai risposto a una prospezione non è una pratica
// da sollecitare. Distinguere prospezione da pratica richiede di LEGGERE la
// conversazione: per questo un modello, non un'altra regex.

import { supabase } from "@/lib/supabaseClient";
import { chat, estimateCost, hasKey, MODEL_FAST } from "./deepseek";

export const TRIAGE_VERSIONE = 1;          // alzarla = riclassificare tutto
const FINESTRA_GG = 35;                    // il widget guarda 30 giorni: margine
const MAX_PER_CORSA = 60;                  // tetto chat per giro (il chiamante può abbassarlo)
const CONCORRENZA = 4;
const TOLLERANZA_MS = 2000;               // created_at identici dei backfill

const PROMPT_TRIAGE = `Sei il triage delle chat WhatsApp di Telefutura (negozi di telefonia WindTre/Vodafone/Fastweb/Sky a Roma). Leggi UNA conversazione tra un punto vendita e un cliente e decidi se oggi serve un'azione, e di chi è la palla.

Rispondi SOLO con un oggetto JSON: {"stato": "...", "azione": "...", "rinvio_fino": "YYYY-MM-DD" oppure null}

I quattro stati possibili:

1. "rispondere" — il cliente aspetta NOI. L'ultima mossa sostanziale è del cliente e una nostra risposta è ancora utile ADESSO: una domanda o richiesta esplicita (prezzo, disponibilità, problema, "mi richiamate?"), documenti o foto mandati per una pratica che aspettano conferma o lavorazione, interesse mostrato dopo una nostra proposta ("mi dica", "quanto verrebbe?"), una lamentela anche senza punto interrogativo.

2. "attesa_cliente" — NOI aspettiamo il cliente su una pratica VIVA, e ha senso sollecitarlo. Vale solo se: abbiamo chiesto qualcosa di concreto e operativo (un documento, una conferma, una scelta, un dato per l'attivazione, un pagamento) E il cliente era già ingaggiato nella conversazione (aveva risposto, era d'accordo, la pratica esiste). La domanda retorica di un primo contatto NON è una richiesta.

3. "programmata" — c'è un rinvio esplicito nel tempo, detto da noi o dal cliente: "ci sentiamo a settembre", "richiamo io giovedì", "passo sabato in negozio", "ne parliamo quando torno dalle ferie". Non serve fare nulla ADESSO: indica in rinvio_fino la data in cui riprendere in mano la chat. Data prudente: "a settembre" → il primo settembre; "settimana prossima" → il lunedì; "più avanti" senza data → due settimane da oggi. Se l'impegno è del cliente ("passo domani"), la ripresa serve a verificare che sia successo.

4. "niente" — tutto il resto: conversazione conclusa (saluti, ringraziamenti, "ok" finale), rifiuto ricevuto ("no grazie", "non mi interessa" — mai insistere), scambio di cortesia, nostra comunicazione informativa o promozionale rimasta senza risposta, auguri, avvisi senza seguito richiesto ("è arrivato il suo telefono").

Regole d'oro (gli errori da non fare):
- PROSPEZIONE ≠ PRATICA. Un nostro messaggio a freddo o quasi ("ho provato a chiamarla per una promozione", "è riuscito a passare in negozio?") a cui il cliente NON ha risposto è "niente": nessuno sta aspettando nessuno — è marketing, non una pratica da sollecitare. Anche se contiene un punto interrogativo.
- IL TEMPO CONSUMA LE RICHIESTE. Una domanda del cliente legata a un momento ormai passato ("siete aperti oggi?" di dieci giorni fa, "confermo per domani" di settimana scorsa) non si "risponde" più: è "niente". E più i giorni passano, più è probabile che la questione sia stata risolta a voce o in negozio: dopo circa due settimane di silenzio servono indizi FORTI per dire ancora "rispondere" o "attesa_cliente".
- L'ULTIMO BLOCCO NON BASTA. Giudica la conversazione intera, non l'ultima bolla: "mi mandi il preventivo" seguito da "grazie, buona giornata" resta "rispondere" (il preventivo lo aspettano ancora).
- Un "ok"/"va bene" secco del cliente dopo una NOSTRA richiesta operativa è un impegno preso, non una chiusura: "attesa_cliente" (aspettiamo il fatto), o "programmata" se c'è una data.
- Foto e documenti del cliente ([immagine], [documento]) dentro una pratica valgono come richiesta di lavorazione: "rispondere" se non abbiamo dato seguito.
- Messaggi nostri segnati [non consegnato] non contano come mosse fatte.
- Nel dubbio tra "rispondere" e "niente" su una chat FRESCA (ultime 48 ore), scegli "rispondere": meglio un falso allarme che un cliente ignorato. Nel dubbio su chat vecchie, scegli "niente".

"azione": una riga in italiano, massimo 90 caratteri, concreta e utile a chi lavora ("Rispondere: chiede se la promo vale sulla seconda SIM", "Sollecitare: mancano i documenti per la portabilità", "Riprendere: aveva detto di risentirci a settembre"). Per "niente" una motivazione telegrafica ("promo senza risposta", "conclusa con i saluti", "ha rifiutato").`;

type StatoTriage = "rispondere" | "attesa_cliente" | "programmata" | "niente";
const STATI: StatoTriage[] = ["rispondere", "attesa_cliente", "programmata", "niente"];

type RigaMsg = { direction: string; body: string | null; media_mime: string | null; status: string | null; wa_timestamp: string | null; created_at: string };

function etichettaMedia(mime: string | null): string {
    if (!mime) return "(vuoto)";
    if (mime.startsWith("image")) return "[immagine]";
    if (mime.startsWith("audio")) return "[audio]";
    if (mime.startsWith("video")) return "[video]";
    return "[documento]";
}

function oggiRoma(): string {
    const d = new Date();
    const giorno = d.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" });
    const ora = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
    return `Oggi è ${giorno}, ore ${ora} (Roma).`;
}

function quandoRoma(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: "Europe/Rome" })
        + " " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
}

// trascrizione compatta: ultime righe utili, corpi tagliati, media come tag
function costruisciTrascrizione(msgs: RigaMsg[]): { testo: string; ultimoTs: number } | null {
    const righe = msgs
        .map((m) => ({ ...m, t: new Date(m.wa_timestamp || m.created_at).getTime() }))
        .filter((m) => !isNaN(m.t) && (m.direction === "in" || m.direction === "out")
            && (String(m.body || "").trim() !== "" || m.media_mime))
        .sort((a, b) => a.t - b.t);
    if (!righe.length) return null;
    let visibili = righe.slice(-30);
    // tetto ~6000 caratteri: si sacrifica il passato, mai le ultime 12 righe
    while (visibili.length > 12 && visibili.reduce((s, m) => s + Math.min(String(m.body || "").length, 300) + 30, 0) > 6000) {
        visibili = visibili.slice(1);
    }
    const testo = visibili.map((m) => {
        const corpo = String(m.body || "").trim().slice(0, 300) || etichettaMedia(m.media_mime);
        const chi = m.direction === "in" ? "CLIENTE" : "NOI";
        const fallito = m.direction === "out" && m.status === "failed" ? " [non consegnato]" : "";
        return `[${quandoRoma(m.wa_timestamp || m.created_at)}] ${chi}${fallito}: ${corpo}`;
    }).join("\n");
    return { testo, ultimoTs: righe[righe.length - 1].t };
}

function estraiJson(testo: string): any | null {
    const m = String(testo || "").match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
}

// rinvio del modello (YYYY-MM-DD) → timestamptz alle ~08:00 di Roma; date
// assurde o mancanti su una "programmata" → due settimane, mai null
function normalizzaRinvio(raw: any, stato: StatoTriage): string | null {
    if (stato !== "programmata") return null;
    const quindicina = () => new Date(Date.now() + 14 * 86400000).toISOString();
    const m = String(raw || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return quindicina();
    const ts = Date.parse(`${m[1]}-${m[2]}-${m[3]}T06:00:00Z`);
    if (isNaN(ts) || ts < Date.now() - 86400000 || ts > Date.now() + 400 * 86400000) return quindicina();
    return new Date(ts).toISOString();
}

async function classificaUna(conv: { id: string; customer_name: string | null; last_message_at: string; chiusa_il: string | null }) {
    const { data: msgs } = await supabase.from("wa_messages")
        .select("direction, body, media_mime, status, wa_timestamp, created_at")
        .eq("conversation_id", conv.id).is("deleted_at", null)
        .order("created_at", { ascending: false }).limit(30);
    const tr = costruisciTrascrizione((msgs || []) as RigaMsg[]);
    const fingerprint = new Date(Math.max(
        tr?.ultimoTs || 0, new Date(conv.last_message_at).getTime()
    )).toISOString();
    const base = { conversation_id: conv.id, versione: TRIAGE_VERSIONE, modello: MODEL_FAST, ultimo_msg_ts: fingerprint, errore: null as string | null, classificato_il: new Date().toISOString() };

    // niente da leggere (solo reazioni/eventi) o chiusa a mano DOPO l'ultimo
    // messaggio: si archivia senza spendere un token
    if (!tr) return { riga: { ...base, stato: "niente", azione: "solo reazioni o messaggi di servizio", rinvio_fino: null }, usage: null };
    if (conv.chiusa_il && new Date(conv.chiusa_il).getTime() >= tr.ultimoTs - 1500) {
        return { riga: { ...base, stato: "niente", azione: "chiusa a mano (✓)", rinvio_fino: null }, usage: null };
    }

    const user = `${oggiRoma()}\nCliente: ${conv.customer_name || "(senza nome)"}\nConversazione (dal più vecchio):\n${tr.testo}`;
    const res = await chat({
        messages: [{ role: "system", content: PROMPT_TRIAGE }, { role: "user", content: user }],
        model: MODEL_FAST, maxTokens: 220, temperature: 0.1, timeoutMs: 25000, responseFormat: "json_object",
    });
    const out = estraiJson(res.message.content || "");
    const stato: StatoTriage = STATI.includes(out?.stato) ? out.stato : "rispondere"; // risposta rotta → prudenza: meglio in lista che sparita
    return {
        riga: {
            ...base, stato,
            azione: String(out?.azione || "").slice(0, 140) || null,
            rinvio_fino: normalizzaRinvio(out?.rinvio_fino, stato),
            errore: out ? null : "risposta non JSON",
        },
        usage: res.usage,
    };
}

export type EsitoCorsa = {
    ok: boolean; saltata?: string;
    classificate: number; dirette: number; errori: number; rimanenti: number;
    costoUsd: number; esito: string;
};

// Un giro di triage: prende le conversazioni con messaggi nuovi (o mai viste,
// o di una versione vecchia del prompt) e le classifica. Lock + debounce su
// wa_triage_stato (riga singola): chiamabile insieme da widget e cron senza
// corse doppie. force=true salta il debounce (mai il lock).
export async function corsaTriage(opts?: { force?: boolean; max?: number }): Promise<EsitoCorsa> {
    const inizio = Date.now();
    const vuoto = (saltata: string): EsitoCorsa => ({ ok: true, saltata, classificate: 0, dirette: 0, errori: 0, rimanenti: 0, costoUsd: 0, esito: saltata });
    if (!hasKey()) return vuoto("DEEPSEEK_API_KEY non configurata: il widget resta sulle regole base");

    // niente credito? non martellare l'API: un tentativo l'ora basta
    const { data: statoRow } = await supabase.from("wa_triage_stato").select("in_corsa_da, ultima_corsa, ultimo_esito").eq("id", 1).maybeSingle();
    if (!opts?.force && statoRow?.ultimo_esito?.includes("senza credito")
        && statoRow.ultima_corsa && Date.now() - new Date(statoRow.ultima_corsa).getTime() < 60 * 60000) {
        return vuoto("DeepSeek senza credito (riprovo tra un'ora)");
    }

    // lock: vince chi aggiorna per primo; un lock più vecchio di 3' è morto
    const adessoIso = new Date().toISOString();
    const { data: claim } = await supabase.from("wa_triage_stato")
        .update({ in_corsa_da: adessoIso })
        .eq("id", 1)
        .or(`in_corsa_da.is.null,in_corsa_da.lt.${new Date(Date.now() - 3 * 60000).toISOString()}`)
        .or(`ultima_corsa.is.null,ultima_corsa.lt.${new Date(Date.now() - (opts?.force ? 0 : 4 * 60000)).toISOString()}`)
        .select("id");
    if (!claim?.length) return vuoto("corsa già in atto o troppo ravvicinata");

    let classificate = 0, dirette = 0, errori = 0, rimanenti = 0;
    let promptTok = 0, complTok = 0;
    let primoErrore: string | null = null;
    let senzaCredito = false;
    try {
        const cutoff = new Date(Date.now() - FINESTRA_GG * 86400000).toISOString();
        const { data: convs } = await supabase.from("wa_conversations")
            .select("id, customer_name, last_message_at, chiusa_il")
            .or("is_group.is.null,is_group.eq.false")
            .gt("last_message_at", cutoff)
            .order("last_message_at", { ascending: false }).limit(400);
        const tutte = convs || [];

        const triMap = new Map<string, { ultimo_msg_ts: string; versione: number }>();
        for (let i = 0; i < tutte.length; i += 100) {
            const blocco = tutte.slice(i, i + 100).map((c) => c.id);
            const { data: rows } = await supabase.from("wa_triage")
                .select("conversation_id, ultimo_msg_ts, versione").in("conversation_id", blocco);
            (rows || []).forEach((r) => triMap.set(r.conversation_id, r));
        }
        const daFare = tutte.filter((c) => {
            const t = triMap.get(c.id);
            return !t || t.versione !== TRIAGE_VERSIONE
                || new Date(t.ultimo_msg_ts).getTime() < new Date(c.last_message_at).getTime() - TOLLERANZA_MS;
        });
        const max = Math.min(Math.max(1, opts?.max || MAX_PER_CORSA), MAX_PER_CORSA);
        const lotto = daFare.slice(0, max);
        rimanenti = daFare.length - lotto.length;

        // pool di lavoro a CONCORRENZA fissa; sul 402 (credito finito) si
        // smette subito: inutile bruciare 60 tentativi identici
        let idx = 0;
        const lavora = async () => {
            while (idx < lotto.length && !senzaCredito) {
                const conv = lotto[idx++];
                try {
                    const { riga, usage } = await classificaUna(conv as any);
                    if (usage) { promptTok += usage.prompt_tokens || 0; complTok += usage.completion_tokens || 0; }
                    const { error } = await supabase.from("wa_triage").upsert(riga, { onConflict: "conversation_id" });
                    if (error) { errori++; if (!primoErrore) primoErrore = error.message; continue; }
                    if (usage) classificate++; else dirette++;
                } catch (e: any) {
                    errori++;
                    const msg = String(e?.message || e);
                    if (!primoErrore) primoErrore = msg.slice(0, 200);
                    if (msg.includes("Insufficient Balance") || msg.includes("402")) senzaCredito = true;
                }
            }
        };
        await Promise.all(Array.from({ length: CONCORRENZA }, lavora));
        if (senzaCredito) rimanenti = daFare.length - classificate - dirette;

        const costoUsd = estimateCost(MODEL_FAST, promptTok, complTok);
        const esito = senzaCredito
            ? `${quandoRoma(adessoIso)} · DeepSeek senza credito: da ricaricare (classificate ${classificate})`
            : `${quandoRoma(adessoIso)} · ${classificate} con AI + ${dirette} dirette · ${errori} errori · ${rimanenti} in coda · $${costoUsd.toFixed(4)}`;

        if (classificate > 0 || (errori > 0 && !senzaCredito)) {   // il "senza credito" vive già in ultimo_esito: niente rumore nel registro
            // log costi nello stesso registro dell'assistente AI (user null = motore)
            supabase.from("ai_usage").insert({
                user_id: null, model: MODEL_FAST, prompt_tokens: promptTok, completion_tokens: complTok,
                cost_usd: costoUsd, latency_ms: Date.now() - inizio, tool_calls: 0,
                ok: errori === 0, error: primoErrore,
            }).then(() => { }, () => { });
        }
        await supabase.from("wa_triage_stato").update({ in_corsa_da: null, ultima_corsa: new Date().toISOString(), ultimo_esito: esito }).eq("id", 1);
        return { ok: errori === 0, classificate, dirette, errori, rimanenti, costoUsd, esito };
    } catch (e: any) {
        const esito = `${quandoRoma(adessoIso)} · corsa fallita: ${String(e?.message || e).slice(0, 160)}`;
        await supabase.from("wa_triage_stato").update({ in_corsa_da: null, ultima_corsa: new Date().toISOString(), ultimo_esito: esito }).eq("id", 1);
        return { ok: false, classificate, dirette, errori: errori + 1, rimanenti, costoUsd: estimateCost(MODEL_FAST, promptTok, complTok), esito };
    }
}
