/**
 * CAPACITÀ PER SEZIONE (comportamenti) — estende la matrice Permessi oltre il
 * "vedo/non vedo": per ogni sezione con più modalità di funzionamento, il
 * COME si comporta per un ruolo si decide da Amministrazione → Utenti →
 * Permessi, senza codice (richiesta Luca 25/07).
 *
 * Stessa tabella dei permessi (role_permissions): una capacità è una riga con
 * chiave `cap:<sezione>:<capacità>` e valore booleano. Nessuna riga = default
 * di codice (il predicato `default(role)` fotografa il comportamento di oggi,
 * quindi a tabella vuota NIENTE cambia). A differenza della visibilità, qui
 * admin/dev NON sono forzati a true: una capacità seleziona un comportamento,
 * non blocca un accesso (es. l'admin non timbra il badge).
 *
 * Due forme:
 *  - "choice": modalità MUTUAMENTE ESCLUSIVE in ordine di priorità (vince la
 *    prima attiva; nessuna attiva = fallback). Es. ambito Clienti.
 *  - "flags": interruttori indipendenti. Es. Badge (timbra / supervisiona).
 *
 * Ogni personalizzazione futura di una sezione va REGISTRATA qui: la pagina
 * Permessi la rende amministrabile da sola.
 */

import { areaOf, seesAllStores, seesWholeStore, ROLES } from "@/lib/roles";
import type { PermMap } from "@/lib/nav";

export interface CapDef {
    id: string;
    label: string;
    desc: string;
    /** comportamento DI DEFAULT per un ruolo (replica del codice storico) */
    default: (role: string) => boolean;
    /** id di un'altra capacità dello STESSO gruppo che deve essere attiva:
     *  con quella spenta questa non conta nulla e nel pannello Permessi resta
     *  oscurata e non cliccabile (es. i destinatari delle Comunicazioni
     *  richiedono "può creare comunicazioni"). */
    requires?: string;
}

export interface CapGroupChoice {
    mode: "choice";
    section: string;        // chiave sezione (href della voce di menu)
    sectionLabel: string;
    caps: CapDef[];         // in ordine di priorità: vince la prima attiva
    fallback: { id: string; label: string; desc: string };
}
export interface CapGroupFlags {
    mode: "flags";
    section: string;
    sectionLabel: string;
    caps: CapDef[];
}
export type CapGroup = CapGroupChoice | CapGroupFlags;

export const capKey = (section: string, capId: string) => `cap:${section}:${capId}`;

/** Valore effettivo di una capacità: riga esplicita se c'è, altrimenti default. */
export function capAllowed(role: string | null | undefined, section: string, cap: CapDef, perms: PermMap | null): boolean {
    if (!role) return false;
    const row = perms?.get(capKey(section, cap.id));
    if (row !== undefined) return row;
    return cap.default(role);
}

/** Modalità vincente di un gruppo "choice" (id della prima attiva, o fallback). */
export function capChoice(role: string | null | undefined, group: CapGroupChoice, perms: PermMap | null): string {
    for (const c of group.caps) if (capAllowed(role, group.section, c, perms)) return c.id;
    return group.fallback.id;
}

// ─── CLIENTI: ambito di visibilità dell'anagrafica ───────────────────────────
// Oggi (fotografia del codice): amministrazione/direzione e ruoli fuori dai
// negozi vedono tutto; i ruoli di negozio vedono i clienti dei negozi in
// visibilità; il reparto outbound solo i propri (il direttore OB tutto il
// reparto — dettaglio che resta nel codice della pagina).
const RUOLI_NEGOZIO_CLIENTI = ["venditore", "store_manager", "tecnico", "direttore_commerciale"];
const RUOLI_PROPRI_CLIENTI = ["agente", "direttore_ob"];
// Il CALLER vede i clienti solo tramite gli appuntamenti che ha preso (Luca 26/07).
const RUOLI_APPUNTAMENTI_CLIENTI = ["caller"];

