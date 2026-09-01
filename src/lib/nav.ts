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
    Package, UserCog, FileText, KeyRound, Shield, Phone, Building2, Tag, Cog,
    ClipboardList, Trophy, Layers, Compass, Target, Euro, Scissors, Radar, Calculator, Boxes, Wrench,
    BarChart3, Receipt, User, Globe, Mail, SlidersHorizontal,
} from "lucide-react";
import { CoronaIcona } from "@/components/IconaCorona";

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
export type NavHubChild = { name: string; sez: string; icon?: NavIcon; emoji?: string; color?: string; roles?: string[]; subs?: NavHubSub[]; esplodi?: boolean; subsSez?: boolean };
// senzaSottomenu: hub SOLO per i permessi (sezione + aree amministrabili una
// a una) — in sidebar resta una voce semplice: le aree si cambiano coi
// pulsanti dentro la pagina, non con un menù a sinistra (Analisi, Luca 21/08)
export type NavHub = { type: "hub"; name: string; href: string; param?: string; icon: NavIcon; roles: string[]; children: NavHubChild[]; senzaSottomenu?: boolean };
export type NavEntry = NavGroup | NavItem | NavHub;

export const EVERYONE = ["*"];
export const ADMINS = ["admin", "dev", "direttore_generale"];
export const MANAGERS = ["admin", "dev", "direttore_generale", "store_manager", "direttore_commerciale", "amministrativo", "direttore_cc", "direttore_ob"];
export const CALLCENTER = ["admin", "dev", "direttore_generale", "caller", "back_office_caller", "direttore_cc"];
// Il gruppo Agenti e' del reparto OUTBOUND: solo loro + direzione commerciale e admin.
export const OUTBOUND_NAV = ["agente", "direttore_ob", "direttore_commerciale", "admin", "dev"];

