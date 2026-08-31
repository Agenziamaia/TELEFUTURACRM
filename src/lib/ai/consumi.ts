/* ═══ IL REGISTRO DEI CONSUMI DELL'AI ══════════════════════════════════════
   Luca 31/08: «un resoconto dei token che stiamo utilizzando, di quanto
   stiamo spendendo diviso per categorie — email spende questo, WhatsApp
   questo, l'assistente questo — e poterlo filtrare per utenza».

   Prima di questo modulo ogni motore scriveva per conto suo, e due dei
   quattro scrivevano `user_id: null` senza dire da dove venissero: erano
   indistinguibili, e «quanto spende l'email» era un dato che non esisteva.
   Il quarto — l'Omnichat — non registrava affatto.

   Qui la registrazione è UNA, e chi aggiunge un motore domani la trova già
   fatta: gli basta dire chi è.

   ⚠️ SI MISURA IL GESTO, MAI IL CONTENUTO. Chi ha chiesto, quando, quanto
   spesso, da quale sezione, quanto è costato. Mai il testo della domanda o
   della risposta, mai il titolo della conversazione, e mai «l'argomento» —
   che sembra innocuo e non lo è, perché per produrlo bisogna leggere.
   L'assistente vale quello che vale perché la gente ci mette dentro le cose
   vere, e le mette solo finché è sicura che nessuno le legge. Un pannello che
   mostrasse di cosa si parla ucciderebbe in un mese la cosa che deve far
   crescere, e i grafici continuerebbero a salire mentre il valore sparisce.
*/
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { modelloAi } from "@/lib/ai/modelli";

/** Da dove viene la spesa. Aggiungendo un motore, si aggiunge qui. */
export type SezioneAi =
    | "assistente"        // la chat personale
    | "triage_whatsapp"   // classifica le chat, gira da solo
    | "triage_email"      // classifica la posta, gira da solo
    | "omnichat";         // recap e risposte suggerite, chiesti da una persona

/* ⚠️ IL CAMBIO, CONGELATO SU OGNI RIGA. Il fornitore fattura in dollari e Luca
   ragiona in euro. Sta qui e non in una tabella perché cambia di poco e di
   rado: si aggiorna a mano quando serve, e le righe già scritte conservano il
   cambio del loro giorno — altrimenti un mese vecchio cambierebbe valore ogni
   volta che si muove la valuta. */
const CAMBIO_USD_EUR = 0.92;

export type Consumo = {
    sezione: SezioneAi;
    /** il dettaglio dentro la sezione: 'domanda', 'classifica_chat', 'recap' */
    funzione?: string;
    /** è girata da sola? I triage sì, l'assistente no. */
    automatica: boolean;
    modello: string;
    /** quante chiamate al modello stanno in questa riga (il triage ne accorpa) */
    chiamate?: number;
    tokenIn: number;
    tokenOut: number;
    tokenInCache?: number;
    tokenRagionamento?: number;
    /** chi ha chiesto, se l'ha chiesto qualcuno */
    userId?: string | null;
    negozio?: string | null;
    ruolo?: string | null;
    /** su quale numero / casella / persona si è speso */
    utenza?: { tipo: "utente" | "numero_wa" | "casella_email"; id: string; label: string } | null;
    durataMs?: number;
    strumenti?: number;
    passaggi?: number;
    esito?: "ok" | "errore" | "troncata" | "senza_credito";
    /** ⚠️ un CODICE, non il messaggio del fornitore: quello si porta dietro
     *  300 caratteri del corpo della richiesta, cioè della domanda. */
    codiceErrore?: string | null;
    /** l'id della conversazione: qui dentro diventa un'impronta e non torna
     *  più indietro — serve a contare, non a ritrovare. */
    conversazione?: string | null;
};

/** Trasforma un errore qualunque in un codice buono da mettere in tabella. */
export function codiceErrore(e: unknown): string {
    const t = String((e as Error)?.message || e || "").toLowerCase();
    if (t.includes("402") || t.includes("insufficient balance")) return "senza_credito";
    if (t.includes("429")) return "troppo_traffico";
    if (t.includes("timeout") || t.includes("abort")) return "timeout";
    const http = t.match(/\b(4\d\d|5\d\d)\b/);
    if (http) return "http_" + http[1];
    if (t.includes("fetch") || t.includes("network")) return "rete";
    return "altro";
}

const impronta = (s: string) => createHash("sha256").update("tf:" + s).digest("hex").slice(0, 32);

/** Scrive una riga di consumo. Non alza mai eccezioni: se il registro non
 *  funziona, il lavoro dell'utente non si ferma per questo. */
export async function registraConsumo(c: Consumo): Promise<void> {
    try {
        const m = modelloAi(c.modello);
        const costoUsd = (c.tokenIn / 1e6) * m.prezzo.in + (c.tokenOut / 1e6) * m.prezzo.out;
        await supabaseAdmin.from("ai_usage").insert({
            sezione: c.sezione,
            funzione: c.funzione ?? null,
            automatica: c.automatica,
            model: c.modello,
            chiamate: c.chiamate ?? 1,
            prompt_tokens: c.tokenIn,
            completion_tokens: c.tokenOut,
            token_in_cache: c.tokenInCache ?? null,
            token_ragionamento: c.tokenRagionamento ?? null,
            user_id: c.userId ?? null,
            negozio: c.negozio ?? null,
            ruolo: c.ruolo ?? null,
            utenza_tipo: c.utenza?.tipo ?? null,
            utenza_id: c.utenza?.id ?? null,
            utenza_label: c.utenza?.label ?? null,
            // il listino si congela sulla riga: fra sei mesi il conto si rifà
            prezzo_in_mtok: m.prezzo.in,
            prezzo_out_mtok: m.prezzo.out,
            cost_usd: costoUsd,
            cambio_eur: CAMBIO_USD_EUR,
            costo_eur: costoUsd * CAMBIO_USD_EUR,
            latency_ms: c.durataMs ?? null,
            tool_calls: c.strumenti ?? null,
            passaggi: c.passaggi ?? null,
            ok: (c.esito ?? "ok") === "ok",
            esito: c.esito ?? "ok",
            codice_errore: c.codiceErrore ?? null,
            conversazione_hash: c.conversazione ? impronta(c.conversazione) : null,
        });
    } catch (e) {
        // il registro che non scrive è un guaio, ma silenzioso non deve esserlo:
        // è così che i media di WhatsApp sono spariti per tre giorni
        console.error("[consumi-ai] non sono riuscito a registrare:", String((e as Error)?.message || e));
    }
}
