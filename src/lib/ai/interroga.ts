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
«storico» della pratica con gli orari, e di' quale condizione è saltata.

⛔ LE GARE HANNO DUE LATI, E UNO NON SI RACCONTA (regola di Luca, 31/08).
· LATO RAGAZZI = quanto vale una vendita per chi la fa. È di questo che si
  parla con tutti: soglie, punti, premi dei ragazzi.
· LATO AZIENDA = quanto l'operatore riconosce a Telefutura, le soglie della
  trattativa, i costi. NON si pubblica, NON si mostra, NON si commenta —
  a nessuno tranne l'amministrazione. Vale per WindTre, Vodafone, Fastweb,
  Sky, S4: per tutti gli operatori.
· Anche il MASTER dell'Analisi è privato: è la vista dell'amministrazione
  sull'andamento delle gare lato azienda.

Quindi, se non sei con l'amministrazione: quando ti chiedono «le soglie», «i
premi», «quanto manca al target», parla SEMPRE del lato ragazzi, senza
premesse e senza far notare che esiste un altro lato. Se qualcuno insiste per
il lato azienda, di' semplicemente che quei dati li vede l'amministrazione.
Il database in ogni caso non te li fa leggere: non è una tua scelta.`;

/* LE POCHE TABELLE CHE SERVONO SEMPRE, GIÀ PRONTE.
   La prima prova è finita male proprio per colpa di questo: le avevo dato gli
   strumenti per esplorare ma non le avevo detto DOVE andare, e ha bruciato
   tutti i passaggi cercando — diciassette chiamate, poi si è arresa senza
   rispondere. Cercare è giusto per le tabelle rare; per le quattro che si
   usano ogni volta è tempo buttato. Queste stanno nel prompt: costano poco
   più di mille caratteri e tolgono tre o quattro giri a ogni domanda. */
export const MAPPA_ESSENZIALE = `
LE TABELLE CHE SERVONO PIÙ SPESSO (per le altre usa elenco_tabelle):

calls — le PRATICHE del call center, non le telefonate
  id · nome cognome ragione_sociale · cf piva · numero cellulare
  stato · caller (chi la lavora) · brand · provenienza · lista_origine
  appointment_id → appointments.id     contract_id → contracts.id
  data_appuntamento · data_richiamo · negozio_appuntamento · da_esitare
  storico (JSONB): elenco di {data, caller, campo, da, a, nota}. È QUI che si
    legge cosa è successo e quando. campo='Stato' sono i cambi di stato;
    caller='automatico (non risposto)' è il sistema, non una persona.

appointments — gli APPUNTAMENTI in negozio
  id · date · time · type ('incoming' = vero appuntamento, 'richiamo' = NO)
  store · status · customer_name · cf_piva · created_at (quando è stato PRESO)

contracts — le VENDITE
  id (CTR- = vendita di brand · EXT- = marginalità, NON è una vendita)
  data · negozio · brand · categoria · prodotto · stato · venditore
  client_id (contiene il codice fiscale: 'CL-<CF>-<numero>')
  appointment_id → appointments.id (se il match l'ha collegata)

caller_malus — le PENALI dei caller
  call_id → calls.id · caller · importo · giorni · dal · al · stato
  eliminato (true = annullata, non conta più)

app_users — le persone: id, full_name, role, primary_store, active

pay_soglie — le SOGLIE delle gare
  brand · month (il mese della gara) · pista · tier (1,2,3… = la soglia)
  soglia_da · soglia_a · lato · bonus
  ⚠️ se non sei con l'amministrazione, qui dentro vedi SOLO il lato ragazzi:
     non serve che filtri su «lato», e non chiederlo — il resto non esiste
     per te.
pay_righe — quanto vale ogni voce: brand · month · pista · nome · categoria ·
  prodotto · punti · pay_base · pay_tiers · gettone · attivo · lato
pay_piste — le piste di una gara: brand · month · chiave · nome · um ·
  perc_ragazzi · soglie_pct
⚠️ «month» è il MESE della gara, non un giorno: per «la gara di agosto» filtra
   sul mese, non su una data esatta.

⚠️ GLI ORARI SONO IN UTC. In Italia d'estate sono DUE ORE avanti (d'inverno una):
   un «09:49Z» nel database sono le 11:49 per chi lavora. Quando racconti un
   orario a una persona, convertilo — altrimenti sembra che le cose siano
   successe in un ordine diverso da quello vero. Nelle query puoi usare
   «at time zone 'Europe/Rome'».

