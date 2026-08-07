/**
 * Catalogo come sorgente delle TENDINE (RIC-03).
 *
 * La struttura CatFiltro (categorie fini → prodotti → offerte → opzioni di un
 * brand) nasceva dentro Ricerca Vendite per i filtri in alto; ora serve anche
 * al modale di modifica contratto, quindi il loader vive qui, con cache di
 * modulo: stesse query di prima, un solo viaggio per brand per sessione.
 *
 * Le query NON filtrano su `attivo`: lo storico contiene voci spente e le
 * tendine devono poterle offrire (es. riassegnare a una vendita pre-catalogo
 * un'offerta ormai dismessa — decisione Luca 04/08).
 */

import { supabase } from "@/lib/supabaseClient";

export type CatFiltro = {
    slug: string;
    /** tutti i prodotti del brand (nomi unici, A–Z) */
    prodNames: string[];
    /** offerte per NOME prodotto */
    offByProd: Record<string, string[]>;
    /** tutte le offerte del brand */
    offNames: string[];
    /** categorie FINI del catalogo che il brand vende davvero, in ordine di catalogo */
    catNames: string[];
    /** prodotti per categoria fine */
    prodsByCat: Record<string, string[]>;
    /** offerte per categoria fine (via id prodotto: la stessa offerta può stare in più categorie) */
    offsByCat: Record<string, string[]>;
    /** opzioni per NOME offerta */
    opzByOff: Record<string, string[]>;
    /** opzioni COMPLETE per NOME offerta (nome, tipo, gruppo esclusivo) —
     *  servono all'editor opzioni del modale di Ricerca Vendite (Luca 07/08) */
    opzMetaByOff: Record<string, { nome: string; tipo: string | null; gruppo: string | null }[]>;
};

export type MargArticolo = { name: string; kind: string };

// Etichetta brand come scritta nei contratti → slug di catalog_brands.
// Le tendine brand restano sui BRAND_CANONICI (i nomi di catalog_brands
// "Very"/"Ho Mobile"/"Kena" creerebbero doppioni a DB): qui si traduce solo.
export const LABEL_SLUG: Record<string, string> = { "WindTre": "windtre", "Vodafone": "vodafone", "Fastweb": "fastweb", "Iliad": "iliad", "Sky": "sky", "TIM": "tim", "Tim": "tim", "S4": "s4", "Dojo": "dojo", "Very Mobile": "very", "Very": "very", "Ho. Mobile": "ho", "Ho Mobile": "ho", "Kena Mobile": "kena", "Kena": "kena" };

// ── Cache di modulo: il catalogo cambia di rado, un viaggio per brand basta ──
// MA il pannello amministrazione puo' aggiornarlo A SESSIONE APERTA: chi ha il
// modale di Ricerca Vendite vedrebbe la versione vecchia fino al reload della
// pagina. Percio' i loader accettano { fresh: true } (bypass della cache, che
// viene comunque RIAGGIORNATA: anche i filtri di pagina beneficiano del dato
// nuovo) e c'e' invalidaCatalogo() per svuotare tutto (Luca 05/08).
let _catNomi: { id: string; nome: string }[] | null = null;
let _catFiltro: Record<string, CatFiltro> = {};
let _margListino: MargArticolo[] | null = null;

/** Svuota la cache del catalogo: la prossima load rilegge dal DB. */
export function invalidaCatalogo() {
    _catNomi = null;
    _catFiltro = {};
    _margListino = null;
}

/** Categorie del catalogo (id + nome), in ordine di catalogo. */
export async function loadCatalogoCategorie(opts?: { fresh?: boolean }): Promise<{ id: string; nome: string }[]> {
    if (!_catNomi || opts?.fresh) {
        const rc = await supabase.from("catalog_categorie").select("id, nome").order("ordine");
        _catNomi = (rc.data ?? []) as { id: string; nome: string }[];
    }
    return _catNomi;
}

