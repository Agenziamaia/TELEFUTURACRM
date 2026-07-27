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

import { areaOf, seesAllStores, seesWholeStore } from "@/lib/roles";
import type { PermMap } from "@/lib/nav";

export interface CapDef {
    id: string;
    label: string;
    desc: string;
    /** comportamento DI DEFAULT per un ruolo (replica del codice storico) */
    default: (role: string) => boolean;
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
export const CAP_CLIENTI_EXTRA: CapGroupFlags = {
    mode: "flags",
    section: "/clienti",
    sectionLabel: "Clienti — funzioni",
    caps: [CAP_CLIENTI_ALLEGATI],
};

/** Catalogo completo: la pagina Permessi lo rende amministrabile da solo.
 *  Piu' gruppi possono condividere la stessa sezione: l'ingranaggio li mostra
 *  impilati nello stesso pannello. */
export const CAPABILITIES: CapGroup[] = [CAP_CLIENTI, CAP_CLIENTI_EXTRA, CAP_BADGE];
