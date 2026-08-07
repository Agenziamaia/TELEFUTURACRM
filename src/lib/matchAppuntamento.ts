/**
 * MATCH VENDITE ↔ APPUNTAMENTI (cantiere 08/08, regole Luca).
 *
 * Quando si registra una vendita, si cerca l'appuntamento del CALL CENTER che
 * l'ha generata e lo si aggancia: l'appuntamento passa a "attivato", la vendita
 * porta l'appointment_id, la pratica caller si collega alla vendita (esce dal
 * "da lavorare") e il malus caller relativo si annulla.
 *
 * REGOLE:
 *  - ponte = CF (clients.cf_piva ↔ appointments.cf_piva/referente_cf; lato
 *    pratiche calls.cf/piva). Normalizzati upper/trim.
 *  - finestra: la vendita cade tra la data appuntamento FISSATA e +30 giorni
 *    (appointments.date è già "l'ultima data fissata": il ri-fissaggio aggiorna
 *    la stessa riga). Un richiamo a vuoto non conta: gli appointments sono solo
 *    quelli veri (type != 'richiamo').
 *  - gemelli per SEDE FISICA: storeRoot(appointment.store) == radice del
 *    negozio di vendita (o appuntamento senza store → match sul solo CF).
 *  - si aggancia l'appuntamento aperto più recente entro la finestra; quelli
 *    già ko/annullato non si toccano.
 *
 * Tutto lato client (anon) come il resto dell'app; il progetto sicurezza
 * sposterà queste scritture dietro auth server.
 */

import { supabase } from "@/lib/supabaseClient";
import { storeRoot } from "@/lib/storeRoot";

const FINESTRA_GG = 30;
const normCf = (s: unknown) => String(s || "").trim().toUpperCase();
const soloData = (s: unknown) => { const m = String(s || "").match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : null; };
const addGiorni = (ymd: string, n: number) => { const [y, m, d] = ymd.split("-").map(Number); const x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };

export type AppuntamentoMatch = {
    id: number; date: string | null; store: string | null; status: string | null;
    created_by: string | null; type: string | null; customer_name: string | null;
};

/** Appuntamenti VERI (non richiami) aperti di un CF — per il banner e per il match.
 *  Il CF si filtra A DB (indice upper(cf_piva), mig. 192): senza, il limit
 *  tagliava i 200 appuntamenti più recenti dell'INTERO sistema e un match
 *  valido ma "vecchio" spariva silenziosamente. */
export async function appuntamentiPerCF(cf: string, referenteCf?: string): Promise<AppuntamentoMatch[]> {
    const chiavi = [normCf(cf), normCf(referenteCf)].filter(Boolean);
    if (!chiavi.length) return [];
    // CF/P.IVA sono alfanumerici: ilike senza wildcard = confronto esatto case-insensitive
    const ors = chiavi.flatMap(k => [`cf_piva.ilike.${k}`, `referente_cf.ilike.${k}`]).join(",");
    const { data } = await supabase
        .from("appointments")
        .select("id, date, store, status, created_by, type, cf_piva, referente_cf, customer_name")
        .neq("type", "richiamo")
        .or(ors)
        .order("date", { ascending: false })
        .limit(200);
    return ((data || []) as (AppuntamentoMatch & { cf_piva: string | null; referente_cf: string | null })[])
        .filter(a => chiavi.includes(normCf(a.cf_piva)) || chiavi.includes(normCf(a.referente_cf)));
}

/**
 * Trova l'appuntamento da agganciare a una vendita.
 * @param cf CF/P.IVA del cliente della vendita (e referente per i business)
 * @param negozioVendita nome puntuale del negozio di vendita (es. "Collatina W3")
 * @param dataVendita "YYYY-MM-DD"
 */
export async function trovaAppuntamentoDaAgganciare(
    cf: string, referenteCf: string | null, negozioVendita: string | null, dataVendita: string,
): Promise<AppuntamentoMatch | null> {
    const dv = soloData(dataVendita);
    if (!dv) return null;
    const radiceVendita = negozioVendita ? storeRoot(negozioVendita) : null;
    const CHIUSI = new Set(["ko", "annullato"]);   // già attivato va bene (lo si conferma), ko/annullato no
    const cand = (await appuntamentiPerCF(cf, referenteCf || undefined))
        .filter(a => {
            if (a.status && CHIUSI.has(a.status)) return false;
            const ad = soloData(a.date);
            if (!ad) return false;
            // la vendita deve cadere tra la data appuntamento e +30gg
            if (dv < ad || dv > addGiorni(ad, FINESTRA_GG)) return false;
            // sede fisica: stessa radice, o appuntamento senza store (richiami/domicilio)
            if (a.store && radiceVendita && storeRoot(a.store) !== radiceVendita) return false;
            return true;
        })
        .sort((x, y) => String(y.date).localeCompare(String(x.date)));   // il più recente entro finestra
    return cand[0] || null;
}

/**
 * Aggancia una vendita a un appuntamento: attiva l'appuntamento, collega le
 * righe contratto, collega e "chiude" la pratica caller (esce dal da-lavorare)
 * e ANNULLA (tombstone) gli eventuali malus caller della pratica.
 * Non solleva: il fallimento del match non deve MAI bloccare il salvataggio
 * della vendita (torna false, la vendita resta salva).
 */
export async function agganciaVenditaAppuntamento(
    appuntamentoId: number, contractIds: string[], firma: string,
): Promise<boolean> {
    try {
        // 1) appuntamento → attivato (se fallisce, stop: non creare stato parziale)
        const { error: e1 } = await supabase.from("appointments").update({ status: "attivato" }).eq("id", appuntamentoId);
        if (e1) { console.error("[MATCH-APP] appointments:", e1.message); return false; }
        // 2) le righe contratto puntano all'appuntamento
        if (contractIds.length) {
            const { error: e2 } = await supabase.from("contracts").update({ appointment_id: appuntamentoId }).in("id", contractIds);
            if (e2) console.error("[MATCH-APP] contracts:", e2.message);
        }
        // 3) pratica caller collegata all'appuntamento → collega la vendita,
        //    marca "Attivato" (esce dal da-lavorare) con evento nello storico
        const primoCtr = contractIds.find(id => id.startsWith("CTR-")) || contractIds[0] || null;
        const { data: pratiche } = await supabase.from("calls").select("id, stato, storico").eq("appointment_id", appuntamentoId);
        for (const p of (pratiche || []) as { id: string; stato: string | null; storico: unknown[] | null }[]) {
            const storico = Array.isArray(p.storico) ? [...p.storico] : [];
            storico.push({ data: new Date().toISOString(), caller: firma, campo: "stato", da: p.stato, a: "Attivato", dettagli: "match vendita " + (primoCtr || "") });
            await supabase.from("calls").update({ stato: "Attivato", contract_id: primoCtr, storico }).eq("id", p.id);
            // 4) annulla (tombstone) i malus caller di quella pratica non compensati
            await supabase.from("caller_malus")
                .update({ eliminato: true, eliminato_il: new Date().toISOString(), eliminato_da: firma })
                .eq("call_id", p.id).neq("stato", "compensato").eq("eliminato", false);
        }
        return true;
    } catch { return false; }
}
