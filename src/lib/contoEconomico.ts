/**
 * CONTO ECONOMICO PER PUNTO VENDITA — il motore (cantiere 07/08).
 *
 * Replica il modello del foglio 'Costi & Ricavi' dell'Excel mensile:
 * per ogni RADICE di negozio (storeRoot: i gemelli si sommano)
 *   Utile = Ricavi (Marginalità + righe brand) − Costi
 *   Costi = Parz. Struttura (11 voci) + Collaboratori + Condivisi + Formazione
 *           + Telefonico (RIPARTO AUTOMATICO) + Partnership W3 (± malus)
 *   Telefonico(pv) = appuntamenti(pv) × costo_reparto / Σ appuntamenti
 *                    (chiave verificata sulle formule del foglio; costo reparto
 *                     in ce_parametri 'telefonico_costo_reparto', default 11.400)
 *
 * RICAVI:
 *  - Marginalità = righe contracts EXT- (brand "Marginalità") per competenza
 *    `data`: RICAVO = Σ importi (replica Excel: incassi; i bundle Vodafone
 *    contano × coefficiente, come il "Bundel Systema" del foglio) e in
 *    parallelo MARGINE ricalcolato per NOME voce — mai fidarsi di
 *    dettagli.margin: le voci auto (Sim/Sost/Bundle) sono salvate con margin=0.
 *  - Righe brand (Wind3, Vodafone, Sky, Fastweb, Iliad, Energia): i contracts
 *    non hanno campi €; finché il listino compensi (ce_compensi_brand, fase 4)
 *    non è attivo il motore espone i PEZZI e ricavo 0 con warning esplicito.
 *
 * Prospect = proiezione LINEARE dichiarata (giorni lavorati lun-sab, esclusa
 * solo la domenica): a mese chiuso fattore 1 → prospect ≡ actual.
 *
 * Usato da: pagina /conto-economico, GET /api/ce/dataset e (in futuro)
 * /api/riunione/dataset del deck builder. Query contracts SEMPRE via
 * caricaTutte (tetto 1000 di PostgREST).
 */

import { supabase } from "@/lib/supabaseClient";
import { caricaTutte } from "@/lib/fetchTutte";
import { storeRoot, CE_ROOTS_ORDINE } from "@/lib/storeRoot";
import { regimeVoce, margineUnitario, type MargPannelloItem } from "@/lib/margMargini";

export const CE_VOCI_STRUTTURA = [
    "affitto", "luce", "utenze", "materiali", "assicurazione", "allarme", "sicurezza",
    "immondizia", "commercialista", "consulente", "insegna",
] as const;
export type CeVoceStruttura = typeof CE_VOCI_STRUTTURA[number];
export const CE_VOCI_LUMP = ["collaboratori", "condivisi", "formazione", "partnership_w3", "malus_partnership"] as const;

export const CE_BRAND_ROWS = ["wind3", "vodafone", "sky", "fastweb", "iliad", "energia", "altri"] as const;
export type CeBrandRow = typeof CE_BRAND_ROWS[number];

export interface CeVoceMarg {
    id: string; nome: string; negozio: string; venditore: string | null; data: string;
    qty: number; importo: number; margine: number; bundle: boolean;
}
export interface CeNegozio {
    nome: string;
    ricavi: {
        marginalita: number; wind3: number; vodafone: number; sky: number;
        fastweb: number; iliad: number; energia: number; altri: number; actual_tot: number;
    };
    marginalita_margine: number;      // vista azienda: margine ricalcolato per nome
    pezzi: Record<CeBrandRow, number>; // contratti brand per riga CE (conteggio)
    costi: {
        struttura: Record<CeVoceStruttura, number> & { parz_struttura: number };
        collaboratori: number; condivisi: number; formazione: number;
        telefonico: number; partnership_w3: number; malus_partnership: number; totale: number;
    };
    utile_actual: number;
    appuntamenti_telefonico: number;
    prospect: { ricavi_tot: number; utile: number };
    voci_marg?: CeVoceMarg[];         // drill-down (solo con opts.dettagli)
}
export interface CeDataset {
    mese: string;                      // YYYY-MM
    negozi: CeNegozio[];
    fuori_mappa: { negozio: string; pratiche: number; marginalita: number; marginalita_margine: number }[];
    totali: {
        ricavi: number; costi: number; utile: number;
        marginalita: number; marginalita_margine: number; telefonico: number; appuntamenti: number;
    };
    warnings: string[];
    meta: {
        calcolato_il: string; live: true; prospect_metodo: "lineare"; prospect_fattore: number;
        costo_reparto_telefonico: number; bundle_coeff: number;
        copertura_vendite_dal: string | null; voci_senza_regime: string[];
        compensi: { valorizzati: number; non_valorizzati: number; conflitti: number };
    };
}

