/**
 * NAVIGAZIONE + PERMESSI DI VISIBILITÀ — fonte unica (regola Luca 25/07).
 *
 * La struttura del menù vive QUI (la Sidebar la renderizza, AuthContext la usa
 * per bloccare le rotte, la pagina Amministrazione → Permessi la amministra).
 *
 * Come si decide se un ruolo vede una voce (in quest'ordine):
 *   1. admin/dev vedono SEMPRE tutto (impossibile chiudersi fuori);
 *   2. riga esplicita in role_permissions (mig. 086) → vale quella,
 *      in ENTRAMBE le direzioni (concedere e togliere);
 *   3. regola outbound: agente/direttore_ob non vedono i gruppi
 *      Vendite/Collaboratori/Negozio (salvo riga esplicita);
 *   4. default di codice (roles della voce qui sotto).
 *
 * La chiave di permesso di una voce è il suo href, com'è scritto qui.
 */

import {
    Home, Send, Navigation, FolderOpen, MessageSquare, MessagesSquare, Sparkles,
    Database, FilePlus, CalendarDays, Clock, Clock3, Users, UsersRound, Smartphone, Store,
    Package, UserCog, FileText, KeyRound, Shield, Phone, Building2, Tag,
    ClipboardList, Trophy, Layers, Compass, Target, Euro, Scissors, Radar, Calculator,
} from "lucide-react";

export type NavIcon = React.ComponentType<{ className?: string }>;
export type NavLink = { name: string; href: string; icon: NavIcon; roles: string[] };
export type NavGroup = { type: "group"; label: string; icon: NavIcon; roles?: string[]; children: NavLink[] };
export type NavItem = { type: "link"; name: string; href: string; icon: NavIcon; roles: string[] };
// emoji: la "modicon" della sotto-voce — la stessa del pulsante-tab in pagina,
// riportata piu' piccola nel menu di sinistra (Luca 31/07)
// color: pallino colorato in alternativa all'emoji (i brand dentro Operatori)
export type NavHubSub = { id: string; name: string; roles: string[]; emoji?: string; color?: string };
// esplodi: la voce si apre nella sidebar mostrando le subs come sotto-link
// (Luca 31/07). subsSez=true → le subs sono SEZIONI vere e i link vanno a
// ?sez=<sub.id> (mini-hub Costi); senza, le subs sono FUNZIONI della voce e
// i link vanno a ?sez=<voce>&tab=<sub.id> (gruppo Utenti). Le subs restano
// amministrabili una a una dalla pagina Permessi (chiavi hubSubKey).
export type NavHubChild = { name: string; sez: string; icon?: NavIcon; color?: string; roles?: string[]; subs?: NavHubSub[]; esplodi?: boolean; subsSez?: boolean };
export type NavHub = { type: "hub"; name: string; href: string; param?: string; icon: NavIcon; roles: string[]; children: NavHubChild[] };
export type NavEntry = NavGroup | NavItem | NavHub;

export const EVERYONE = ["*"];
export const ADMINS = ["admin", "dev", "direttore_generale"];
export const MANAGERS = ["admin", "dev", "direttore_generale", "store_manager", "direttore_commerciale", "amministrativo", "direttore_cc", "direttore_ob"];
export const CALLCENTER = ["admin", "dev", "direttore_generale", "caller", "back_office_caller", "direttore_cc"];
// Il gruppo Agenti e' del reparto OUTBOUND: solo loro + direzione commerciale e admin.
export const OUTBOUND_NAV = ["agente", "direttore_ob", "direttore_commerciale", "admin", "dev"];