export const NAVIGATION: NavEntry[] = [
    { type: "link", name: "Home", href: "/dashboard", icon: Home, roles: EVERYONE },
    // ANALISI (Luca 20-21/08): la sezione-vetrina a punti/pezzi. È un HUB per
    // i PERMESSI (sezione intera + ogni area concedibile per ruolo dalla
    // pagina Permessi: /analisi e /analisi?sez=io|negozio|rete|regia) ma
    // SENZA sottomenu in sidebar: le aree si cambiano coi pulsanti in pagina.
    // Default: tutto solo admin/dev finché Luca non apre; la Regia resta sua.
    {
        // HUB PIENO dal 24/08 (Luca: «è arrivato il momento»): voce → preview,
        // freccetta → sottomenu con le aree; prima era senzaSottomenu.
        type: "hub", name: "Analisi", href: "/analisi", icon: BarChart3, roles: ["admin", "dev"],
        children: [
            { name: "Io", sez: "io", icon: User, roles: ["admin", "dev"] },
            { name: "Negozio", sez: "negozio", icon: Store, roles: ["admin", "dev"] },
            // LA RETE E' DI TUTTI, TRANNE GLI APPRENDISTI (Luca, briefing
            // della sezione). Il valore di fabbrica apre; a chiudere sono le
            // due righe di grado `@apprendista` in role_permissions, che
            // vincono sul ruolo. Cosi' un ruolo nuovo nasce dentro, come
            // Luca ha chiesto, e non fuori per dimenticanza.
            { name: "Rete", sez: "rete", icon: Globe, roles: EVERYONE },
            // "Master" per Luca (21/08): la sez resta "regia" — è la chiave di
            // permesso già concessa, cambiarla scollegherebbe le righe esistenti
            { name: "Master", sez: "regia", icon: CoronaIcona, roles: ["admin", "dev"] },
        ],
    },
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
            // REGISTRO CHIAMATE Aircall del negozio (AIR-01, Luca 04/08): il
            // registro lo vede tutto il negozio, l'AUDIO delle registrazioni è
            // gestito a parte per ruolo (store manager in su, gate in pagina e
            // sul proxy). La voce resta amministrabile dal pannello Permessi.
            { name: "Registro Chiamate", href: "/chiamate", icon: Phone, roles: EVERYONE },
        ],
    },
    /* HUB MAGAZZINO (Luca 01/09): «stavo pensando di tirare fuori magazzino da
       dentro negozio, facendolo HUB, con dentro le tre attuali sezioni».
       Era una voce sola dentro «Negozio», e le tre sezioni si trovavano solo
       entrando: dal 1° settembre il magazzino è il registro fiscale della
       merce, e ci si entra per una delle tre cose, non «per il magazzino». */
    {
        type: "group",
        label: "Magazzino",
        icon: Boxes,
        children: [
            { name: "Giacenze", href: "/magazzino?tab=giacenze", icon: Boxes, roles: EVERYONE },
            { name: "Trasferimenti", href: "/magazzino?tab=trasferimenti", icon: Package, roles: EVERYONE },
            { name: "Articoli", href: "/magazzino?tab=articoli", icon: ClipboardList, roles: EVERYONE },
        ],
    },
    // HUB UTILITY (Luca 12/08): subito DOPO l'hub Negozio (non dentro).
    // Dentro, in ordine: Calcolatore (primo — Luca 12/08 sera), Documentazione,
    // Password coi ruoli di sempre. Calcolatore per ora admin/dev: si apre ai
    // ragazzi quando arriva la vista gare.
    {
        type: "group",
        label: "Utility",
        icon: Wrench,
        children: [
            { name: "Calcolatore $$$", href: "/calcolatore", icon: Calculator, roles: ["admin", "dev"] },
            // CHIUSURA LINEA (Luca 01/08, qui dal 13/08): ticketing disdette
            // operatori — Luca la vuole in Utility, prima di Documentazione
            { name: "Chiusura Linea", href: "/chiusura-linea", icon: Scissors, roles: EVERYONE },
            { name: "Documentazione", href: "/documentazione", icon: FolderOpen, roles: EVERYONE },
            { name: "Password", href: "/password-v2", icon: KeyRound, roles: ["admin", "direttore_generale", "store_manager"] },
        ],
    },
    { type: "link", name: "Calendario", href: "/calendario", icon: CalendarDays, roles: EVERYONE },
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
                    { id: "sky", name: "Sky", roles: ["admin", "dev"], color: "var(--tf-8b5cf6)" },
                    { id: "s4", name: "S4", roles: ["admin", "dev"], color: "var(--tf-28a745)" },
                    { id: "tim", name: "TIM", roles: ["admin", "dev"], color: "var(--tf-0050ff)" },
                    { id: "kena", name: "Kena", roles: ["admin", "dev"], color: "#F5A623" },
                    { id: "dojo", name: "Dojo", roles: ["admin", "dev"], color: "var(--tf-14b8a6)" },
                ],
            },
            { name: "Target", sez: "target", icon: ClipboardList, roles: ["admin", "dev"] },
            { name: "Obiettivi Home", sez: "obiettivi", icon: Target, roles: ["admin", "dev"] },
            { name: "Direzione Inserimento", sez: "direzione", icon: Compass, roles: ["admin", "dev"] },
            // CALENDARIO GARE (Luca 11/08): giorni lavorativi/ora scatto/proiezione
            { name: "Calendario gare", sez: "calendariogare", icon: CalendarDays, roles: ["admin", "dev"] },
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
                    /* «Costi per negozio», non «Negozi» (revisore 31/08): dal
                       31/08 c'è una sezione che si chiama Negozi — la scheda del
                       punto vendita — e due voci con lo stesso nome nello stesso
                       menu, e nella matrice dei permessi, sono due permessi
                       diversi indistinguibili. L'`id` resta «negozi»: è la chiave
                       dei permessi e dei link salvati. */
                    { id: "negozi", name: "Costi per negozio", roles: ["admin", "dev"], emoji: "🏬" },
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
            // MINI-HUB Fiscalità (Luca 24/08, DOPO Utenti come richiesto): le
            // registratore telematico. REGOLA (già sbagliata troppe volte,
            // vedi Orari & Chiusure 03/08): ogni sezione nuova della pagina
            // Amministrazione VA REGISTRATA QUI — la tendina a sinistra e i
            // permessi nascono da QUESTO file, non dalla pagina.
            {
                name: "Fiscalità", sez: "fiscalita", icon: Receipt, roles: [...ADMINS, "amministrativo"], esplodi: true, subsSez: true,
                subs: [
                    { id: "reparti", name: "Reparti & IVA", roles: [...ADMINS, "amministrativo"], emoji: "🧮" },
                    { id: "cassascontrini", name: "Cassa & Scontrini", roles: [...ADMINS, "amministrativo"], emoji: "🧾" },
                    { id: "coupon", name: "Coupon", roles: [...ADMINS, "amministrativo"], emoji: "🎟" },
                    // la definizione degli articoli: prezzo, costo, e se in cassa
                    // quel prezzo si può correggere (Luca 29/08)
                    { id: "articoli", name: "Articoli", roles: [...ADMINS, "amministrativo"], emoji: "📦" },
                ],
            },
            /* MINI-HUB SETUP (Luca 31/08): «creiamo un altro minihub per tenere
               tutto in ordine, chiamiamolo Setup». Sono le sezioni che
               CONFIGURANO come lavora il CRM — cosa si può vendere, quali esiti
               esistono, cosa si può ordinare — invece di mostrarne i dati. In
               una griglia da quindici riquadri erano indistinguibili dalle
               altre; raccolte sotto un nome si trovano.
               ⚠️ Gli `id` restano quelli di sempre (`catalogo`, `callcenter`,
               `ordinemerce`, `calendario`, `trackingesiti`): sono la chiave dei
               permessi in role_permissions e dei link salvati. Cambiarli
               significherebbe azzerare in silenzio i permessi già dati e
               rompere ogni scorciatoia che qualcuno si è messo fra i preferiti.
               Cambia solo dove la voce si trova, non cosa è. */
            {
                name: "Setup", sez: "setup", icon: SlidersHorizontal,
                roles: [...ADMINS, "amministrativo"], esplodi: true, subsSez: true,
                subs: [
                    // "Marginalità" vive DENTRO Catalogo come pseudo-brand 💰 (Luca 05/08)
                    { id: "catalogo", name: "Catalogo", roles: ["admin", "dev"], emoji: "🗂️" },
                    { id: "callcenter", name: "Call Center", roles: ["admin", "dev"], emoji: "📞" },
                    // articoli ordinabili di Ordine Merce (Luca 01/08): amministrativo in su
                    { id: "ordinemerce", name: "Ordine Merce", roles: [...ADMINS, "amministrativo"], emoji: "📦" },
                    { id: "calendario", name: "Calendario", roles: ["admin", "dev"], emoji: "🗓️" },
                    // Esiti del Tracking PDA per categoria (MOD-28, Luca 10/08)
                    { id: "trackingesiti", name: "Tracking PDA", roles: ["admin", "dev"], emoji: "🛰️" },
                ],
            },
            // Orari & Chiusure: la sezione esisteva in pagina ma NON qui — e il
            // menu a tendina nasce da QUESTO file (errore già fatto, Luca 03/08)
            // «NEGOZI» e non piu' «Orari & Chiusure» (Luca 31/08): dentro ci
            // sono indirizzo, CAP, citta, societa, registratore fiscale e gli
            // orari. La `sez` resta «orari»: e' la chiave dei permessi e degli
            // indirizzi salvati, cambiarla scollegherebbe le une e gli altri.
            { name: "Negozi", sez: "orari", icon: Store, roles: ["admin", "dev"] },
            // Pannello WhatsApp (Luca 25/08): numeri, verifica, ricollega, intestazioni
            { name: "WhatsApp", sez: "whatsapp", icon: MessagesSquare, roles: ["admin", "dev"] },
            // Pannello Email (Luca 26/08): governance caselle — collega/riassegna/elimina solo da qui
            { name: "Email", sez: "email", icon: Mail, roles: ["admin", "dev"] },
            /* SPESA E USO DELL'AI (Luca 31/08). Nasce riservata all'admin, ma è
               una sezione come le altre: si assegna a chiunque dalla pagina
               Permessi, senza toccare il codice — richiesta esplicita di Luca. */
            { name: "AI", sez: "ai", icon: Sparkles, roles: ["admin", "dev"] },
            /* PAYSTORE (Luca 01/09): «tiriamola fuori dall'hub di Setup, perché
               non è un setup». Ha ragione: Setup dice COME lavora il CRM, questa
               dice cosa è successo — le ricariche vendute, giorno per giorno.
               Sta accanto ad AI, che è l'altra sezione che guarda i numeri di un
               servizio. Amministrativo in su: dentro ci sono i numeri di
               cellulare dei clienti. */
            { name: "PayStore", sez: "paystore", icon: Smartphone, roles: [...ADMINS, "amministrativo"] },
            /* AUTOMATISMI (Luca 31/08): nasce ristretto come l'AI — da qui si
               spengono lavori che spediscono documenti del personale e si
               cambiano i destinatari di quelle email. Si allarga dalla pagina
               Permessi quando serve, senza toccare il codice. */
            { name: "Automatismi", sez: "automatismi", icon: Cog, roles: ["admin", "dev"] },
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
