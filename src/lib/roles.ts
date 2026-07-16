// Single source of truth for the Telefutura CRM user model.
// Two levels: Livello 1 = ruolo funzionale (porta i permessi base),
// Livello 2 = grado (raffina permessi + inquadramento/target/compensi).

export type Area = "pv" | "cc" | "ob" | "sede";

export type RoleId =
    | "venditore"
    | "store_manager"
    | "supervisore"
    | "caller"
    | "direttore_cc"
    | "agente"
    | "direttore_ob"
    | "amministrativo"
    | "admin";

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
        id: "venditore",
        label: "Venditore",
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
    { id: "supervisore", label: "Supervisore", area: "pv", grades: [] },
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
    { id: "admin", label: "Admin", area: "sede", grades: [] },
];

export const BRANDS: string[] = [
    "WindTre",
    "Vodafone",
    "Fastweb",
    "Sky",
    "Tim",
    "Iliad",
    "Energia",
];

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