export const NAVIGATION: NavEntry[] = [
    { type: "link", name: "Home", href: "/dashboard", icon: Home, roles: EVERYONE },
    { type: "link", name: "Clienti", href: "/clienti", icon: Users, roles: EVERYONE },
    {
        // CALL CENTER e' un GRUPPO (Luca 28/07): dentro la vecchia sezione Caller
        // e il BADGE, SPOSTATO da Collaboratori (permessi e capacita' migrati
        // con la mig. 096: chi vedeva/faceva prima, vede/fa uguale ora).
        type: "group",
        label: "Call Center",
        icon: Phone,
        children: [
            { name: "Caller", href: "/caller", icon: Phone, roles: CALLCENTER },
            { name: "Badge", href: "/caller?tab=badge", icon: Clock, roles: EVERYONE },
        ],
    },
    {
        type: "group",
        label: "Agenti",
        icon: UserCog,
        roles: OUTBOUND_NAV,
        children: [
            { name: "Invia pda", href: "/pda/invia", icon: Send, roles: OUTBOUND_NAV },
            { name: "Gestione pda", href: "/gestione", icon: Database, roles: OUTBOUND_NAV },
        ],
    },
    {
        type: "group",
        label: "Vendite",
        icon: FileText,
        children: [
            { name: "Registra Vendita", href: "/registra-vendita", icon: FilePlus, roles: EVERYONE },
            { name: "Ricerca Vendite", href: "/ricerca-vendite", icon: Database, roles: EVERYONE },
            { name: "Tracking pda", href: "/pda/tracking", icon: Navigation, roles: EVERYONE },
        ],
    },
    {
        type: "group",
        label: "Collaboratori",
        icon: Users,
        children: [
            { name: "Ferie", href: "/collaboratori?tab=ferie", icon: CalendarDays, roles: EVERYONE },
            // icona PERSONE IN CERCHIO (Luca 03/08): i turni sono squadra, non negozio
            { name: "Turni", href: "/collaboratori?tab=turni", icon: UsersRound, roles: EVERYONE },
            { name: "Malattia", href: "/collaboratori?tab=malattia", icon: Shield, roles: MANAGERS },
            { name: "Ritardi", href: "/collaboratori?tab=ritardi", icon: Clock3, roles: EVERYONE },
        ],
    },
    {
        type: "group",
        label: "Negozio",
        icon: Store,
        children: [
            { name: "Gestione Usati", href: "/usati", icon: Smartphone, roles: EVERYONE },
            { name: "Ordine Merce", href: "/ordine-merce", icon: Package, roles: MANAGERS },
            { name: "Chiusura Negozio", href: "/chiusura", icon: Store, roles: EVERYONE },
            // CHIUSURA LINEA (Luca 01/08): ticketing disdette operatori
            { name: "Chiusura Linea", href: "/chiusura-linea", icon: Scissors, roles: EVERYONE },
            // REGISTRO CHIAMATE Aircall del negozio (AIR-01, Luca 04/08): il
            // registro lo vede tutto il negozio, l'AUDIO delle registrazioni è
            // gestito a parte per ruolo (store manager in su, gate in pagina e
            // sul proxy). La voce resta amministrabile dal pannello Permessi.
            { name: "Registro Chiamate", href: "/chiamate", icon: Phone, roles: EVERYONE },
            { name: "Password", href: "/password-v2", icon: KeyRound, roles: ["admin", "direttore_generale", "store_manager"] },
        ],
    },
    // CALCOLATORE $$$ (cantiere GARE 10/08): registra-vendita riassunto che
    // dice il commissioning di una vendita alla soglia scelta (pay tabellare).
    // Link autonomo SOTTO il gruppo Negozio, prima di Calendario (Luca 10/08).
    // Per ora admin/dev: si apre ai ragazzi quando arriva la vista gare.
    { type: "link", name: "Calcolatore $$$", href: "/calcolatore", icon: Calculator, roles: ["admin", "dev"] },
    { type: "link", name: "Calendario", href: "/calendario", icon: CalendarDays, roles: EVERYONE },
    { type: "link", name: "Documentazione", href: "/documentazione", icon: FolderOpen, roles: EVERYONE },
    { type: "link", name: "Comunicazioni", href: "/comunicazioni", icon: MessageSquare, roles: EVERYONE },
    { type: "link", name: "Chat", href: "/chat", icon: MessagesSquare, roles: EVERYONE },
    { type: "link", name: "Assistente AI", href: "/assistente", icon: Sparkles, roles: MANAGERS },
    // Conto economico per PV: sezione RIMOSSA su direttiva Luca 07/08 — si
    // rifà da capo (grafica CRM) DOPO che avrà dato compensi/soglie/target/
    // bonus/malus per operatore; le tabelle ce_* a DB restano dormienti.
    // Riunioni (deck builder): sezione MESSA DA PARTE su task Luca 10/08 —
    // si riprenderà più avanti come sviluppo dedicato (riunione_deck resta a DB).
    {
        type: "hub",
        name: "Gare",
        href: "/gare",
        param: "brand",
        icon: Trophy,
        roles: ["admin", "dev"],
        children: [
            // RIORDINO (Luca 03/08): i brand riuniti nel SUB-HUB "Operatori";
            // Target, Obiettivi Home e Direzione Inserimento arrivano QUI
            // dall'hub Amministrazione (mig. 148 trasloca le chiavi permesso).
            {
                name: "Operatori", sez: "operatori", icon: Layers, roles: ["admin", "dev"], esplodi: true, subsSez: true,
                subs: [
                    { id: "w3", name: "WindTre", roles: ["admin", "dev"], color: "var(--tf-ff6b00)" },
                    { id: "vs", name: "Vodafone Store", roles: ["admin", "dev"], color: "var(--tf-e60000)" },
                    { id: "vnd", name: "Vodafone VND", roles: ["admin", "dev"], color: "var(--tf-ff6666)" },
                    { id: "fastweb", name: "Fastweb", roles: ["admin", "dev"], color: "var(--tf-ffd800)" },
                    { id: "sky", name: "Sky", roles: ["admin", "dev"], color: "var(--tf-0072c6)" },
                    { id: "s4", name: "S4", roles: ["admin", "dev"], color: "var(--tf-28a745)" },
                    { id: "tim", name: "TIM", roles: ["admin", "dev"], color: "var(--tf-0050ff)" },
                    { id: "dojo", name: "Dojo", roles: ["admin", "dev"], color: "var(--tf-14b8a6)" },
                ],
            },
            { name: "Target", sez: "target", icon: ClipboardList, roles: ["admin", "dev"] },
            { name: "Obiettivi Home", sez: "obiettivi", icon: Target, roles: ["admin", "dev"] },
            { name: "Direzione Inserimento", sez: "direzione", icon: Compass, roles: ["admin", "dev"] },
        ],
    },
    // (il Calcolatore $$$ vive SOPRA, sotto il gruppo Negozio — il doppione
    // che stava qui è stato rimosso su segnalazione di Luca 11/08)
    {
        type: "hub",
        name: "Amministrazione",
        href: "/amministrazione",
        icon: Shield,
        roles: [...ADMINS, "amministrativo"],
        children: [
            // Ogni SEZIONE dell'hub ha i suoi ruoli (decidibili una a una dalla
            // pagina Permessi); Utenti ha anche le sue FUNZIONI interne (subs).
            // Le tre voci "Costi ·" formano il MINI-HUB Costi (Luca 31/07),
            // PRIMA di Utenti: i sez (e quindi le chiavi di permesso) restano
            // quelli storici — negozi, condivisi, altri — concessi uno a uno.
            // MINI-HUB Costi (Luca 31/07): UNA voce che si esplode nelle tre
            // sezioni — permessi granulari per sub (chiavi &tab=..., mig. 115
            // ha migrato le vecchie chiavi ?sez=negozi|condivisi|altri)
            {
                name: "Costi", sez: "costi", icon: Euro, roles: ["admin", "dev"], esplodi: true, subsSez: true,
                subs: [
                    { id: "negozi", name: "Negozi", roles: ["admin", "dev"], emoji: "🏬" },
                    { id: "condivisi", name: "Costi condivisi", roles: ["admin", "dev"], emoji: "🤝" },
                    { id: "altri", name: "Altri costi", roles: ["admin", "dev"], emoji: "🧾" },
                ],
            },
            {
                name: "Utenti", sez: "utenti", icon: Users, roles: [...ADMINS, "amministrativo"], esplodi: true,
                subs: [
                    { id: "lista", name: "Lista utenti", roles: [...ADMINS, "amministrativo"], emoji: "👥" },
                    { id: "permessi", name: "Permessi", roles: ["admin", "dev"], emoji: "🔐" },
                    { id: "ruoli", name: "Ruoli", roles: [...ADMINS, "amministrativo"], emoji: "🏷️" },
                    // permessi "di capacità": funzioni designate a persone (es. ferie)
                    { id: "incarichi", name: "Incarichi", roles: ["admin", "dev"], emoji: "🎯" },
                    // DEBITI collaboratori (Luca 01/08): blackbook, amministrativo in su
                    { id: "debiti", name: "Debiti", roles: [...ADMINS, "amministrativo"], emoji: "💸" },
                ],
            },
            // Orari & Chiusure: la sezione esisteva in pagina ma NON qui — e il
            // menu a tendina nasce da QUESTO file (errore già fatto, Luca 03/08)
            { name: "Orari & Chiusure", sez: "orari", icon: Clock3, roles: ["admin", "dev"] },
            // "Marginalità" vive DENTRO Catalogo come pseudo-brand 💰 (Luca 05/08)
            { name: "Catalogo", sez: "catalogo", icon: Layers, roles: ["admin", "dev"] },
            { name: "Call Center", sez: "callcenter", icon: Phone, roles: ["admin", "dev"] },
            // articoli ordinabili di Ordine Merce (Luca 01/08): amministrativo in su
            { name: "Ordine Merce", sez: "ordinemerce", icon: Package, roles: [...ADMINS, "amministrativo"] },
            { name: "Calendario", sez: "calendario", icon: CalendarDays, roles: ["admin", "dev"] },
            // Esiti del Tracking PDA per categoria (MOD-28, Luca 10/08)
            { name: "Tracking PDA", sez: "trackingesiti", icon: Radar, roles: ["admin", "dev"] },
            // Tabellari pay delle GARE (Luca 10/08): soglie e importi per brand/mese
            { name: "Tabellari Gare", sez: "paytabellari", icon: Trophy, roles: ["admin", "dev"] },
            // Target, Direzione Inserimento e Obiettivi Home sono TRASLOCATI
            // nell'hub Gare (Luca 03/08) — vedi sopra.
        ],
    },
];

