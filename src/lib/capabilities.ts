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
export const CAP_BADGE_TIMBRA: CapDef = {
    id: "timbra",
    label: "Timbratura",
    desc: "Card Inizia/Pausa/Fine turno con timer, KPI personali e storico badgiate.",
    default: (r) => areaOf(r) === "cc",
};
export const CAP_BADGE_TEAM: CapDef = {
    id: "vede_team",
    label: "Supervisione presenze",
    desc: "Contatori team, turni in corso (con forza chiusura) e Storico presenze allargato con filtri, benchmark ed export.",
    default: (r) => (seesAllStores(r) || seesWholeStore(r)) && r !== "back_office_caller",
};
export const CAP_BADGE: CapGroupFlags = {
    mode: "flags",
    section: BADGE_SECTION,
    sectionLabel: "Badge (Call Center)",
    caps: [CAP_BADGE_TIMBRA, CAP_BADGE_TEAM],
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

/** Catalogo completo: la pagina Permessi lo rende amministrabile da solo.
 *  Piu' gruppi possono condividere la stessa sezione: l'ingranaggio li mostra
 *  impilati nello stesso pannello. */
// ─── RICERCA VENDITE: come si modificano le vendite (rotellina, Luca 04/08) ──
// "diretta" = salva subito e approva le richieste altrui; "richiesta" =
// comportamento storico (le modifiche passano dall'approvazione);
// "nessuna" = sola consultazione (niente modifica né eliminazione).
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

export const CAPABILITIES: CapGroup[] = [CAP_CLIENTI, CAP_CLIENTI_EXTRA, CAP_RICERCA_MODIFICA, CAP_CALENDARIO_VISTA, CAP_BADGE, CAP_USATO, CAP_FERIE, CAP_COMUNICAZIONI, CAP_DISDETTE, CAP_PASSWORD];