export const CAP_CLIENTI: CapGroupChoice = {
    mode: "choice",
    section: "/clienti",
    sectionLabel: "Clienti",
    caps: [
        {
            id: "tutti",
            label: "Tutti i clienti",
            desc: "Anagrafica completa, nessun cliente oscurato.",
            default: (r) => !RUOLI_NEGOZIO_CLIENTI.includes(r) && !RUOLI_PROPRI_CLIENTI.includes(r) && !RUOLI_APPUNTAMENTI_CLIENTI.includes(r),
        },
        {
            id: "negozi",
            label: "Clienti dei negozi in visibilità",
            desc: "Per intero i clienti acquisiti o gestiti dai negozi visibili all'utente; gli altri oscurati con accesso su richiesta.",
            default: (r) => RUOLI_NEGOZIO_CLIENTI.includes(r),
        },
        {
            id: "appuntamenti",
            label: "Clienti con appuntamento preso",
            desc: "Per intero solo i clienti per cui l'utente ha FISSATO un appuntamento (aggancio per CF o cellulare); gli altri oscurati con accesso su richiesta.",
            default: (r) => RUOLI_APPUNTAMENTI_CLIENTI.includes(r),
        },
    ],
    fallback: {
        id: "propri",
        label: "Solo i propri clienti",
        desc: "Per intero solo i clienti inseriti dall'utente (il direttore outbound: tutto il reparto); gli altri oscurati con accesso su richiesta.",
    },
};

// ─── BADGE (Collaboratori): modalità della sezione ───────────────────────────
// SPOSTATA da /collaboratori?tab=badge all'hub Call Center (Luca 28/07):
// le righe cap:* esistenti sono state MIGRATE alla nuova chiave (mig. 096).
export const BADGE_SECTION = "/caller?tab=badge";
// MOD-11b (Luca 10/08): i profili sono le COMBINAZIONI di questi interruttori.
//   · solo Timbratura                  → OPERATORE: badge grande + i suoi KPI/storico
//   · Timbratura + Supervisione        → DIRETTORE: stessa vista dell'amministrativo
//                                        + barra badge compatta per timbrare
//   · solo Supervisione                → AMMINISTRATIVO: vista team, nessun badge
//   · Corregge i turni                 → extra a parte (default: amministrazione)
export const CAP_BADGE_TIMBRA: CapDef = {
    id: "timbra",
    label: "Timbratura (operatore)",
    desc: "Badgia i turni. Da sola: card grande Inizia/Pausa/Fine con KPI e storico personali. Insieme a Supervisione: barra di timbratura compatta sopra la vista team (profilo direttore).",
    default: (r) => areaOf(r) === "cc",
};
export const CAP_BADGE_TEAM: CapDef = {
    id: "vede_team",
    label: "Supervisione presenze",
    desc: "La vista team completa (identica per direttore e amministrativo): quadri live della giornata, contatori, turni in corso e Storico presenze con filtri ed export. Da sola = profilo amministrativo (nessun badge). NON permette di modificare i turni: serve l'interruttore a parte.",
    default: (r) => (seesAllStores(r) || seesWholeStore(r)) && r !== "back_office_caller",
};
// Correzione/eliminazione dei turni e chiusura forzata (Luca 05/08): prima era
// codice fisso "amministrativo in su" — il direttore del telefonico vede tutto
// ma non tocca (default giusto), pero' ora si puo' abilitare dalla rotellina.
export const CAP_BADGE_CORREGGE: CapDef = {
    id: "corregge_turni",
    label: "Corregge i turni",
    desc: "Può correggere entrata/uscita, eliminare turni e forzare la chiusura dei turni dimenticati aperti. Default: amministrazione e direzione generale.",
    default: (r) => ["amministrativo", "admin", "dev", "direttore_generale"].includes(r),
    requires: "vede_team",
};
// CHIUSURA FORZATA scorporata dalla correzione (Luca 24/08 sera): il
// direttore del call center chiude i turni dimenticati aperti dei suoi,
// SENZA poter correggere entrate/uscite o eliminare turni.
export const CAP_BADGE_FORZA_CHIUSURA: CapDef = {
    id: "forza_chiusura",
    label: "Forza la chiusura dei turni",
    desc: "Può chiudere forzatamente un turno dimenticato aperto (niente correzioni né eliminazioni). Default: amministrazione, direzione generale e direzione call center.",
    default: (r) => ["amministrativo", "admin", "dev", "direttore_generale", "direttore_cc"].includes(r),
    requires: "vede_team",
};
export const CAP_BADGE: CapGroupFlags = {
    mode: "flags",
    section: BADGE_SECTION,
    sectionLabel: "Badge (Call Center)",
    caps: [CAP_BADGE_TIMBRA, CAP_BADGE_TEAM, CAP_BADGE_CORREGGE, CAP_BADGE_FORZA_CHIUSURA],
};