// Chiavi di permesso delle sezioni interne di un hub e delle loro funzioni.
// Chiave di permesso di un GRUPPO del menu' (accesso all'hub): spegnerla
// nasconde l'intero gruppo, qualunque sia lo stato delle voci interne.
export const groupKey = (label: string) => `group:${label}`;
export const groupByLabel = (label: string): NavGroup | undefined =>
    NAVIGATION.find((e): e is NavGroup => e.type === "group" && e.label === label);
export const hubChildKey = (hub: NavHub, c: NavHubChild) => `${hub.href}?${hub.param || "sez"}=${c.sez}`;
export const hubSubKey = (hub: NavHub, c: NavHubChild, subId: string) => `${hubChildKey(hub, c)}&tab=${subId}`;
export const hubByHref = (href: string): NavHub | undefined =>
    NAVIGATION.find((e): e is NavHub => e.type === "hub" && e.href === href);

// gruppi nascosti di default al reparto outbound (salvo riga esplicita)
export const OUTBOUND_HIDDEN_GROUPS = ["Vendite", "Collaboratori", "Negozio"];
// link nascosti di default al reparto outbound anche FUORI dai gruppi qui
// sopra (il Badge stava in Collaboratori: spostandolo nel gruppo Call Center
// non deve comparire all'outbound, che prima non lo vedeva).
export const OUTBOUND_HIDDEN_LINKS = ["/caller?tab=badge"];

