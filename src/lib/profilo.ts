"use client";

// PROFILO PERSONALE (Luca 31/07): i campi che ogni utente vede e mantiene dal
// proprio profilo (icona in alto a destra). Prima compilazione LIBERA (scrive
// subito su app_users); la MODIFICA di un dato gia' presente passa da una
// richiesta che l'amministrazione approva (tabella profilo_richieste, mig. 120).
import { supabase } from "@/lib/supabaseClient";

export const CAMPI_PROFILO = [
    { campo: "full_name", label: "Nome e cognome" },
    { campo: "cf", label: "Codice fiscale" },
    { campo: "email", label: "Email" },
    { campo: "phone", label: "Cellulare" },
    { campo: "address", label: "Indirizzo di residenza" },
    { campo: "iban", label: "IBAN" },
] as const;

export type RigaProfilo = {
    full_name?: string | null; cf?: string | null; email?: string | null;
    phone?: string | null; address?: string | null; iban?: string | null;
};

export function campiMancanti(r: RigaProfilo | null): string[] {
    if (!r) return [];
    return CAMPI_PROFILO
        .filter((c) => !String((r as Record<string, unknown>)[c.campo] ?? "").trim())
        .map((c) => c.label);
}

/** Riga profilo dell'utente; regge anche il DB senza la colonna cf (mig. 120). */
export async function caricaProfilo(userId: string): Promise<RigaProfilo | null> {
    const tent = await supabase.from("app_users").select("full_name, cf, email, phone, address, iban").eq("id", userId).maybeSingle();
    if (!tent.error) return (tent.data ?? null) as RigaProfilo | null;
    const { data } = await supabase.from("app_users").select("full_name, email, phone, address, iban").eq("id", userId).maybeSingle();
    return (data ?? null) as RigaProfilo | null;
}