// ─── CLIENTI: funzioni aggiuntive della scheda ───────────────────────────────
export const CAP_CLIENTI_ALLEGATI: CapDef = {
    id: "vede_allegati",
    label: "Allegati del cliente",
    desc: "Nella scheda cliente vede la sezione Documenti e PDA caricati (documenti, contratti, fatture).",
    default: () => true,   // oggi la vede chiunque apra la scheda
};
export const CAP_CLIENTI_INTEGRA_DOC: CapDef = {
    id: "integra_documenti",
    label: "Integra documenti",
    desc: "Nella scheda cliente può CARICARE i documenti mancanti sui contratti già registrati (mai eliminare quelli esistenti). Regola Luca 31/07: di default solo i ruoli del punto vendita da store manager in su.",
    default: (r) => ["store_manager", "direttore_commerciale", "amministrativo", "admin", "dev", "direttore_generale"].includes(r),
};
// Chi può ASCOLTARE l'audio delle chiamate (Luca 04/08): amministrabile dalla
// rotellina — lo storico chiamate senza audio resta visibile a chi vede il
// cliente/negozio. Il default replica la regola "store manager in su + call
// center" nata con il Registro Chiamate.
export const CAP_CLIENTI_REGISTRAZIONI: CapDef = {
    id: "ascolta_registrazioni",
    label: "Ascolta le registrazioni",
    desc: "Player e download dell'audio delle chiamate (timeline e storico cliente, Registro Chiamate, Caller). Spenta: vede lo storico chiamate senza audio. Default: store manager in su + ruoli del call center.",
    default: (r) => [
        "store_manager", "supervisore", "direttore_commerciale",
        "direttore_cc", "direttore_ob", "back_office_caller", "caller",
        "amministrativo", "direttore_generale", "admin", "dev",
    ].includes(r),
};
export const CAP_CLIENTI_EXTRA: CapGroupFlags = {
    mode: "flags",
    section: "/clienti",
    sectionLabel: "Clienti — funzioni",
    caps: [CAP_CLIENTI_ALLEGATI, CAP_CLIENTI_INTEGRA_DOC, CAP_CLIENTI_REGISTRAZIONI],
};

// ─── GESTIONE USATO: rotellina della sezione (Luca 31/07) ────────────────────
// Il CRM si rivende: chi lavora il laboratorio, chi vede tempi/malus e chi
// vede i costi sono SCELTE per ruolo, non regole scolpite nel codice.
export const CAP_USATO_LAVORA: CapDef = {
    id: "lavora_usato",
    label: "Lavora l'usato (laboratorio)",
    desc: "Gestisce il telefono nelle fasi di laboratorio: ricezione, lavorazione, ricambi, pronto e invio al negozio. Per il ruolo Tecnico serve comunque il grado Senior.",
    default: (r) => r === "tecnico",
};
export const CAP_USATO_MALUS: CapDef = {
    id: "vede_malus_usato",
    label: "Tempi e malus del laboratorio",
    desc: "Vede scadenze, contatori e storico malus del laboratorio (regole in Amministrazione → Regole Usato).",
    default: (r) => ["tecnico", "amministrativo", "admin", "dev", "direttore_generale"].includes(r),
};
export const CAP_USATO_COSTI: CapDef = {
    id: "vede_costi_usato",
    label: "Costi di acquisto e riparazione",
    desc: "Vede il prezzo di acquisto e i costi ricambi/riparazione dei dispositivi usati (tabella, scheda e bonifici). Regola Luca 31/07: di default solo dall'amministrativo in su.",
    default: (r) => ["amministrativo", "admin", "dev", "direttore_generale"].includes(r),
};
export const CAP_USATO: CapGroupFlags = {
    mode: "flags",
    section: "/usati",
    sectionLabel: "Gestione Usato",
    caps: [CAP_USATO_LAVORA, CAP_USATO_MALUS, CAP_USATO_COSTI],
};

// ─── CALLER: rotellina della sezione (Luca 24/08) ────────────────────────────
// L'audio delle chiamate DENTRO lo storico lavorazioni della pratica e' una
// concessione a parte: di default la sente SOLO l'admin, ogni altro ruolo o
// persona si accende da qui (il player degli altri posti — Clienti, Registro
// Chiamate — resta governato dalla capability della rotellina Clienti).
export const CAP_CALLER_REG_STORICO: CapDef = {
    id: "registrazioni_storico",
    label: "Ascolta le chiamate dallo storico lavorazioni",
    desc: "Player e download della registrazione sulle voci «Chiamata Aircall» dentro lo storico lavorazioni della pratica caller. Default: solo admin.",
    default: (r) => r === "admin",
};
export const CAP_CALLER: CapGroupFlags = {
    mode: "flags",
    section: "/caller",
    sectionLabel: "Caller",
    caps: [CAP_CALLER_REG_STORICO],
};

