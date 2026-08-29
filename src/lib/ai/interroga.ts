/**
 * L'ASSISTENTE INTERROGA IL DATABASE (Luca 29/08).
 *
 * «Mi piacerebbe che l'AI avesse contesto pieno sul CRM. Non capisco perché
 *  dobbiamo creare uno schema definito.»
 *
 * Aveva ragione: scrivere un tool a mano per ogni domanda non scala e
 * invecchia. Qui invece l'assistente esplora e chiede, come farebbe una
 * persona che apre il database.
 *
 * NON SI DÀ TUTTO IN PASTO AL MODELLO. Sono 173 tabelle e 1813 colonne: una
 * mappa completa nel prompt sarebbero tredicimila caratteri a OGNI domanda,
 * pagati sempre e usati quasi mai. Si fa in tre mosse, come si farebbe a mano:
 *   1. che tabelle ci sono         → `elenco_tabelle`
 *   2. cosa c'è dentro questa      → `descrivi_tabella`
 *   3. la domanda vera             → `interroga`
 *
 * LA SICUREZZA STA IN DUE POSTI, e vale la pena sapere quale fa cosa:
 *   · IL DATABASE garantisce che non si scrive e che certe tabelle non si
 *     aprono proprio (password, caselle di posta, chiavi dei servizi): la
 *     funzione `ai.interroga` gira come un ruolo che sa solo leggere, e a cui
 *     quelle tabelle non sono concesse. Nessun errore dell'applicazione può
 *     aggirarlo.
 *   · IL CODICE, qui sotto, toglie le RIGHE dei negozi che l'utente non vede e
 *     le COLONNE che il suo ruolo non può leggere. Si filtrano i RISULTATI,
 *     non la query: qualunque cosa il modello abbia scritto — anche un
 *     «select *» — quello che non deve vedere sparisce prima che lo veda.
 */
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import type { Scope } from "./scope";
import { filtraColonne, TABELLE_VIETATE } from "./permessiDati";
import { sameStore } from "@/lib/negoziNomi";

const MAX_RIGHE = 300;

/* A COSA SERVONO LE TABELLE CHE CONTANO. Il nome da solo non basta: «calls»
   sembrano le telefonate e invece sono le pratiche del call center, e
   «contracts» tiene dentro anche la marginalità, che una vendita non è.
   Le altre 150 il modello se le scopre da sé con `elenco_tabelle`. */
const A_COSA_SERVE: Record<string, string> = {
    contracts: "le VENDITE. Attenzione: le righe con id EXT- sono voci di marginalità (accessori, SIM, kasko), NON vendite di brand — quelle sono le CTR-. `negozio` è il punto vendita, `data` il giorno della vendita.",
    calls: "le PRATICHE del call center (non le telefonate). `stato` è la lavorazione, `storico` è un elenco JSON di tutto quello che è successo, `caller` è chi la lavora.",
    call_events: "le telefonate vere di Aircall: quando, in che verso, se ha risposto.",
    appointments: "gli APPUNTAMENTI in negozio. `type='richiamo'` NON è un appuntamento, è un promemoria del call center. `status` è l'esito.",
    clients: "l'anagrafica dei clienti.",
    app_users: "le persone che usano il CRM: nome, ruolo, negozio principale.",
    stores: "i punti vendita.",
    user_stores: "dove lavora ciascuno.",
    user_store_visibility: "quali negozi vede ciascuno, oltre ai suoi.",
    caller_malus: "le penali dei caller. `eliminato=true` vuol dire annullata.",
    caller_regole: "le regole che fanno nascere le penali, per stato.",
    caller_opzioni: "gli stati del caller e il loro `comportamento` (appuntamento, richiamo, non_risposto, neutro, definitivo).",
    usati: "i telefoni usati comprati e rivenduti.",
    calendar_tasks: "le task del calendario.",
    chat_messages: "la chat interna.",
    comunicazioni: "le comunicazioni aziendali.",
    pay_tabellare: "i punti che ogni voce vale nelle gare.",
    catalog_offerte: "le offerte a catalogo, per brand.",
    catalog_opzioni: "le opzioni delle offerte.",
};

/* LE REGOLE CHE NEI DATI NON CI SONO.
   Perché una cooperation non è salita non si vede guardando le tabelle: si
   vede applicando la regola. Senza queste righe il modello risponde in modo
   plausibile e sbagliato — che è il modo peggiore di sbagliare. */
export const REGOLE_DI_CASA = `
COME FUNZIONA IL CALL CENTER (regole che nei dati non si vedono):

· UNA VENDITA SI COLLEGA A UN APPUNTAMENTO solo se, QUANDO il cliente è andato
  in negozio, la pratica era già in stato appuntamento. Se l'appuntamento è
  stato creato DOPO la vendita, non vale: niente cooperation al caller.
· UN RICHIAMO NON È UN APPUNTAMENTO. Le righe di «appointments» con
  type='richiamo' sono promemoria del call center e non generano mai
  cooperation.
· LA FINESTRA: la vendita deve stare fra la data in cui l'appuntamento è stato
  PRESO (appointments.created_at) e la data dell'appuntamento più N giorni
  (N sta in caller_match_config.finestra_giorni, oggi 30).
· STESSO NEGOZIO → «Attivato» e cooperation al caller. ALTRO NEGOZIO →
  «Attivato Altro Negozio», l'appuntamento risulta convertito ma la
  cooperation non sale.
· I MALUS nascono dallo stato della pratica e dai giorni fermi (caller_regole).
  Gli stati con comportamento 'definitivo' non maturano penali.
· LA PRODUZIONE di un negozio: righe CTR- non annullate e non nascoste dalla
  gestione. Le EXT- sono marginalità, non vendite.

QUANDO SPIEGHI PERCHÉ QUALCOSA NON È SUCCESSO, ricostruisci la sequenza dallo
«storico» della pratica con gli orari, e di' quale condizione è saltata.`;