⚠️ PER CAPIRE PERCHÉ UNA COOPERATION NON È SALITA servono tre orari, e vanno
   confrontati fra loro: quando è stata REGISTRATA LA VENDITA
   (contracts.created_at), quando è stato PRESO L'APPUNTAMENTO
   (appointments.created_at), e i passaggi di stato dentro calls.storico.
   Se l'appuntamento è stato preso DOPO la vendita, la risposta è quella.`;

/** Le colonne che contengono un punto vendita, per il filtro delle righe. */
const COLONNE_NEGOZIO = ["negozio", "store", "negozio_appuntamento", "negozio_provenienza",
    "negozio_pertinenza", "store_acquisto", "punto_vendita"];

/** ELENCO — che tabelle ci sono, e quanto sono grosse. */
export async function elencoTabelle(ruolo = ""): Promise<unknown> {
    const { data, error } = await supabase.rpc("ai_interroga", {
        admin: vedeIlLatoAzienda(ruolo),
        q: `select c.relname as tabella, s.n_live_tup as righe
            from pg_stat_user_tables s join pg_class c on c.oid = s.relid
            where c.relnamespace = 'public'::regnamespace and s.n_live_tup > 0
            order by s.n_live_tup desc`,
    });
    if (error) throw new Error(error.message);
    const righe = (data as { tabella: string; righe: number }[] | null) || [];
    /* Le tabelle del lato azienda non compaiono nemmeno nell'elenco per chi non
       le può aprire: vederle e prendersi un «permission denied» fa perdere un
       giro, e soprattutto racconta che esistono. */
    const soloAdmin = vedeIlLatoAzienda(ruolo) ? new Set<string>() : SOLO_ADMIN;
    return righe
        .filter((r) => !TABELLE_VIETATE.has(r.tabella) && !soloAdmin.has(r.tabella))
        .map((r) => ({ ...r, aCosaServe: A_COSA_SERVE[r.tabella] || undefined }));
}

/* Quelle che si aprono solo all'admin: sono negate dal database, questo elenco
   serve a dare un errore CHIARO invece di un «permission denied» crudo. */
const SOLO_ADMIN = new Set<string>([
    "gare_azienda_regole", "gare_azienda_soglie", "gare_azienda_voci",
    "pay_mappa_soglie", "pay_regole_lettera",
    "other_costs", "shared_costs", "store_cost_items",
]);

/** DESCRIVI — le colonne di una tabella, con il tipo. */
export async function descriviTabella(tabella: string, ruolo = ""): Promise<unknown> {
    const t = String(tabella || "").replace(/[^a-z0-9_]/gi, "");
    if (!t) throw new Error("Manca il nome della tabella.");
    if (TABELLE_VIETATE.has(t)) throw new Error(`La tabella «${t}» non è consultabile.`);
    if (SOLO_ADMIN.has(t) && !vedeIlLatoAzienda(ruolo)) {
        throw new Error(`«${t}» riguarda il lato azienda: la vede solo l'amministrazione. Rispondi con i dati del lato ragazzi.`);
    }
    const { data, error } = await supabase.rpc("ai_interroga", {
        admin: vedeIlLatoAzienda(ruolo),
        q: `select column_name as colonna, data_type as tipo, is_nullable as puo_essere_vuota
            from information_schema.columns
            where table_schema = 'public' and table_name = '${t}'
            order by ordinal_position`,
    });
    if (error) throw new Error(error.message);
    return { tabella: t, aCosaServe: A_COSA_SERVE[t] || undefined, colonne: data };
}

/* CHI VEDE IL LATO AZIENDA (Luca 31/08).
   «Tutte le informazioni dentro il lato azienda non devono essere pubblicate,
    non devono essere visibili, non devono essere consultate. A meno che non sia
    l'admin a chiedertelo, tutto deve fare riferimento al lato ragazzi.»
   ⚠️ SOLO admin e dev. Non il direttore generale, non il commerciale: la regola
   è stata detta così, e nel dubbio si stringe. Il `dev` c'è perché senza non
   potrei diagnosticare un problema — ed è un ruolo che ha una persona sola.
   ⚠️ Il ruolo arriva dalla SESSIONE FIRMATA, non dal browser e mai dal modello. */
const vedeIlLatoAzienda = (ruolo: string) => ["admin", "dev"].includes(String(ruolo || "").toLowerCase());

