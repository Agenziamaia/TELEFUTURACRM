/**
 * MATCH VENDITE ↔ APPUNTAMENTI (cantiere 08/08, regole Luca).
 *
 * Quando si registra una vendita, si cerca l'appuntamento del CALL CENTER che
 * l'ha generata (ponte CF, finestra 30gg dalla data fissata). Poi:
 *  - STESSO negozio (sede radice dell'appuntamento == negozio di vendita) E
 *    venditore che lavora in quel negozio → si CHIEDE al venditore (popup) se
 *    associare: se sì, appuntamento "attivato" + cooperation al caller.
 *  - ALTRO negozio (o venditore che non lavora lì) → appuntamento
 *    "attivato_diverso_negozio": il negozio vede che il cliente si è mosso
 *    altrove, ma la cooperation NON sale (non è giusto). Automatico.
 *
 * REGOLE: ponte = CF (clients.cf_piva ↔ appointments.cf_piva/referente_cf; lato
 * pratiche calls.cf/piva), normalizzati upper/trim; finestra (Luca 10/08) =
 * vendita tra la DATA DELLA CHIAMATA (created_at: quando il caller ha fissato)
 * e +30gg dalla data fissata (appointments.date, già l'ultima) — l'anticipo
 * conta, prima della chiamata no; solo appuntamenti veri (type != 'richiamo');
 * ko/annullato si RIAPRONO se il CF si attiva in finestra.
 * Tutto lato client (anon) come il resto dell'app; la sicurezza sposterà queste
 * scritture dietro auth server.
 */

import { supabase } from "@/lib/supabaseClient";
import { storeRoot } from "@/lib/storeRoot";

// FINESTRA CONFIGURABILE (Luca 24/08): la regola dei 30 giorni si governa
// dal pannello Amministrazione → Call Center (caller_match_config, riga
// singola). Cache di modulo con fallback 30; resetCacheMatchConfig() la
// invalida dopo un salvataggio dal pannello.
let _finestraGg: number | null = null;
export function resetCacheMatchConfig() { _finestraGg = null; }
async function finestraGg(): Promise<number> {
    if (_finestraGg != null) return _finestraGg;
    try {
        const { data } = await supabase.from("caller_match_config").select("finestra_giorni").eq("id", 1).maybeSingle();
        const v = Number(data?.finestra_giorni);
        _finestraGg = Number.isFinite(v) && v > 0 ? v : 30;
    } catch { _finestraGg = 30; }
    return _finestraGg;
}
const normCf = (s: unknown) => String(s || "").trim().toUpperCase();
const soloData = (s: unknown) => { const m = String(s || "").match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : null; };
const addGiorni = (ymd: string, n: number) => { const [y, m, d] = ymd.split("-").map(Number); const x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };

export type AppuntamentoMatch = {
    id: number; date: string | null; store: string | null; status: string | null;
    created_by: string | null; type: string | null; customer_name: string | null;
    created_at: string | null;
};

/** Appuntamenti VERI (non richiami) aperti di un CF — per il banner e per il match.
 *  Il CF si filtra A DB (indice upper(cf_piva), mig. 192). */
export async function appuntamentiPerCF(cf: string, referenteCf?: string): Promise<AppuntamentoMatch[]> {
    const chiavi = [normCf(cf), normCf(referenteCf)].filter(Boolean);
    if (!chiavi.length) return [];
    const ors = chiavi.flatMap(k => [`cf_piva.ilike.${k}`, `referente_cf.ilike.${k}`]).join(",");
    const { data } = await supabase
        .from("appointments")
        .select("id, date, store, status, created_by, type, cf_piva, referente_cf, customer_name, created_at")
        .neq("type", "richiamo")
        .or(ors)
        .order("date", { ascending: false })
        .limit(200);
    return ((data || []) as (AppuntamentoMatch & { cf_piva: string | null; referente_cf: string | null })[])
        .filter(a => chiavi.includes(normCf(a.cf_piva)) || chiavi.includes(normCf(a.referente_cf)));
}

export type CandidatoMatch = { appuntamento: AppuntamentoMatch; stessoNegozio: boolean };

/**
 * Trova l'appuntamento aperto da agganciare a una vendita (QUALSIASI negozio,
 * entro finestra) e dice se è dello STESSO negozio della vendita (gemelli per
 * sede radice; appuntamento senza store → trattato come stesso, match cf-only).
 */
