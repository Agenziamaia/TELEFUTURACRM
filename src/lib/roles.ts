// Single source of truth for the Telefutura CRM user model.
// Two levels: Livello 1 = ruolo funzionale (porta i permessi base),
// Livello 2 = grado (raffina permessi + inquadramento/target/compensi).

export type Area = "pv" | "cc" | "ob" | "sede";

export type RoleId =
    | "venditore"
    | "store_manager"
    | "supervisore"
    | "direttore_commerciale"
    | "tecnico"
    | "caller"
    | "back_office_caller"
    | "direttore_cc"
    | "agente"
    | "direttore_ob"
    | "amministrativo"
    | "direttore_generale"
    | "admin"
    | "dev";

export interface Grade {
    id: string;
    label: string;
}

export interface RoleDef {
    id: RoleId;
    label: string;
    area: Area;
    grades: Grade[]; // empty => ruolo unico, senza gradi
}

export const AREAS: { id: Area; label: string }[] = [
    { id: "pv", label: "Punto Vendita" },
    { id: "cc", label: "Call Center" },
    { id: "ob", label: "Outbound" },
    { id: "sede", label: "Sede" },
];

export const ROLES: RoleDef[] = [
    {
        // id storico "venditore" (nel DB e nei riferimenti target); etichetta pubblica: Consulente
        id: "venditore",
        label: "Consulente",
        area: "pv",
        grades: [
            { id: "apprendista", label: "Apprendista" },
            { id: "store_specialist", label: "Store Specialist" },
            { id: "store_specialist_senior", label: "Store Specialist Senior" },
        ],
    },
    {
        id: "store_manager",
        label: "Store Manager",
        area: "pv",
        grades: [
            { id: "store_manager", label: "Store Manager" },
            { id: "store_manager_senior", label: "Store Manager Senior" },
        ],
    },
    { id: "direttore_commerciale", label: "Direttore Commerciale", area: "pv", grades: [] },
    { id: "tecnico", label: "Tecnico", area: "pv", grades: [] },
    {
        id: "caller",
        label: "Caller",
        area: "cc",
        grades: [
            { id: "apprendista", label: "Apprendista" },
            { id: "caller", label: "Caller" },
            { id: "caller_senior", label: "Caller Senior" },
        ],
    },
    { id: "back_office_caller", label: "Back Office / Caller", area: "cc", grades: [] },
    {
        id: "direttore_cc",
        label: "Direzione Call Center",
        area: "cc",
        grades: [
            { id: "team_leader", label: "Team Leader" },
            { id: "direttore", label: "Direttore" },
        ],
    },
    {
        id: "agente",
        label: "Agente",
        area: "ob",
        grades: [
            { id: "apprendista", label: "Apprendista" },
            { id: "agente", label: "Agente" },
            { id: "agente_senior", label: "Agente Senior" },
        ],
    },
    {
        id: "direttore_ob",
        label: "Direzione Outbound",
        area: "ob",
        grades: [
            { id: "team_leader", label: "Team Leader" },
            { id: "direttore", label: "Direttore" },
        ],
    },
    {
        id: "amministrativo",
        label: "Amministrativo",
        area: "sede",
        grades: [
            { id: "amministrazione", label: "Amministrazione" },
            { id: "back_office", label: "Back Office" },
        ],
    },
    { id: "direttore_generale", label: "Direttore Generale", area: "sede", grades: [] },
    { id: "admin", label: "Admin", area: "sede", grades: [] },
    // Ruolo tecnico (sviluppatore): stessi permessi di admin
    { id: "dev", label: "Dev", area: "sede", grades: [] },
];

// Ruoli con visibilità su TUTTI i negozi
export function seesAllStores(role: string | null | undefined): boolean {
    return role === "admin" || role === "dev" || role === "direttore_generale" || role === "amministrativo";
}

// Ruoli "amministrativi o superiori" (es. approvazione modifiche profilo)
export function isAdminOrAbove(role: string | null | undefined): boolean {
    return role === "amministrativo" || role === "direttore_generale" || role === "admin" || role === "dev";
}

// Il badge (timbratura) è riservato al call center; i ruoli di negozio non lo usano.
export function canUseBadge(role: string | null | undefined): boolean {
    return areaOf(role || "") === "cc";
}

// Categorie di punto vendita (per target e classificazione)
export const STORE_CATEGORIES: string[] = [
    "Franchising W3",
    "Multi Brand Puri",
    "Fr W3 + Multi Brand",
    "Vodafone Store",
    "VS + Multibrand",
];

// Società di assunzione del collaboratore
export const EMPLOYMENT_COMPANIES: string[] = [
    "Telefutura SRL",
    "Telefutura 2 SRL",
    "APS",
    "Partita IVA",
];

// Ore settimanali contrattuali
export const WEEKLY_HOURS: number[] = [20, 24, 30, 36, 40];

export function hoursType(h: number | null | undefined): string {
    if (!h) return "";
    return h >= 36 ? "Full time" : "Part time";
}

// Tipo di contratto
export const CONTRACT_TYPES: string[] = [
    "Indeterminato",
    "Determinato",
    "Apprendistato",
    "Tirocinio",
    "Collaborazione",
    "Partita IVA",
    "Compenso Amministratore",
];

// Il contratto ha una scadenza (determinato / apprendistato / tirocinio)
export function contractNeedsExpiry(t: string | null | undefined): boolean {
    return t === "Determinato" || t === "Apprendistato" || t === "Tirocinio";
}

export const BRANDS: string[] = [
    "WindTre",
    "Vodafone",
    "Fastweb",
    "Sky",
    "Tim",
    "Iliad",
    "Energia",
];

// Colori originali dei brand per le chip UI: color = base (sfondo/bordo), text = variante leggibile su tema scuro
export const BRAND_COLORS: Record<string, { color: string; text: string }> = {
    WindTre: { color: "#ff6600", text: "#ffa366" },
    Vodafone: { color: "#e60000", text: "#ff6666" },
    Fastweb: { color: "#ffd400", text: "#ffe066" },
    Sky: { color: "#0072c9", text: "#66b5ff" },
    Tim: { color: "#004691", text: "#6fa8ff" },
    Iliad: { color: "#ff0032", text: "#ff667f" },
    Energia: { color: "#16a34a", text: "#4ade80" },
};

export function getRole(id: string): RoleDef | undefined {
    return ROLES.find((r) => r.id === id);
}

export function roleLabel(id: string): string {
    return getRole(id)?.label ?? id;
}

export function gradesFor(id: string): Grade[] {
    return getRole(id)?.grades ?? [];
}

export function gradeLabel(roleId: string, gradeId: string | null | undefined): string {
    if (!gradeId) return "";
    return gradesFor(roleId).find((g) => g.id === gradeId)?.label ?? gradeId;
}

export function areaOf(roleId: string): Area | undefined {
    return getRole(roleId)?.area;
}

export function areaLabel(area: Area): string {
    return AREAS.find((a) => a.id === area)?.label ?? area;
}

export function rolesByArea(area: Area): RoleDef[] {
    return ROLES.filter((r) => r.area === area);
}
