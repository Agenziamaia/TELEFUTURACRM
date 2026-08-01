"use client";

// PROFILO PERSONALE (Luca 31/07): i campi che ogni utente vede e mantiene dal
// proprio profilo (icona in alto a destra). Prima compilazione LIBERA (scrive
// subito su app_users); la MODIFICA di un dato gia' presente passa da una
// richiesta che l'amministrazione approva (tabella profilo_richieste, mig. 120).
// PEC e domicilio (mig. 126, Luca 01/08): la PEC e' tra i campi richiesti al
// completamento; il domicilio SOLO se il flag "diverso dalla residenza" e' su.
import { supabase } from "@/lib/supabaseClient";

export const CAMPI_PROFILO = [
    { campo: "full_name", label: "Nome e cognome" },
    { campo: "cf", label: "Codice fiscale" },
    { campo: "email", label: "Email" },
    { campo: "pec", label: "PEC" },
    { campo: "phone", label: "Cellulare" },
    { campo: "address", label: "Indirizzo di residenza" },
    { campo: "iban", label: "IBAN" },
] as const;

export type RigaProfilo = {
    full_name?: string | null; cf?: string | null; email?: string | null;
    pec?: string | null; phone?: string | null; address?: string | null; iban?: string | null;
    domicilio_diverso?: boolean | null; domicilio?: string | null;
};

export function campiMancanti(r: RigaProfilo | null): string[] {
    if (!r) return [];
    const miss = CAMPI_PROFILO
        .filter((c) => !String((r as Record<string, unknown>)[c.campo] ?? "").trim())
        .map((c) => c.label as string);
    // il domicilio conta solo quando l'utente dichiara che e' diverso dalla residenza
    if (r.domicilio_diverso && !String(r.domicilio ?? "").trim()) miss.push("Domicilio");
    return miss;
}

/** Riga profilo dell'utente; regge anche il DB senza le colonne piu' nuove
 *  (mig. 120: cf; mig. 126: pec/domicilio). */
export async function caricaProfilo(userId: string): Promise<RigaProfilo | null> {
    const pieno = await supabase.from("app_users")
        .select("full_name, cf, email, pec, phone, address, iban, domicilio_diverso, domicilio")
        .eq("id", userId).maybeSingle();
    if (!pieno.error) return (pieno.data ?? null) as RigaProfilo | null;
    const conCf = await supabase.from("app_users").select("full_name, cf, email, phone, address, iban").eq("id", userId).maybeSingle();
    if (!conCf.error) return (conCf.data ?? null) as RigaProfilo | null;
    const { data } = await supabase.from("app_users").select("full_name, email, phone, address, iban").eq("id", userId).maybeSingle();
    return (data ?? null) as RigaProfilo | null;
}