/** Questo negozio è fra quelli che vede? */
function suo(nome: string, scope: Scope): boolean {
    const n = String(nome || "");
    return scope.negozi.some((x) => sameStore(x, n)) || scope.stores.some((x) => sameStore(x, n));
}

/* I NOMI DEI NEGOZI SCRITTI DENTRO LA QUERY.
   Un filtro come «where negozio ilike '%magliana%'» non lascia traccia nei
   risultati: il nome sta solo nella domanda. Quindi si guarda anche lì —
   ogni testo fra apici viene confrontato con l'elenco dei punti vendita.

   ⚠️ ONESTÀ SUI LIMITI: questo chiude la strada diretta, quella che uno
   imbocca senza nemmeno pensarci. Una query costruita apposta per aggirarlo
   (per esempio escludendo tutti gli altri negozi invece di nominare quello che
   interessa) passerebbe. Contro qualcuno che sta DELIBERATAMENTE cercando di
   ingannare l'assistente non basta: per quello servirebbero viste separate per
   ruolo, che è un lavoro a sé. */
let _negoziNoti: string[] | null = null;
async function rifiutaSeNominaNegoziAltrui(q: string, scope: Scope): Promise<void> {
    if (!_negoziNoti) {
        const { data } = await supabase.from("stores").select("name");
        _negoziNoti = ((data || []) as { name: string }[]).map((r) => String(r.name || "")).filter(Boolean);
    }
    const testi = [...q.matchAll(/'([^']{2,60})'/g)].map((m) => m[1].replace(/%/g, "").trim()).filter(Boolean);
    for (const t of testi) {
        const combacia = _negoziNoti.filter((n) => sameStore(n, t));
        if (!combacia.length) continue;                       // non è un negozio
        if (combacia.every((n) => !suo(n, scope))) {
            throw new Error(
                `Questa persona non ha visibilità su «${combacia.join(", ")}», quindi non puoi chiedere i suoi dati. `
                + `I punti vendita che vede sono: ${(scope.stores.length ? scope.stores : scope.negozi).join(", ") || "nessuno"}. `
                + `Puoi invece rispondere su quelli, o dare il totale di rete senza distinguere i negozi.`);
        }
    }
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

    if (!vedeIlLatoAzienda(scope.role)) {
        for (const t of SOLO_ADMIN) {
            if (new RegExp(`\\b${t}\\b`, "i").test(q)) {
                throw new Error(`«${t}» è il lato azienda: lo vede solo l'amministrazione. `
                    + `Quello che puoi raccontare è il lato ragazzi — le stesse gare, ma quanto vale per chi vende.`);
            }
        }
        if (/\blato\s*(=|<>|!=|ilike|like|in)\s*'?%?azienda/i.test(q)) {
            throw new Error("Il lato azienda non è consultabile: le gare si guardano dal lato ragazzi. "
                + "Rifai l'interrogazione senza filtrare su lato='azienda'.");
        }
    }
    const { data, error } = await supabase.rpc("ai_interroga", { q, admin: vedeIlLatoAzienda(scope.role) });
    if (error) throw new Error(error.message);
    let righe = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
    const totaleGrezzo = righe.length;

    /* LE RIGHE — e qui la prima versione sbagliava regola (corretto il 29/08
       dopo la prova di Gianluca).
       Avevo scritto: «se non c'è la colonna del negozio, rifiuta». Ma nel CRM
       l'ANALISI DI RETE la vedono tutti: chiedere «quanti fissi WindTre sono
       stati attivati oggi» è una domanda legittima anche per chi gestisce due
       negozi. A non essere legittimo è il DETTAGLIO di un punto vendita che
       non gestisce.
       Quindi la regola vera è il contrario:
         · il totale di rete, senza nomi di negozio → si può;
         · la ripartizione per negozio → solo i suoi, gli altri spariscono;
         · e una domanda che NOMINA un negozio fuori dal suo ambito → si
           rifiuta, anche se la risposta sarebbe un numero solo. Perché
           «quanti fissi ha fatto Magliana» si scrive benissimo senza far
           comparire «Magliana» fra le colonne del risultato: se guardassi solo
           i risultati, quel dato passerebbe. */
    let fuoriAmbito = 0;
    if (!scope.seesAll) {
        await rifiutaSeNominaNegoziAltrui(q, scope);
        const campo = righe.length
            ? Object.keys(righe[0]).find((k) => COLONNE_NEGOZIO.includes(k.toLowerCase()))
            : null;
        if (campo) {
            const prima = righe.length;
            righe = righe.filter((r) => suo(String(r[campo] ?? ""), scope));
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