export const canSeeDefault = (roles: string[], role?: string | null) =>
    roles.includes("*") || (!!role && roles.includes(role));

/** Righe di role_permissions gia' caricate per un ruolo: href -> allowed. */
export type PermMap = Map<string, boolean>;

/** Visibilita' EFFETTIVA di una voce per un ruolo (vedi ordine in testa al file). */
export function effectiveAllowed(
    role: string | null | undefined,
    href: string,
    defaultRoles: string[],
    perms: PermMap | null,
    groupLabel?: string,
): boolean {
    if (role === "admin" || role === "dev") return true;
    const row = perms?.get(href);
    if (row !== undefined) return row;
    if ((role === "agente" || role === "direttore_ob") && groupLabel && OUTBOUND_HIDDEN_GROUPS.includes(groupLabel)) return false;
    if ((role === "agente" || role === "direttore_ob") && OUTBOUND_HIDDEN_LINKS.includes(href)) return false;
    return canSeeDefault(defaultRoles, role);
}

/** Voci con permesso, indicizzate per rotta (base senza query): per il blocco rotte. */
export function routeBases(): { base: string; items: { href: string; roles: string[]; group?: string }[] }[] {
    const map = new Map<string, { href: string; roles: string[]; group?: string }[]>();
    const add = (href: string, roles: string[], group?: string) => {
        const base = href.split("?")[0];
        (map.get(base) ?? map.set(base, []).get(base)!).push({ href, roles, group });
    };
    NAVIGATION.forEach((e) => {
        if (e.type === "link" || e.type === "hub") add(e.href, e.roles);
        else e.children.forEach((c) => add(c.href, c.roles, e.label));
    });
    return [...map.entries()].map(([base, items]) => ({ base, items }));
}