/** Le colonne che contengono un punto vendita, per il filtro delle righe. */
const COLONNE_NEGOZIO = ["negozio", "store", "negozio_appuntamento", "negozio_provenienza",
    "negozio_pertinenza", "store_acquisto", "punto_vendita"];

/** ELENCO — che tabelle ci sono, e quanto sono grosse. */
export async function elencoTabelle(): Promise<unknown> {
    const { data, error } = await supabase.rpc("ai_interroga", {
        q: `select c.relname as tabella, s.n_live_tup as righe
            from pg_stat_user_tables s join pg_class c on c.oid = s.relid
            where c.relnamespace = 'public'::regnamespace and s.n_live_tup > 0
            order by s.n_live_tup desc`,
    });
    if (error) throw new Error(error.message);
    const righe = (data as { tabella: string; righe: number }[] | null) || [];
    return righe
        .filter((r) => !TABELLE_VIETATE.has(r.tabella))
        .map((r) => ({ ...r, aCosaServe: A_COSA_SERVE[r.tabella] || undefined }));
}

/** DESCRIVI — le colonne di una tabella, con il tipo. */
export async function descriviTabella(tabella: string): Promise<unknown> {
    const t = String(tabella || "").replace(/[^a-z0-9_]/gi, "");
    if (!t) throw new Error("Manca il nome della tabella.");
    if (TABELLE_VIETATE.has(t)) throw new Error(`La tabella «${t}» non è consultabile.`);
    const { data, error } = await supabase.rpc("ai_interroga", {
        q: `select column_name as colonna, data_type as tipo, is_nullable as puo_essere_vuota
            from information_schema.columns
            where table_schema = 'public' and table_name = '${t}'
            order by ordinal_position`,
    });
    if (error) throw new Error(error.message);
    return { tabella: t, aCosaServe: A_COSA_SERVE[t] || undefined, colonne: data };
}

/** INTERROGA — la domanda vera, con i filtri applicati ai RISULTATI. */
export async function interroga(sql: string, scope: Scope): Promise<unknown> {
    const q = String(sql || "").trim();
    if (!q) throw new Error("Manca l'interrogazione.");

    // un controllo in più prima ancora del database: dà un errore leggibile
    for (const t of TABELLE_VIETATE) {
        if (new RegExp(`\\b${t}\\b`, "i").test(q)) {
            throw new Error(`La tabella «${t}» non è consultabile: contiene credenziali o chiavi.`);
        }
    }

    const { data, error } = await supabase.rpc("ai_interroga", { q });
    if (error) throw new Error(error.message);
    let righe = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
    const totaleGrezzo = righe.length;

    /* LE RIGHE: chi non vede tutti i negozi vede solo i suoi.
       ⚠️ Se la risposta non porta con sé una colonna del negozio non si può
       filtrare — e allora NON si tira a indovinare: si rifiuta e si dice al
       modello di rifare la domanda includendo il negozio. Meglio una domanda
       in più che una riga di un altro punto vendita. */
    let fuoriAmbito = 0;
    if (!scope.seesAll) {
        const campo = righe.length
            ? Object.keys(righe[0]).find((k) => COLONNE_NEGOZIO.includes(k.toLowerCase()))
            : null;
        if (righe.length && !campo) {
            throw new Error(
                "Questa persona vede solo alcuni punti vendita, quindi la risposta deve poter essere filtrata per negozio: "
                + "rifai l'interrogazione includendo la colonna del negozio (es. `negozio`) fra quelle selezionate, "
                + "e se stai contando raggruppa per negozio.");
        }
        if (campo) {
            const prima = righe.length;
            righe = righe.filter((r) =>
                scope.negozi.some((n) => sameStore(n, String(r[campo] ?? ""))) ||
                scope.stores.some((n) => sameStore(n, String(r[campo] ?? ""))));
            fuoriAmbito = prima - righe.length;
        }
    }

    // LE COLONNE: quelle che il ruolo non può leggere spariscono
    const { righe: pulite, tolte } = filtraColonne(righe.slice(0, MAX_RIGHE), scope.role);

    return {
        righe: pulite,
        quante: pulite.length,
        ...(totaleGrezzo > MAX_RIGHE ? { troncate: `mostrate ${MAX_RIGHE} di ${totaleGrezzo}` } : {}),
        ...(fuoriAmbito ? { righeFuoriDaiTuoiNegozi: fuoriAmbito } : {}),
        ...(tolte.length ? { colonneNascosteAlTuoRuolo: tolte } : {}),
        // la query si mostra sempre: una risposta che non si può verificare
        // non serve a niente
        interrogazione: q,
    };
}
