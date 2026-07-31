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
    Database, FilePlus, CalendarDays, Clock, Clock3, Users, Smartphone, Store,
    Package, UserCog, FileText, KeyRound, Shield, Phone, Building2, Tag,
    ClipboardList, Trophy, Layers, Compass, Target, Euro,
} from "lucide-react";

export type NavIcon = React.ComponentType<{ className?: string }>;
export type NavLink = { name: string; href: string; icon: NavIcon; roles: string[] };
export type NavGroup = { type: "group"; label: string; icon: NavIcon; roles?: string[]; children: NavLink[] };
export type NavItem = { type: "link"; name: string; href: string; icon: NavIcon; roles: string[] };
// emoji: la "modicon" della sotto-voce — la stessa del pulsante-tab in pagina,
// riportata piu' piccola nel menu di sinistra (Luca 31/07)
export type NavHubSub = { id: string; name: string; roles: string[]; emoji?: string };
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
            { name: "Password", href: "/password-v2", icon: KeyRound, roles: ["admin", "direttore_generale", "store_manager"] },
        ],
    },
    { type: "link", name: "Calendario", href: "/calendario", icon: CalendarDays, roles: EVERYONE },
    { type: "link", name: "Documentazione", href: "/documentazione", icon: FolderOpen, roles: EVERYONE },
    { type: "link", name: "Comunicazioni", href: "/comunicazioni", icon: MessageSquare, roles: EVERYONE },
    { type: "link", name: "Chat", href: "/chat", icon: MessagesSquare, roles: EVERYONE },
    { type: "link", name: "Assistente AI", href: "/assistente", icon: Sparkles, roles: MANAGERS },
    {
        type: "hub",
        name: "Gare",
        href: "/gare",
        param: "brand",
        icon: Trophy,
        roles: ["admin", "dev"],
        children: [
            { name: "WindTre", sez: "w3", color: "#FF6B00" },
            { name: "Vodafone Store", sez: "vs", color: "#E60000" },
            { name: "Vodafone VND", sez: "vnd", color: "#ff6666" },
            { name: "Fastweb", sez: "fastweb", color: "#FFD800" },
            { name: "Sky", sez: "sky", color: "#0072C6" },
            { name: "S4", sez: "s4", color: "#28a745" },
            { name: "TIM", sez: "tim", color: "#0050FF" },
            { name: "Dojo", sez: "dojo", color: "#14b8a6" },
        ],
    },
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
                ],
            },
            { name: "Marginalità", sez: "marginalita", icon: Package, roles: ["admin", "dev"] },
            { name: "Catalogo", sez: "catalogo", icon: Layers, roles: ["admin", "dev"] },
            { name: "Call Center", sez: "callcenter", icon: Phone, roles: ["admin", "dev"] },
            { name: "Calendario", sez: "calendario", icon: CalendarDays, roles: ["admin", "dev"] },
            { name: "Target", sez: "target", icon: ClipboardList, roles: ["admin", "dev"] },
            { name: "Direzione Inserimento", sez: "direzione", icon: Compass, roles: ["admin", "dev"] },
            { name: "Obiettivi Home", sez: "obiettivi", icon: Target, roles: ["admin", "dev"] },
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
