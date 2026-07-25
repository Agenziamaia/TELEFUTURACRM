"use client";

/**
 * UNIVOCITÀ DATI CLIENTE (regole Luca 25/07), valide OVUNQUE si crei o
 * modifichi un'anagrafica (sezione Clienti e Registra Vendita):
 *  - P.IVA (business) e Codice Fiscale (consumer): UNIVOCI e bloccanti;
 *  - CELLULARE: UNIVOCO — se appartiene a un altro cliente si sceglie se
 *    SPOSTARLO sul nuovo (liberaCellulare) o inserirne un altro;
 *  - EMAIL: può ripetersi, ma va SEGNALATA quando è già di un altro cliente.
 */

import { supabase } from "@/lib/supabaseClient";

export interface DupCliente { id: string; label: string }

interface RigaCliente { id: string; tipo: string | null; nome: string | null; cognome: string | null; ragione_sociale: string | null }

const etichetta = (r: RigaCliente): string =>
    (r.tipo === "business" && r.ragione_sociale) ? r.ragione_sociale : `${r.nome || ""} ${r.cognome || ""}`.trim() || r.id;

const SEL = "id,tipo,nome,cognome,ragione_sociale";

async function primo(campo: string, valore: string, excludeId?: string | null): Promise<DupCliente | null> {
    const v = valore.trim();
    if (!v) return null;
    let q = supabase.from("clients").select(SEL).ilike(campo, v).limit(1);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q;
    const r = (data && data[0]) as RigaCliente | undefined;
    return r ? { id: r.id, label: etichetta(r) } : null;
}

export async function trovaDuplicati(opts: {
    excludeId?: string | null;
    cellulare?: string;
    cfPiva?: string;
    email?: string;
}): Promise<{ cellulare: DupCliente | null; cfPiva: DupCliente | null; email: DupCliente | null }> {
    const [cell, cf, mail] = await Promise.all([
        primo("cellulare", opts.cellulare || "", opts.excludeId),
        primo("cf_piva", opts.cfPiva || "", opts.excludeId),
        primo("email", opts.email || "", opts.excludeId),
    ]);
    return { cellulare: cell, cfPiva: cf, email: mail };
}

/** Sposta il cellulare: lo toglie dal cliente che lo aveva (scelta esplicita). */
export async function liberaCellulare(clienteId: string): Promise<void> {
    await supabase.from("clients").update({ cellulare: "" }).eq("id", clienteId);
}