// ─── FERIE (Collaboratori): maschera della sezione ───────────────────────────
// Luca 27/07: store manager e direttore commerciale vedevano la maschera del
// team; devono avere quella del consulente (solo le PROPRIE richieste). Qui il
// default NON fotografa il codice storico ma la nuova regola: gestione al solo
// pacchetto approvatori — ogni altro ruolo si riaccende dalla rotellina.
export const FERIE_SECTION = "/collaboratori?tab=ferie";
export const CAP_FERIE_GESTIONE: CapDef = {
    id: "gestione_team",
    label: "Gestione team",
    desc: "Registro richieste di tutto il team, calendario ferie, filtri, approva/rifiuta ed export per il commercialista. Spenta: il ruolo vede e fa solo le proprie richieste.",
    default: (r) => ["amministrativo", "admin", "dev", "direttore_generale"].includes(r),
};
export const CAP_FERIE: CapGroupFlags = {
    mode: "flags",
    section: FERIE_SECTION,
    sectionLabel: "Ferie",
    caps: [CAP_FERIE_GESTIONE],
};

// ─── COMUNICAZIONI: chi puo' crearle e verso quali ruoli (Luca 30/07) ────────
// "crea" accende il pulsante Nuova comunicazione; i destinatari possibili sono
// tutti i ruoli (verso_tutti) oppure SOLO quelli spuntati (verso_<ruolo>) —
// es. lo store manager puo' essere abilitato solo verso i ruoli del negozio.
const CREA_COM_DEFAULT = ["amministrativo", "admin", "dev", "direttore_generale"];
export const CAP_COM_CREA: CapDef = {
    id: "crea",
    label: "Può creare comunicazioni",
    desc: "Mostra il pulsante Nuova comunicazione: bacheca (campanella + letture) o pop-up con conferma.",
    default: (r) => CREA_COM_DEFAULT.includes(r),
};
export const CAP_COM_VERSO_TUTTI: CapDef = {
    id: "verso_tutti",
    label: "Destinatari: tutti i ruoli",
    desc: "Può indirizzare le comunicazioni a chiunque. Spenta: valgono solo i ruoli spuntati qui sotto.",
    default: (r) => CREA_COM_DEFAULT.includes(r),
    requires: "crea",
};
export const CAP_COMUNICAZIONI: CapGroupFlags = {
    mode: "flags",
    section: "/comunicazioni",
    sectionLabel: "Comunicazioni",
    caps: [
        CAP_COM_CREA,
        CAP_COM_VERSO_TUTTI,
        ...ROLES.flatMap((r): CapDef[] => [
            {
                id: `verso_${r.id}`,
                label: `Destinatari: ${r.label}`,
                desc: `Può indirizzare comunicazioni al ruolo ${r.label} (conta solo con "tutti i ruoli" spenta).`,
                default: () => false,
                requires: "crea",
            },
            // AMBITO (Luca 31/07): accesa = le comunicazioni verso questo ruolo
            // raggiungono SOLO le persone dei negozi visibili del mittente
            // (assegnati + visibilità + sede di login); alla creazione il
            // ruolo viene RISOLTO nelle persone reali (target_users), quindi
            // a database non resta mai un target di ruolo "aperto".
            {
                id: `verso_${r.id}_ambito`,
                label: `↳ ${r.label}: solo il suo ambito`,
                desc: `Le comunicazioni verso ${r.label} raggiungono solo le persone dei negozi che il mittente vede. Spenta: tutti i ${r.label} dell'azienda.`,
                default: () => false,
                requires: `verso_${r.id}`,
            },
        ]),
    ],
};

/** true se le comunicazioni di `role` verso il ruolo `destRole` sono limitate
 *  al SUO ambito (persone dei negozi visibili del mittente) — Luca 31/07. */
export function destinatarioSoloAmbito(role: string | null | undefined, destRole: string, perms: PermMap | null): boolean {
    if (!role) return false;
    return capAllowed(role, CAP_COMUNICAZIONI.section, { id: `verso_${destRole}_ambito`, label: "", desc: "", default: () => false }, perms);
}

/** Ruoli verso cui `role` puo' indirizzare una comunicazione (id da roles.ts). */
export function ruoliDestinatariComunicazioni(role: string | null | undefined, perms: PermMap | null): string[] {
    if (!role || !capAllowed(role, CAP_COMUNICAZIONI.section, CAP_COM_CREA, perms)) return [];
    if (capAllowed(role, CAP_COMUNICAZIONI.section, CAP_COM_VERSO_TUTTI, perms)) return ROLES.map((r) => r.id);
    return ROLES.filter((r) =>
        capAllowed(role, CAP_COMUNICAZIONI.section, { id: `verso_${r.id}`, label: "", desc: "", default: () => false }, perms)
    ).map((r) => r.id);
}

