"use client";

/* Tipi e costanti condivise della sezione Gare a due livelli. */

export interface Pista {
    id: string;
    gara: string;
    codice: string;
    nome: string;
    descrizione: string | null;
    sort_order: number;
}
export interface SogliaAz {
    id: string;
    pista: string;
    scope: string;
    cluster: string | null;
    store_name: string | null;
    tier: number;
    soglia_valore: number;
    soglia_um: string;
    reward_tipo: string | null;
    reward_valore: number | null;
    reward_um: string | null;
    reward_descr: string | null;
    girata_ai_ragazzi: boolean;
    note: string | null;
}
export interface VoceAz {
    id: string;
    pista: string;
    nome: string;
    tipo: string;
    valore: number | null;
    um: string | null;
    condizione: string | null;
    scope: string;
    girata_ai_ragazzi: boolean;
    note: string | null;
}
export interface RegolaAz {
    id: string;
    pista: string | null;
    tipo: string;
    condizione: string;
    effetto: string;
    valore: number | null;
    um: string | null;
    bersaglio: string | null;
    scope: string;
    girata_ai_ragazzi: boolean;
    note: string | null;
}
export interface NegozioAz {
    id: string;
    gara: string;
    store_name: string;
    cluster: string | null;
    note: string | null;
}

// DIVISIONI di gara dentro un brand: lettere diverse dallo stesso operatore.
// I brand assenti hanno una sola gara ('principale', selettore nascosto).
export const BRAND_DIVISIONI: Record<string, { id: string; label: string; sub: string }[]> = {
    w3: [
        { id: "franchising", label: "Franchising", sub: "5 pdv · Telefutura SRL" },
        { id: "multibrand", label: "Multibrand", sub: "Top Dealer & Dealer · 3 pdv" },
    ],
};
export interface SogliaRag {
    id: string;
    tier: number;
    nome: string;
    soglia_valore: number;
    soglia_um: string;
    reward_tipo: string;
    reward_valore: number | null;
    reward_um: string | null;
    reward_descr: string | null;
    descrizione: string | null;
    premio_note: string | null;
}
export interface PayRag {
    id: string;
    attivazione: string;
    importo: number;
    retroattivo: boolean;
    tier_min: number;
    note: string | null;
}

// La gara RAGAZZI può accorpare più brand azienda (es. Vodafone unica per VS + VND).
export const RAGAZZI_GARA: Record<string, { id: string; label: string; nota?: string }> = {
    w3: { id: "w3", label: "WindTre" },
    vs: { id: "vodafone", label: "Vodafone", nota: "Gara unica per Vodafone Store + VND: i ragazzi non vedono la distinzione." },
    vnd: { id: "vodafone", label: "Vodafone", nota: "Gara unica per Vodafone Store + VND: i ragazzi non vedono la distinzione." },
    fastweb: { id: "fastweb", label: "Fastweb" },
    sky: { id: "sky", label: "Sky" },
    s4: { id: "s4", label: "S4 Energy" },
    tim: { id: "tim", label: "TIM" },
    dojo: { id: "dojo", label: "Dojo" },
};

export const CLUSTER_SUGGERITI = ["strada_c1", "strada_c2", "strada_c3", "cc_c1", "cc_c2", "cc_c3", "monopos", "multipos", "dal_4_pos"];
export const UM_SOGLIA = ["punti", "pezzi", "percent", "eur"];
export const REWARD_TIPI_AZ = ["bonus", "moltiplicatore", "pay", "sblocco"];
export const REWARD_TIPI_RAG = ["pay_tabella", "moltiplicatore", "bonus"];
export const VOCE_TIPI = ["punti", "gettone", "bonus", "moltiplicatore", "pay_ricorrente"];
export const REGOLA_TIPI = ["malus", "gate", "storno"];

export const eur = (n: number) => `€ ${n.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
