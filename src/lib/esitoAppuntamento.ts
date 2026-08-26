"use client";

/**
 * ESITO APPUNTAMENTO — logica CONDIVISA tra Calendario e widget Home
 * «Agenda del giorno» (estratta il 26/08 dal calendario per non duplicarla:
 * l'esito del negozio deve SEMPRE arrivare anche sulla pratica caller —
 * storico + stato per gli esiti definitivi, fix del 10/08).
 *
 * Regole rispettate qui come nel calendario:
 *  - «attivato» / «attivato_diverso_negozio» NON si scrivono a mano: li
 *    scrive solo il match vendita↔appuntamento;
 *  - «ko» dal negozio = «Venuto Non Interessato» (flusso a due step 11/08:
 *    definitivo lo mette solo il caller dopo la verifica);
 *  - lo storico della pratica registra sempre origine e chiave esito.
 */
import { supabase } from "@/lib/supabaseClient";

export const STATO_CALL_DA_ESITO: Record<string, string> = {
    attivato: "Attivato",
    attivato_diverso_negozio: "Attivato Altro Negozio",
    ko: "Venuto Non Interessato",
    no_show: "Non andato",
    annullato: "Annullato",
};

// etichette degli esiti da calendario_esiti (cache di modulo, un fetch)
let _etichette: Record<string, string> | null = null;
async function etichetteEsiti(): Promise<Record<string, string>> {
    if (_etichette) return _etichette;
    const { data } = await supabase.from("calendario_esiti").select("chiave, etichetta");
    _etichette = Object.fromEntries(((data || []) as { chiave: string; etichetta: string }[]).map(r => [r.chiave, r.etichetta]));
    return _etichette;
}
const label = (m: Record<string, string>, chiave: string | null | undefined) =>
    (chiave && (m[chiave] || chiave)) || "—";

/** Sincronizza l'esito del negozio sulla pratica caller collegata
 *  (storico sempre; stato solo per le chiavi mappate). Best-effort. */
export async function sincronizzaEsitoSuPratica(apptId: number | string, daLabel: string, aLabel: string, chiaveEsito: string, autore: string) {
    try {
        const { data: pratiche } = await supabase.from("calls").select("id, stato, storico").eq("appointment_id", apptId);
        for (const p of (pratiche || []) as { id: string; stato: string | null; storico: unknown[] | null }[]) {
            const storico = Array.isArray(p.storico) ? [...p.storico] : [];
            storico.push({
                data: new Date().toISOString(), caller: autore || "Negozio",
                campo: "Esito negozio", da: daLabel, a: aLabel,
                dettagli: { origine: "calendario", esito: chiaveEsito },
            });
            const nuovo = STATO_CALL_DA_ESITO[chiaveEsito];
            const upd: Record<string, unknown> = { storico };
            if (nuovo && p.stato !== nuovo) upd.stato = nuovo;
            await supabase.from("calls").update(upd).eq("id", p.id);
        }
    } catch { /* best-effort */ }
}

/** Esita un appuntamento COME farebbe il calendario: update dello status +
 *  sincronizzazione sulla pratica caller. Ritorna l'eventuale errore. */
export async function esitaAppuntamento(
    apptId: number | string, chiaveNuova: string, chiavePrima: string | null | undefined, autore: string,
): Promise<{ error: string | null }> {
    if (chiaveNuova === "attivato" || chiaveNuova === "attivato_diverso_negozio") {
        return { error: "«Attivato» lo scrive solo il match con la vendita" };
    }
    const { error } = await supabase.from("appointments").update({ status: chiaveNuova }).eq("id", apptId);
    if (error) return { error: error.message };
    const m = await etichetteEsiti();
    await sincronizzaEsitoSuPratica(apptId, label(m, chiavePrima), label(m, chiaveNuova), chiaveNuova, autore);
    return { error: null };
}