// ─── CHIUSURA LINEA: chi invia e chi gestisce (Luca 01/08) ───────────────────
// Due livelli decisi da Permessi: l'accesso SEMPLICE (inviare e seguire le
// proprie disdette) e la GESTIONE (tabella globale con Gestita/Rigetta).
export const CAP_DISDETTE_INVIA: CapDef = {
    id: "invia",
    label: "Invia disdette (accesso semplice)",
    desc: "Modulo di invio e dashboard delle proprie richieste (lo store manager vede anche quelle del team). Spenta = pagina in sola consultazione.",
    default: () => true,
};
export const CAP_DISDETTE_GESTISCE: CapDef = {
    id: "gestisce",
    label: "Gestisce le disdette (vista direzione)",
    desc: "Tabella globale di tutte le richieste con ordinamento a urgenza e azioni Segna Gestita / Rigetta con motivo. Chi gestisce può anche inviare. Default: direttore commerciale in su e amministrazione.",
    default: (r) => ["admin", "dev", "direttore_generale", "direttore_commerciale", "amministrativo"].includes(r),
};
export const CAP_DISDETTE: CapGroupFlags = {
    mode: "flags",
    section: "/chiusura-linea",
    sectionLabel: "Chiusura Linea",
    caps: [CAP_DISDETTE_INVIA, CAP_DISDETTE_GESTISCE],
};

// ─── PASSWORD: chi modifica e aggiunge (Luca 03/08) ──────────────────────────
// La consultazione resta decisa dalla visibilità della voce; QUI si decide chi
// puo' anche cambiare e aggiungere credenziali e categorie.
export const CAP_PASSWORD_MODIFICA: CapDef = {
    id: "modifica",
    label: "Modifica e aggiunge password",
    desc: "Può creare, modificare ed eliminare credenziali e categorie. Spenta: la sezione resta in sola consultazione. Default (Luca 03/08): dallo Store Manager in su.",
    default: (r) => ["store_manager", "direttore_commerciale", "amministrativo", "direttore_generale", "admin", "dev"].includes(r),
};
// SEC-02 (Luca 04/08): lo storico modifiche nell'ultimo passo della sezione.
// Della password si registra SOLO che è cambiata (mai il valore, nemmeno
// mascherato); i campi non segreti mostrano vecchio → nuovo.
export const CAP_PASSWORD_STORICO: CapDef = {
    id: "storico",
    label: "Vede lo storico modifiche",
    desc: "Nell'ultimo passo (dopo brand e categoria) vede chi ha creato, modificato o eliminato credenziali e quando. Della password appare solo che è cambiata, mai il valore. Default (Luca 04/08): dallo Store Manager in su.",
    default: (r) => ["store_manager", "direttore_commerciale", "amministrativo", "direttore_generale", "admin", "dev"].includes(r),
};
export const CAP_PASSWORD: CapGroupFlags = {
    mode: "flags",
    section: "/password-v2",
    sectionLabel: "Password",
    caps: [CAP_PASSWORD_MODIFICA, CAP_PASSWORD_STORICO],
};

// ─── TRACKING PDA: chi lavora l'esito admin (rotellina, Luca 25/08) ──────────
// Prima era codice fisso «amministrativo in su», nato quando il pannello
// Permessi non esisteva ancora (stesso percorso di CAP_BADGE_CORREGGE). La
// capacità governa SOLO il pulsante «⚡ Da lavorare» e la scheda Admin della
// pratica (l'esito amministrativo con nota che chiude il ciclo). Per direttiva
// esplicita di Luca (25/08 sera) NON concede nulla di distruttivo: la
// compensazione dei malus resta all'amministrazione, eliminare pratiche e
// malus resta admin/dev. Il default fotografa il codice storico: a tabella
// vuota NON cambia nulla.
export const CAP_TRACKING_ESITO_ADMIN: CapDef = {
    id: "esito_admin",
    label: "Lavora l'esito admin (⚡ Da lavorare)",
    desc: "Vede il pulsante «⚡ Da lavorare» con le pratiche in attesa di verifica e mette l'esito amministrativo con nota dalla scheda Admin. Dentro il Tracking la platea è completa: le pratiche di TUTTI i punti vendita (la visibilità negozi delle altre sezioni non cambia). Non concede altro: compensazione malus ed eliminazioni restano all'amministrazione. Default: amministrazione e direzione generale.",
    default: (r) => ["amministrativo", "admin", "dev", "direttore_generale"].includes(r),
};
export const CAP_TRACKING: CapGroupFlags = {
    mode: "flags",
    section: "/pda/tracking",
    sectionLabel: "Tracking PDA",
    caps: [CAP_TRACKING_ESITO_ADMIN],
};

/** Catalogo completo: la pagina Permessi lo rende amministrabile da solo.
 *  Piu' gruppi possono condividere la stessa sezione: l'ingranaggio li mostra
 *  impilati nello stesso pannello. */
