import { supabaseAdmin } from "@/lib/supabaseAdmin";

/* ═══ SCRIVERE LA STORIA DI UNA RICARICA ═══════════════════════════════════
   Una riga di `paystore_ricariche` porta solo l'ULTIMO stato, l'ULTIMO errore,
   l'ULTIMO tentativo: ogni correzione cancella quella prima. Qui resta tutto.

   ⚠️ SCRIVERE UN EVENTO NON DEVE MAI FAR FALLIRE IL GESTO. Se il registro non
   si scrive, la ricarica deve partire lo stesso: un diario che blocca il lavoro
   è peggio di un diario che manca. Per questo `annota` non solleva mai. */

export type TipoEvento = "modifica" | "stato" | "invio" | "riconciliata";

export async function annota(
    ricaricaId: string,
    tipo: TipoEvento,
    testo: string,
    chi?: string | null,
    dati?: Record<string, unknown>,
): Promise<void> {
    try {
        await supabaseAdmin.from("paystore_eventi").insert({
            ricarica_id: ricaricaId, tipo, testo,
            chi: chi || null, dati: dati || null,
        });
    } catch { /* vedi sopra: il diario non comanda */ }
}

/** Il nome leggibile di chi sta facendo il gesto. */
export async function nomeDi(userId: string | null | undefined): Promise<string> {
    if (!userId) return "motore";
    const { data } = await supabaseAdmin.from("app_users").select("full_name").eq("id", userId).maybeSingle();
    return (data as { full_name?: string } | null)?.full_name || userId;
}