const _brandKey = (b: unknown) => String(b || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const BRAND_TO_ROW: Record<string, CeBrandRow> = {
    windtre: "wind3", vodafone: "vodafone", sky: "sky", fastweb: "fastweb",
    iliad: "iliad", s4: "energia",
};
const rigaBrand = (brand: unknown): CeBrandRow => BRAND_TO_ROW[_brandKey(brand)] || "altri";

const isBundleNome = (nome: unknown) => /bundle/i.test(String(nome || ""));
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Fattore di proiezione lineare: giorni lavorati (lun-sab) del mese ÷ trascorsi. */
export function fattoreProspect(mese: string, oggi = new Date()): number {
    const [y, m] = mese.split("-").map(Number);
    const inMese = oggi.getFullYear() === y && oggi.getMonth() + 1 === m;
    const primaDelMese = oggi.getFullYear() < y || (oggi.getFullYear() === y && oggi.getMonth() + 1 < m);
    if (!inMese) return primaDelMese ? 1 : 1;   // mese chiuso (o futuro): actual = prospect
    const giorniMese = new Date(y, m, 0).getDate();
    let tot = 0, trascorsi = 0;
    for (let g = 1; g <= giorniMese; g++) {
        const dow = new Date(y, m - 1, g).getDay();
        if (dow === 0) continue;                 // esclusa SOLO la domenica
        tot++;
        if (g <= oggi.getDate()) trascorsi++;
    }
    return trascorsi > 0 ? tot / trascorsi : 1;
}

export async function computeContoEconomico(mese: string, opts?: { dettagli?: boolean }): Promise<CeDataset> {
    const primo = `${mese}-01`;
    const ultimo = `${mese}-31`;
    const warnings: string[] = [];

    const [stores, costiRes, appRes, parRes, margItemsRes, contrattiRes, compensiRes] = await Promise.all([
        supabase.from("stores").select("name, is_ufficio"),
        supabase.from("ce_costi_mensili").select("store_root, voce, importo").eq("month", primo),
        supabase.from("ce_telefonico_appuntamenti").select("store_root, appuntamenti").eq("month", primo),
        supabase.from("ce_parametri").select("chiave, month, valore_num"),
        supabase.from("marg_items").select("name, cost_mode, company_cost, margin_percent").eq("active", true),
        caricaTutte<{ id: string; brand: string; negozio: string | null; venditore: string | null; data: string; prodotto: string | null; tipo_cliente: string | null; categoria: string | null; offerta: string | null; opzioni: { nome?: string; quantita?: number | null }[] | null; dettagli: Record<string, unknown> | null; nascosta_gestione: boolean | null }>(
            (from, to) => supabase.from("contracts")
                .select("id, brand, negozio, venditore, data, prodotto, tipo_cliente, categoria, offerta, opzioni, dettagli, nascosta_gestione")
                .gte("data", primo).lte("data", ultimo)
                .or("is_demo.is.null,is_demo.eq.false")
                .order("id").range(from, to)),
        supabase.from("ce_compensi_brand").select("*").eq("attivo", true),
    ]);

    if (contrattiRes.error) warnings.push(`Lettura contratti incompleta: ${contrattiRes.error.message || "errore"}`);
    if (compensiRes.error) warnings.push(`Lettura listino compensi FALLITA (${compensiRes.error.message || "errore"}): ricavi brand a 0 per errore tecnico, non per listino vuoto.`);
    const contratti = (contrattiRes.data || []).filter(c => c.nascosta_gestione !== true);
    const pannello: MargPannelloItem[] = (margItemsRes.data as MargPannelloItem[]) || [];

    // parametri: override del mese poi default globale
    const par = (chiave: string, fallback: number): number => {
        const righe = (parRes.data || []) as { chiave: string; month: string | null; valore_num: number | null }[];
        const mesePar = righe.find(r => r.chiave === chiave && r.month === primo);
        if (mesePar?.valore_num != null) return Number(mesePar.valore_num);
        const def = righe.find(r => r.chiave === chiave && r.month === null);
        return def?.valore_num != null ? Number(def.valore_num) : fallback;
    };
    const costoReparto = par("telefonico_costo_reparto", 11400);
    const bundleCoeff = par("bundle_coeff_default", 0.60);   // frazione (0.60 = 60%)

    // ── LISTINO COMPENSI BRAND (mig. 189): match gerarchico, il più specifico
    //    vince; niente match = bucket "non valorizzato", MAI zero silenzioso.
    type CompensoRow = {
        id: string; brand: string; tipo_cliente: string | null; categoria: string | null;
        prodotto: string | null; offerta: string | null; opzione: string | null;
        compenso: number; regime: string; mese_da: string | null; mese_a: string | null;
    };
    const compensi = ((compensiRes.data || []) as CompensoRow[])
        .filter(r => r.regime === "fisso")
        .filter(r => (!r.mese_da || r.mese_da <= primo) && (!r.mese_a || r.mese_a >= primo));
    const normTx = (s: unknown) => String(s ?? "").trim().toLowerCase();
    const compensiPerBrand = new Map<string, CompensoRow[]>();
    compensi.forEach(r => {
        const k = _brandKey(r.brand);
        if (!compensiPerBrand.has(k)) compensiPerBrand.set(k, []);
        compensiPerBrand.get(k)!.push(r);
    });
    let compValorizzati = 0, compNonValorizzati = 0, compConflitti = 0;
    const risolviCompenso = (c: { brand: string; tipo_cliente: string | null; categoria: string | null; prodotto: string | null; offerta: string | null; opzioni: { nome?: string; quantita?: number | null }[] | null }): number | null => {
        const cand = compensiPerBrand.get(_brandKey(c.brand));
        if (!cand?.length) return null;
        const opz = Array.isArray(c.opzioni) ? c.opzioni : [];
        let best: { row: CompensoRow; score: number; qty: number }[] = [];
        for (const r of cand) {
            let score = 0;
            if (r.tipo_cliente != null) { if (normTx(r.tipo_cliente) !== normTx(c.tipo_cliente)) continue; score++; }
            if (r.categoria != null) { if (normTx(r.categoria) !== normTx(c.categoria)) continue; score++; }
            if (r.prodotto != null) { if (normTx(r.prodotto) !== normTx(c.prodotto)) continue; score++; }
            if (r.offerta != null) { if (normTx(r.offerta) !== normTx(c.offerta)) continue; score++; }
            let qty = 1;
            if (r.opzione != null) {
                const trovata = opz.find(o => normTx(o?.nome) === normTx(r.opzione));
                if (!trovata) continue;
                score++; qty = Math.max(1, Number(trovata.quantita || 1));
            }
            if (!best.length || score > best[0].score) best = [{ row: r, score, qty }];
            else if (score === best[0].score) best.push({ row: r, score, qty });
        }
        if (!best.length) return null;
        if (best.length > 1 && new Set(best.map(b => Number(b.row.compenso))).size > 1) compConflitti++;
        return Number(best[0].row.compenso) * best[0].qty;
    };

    // radici: negozi veri (uffici esclusi) + le 12 colonne canoniche
    const radici: string[] = [...CE_ROOTS_ORDINE];
    ((stores.data || []) as { name: string; is_ufficio: boolean | null }[])
        .filter(s => !s.is_ufficio)
        .map(s => storeRoot(s.name))
        .forEach(r => { if (r && !radici.includes(r)) radici.push(r); });
    const radiciSet = new Set(radici);

    // impianto per radice
    type Acc = {
        ricaviBrand: Record<CeBrandRow, number>; pezzi: Record<CeBrandRow, number>;
        marg: number; margMargine: number; voci: CeVoceMarg[];
    };
    const vuoto = (): Acc => ({
        ricaviBrand: { wind3: 0, vodafone: 0, sky: 0, fastweb: 0, iliad: 0, energia: 0, altri: 0 },
        pezzi: { wind3: 0, vodafone: 0, sky: 0, fastweb: 0, iliad: 0, energia: 0, altri: 0 },
        marg: 0, margMargine: 0, voci: [],
    });
    const perRadice = new Map<string, Acc>();
    radici.forEach(r => perRadice.set(r, vuoto()));
    const fuori = new Map<string, { pratiche: number; marginalita: number; marginalita_margine: number }>();
    const senzaRegime = new Set<string>();
    let pezziBrandTot = 0;
    let minData: string | null = null;

    for (const c of contratti) {
        if (c.data && (!minData || c.data < minData)) minData = c.data;
        const radice = storeRoot(c.negozio || "");
        const dentro = radiciSet.has(radice);
        const acc = dentro ? perRadice.get(radice)! : null;
        const fm = dentro ? null : (fuori.get(radice || "(vuoto)") || { pratiche: 0, marginalita: 0, marginalita_margine: 0 });

        if (c.brand === "Marginalità") {
            const det = c.dettagli || {};
            const qty = Math.max(1, Math.round(num(det["qty"]) || 1));
            const price = num(det["price"]);
            const importoRaw = det["importo"] != null ? num(det["importo"]) : price * qty;
            const bundle = isBundleNome(det["product"] ?? c.prodotto);
            // RICAVO (replica Excel): incasso; i bundle contano × coefficiente
            const ricavo = bundle ? importoRaw * bundleCoeff : importoRaw;
            // MARGINE (vista azienda): salvato se ≠0, altrimenti ricalcolo per nome
            let margine = det["totalMargin"] != null ? num(det["totalMargin"]) : num(det["margin"]) * qty;
            if (!margine) {
                if (bundle) margine = importoRaw * bundleCoeff;
                else {
                    const regime = regimeVoce(String(det["product"] ?? c.prodotto ?? ""), pannello);
                    // prezzo UNITARIO: dettagli.price può contenere il TOTALE
                    // (RV lo valorizza con l'importo digitato) — si divide per qty,
                    // così pct/cost non vengono moltiplicati due volte
                    if (regime) {
                        const unit = qty > 0 ? importoRaw / qty : (price || 0);
                        margine = margineUnitario(regime, unit) * qty;
                    } else if (importoRaw) senzaRegime.add(String(det["product"] ?? c.prodotto ?? "?"));
                }
            }
            if (acc) {
                acc.marg += ricavo; acc.margMargine += margine;
                if (opts?.dettagli) acc.voci.push({
                    id: c.id, nome: String(det["product"] ?? c.prodotto ?? "?"), negozio: c.negozio || "",
                    venditore: c.venditore, data: c.data, qty, importo: round2(ricavo), margine: round2(margine), bundle,
                });
            } else if (fm) { fm.marginalita += ricavo; fm.marginalita_margine += margine; fm.pratiche++; }
        } else {
            // riga brand: pezzi sempre; € dal listino compensi (match gerarchico).
            // KIPOINT ESCLUSO dal listino: i suoi € vivono già nella voce
            // marginalità generata alla vendita (una regola qui = doppio conteggio).
            const riga = rigaBrand(c.brand);
            const kipoint = _brandKey(c.brand) === "kipoint";
            const compenso = kipoint ? null : risolviCompenso(c);
            if (!kipoint) { if (compenso != null) compValorizzati++; else compNonValorizzati++; }
            if (acc) {
                acc.pezzi[riga]++; pezziBrandTot++;
                if (compenso != null) acc.ricaviBrand[riga] += compenso;
            } else if (fm) fm.pratiche++;
        }
        if (!dentro) fuori.set(radice || "(vuoto)", fm!);
    }

    // costi per radice
    const costiPerRadice = new Map<string, Map<string, number>>();
    ((costiRes.data || []) as { store_root: string; voce: string; importo: number }[]).forEach(r => {
        if (!costiPerRadice.has(r.store_root)) costiPerRadice.set(r.store_root, new Map());
        costiPerRadice.get(r.store_root)!.set(r.voce, num(r.importo));
    });

    // appuntamenti e riparto telefonico
    const appPerRadice = new Map<string, number>();
    ((appRes.data || []) as { store_root: string; appuntamenti: number }[]).forEach(r =>
        appPerRadice.set(r.store_root, num(r.appuntamenti)));
    const appTot = [...appPerRadice.values()].reduce((s, v) => s + v, 0);
    if (!appTot) warnings.push("Appuntamenti telefonico del mese non inseriti: riparto telefonico a 0 su tutti i negozi.");

    const fattore = fattoreProspect(mese);
    const negozi: CeNegozio[] = radici.map(nome => {
        const acc = perRadice.get(nome)!;
        const cm = costiPerRadice.get(nome) || new Map<string, number>();
        const struttura = {} as Record<CeVoceStruttura, number> & { parz_struttura: number };
        let parz = 0;
        CE_VOCI_STRUTTURA.forEach(v => { const x = cm.get(v) || 0; struttura[v] = x; parz += x; });
        struttura.parz_struttura = parz;
        const app = appPerRadice.get(nome) || 0;
        const telefonico = appTot > 0 ? app * costoReparto / appTot : 0;
        const collaboratori = cm.get("collaboratori") || 0;
        const condivisi = cm.get("condivisi") || 0;
        const formazione = cm.get("formazione") || 0;
        const partnership = cm.get("partnership_w3") || 0;
        const malusPartnership = cm.get("malus_partnership") || 0;
        const totaleCosti = parz + collaboratori + condivisi + formazione + telefonico + partnership + malusPartnership;
        const rb = acc.ricaviBrand;
        const actualTot = acc.marg + rb.wind3 + rb.vodafone + rb.sky + rb.fastweb + rb.iliad + rb.energia + rb.altri;
        return {
            nome,
            ricavi: {
                marginalita: acc.marg, wind3: rb.wind3, vodafone: rb.vodafone, sky: rb.sky,
                fastweb: rb.fastweb, iliad: rb.iliad, energia: rb.energia, altri: rb.altri, actual_tot: actualTot,
            },
            marginalita_margine: acc.margMargine,
            pezzi: acc.pezzi,
            costi: {
                struttura, collaboratori, condivisi, formazione, telefonico,
                partnership_w3: partnership, malus_partnership: malusPartnership, totale: totaleCosti,
            },
            utile_actual: actualTot - totaleCosti,
            appuntamenti_telefonico: app,
            prospect: { ricavi_tot: actualTot * fattore, utile: actualTot * fattore - totaleCosti },
            ...(opts?.dettagli ? { voci_marg: acc.voci } : {}),
        };
    });

    if (compNonValorizzati > 0) warnings.push(
        compValorizzati > 0
            ? `Compensi brand: ${compValorizzati} contratti valorizzati dal listino, ${compNonValorizzati} SENZA regola (contati solo a pezzi) — completare il listino compensi.`
            : `Ricavi brand non ancora valorizzati: ${pezziBrandTot} contratti del mese contati a pezzi — compilare il listino compensi (💶 in pagina).`);
    if (compConflitti > 0) warnings.push(
        `Listino compensi: ${compConflitti} contratti con regole in CONFLITTO a pari specificità e importi diversi — rivedere il listino.`);
    if (minData && minData > primo && mese === "2026-07") warnings.push(
        `Copertura parziale: vendite a CRM solo dal ${minData} (il gestionale è partito a fine luglio).`);
    const fuoriArr = [...fuori.entries()].map(([negozio, v]) => ({
        negozio, pratiche: v.pratiche,
        marginalita: round2(v.marginalita), marginalita_margine: round2(v.marginalita_margine),
    }));
    if (fuoriArr.length) warnings.push(
        `${fuoriArr.reduce((s, f) => s + f.pratiche, 0)} pratiche su centri fuori dalle colonne (${fuoriArr.map(f => f.negozio).join(", ")}): mostrate a parte, mai sommate ai negozi.`);
    if (senzaRegime.size) warnings.push(
        `Voci marginalità senza regime di margine (né pannello né listino storico): ${[...senzaRegime].join(", ")} — margine contato 0.`);

    const totali = {
        ricavi: round2(negozi.reduce((s, n) => s + n.ricavi.actual_tot, 0)),
        costi: round2(negozi.reduce((s, n) => s + n.costi.totale, 0)),
        utile: round2(negozi.reduce((s, n) => s + n.utile_actual, 0)),
        marginalita: round2(negozi.reduce((s, n) => s + n.ricavi.marginalita, 0)),
        marginalita_margine: round2(negozi.reduce((s, n) => s + n.marginalita_margine, 0)),
        telefonico: round2(negozi.reduce((s, n) => s + n.costi.telefonico, 0)),
        appuntamenti: appTot,
    };

    return {
        mese, negozi, fuori_mappa: fuoriArr, totali, warnings,
        meta: {
            calcolato_il: new Date().toISOString(), live: true,
            prospect_metodo: "lineare", prospect_fattore: fattore,
            costo_reparto_telefonico: costoReparto, bundle_coeff: bundleCoeff,
            copertura_vendite_dal: minData, voci_senza_regime: [...senzaRegime],
            compensi: { valorizzati: compValorizzati, non_valorizzati: compNonValorizzati, conflitti: compConflitti },
        },
    };
}