// ─── RICERCA VENDITE: come si modificano le vendite (rotellina, Luca 04/08) ──
// "diretta" = salva subito e approva le richieste altrui; "richiesta" =
// comportamento storico (le modifiche passano dall'approvazione);
// "nessuna" = sola consultazione (niente modifica né eliminazione).
// ─── PRATICA NON VALIDA (Luca 27/08) ───────────────────────────────────────
// Dichiarare che una pratica non conta per commissioning e gare è un gesto
// che sposta soldi: lo fa chi ha il quadro completo. Per ora l'amministrazione
// e basta — ma è una spia, non una riga di codice: si sposta da qui.
export const CAP_RICERCA_NON_VALIDA: CapDef = {
    id: "non_valida",
    label: "Può dichiarare una pratica NON VALIDA",
    desc: "In Ricerca Vendite compare la ✗ viola accanto al cestino: dichiara che quella pratica non conta per il commissioning né per le gare, con una nota OBBLIGATORIA che resta nello storico e si legge da tutti nel dettaglio. Non elimina e non nasconde niente: la pratica resta, con scritto perché non vale e chi l'ha deciso. Default: amministrativo.",
    default: (r) => r === "amministrativo",
};
export const CAP_RICERCA_EXTRA: CapGroupFlags = {
    mode: "flags",
    section: "/ricerca-vendite",
    sectionLabel: "Ricerca Vendite",
    caps: [CAP_RICERCA_NON_VALIDA],
};

export const CAP_RICERCA_MODIFICA: CapGroupChoice = {
    mode: "choice",
    section: "/ricerca-vendite",
    sectionLabel: "Ricerca Vendite",
    caps: [
        {
            id: "diretta",
            label: "Modifica diretta",
            desc: "Le modifiche e le eliminazioni si applicano subito, senza approvazione; vede e approva le richieste degli altri.",
            default: (r) => ["amministrativo", "admin", "dev", "direttore_generale"].includes(r),
        },
        {
            id: "nessuna",
            label: "Sola consultazione",
            desc: "Vede le vendite ma non può proporre modifiche né eliminazioni.",
            default: () => false,
        },
    ],
    // "richiesta" vive SOLO come fallback (pattern CAP_CLIENTI/"propri"): se
    // stesse anche in caps il radio della rotellina la mostrerebbe due volte.
    fallback: {
        id: "richiesta",
        label: "Modifica con autorizzazione",
        desc: "Le modifiche e le eliminazioni diventano richieste per l'amministrazione e si applicano solo dopo l'approvazione.",
    },
};

// ─── CALENDARIO: ambito di visibilità degli appuntamenti (rotellina, 05/08) ──
// Caso Alex Coviello (back office): vedeva TUTTI gli appuntamenti del call
// center — ora il back office parte da "solo i propri" e l'ambito si decide
// dalla rotellina. La priorità replica il codice storico del calendario.
export const CAP_CALENDARIO_VISTA: CapGroupChoice = {
    mode: "choice",
    section: "/calendario",
    sectionLabel: "Calendario",
    caps: [
        {
            id: "tutti",
            label: "Tutto il calendario",
            desc: "Vede ogni appuntamento di ogni negozio e reparto, con tutti i filtri (punto vendita, consulente, fissato da).",
            default: (r) => ["admin", "dev", "direttore_generale", "amministrativo"].includes(r),
        },
        {
            id: "call_center",
            label: "Appuntamenti del call center",
            desc: "I propri più tutti quelli fissati dallo staff del call center (per chi lo dirige).",
            default: (r) => r === "direttore_cc",
        },
        {
            id: "negozio",
            label: "Propri + negozio",
            desc: "I propri (fissati da lui o a lui assegnati) più gli appuntamenti in negozio dei punti vendita in visibilità.",
            // fotografia del codice storico per tutti gli altri ruoli; il back
            // office caller ne resta FUORI (Luca 05/08: vede solo i suoi)
            default: (r) => r !== "back_office_caller",
        },
    ],
    // "propri" solo come fallback (pattern CAP_RICERCA_MODIFICA): niente
    // doppioni nel radio della rotellina.
    fallback: {
        id: "propri",
        label: "Solo i propri",
        desc: "Vede soltanto gli appuntamenti che ha fissato lui o che gli sono assegnati come consulente.",
    },
};

