/**
 * ALLEGATO CONTRATTO — regola amministrabile dal Catalogo (MOD-31, Luca 10/08).
 *
 * Lo step Allegati di Registra Vendita chiede il contratto secondo la colonna
 * `contratto_richiesto` del catalogo, risolta dal livello piu' SPECIFICO al
 * piu' generale: offerta → prodotto → categoria → brand → default.
 * NULL a un livello = eredita dal livello sopra; default finale = obbligatorio.
 *
 * Il registro si riempie man mano che Registra Vendita carica il catalogo
 * (brand tutti insieme, albero per brand). REGISTRO VUOTO o colonna assente
 * (migrazione non applicata) = fallback sulle vecchie regole hardcoded
 * (Iliad assente, Sky facoltativo, resto obbligatorio): il CRM non cambia
 * comportamento finche' il dato non c'e'.
 */

export type ContrattoRichiesto = "obbligatorio" | "facoltativo" | "assente";

const VALIDI = ["obbligatorio", "facoltativo", "assente"];
const norm = (v: unknown): ContrattoRichiesto | null =>
    VALIDI.includes(String(v || "")) ? (String(v) as ContrattoRichiesto) : null;

const REG = {
    brands: new Map<string, ContrattoRichiesto>(),
    categorie: new Map<string, ContrattoRichiesto>(),     // per NOME (globale)
    prodotti: new Map<string, ContrattoRichiesto>(),      // brand|tipo|categoria|prodotto
    offerte: new Map<string, ContrattoRichiesto>(),       // brand|tipo|categoria|prodotto|offerta
};

const kProd = (brand: string, tipo: string, categoria: string, prodotto: string) =>
    [brand, tipo, categoria, prodotto].map((s) => String(s || "").trim().toLowerCase()).join("|");

/** Da chiamare quando si caricano i catalog_brands (una volta, tutti). */
export function registraContrattoBrands(rows: { id: string; contratto_richiesto?: string | null }[] | null | undefined) {
    (rows ?? []).forEach((r) => {
        const v = norm(r.contratto_richiesto);
        if (v) REG.brands.set(String(r.id).toLowerCase(), v);
        else REG.brands.delete(String(r.id).toLowerCase());
    });
}

/** Da chiamare quando si carica l'albero di UN brand (categorie globali,
 *  prodotti del brand, offerte con prodotto_id). */
export function registraContrattoAlbero(
    brandSlug: string,
    categorie: { id: string; nome: string; contratto_richiesto?: string | null }[],
    prodotti: { id: string; tipo_cliente: string; categoria_id: string; nome: string; contratto_richiesto?: string | null }[],
    offerte: { prodotto_id: string; nome: string; contratto_richiesto?: string | null }[],
) {
    const nomeCat = new Map(categorie.map((c) => [c.id, c.nome] as [string, string]));
    categorie.forEach((c) => {
        const v = norm(c.contratto_richiesto);
        const k = String(c.nome || "").trim().toLowerCase();
        if (v) REG.categorie.set(k, v); else REG.categorie.delete(k);
    });
    const keyDiProd = new Map<string, string>();
    prodotti.forEach((p) => {
        const k = kProd(brandSlug, p.tipo_cliente, nomeCat.get(p.categoria_id) || "", p.nome);
        keyDiProd.set(p.id, k);
        const v = norm(p.contratto_richiesto);
        if (v) REG.prodotti.set(k, v); else REG.prodotti.delete(k);
    });
    offerte.forEach((o) => {
        const pk = keyDiProd.get(o.prodotto_id);
        if (!pk) return;
        const k = pk + "|" + String(o.nome || "").trim().toLowerCase();
        const v = norm(o.contratto_richiesto);
        if (v) REG.offerte.set(k, v); else REG.offerte.delete(k);
    });
}

/** Regole storiche hardcoded: valgono da fallback finale (e replicano il seed). */
function fallbackLegacy(brandSlug: string): ContrattoRichiesto {
    const b = String(brandSlug || "").toLowerCase();
    if (b === "iliad") return "assente";
    if (b === "sky") return "facoltativo";
    return "obbligatorio";
}

/** Stato del contratto per una riga di vendita: piu' specifico vince. */
export function contrattoRichiestoPer(
    brandSlug: string, tipoCliente: string, categoria: string, prodotto: string, offerta: string,
): ContrattoRichiesto {
    const pk = kProd(brandSlug, tipoCliente, categoria, prodotto);
    const vOff = REG.offerte.get(pk + "|" + String(offerta || "").trim().toLowerCase());
    if (vOff) return vOff;
    const vProd = REG.prodotti.get(pk);
    if (vProd) return vProd;
    const vCat = REG.categorie.get(String(categoria || "").trim().toLowerCase());
    if (vCat) return vCat;
    const vBrand = REG.brands.get(String(brandSlug || "").toLowerCase());
    if (vBrand) return vBrand;
    // registro con ALMENO una regola = il dato governa (default obbligatorio);
    // registro vuoto (migrazione non applicata / catalogo non ancora caricato)
    // = comportamento storico hardcoded
    const regole = REG.brands.size + REG.categorie.size + REG.prodotti.size + REG.offerte.size;
    return regole > 0 ? "obbligatorio" : fallbackLegacy(brandSlug);
}