/** Catalogo completo di un brand (per slug), pronto per le tendine. */
export async function loadCatalogoBrand(slug: string, opts?: { fresh?: boolean }): Promise<CatFiltro> {
    const hit = _catFiltro[slug];
    if (hit && !opts?.fresh) return hit;
    const catNomi = await loadCatalogoCategorie(opts);
    const rp = await supabase.from("catalog_prodotti").select("id, nome, categoria_id").eq("brand_id", slug);
    const prods = (rp.data ?? []) as { id: string; nome: string; categoria_id: string }[];
    let offs: { id: string; prodotto_id: string; nome: string }[] = [];
    let opzs: { offerta_id: string; nome: string }[] = [];
    if (prods.length) {
        const ro = await supabase.from("catalog_offerte").select("id, prodotto_id, nome").in("prodotto_id", prods.map((x) => x.id));
        offs = (ro.data ?? []) as { id: string; prodotto_id: string; nome: string }[];
        if (offs.length) {
            const rz = await supabase.from("catalog_opzioni").select("offerta_id, nome, tipo, gruppo_singolo, ordine").order("ordine").in("offerta_id", offs.map((o) => o.id));
            opzs = (rz.data ?? []) as { offerta_id: string; nome: string; tipo?: string | null; gruppo_singolo?: string | null }[];
        }
    }
    // opzioni per NOME offerta (la stessa offerta può vivere in più categorie)
    const offNomeById: Record<string, string> = {}; offs.forEach((o) => { offNomeById[o.id] = o.nome; });
    const opzByOff: Record<string, string[]> = {};
    const opzMetaByOff: CatFiltro["opzMetaByOff"] = {};
    opzs.forEach((z) => {
        const on = offNomeById[z.offerta_id]; if (!on) return;
        (opzByOff[on] = opzByOff[on] || []).push(z.nome);
        const meta = (opzMetaByOff[on] = opzMetaByOff[on] || []);
        if (!meta.some((m) => m.nome === z.nome)) meta.push({ nome: z.nome, tipo: (z as { tipo?: string | null }).tipo ?? null, gruppo: (z as { gruppo_singolo?: string | null }).gruppo_singolo ?? null });
    });
    Object.keys(opzByOff).forEach((k) => { opzByOff[k] = Array.from(new Set(opzByOff[k])).sort(); });
    const nomeById: Record<string, string> = {}; prods.forEach((x) => { nomeById[x.id] = x.nome; });
    const offByProd: Record<string, string[]> = {};
    offs.forEach((o) => { const pn = nomeById[o.prodotto_id]; if (!pn) return; (offByProd[pn] = offByProd[pn] || []).push(o.nome); });
    Object.keys(offByProd).forEach((k) => { offByProd[k] = Array.from(new Set(offByProd[k])).sort(); });
    // categorie REALI del brand in ordine di catalogo + prodotti/offerte per categoria
    const catNames: string[] = []; const prodsByCat: Record<string, string[]> = {}; const offsByCat: Record<string, string[]> = {};
    catNomi.forEach((c) => {
        const suoiProds = prods.filter((p) => p.categoria_id === c.id);
        if (!suoiProds.length) return;
        catNames.push(c.nome);
        prodsByCat[c.nome] = Array.from(new Set(suoiProds.map((p) => p.nome))).sort();
        const ids = new Set(suoiProds.map((p) => p.id));
        offsByCat[c.nome] = Array.from(new Set(offs.filter((o) => ids.has(o.prodotto_id)).map((o) => o.nome))).sort();
    });
    const t: CatFiltro = { slug, prodNames: Array.from(new Set(prods.map((x) => x.nome))).sort(), offByProd, offNames: Array.from(new Set(offs.map((o) => o.nome))).sort(), catNames, prodsByCat, offsByCat, opzByOff, opzMetaByOff };
    _catFiltro[slug] = t;
    return t;
}

/** Listino Marginalità: articoli con il loro tipo (prodotti/servizi), A–Z. */
export async function loadMargListino(opts?: { fresh?: boolean }): Promise<MargArticolo[]> {
    if (_margListino && !opts?.fresh) return _margListino;
    const [rc, ri] = await Promise.all([
        supabase.from("marg_categories").select("id, kind"),
        // anche gli articoli spenti: lo storico li contiene
        supabase.from("marg_items").select("name, category_id"),
    ]);
    const kindById: Record<string, string> = {};
    (rc.data ?? []).forEach((c: { id: string; kind: string }) => { kindById[c.id] = c.kind; });
    const list = (ri.data ?? []).map((i: { name: string; category_id: string }) => ({ name: i.name, kind: kindById[i.category_id] || "prodotti" }));
    // voce AUTO del Registra (telefono a rate/listino): non sta nel listino
    // marg_items ma nelle vendite c'è, ed è un prodotto.
    list.push({ name: "Telefono TNP (listino)", kind: "prodotti" });
    _margListino = Array.from(new Map(list.map((x) => [x.name, x])).values()).sort((a, b) => a.name.localeCompare(b.name));
    return _margListino;
}