// ─── CALENDARIO: ambito di visibilità delle TASK (rotellina, Luca 05/08) ─────
// «Nei permessi non c'è la visibilità delle task: oggi è legata a quella del
// calendario ma devono essere due cose diverse.» Stessa section "/calendario"
// (i due gruppi si impilano nello stesso pannello ⚙️, pattern CAP_CLIENTI +
// CAP_CLIENTI_EXTRA) ma id con prefisso task_: la chiave in role_permissions
// è cap:<section>:<id> e senza prefisso colliderebbe con quelle della VISTA.
// FOTOGRAFIA del codice storico (a tabella vuota NON cambia nulla): chi aveva
// la vista appuntamenti "tutti" (admin/dev/DG/amministrativo) vedeva TUTTE le
// task; ogni altro ruolo vedeva le proprie (assegnate a lui o create da lui)
// più quelle assegnate ai punti vendita in visibilità.
export const CAP_CALENDARIO_TASK: CapGroupChoice = {
    mode: "choice",
    section: "/calendario",
    sectionLabel: "Calendario — task",
    caps: [
        {
            id: "task_tutte",
            label: "Tutte le task",
            desc: "Vede ogni task di ogni persona e punto vendita, con i filtri e l'elenco completo delle arretrate.",
            default: (r) => ["admin", "dev", "direttore_generale", "amministrativo"].includes(r),
        },
        {
            id: "task_negozio",
            label: "Proprie + negozio",
            desc: "Le proprie (assegnate a lui o create da lui) più le task assegnate ai punti vendita in visibilità.",
            // fotografia: oggi vale per tutti i ruoli senza vista completa
            default: () => true,
        },
        // SCELTA ESPLICITA (Luca 27/08: «a prescindere dai negozi in
        // visibilità, sul calendario vede solo le SUE cose»): prima era
        // raggiungibile solo spegnendo le altre due — ora è una voce sua.
        {
            id: "task_proprie",
            label: "Solo le sue cose",
            desc: "A prescindere dai negozi in visibilità: solo le task assegnate a lei e quelle che lei ha assegnato ad altri (persone o negozi).",
            default: () => false,
        },
    ],
    fallback: {
        id: "task_proprie",
        label: "Solo le proprie",
        desc: "Vede soltanto le task assegnate a lui o create da lui; niente task di punto vendita.",
    },
};

// (Conto Economico: capacità rimosse insieme alla sezione — direttiva Luca
//  07/08; si ricreeranno col rifacimento post-input compensi/soglie/target.)

// (Riunioni/deck builder: sezione MESSA DA PARTE su task Luca 10/08 — "è
//  completamente diversa da quello che mi ero immaginato, la riprenderemo più
//  in là". Tolte pagina, API e capacità; la tabella riunione_deck e il motore
//  contoEconomico restano dormienti per la ripresa futura.)

// ─── PANNELLO WHATSAPP (Amministrazione → WhatsApp, Luca 25/08 notte): cosa
// può GESTIRE chi ha la sezione — i numeri personali (utenti/caller), quelli
// dei punti vendita, o entrambi. La VISIBILITÀ della sezione resta nella
// matrice Permessi; queste capacità decidono le azioni dentro il pannello
// (collega, riassegna, ricollega, disconnetti, elimina). Verifica live
// sempre concessa a chi vede la sezione (è sola diagnostica).
export const CAP_WA_UTENTI: CapDef = {
    id: "numeri_utenti",
    label: "Gestisce i numeri personali (utenti e caller)",
    desc: "Collega, riassegna, ricollega, disconnette ed elimina i numeri WhatsApp intestati alle PERSONE (caller compresi: ognuno il suo). Spenta = quei numeri restano in sola consultazione. Default: admin e dev.",
    default: (r) => ["admin", "dev"].includes(r),
};
export const CAP_WA_NEGOZI: CapDef = {
    id: "numeri_negozi",
    label: "Gestisce i numeri dei punti vendita",
    desc: "Collega (anche multi-negozio per i gemelli tipo Magliana), riassegna, ricollega, disconnette ed elimina i numeri WhatsApp dei NEGOZI, condivisi per visibilità. Spenta = quei numeri restano in sola consultazione. Default: admin e dev.",
    default: (r) => ["admin", "dev"].includes(r),
};
export const CAP_WHATSAPP_ADMIN: CapGroupFlags = {
    mode: "flags",
    section: "/amministrazione?sez=whatsapp",
    sectionLabel: "Pannello WhatsApp",
    caps: [CAP_WA_UTENTI, CAP_WA_NEGOZI],
};

