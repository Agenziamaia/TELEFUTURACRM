"use client";

/**
 * UNIVOCITÀ DATI CLIENTE (regole Luca 25/07, aggiornate 01/08), valide OVUNQUE
 * si crei o modifichi un'anagrafica (sezione Clienti e Registra Vendita):
 *  - P.IVA (business) e Codice Fiscale (consumer): UNIVOCI e bloccanti;
 *  - CELLULARE: univoco TRA ANAGRAFICHE DELLO STESSO TIPO. Lo stesso numero
 *    può stare su UNA consumer e UNA business insieme (Luca 01/08: caso
 *    amministratore di società — persona fisica + azienda). Se appartiene a
 *    un altro cliente dello stesso tipo si sceglie se SPOSTARLO sul nuovo
 *    (liberaCellulare) o inserirne un altro;
 *  - EMAIL: può ripetersi, ma va SEGNALATA quando è già di un altro cliente.
 */

import { supabase } from "@/lib/supabaseClient";

export interface DupCliente { id: string; label: string; tipo: string | null }

interface RigaCliente { id: string; tipo: string | null; nome: string | null; cognome: string | null; ragione_sociale: string | null }

const etichetta = (r: RigaCliente): string =>
    (r.tipo === "business" && r.ragione_sociale) ? r.ragione_sociale : `${r.nome || ""} ${r.cognome || ""}`.trim() || r.id;

const SEL = "id,tipo,nome,cognome,ragione_sociale";

const aDup = (r: RigaCliente): DupCliente => ({ id: r.id, label: etichetta(r), tipo: r.tipo });

async function primo(campo: string, valore: string, excludeId?: string | null): Promise<DupCliente | null> {
    const v = valore.trim();
    if (!v) return null;
    let q = supabase.from("clients").select(SEL).ilike(campo, v).limit(1);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q;
    const r = (data && data[0]) as RigaCliente | undefined;
    return r ? aDup(r) : null;
}

/** Possessori del CELLULARE che BLOCCANO davvero: con tipoNuovo dichiarato
 *  conta solo chi ha lo STESSO tipo (la coppia consumer+business è ammessa);
 *  senza tipoNuovo vale la vecchia regola (qualunque possessore). */
async function cellulareBloccante(valore: string, tipoNuovo?: string | null, excludeId?: string | null): Promise<DupCliente | null> {
    const v = valore.trim();
    if (!v) return null;
    let q = supabase.from("clients").select(SEL).ilike("cellulare", v).limit(5);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q;
    const righe = (data ?? []) as RigaCliente[];
    if (!righe.length) return null;
    if (!tipoNuovo) return aDup(righe[0]);
    const stesso = righe.find(r => (r.tipo || "consumer") === tipoNuovo);
    return stesso ? aDup(stesso) : null;
}

export async function trovaDuplicati(opts: {
    excludeId?: string | null;
    cellulare?: string;
    /** tipo dell'anagrafica che si sta creando/modificando ("consumer" |
     *  "business"): abilita l'eccezione coppia consumer+business sul cellulare */
    tipoNuovo?: string | null;
    cfPiva?: string;
    email?: string;
}): Promise<{ cellulare: DupCliente | null; cfPiva: DupCliente | null; email: DupCliente | null }> {
    const [cell, cf, mail] = await Promise.all([
        cellulareBloccante(opts.cellulare || "", opts.tipoNuovo, opts.excludeId),
        primo("cf_piva", opts.cfPiva || "", opts.excludeId),
        primo("email", opts.email || "", opts.excludeId),
    ]);
    return { cellulare: cell, cfPiva: cf, email: mail };
}

/** Sposta il cellulare: lo toglie dal cliente che lo aveva (scelta esplicita). */
export async function liberaCellulare(clienteId: string): Promise<void> {
    await supabase.from("clients").update({ cellulare: "" }).eq("id", clienteId);
}