export async function trovaAppuntamentoDaAgganciare(
    cf: string, referenteCf: string | null, negozioVendita: string | null, dataVendita: string,
): Promise<CandidatoMatch | null> {
    const dv = soloData(dataVendita);
    if (!dv) return null;
    const gg = await finestraGg();
    const radiceVendita = negozioVendita ? storeRoot(negozioVendita) : null;
    // già attivato* = non si ri-tocca (evita che una seconda vendita in altro
    // negozio declassi una cooperation già assegnata). KO/ANNULLATO invece si
    // RIAPRONO (decisione Luca 10/08 via Verifiche): se il CF si attiva dentro
    // la finestra, la cooperation sale comunque.
    const CHIUSI = new Set(["attivato", "attivato_diverso_negozio"]);
    const cand = (await appuntamentiPerCF(cf, referenteCf || undefined))
        .filter(a => {
            if (a.status && CHIUSI.has(a.status)) return false;
            const ad = soloData(a.date);
            if (!ad) return false;
            // FINESTRA (regola Luca 10/08, N configurabile dal 24/08 in
            // Amministrazione → Call Center): dalla DATA DELLA CHIAMATA (quando
            // il caller ha fissato l'appuntamento) a +N giorni dalla data
            // fissata — il cliente in ANTICIPO conta, prima della chiamata no.
            const dallaChiamata = soloData(a.created_at) || ad;
            return dv >= dallaChiamata && dv <= addGiorni(ad, gg);
        })
        .sort((x, y) => String(y.date).localeCompare(String(x.date)));
    const a = cand[0];
    if (!a) return null;
    const stessoNegozio = !a.store || !radiceVendita || storeRoot(a.store) === radiceVendita;
    return { appuntamento: a, stessoNegozio };
}

/** Il venditore lavora nel negozio (radice)? — primary_store o user_stores.
 *  Se non si riesce a determinare, torna true (non blocca il merito per un dato
 *  mancante; il controllo di sede resta il filtro principale). */
export async function venditoreLavoraIn(venditore: string | null, radice: string): Promise<boolean> {
    if (!venditore) return true;
    try {
        const { data: u } = await supabase.from("app_users").select("id, primary_store").eq("full_name", venditore).limit(1);
        const rec = u && u[0];
        if (!rec) return true;
        if (rec.primary_store && storeRoot(String(rec.primary_store)) === radice) return true;
        const { data: us } = await supabase.from("user_stores").select("store_name").eq("user_id", rec.id);
        return (us || []).some((r: { store_name: string | null }) => r.store_name && storeRoot(String(r.store_name)) === radice);
    } catch { return true; }
}

/**
 * Aggancia una vendita a un appuntamento.
 * @param cooperation true = stesso negozio: "attivato" + cooperation al caller
 *   (collega la vendita alla pratica). false = altro negozio:
 *   "attivato_diverso_negozio", nessuna cooperation, ma l'appuntamento risulta
 *   comunque attivato (visibilità) e i malus caller cadono (onorato).
 * Best-effort: non solleva; torna false se l'attivazione fallisce.
 */
export async function agganciaVenditaAppuntamento(
    appuntamentoId: number, contractIds: string[], firma: string, cooperation: boolean,
): Promise<boolean> {
    try {
        const nuovoStatus = cooperation ? "attivato" : "attivato_diverso_negozio";
        const { error: e1 } = await supabase.from("appointments").update({ status: nuovoStatus }).eq("id", appuntamentoId);
        if (e1) { console.error("[MATCH-APP] appointments:", e1.message); return false; }
        // la vendita punta all'appuntamento SOLO se stesso negozio (cooperation)
        const primoCtr = contractIds.find(id => id.startsWith("CTR-")) || contractIds[0] || null;
        if (cooperation && contractIds.length) {
            const { error: e2 } = await supabase.from("contracts").update({ appointment_id: appuntamentoId }).in("id", contractIds);
            if (e2) console.error("[MATCH-APP] contracts:", e2.message);
        }
        // pratica caller collegata all'appuntamento: esce dal "da lavorare"; il
        // contract_id (cooperation) solo se stesso negozio
        const { data: pratiche } = await supabase.from("calls").select("id, stato, storico").eq("appointment_id", appuntamentoId);
        for (const p of (pratiche || []) as { id: string; stato: string | null; storico: unknown[] | null }[]) {
            const storico = Array.isArray(p.storico) ? [...p.storico] : [];
            const nuovoStato = cooperation ? "Attivato" : "Attivato Altro Negozio";
            storico.push({ data: new Date().toISOString(), caller: firma, campo: "stato", da: p.stato, a: nuovoStato, dettagli: cooperation ? "match vendita " + (primoCtr || "") : "cliente attivato in altro negozio" });
            await supabase.from("calls").update({ stato: nuovoStato, contract_id: cooperation ? primoCtr : null, storico }).eq("id", p.id);
            // il malus cade in entrambi i casi (l'appuntamento è stato onorato)
            await supabase.from("caller_malus")
                .update({ eliminato: true, eliminato_il: new Date().toISOString(), eliminato_da: firma })
                .eq("call_id", p.id).neq("stato", "compensato").eq("eliminato", false);
        }
        return true;
    } catch { return false; }
}