// ─── PANNELLO EMAIL (Amministrazione → Email, Luca 26/08 — governance
// caselle): come per i numeri WhatsApp, le caselle email si collegano,
// riassegnano ed eliminano SOLO dal pannello amministrativo — i collaboratori
// le USANO dall'Inbox (leggere, rispondere, archiviare, cestinare) ma non
// possono più collegarle, scollegarle o eliminarle per sempre. Stesso schema
// a due domini del WhatsApp: caselle personali / caselle dei punti vendita.
export const CAP_EM_UTENTI: CapDef = {
    id: "caselle_utenti",
    label: "Gestisce le caselle personali (utenti)",
    desc: "Collega, riassegna, riprova la connessione ed elimina le caselle email intestate alle PERSONE. Spenta = quelle caselle restano in sola consultazione. Default: admin e dev.",
    default: (r) => ["admin", "dev"].includes(r),
};
export const CAP_EM_NEGOZI: CapDef = {
    id: "caselle_negozi",
    label: "Gestisce le caselle dei punti vendita",
    desc: "Collega, riassegna, riprova la connessione ed elimina le caselle email dei NEGOZI, condivise per visibilità. Spenta = quelle caselle restano in sola consultazione. Default: admin e dev.",
    default: (r) => ["admin", "dev"].includes(r),
};
export const CAP_EMAIL_ADMIN: CapGroupFlags = {
    mode: "flags",
    section: "/amministrazione?sez=email",
    sectionLabel: "Pannello Email",
    caps: [CAP_EM_UTENTI, CAP_EM_NEGOZI],
};

// ─── CHAT: chi vede la scheda OMNICHAT (Luca 26/08 sera) ────────────────────
// «Dammi la possibilità di dedicare la visibilità dell'Omnichat solo a chi
// dico io, e per ora lasciala aperta solo a me e a Francesco Latina, che
// continuiamo a lavorarci sopra.»
// È una scheda in costruzione dentro una pagina che i negozi usano tutto il
// giorno: finché non è finita, si accende persona per persona dalla rotellina
// invece di uscire per ruolo. Il default vale SOLO per admin e dev — chiunque
// altro la vede se e solo se Luca gliela accende (riga `user:<id>`).
// Le altre tre schede — chat interna, WhatsApp, email — non si toccano: questa
// capacità governa l'Omnichat e basta.
// ─── WHATSAPP SOTTO CODICE (Luca 27/08) ────────────────────────────────────
// «SOLO Sandra e Claudia devono avere un codice che quando aprono WhatsApp
// gli chiede, altrimenti non è possibile vederlo». Non sono due nomi scritti
// nel codice: è una capability, così domani si accende o si spegne a chiunque
// dalla stessa rotellina. Il codice se lo scelgono loro al primo ingresso e
// non è rileggibile da nessuno — nel database c'è solo l'impronta.
// la sezione è "/chat": WhatsApp non è una voce di menu a sé, si apre
// dalla Chat — e l'interruttore deve comparire dove Luca lo cerca
export const WA_SECTION = "/chat";
export const CAP_WA_CODICE: CapDef = {
    id: "codice",
    label: "Chiede un codice per aprire WhatsApp",
    desc: "Chi ha questa spia accesa, ogni volta che apre WhatsApp deve inserire un codice personale: senza, le conversazioni non si vedono. Il codice se lo sceglie da sé al primo ingresso e nessuno può rileggerlo (nemmeno l'admin): se lo dimentica lo si azzera e ne sceglie un altro. Cinque tentativi sbagliati bloccano per cinque minuti. Default: spenta per tutti.",
    default: () => false,
};

export const CAP_CHAT_OMNI: CapDef = {
    id: "omnichat",
    label: "Omnichat (in costruzione)",
    desc: "Nella Chat vede la quarta scheda «Omnichat»: la lista unificata dei tre canali, l'assistente AI che riassume la conversazione e suggerisce le risposte, e la scheda del contatto (valore generato, telefono a rate, cronologia). Spenta = restano le tre schede di sempre. Default: solo admin e dev, perché la sezione è ancora in lavorazione.",
    default: (r) => ["admin", "dev"].includes(r),
};
export const CAP_CHAT: CapGroupFlags = {
    mode: "flags",
    section: "/chat",
    sectionLabel: "Chat",
    caps: [CAP_CHAT_OMNI, CAP_WA_CODICE],
};



export const CAPABILITIES: CapGroup[] = [CAP_CLIENTI, CAP_CLIENTI_EXTRA, CAP_RICERCA_MODIFICA, CAP_RICERCA_EXTRA, CAP_CALENDARIO_VISTA, CAP_CALENDARIO_TASK, CAP_TRACKING, CAP_BADGE, CAP_CALLER, CAP_USATO, CAP_FERIE, CAP_COMUNICAZIONI, CAP_DISDETTE, CAP_PASSWORD, CAP_WHATSAPP_ADMIN, CAP_EMAIL_ADMIN, CAP_CHAT];
