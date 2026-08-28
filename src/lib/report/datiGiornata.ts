// I NUMERI DELLA GIORNATA, NELLA FORMA CHE IL REPORT SI ASPETTA (Luca 28/08).
//
// SOLO SERVER: legge con la chiave amministratore, perché il report riguarda
// un negozio intero e non solo quello che vede chi lo chiede.
//
// ⚠️ Le categorie del report NON sono le categorie del CRM. Il report parla la
// lingua del volantino — «Luce & Gas», «Business», «3P» — il database parla la
// sua: `categoria` (Mobile, Fisso, Customer Base, Energia, TV, Multi-Servizi),
// `prodotto` e `tipo_cliente`. La traduzione sta qui, in un punto solo, e
// nasce da come i dati sono fatti DAVVERO (verificato sugli ultimi 30 giorni),
// non da come uno se li immagina.
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type RigaReport = { cat: string; pz: number; pt?: number | null; det?: string; val?: number };
export type BrandReport = { id: string; euro: number; pt: boolean; calcPt?: boolean; totPt?: boolean; righe: RigaReport[] };
export type DatiReport = {
    negozio: string;
    data: string;
    ingressi: number;
    usati: number;
    commento: string;
    brands: BrandReport[];
    minori: { id: string; pz: number; e: number }[];
    marginalita: { l: string; v: number }[];
};

type Vendita = {
    brand: string | null; categoria: string | null; prodotto: string | null;
    offerta: string | null; tipo_cliente: string | null;
};

const norm = (s: unknown) => String(s || "").trim().toLowerCase();
const conta = (v: Vendita[], f: (x: Vendita) => boolean) => v.filter(f).length;

/* Le sei carte principali, sempre presenti anche a zero: è il componente a
   ingrigirle e a scrivere «nessuna produzione». Mai togliere una carta. */
const brandDi = (v: Vendita[], prefisso: string) =>
    v.filter((x) => norm(x.brand).startsWith(prefisso));

const eBusiness = (x: Vendita) => norm(x.tipo_cliente) === "business";
const cat = (x: Vendita, c: string) => norm(x.categoria) === c;
const prod = (x: Vendita, re: RegExp) => re.test(String(x.prodotto || ""));

export async function datiGiornata(negozio: string, giorno: string): Promise<DatiReport> {
    const [venditeRes, usatiRes, margRes] = await Promise.all([
        supabaseAdmin.from("contracts")
            .select("brand, categoria, prodotto, offerta, tipo_cliente")
            .eq("negozio", negozio).eq("data", giorno)
            .or("is_demo.is.null,is_demo.eq.false")
            .or("non_valida.is.null,non_valida.eq.false"),
        // usati COMPRATI oggi in questo negozio: la data d'acquisto è sua
        supabaseAdmin.from("usati")
            .select("id", { count: "exact", head: true })
            .eq("store_acquisto", negozio).eq("purchase_date", giorno),
        // la marginalità è un «brand di casa» dentro contracts
        supabaseAdmin.from("contracts")
            .select("prodotto, categoria")
            .ilike("brand", "Marginalit%").eq("negozio", negozio).eq("data", giorno),
    ]);

    const v = (venditeRes.data || []) as Vendita[];
    const w3 = brandDi(v, "windtre"), vf = brandDi(v, "vodafone"), sky = brandDi(v, "sky");
    const fw = brandDi(v, "fastweb"), s4 = brandDi(v, "s4"), il = brandDi(v, "iliad");

    /* `pt: null` = questo brand non dà punti su quella riga (punto pallido)
       `pt: 0`    = punti previsti, ma oggi zero (trattino)
       Sono due cose diverse e il componente le disegna diverse.
       ⚠️ I PUNTI SONO A ZERO finché non entra il motore delle gare: sarebbe
       peggio inventarli. La parte economica arriva domani (Luca). */
    const brands: BrandReport[] = [
        {
            id: "vodafone", euro: 0, pt: true, righe: [
                { cat: "Mobile", pz: conta(vf, (x) => cat(x, "mobile")), pt: 0, det: dettaglio(vf, /mnp/i, "MNP") },
                { cat: "Fisso", pz: conta(vf, (x) => cat(x, "fisso")), pt: 0 },
                { cat: "Customer Base", pz: conta(vf, (x) => cat(x, "customer base")), pt: null },
                { cat: "Business", pz: conta(vf, eBusiness), pt: 0 },
                { cat: "Luce & Gas", pz: conta(vf, (x) => cat(x, "energia")), pt: null },
            ],
        },
        {
            id: "windtre", euro: 0, pt: true, righe: [
                { cat: "Mobile", pz: conta(w3, (x) => cat(x, "mobile")), pt: 0, det: dettaglio(w3, /mnp/i, "MNP") },
                { cat: "Fisso", pz: conta(w3, (x) => cat(x, "fisso")), pt: 0 },
                { cat: "Business", pz: conta(w3, eBusiness), pt: null },
                // TNP: nel CRM non esiste ancora come prodotto — riga a zero,
                // non inventata (verificato: nessuna vendita con questo nome)
                { cat: "TNP", pz: conta(w3, (x) => prod(x, /tnp/i)), pt: null },
                { cat: "Customer Base", pz: conta(w3, (x) => cat(x, "customer base")), pt: 0 },
                { cat: "Luce & Gas", pz: conta(w3, (x) => cat(x, "energia")), pt: null },
                { cat: "Assicurazioni", pz: conta(w3, (x) => prod(x, /assicuraz/i)), pt: 0 },
                { cat: "Protecta", pz: conta(w3, (x) => prod(x, /protect/i)), pt: 0 },
            ],
        },
        {
            /* Sky è l'unico brand dove i punti si CALCOLANO dai pezzi e si
               sommano. I valori per unità vengono dal tabellare del CRM, mai
               scritti qui: finché non li leggiamo restano a zero. */
            id: "sky", euro: 0, pt: true, calcPt: true, totPt: true, righe: [
                { cat: "Fibra", pz: conta(sky, (x) => prod(x, /fibra/i)), val: 0 },
                { cat: "TV", pz: conta(sky, (x) => cat(x, "tv")), val: 0 },
                { cat: "3P", pz: conta(sky, (x) => prod(x, /^3p/i)), val: 0 },
            ],
        },
        {
            id: "fastweb", euro: 0, pt: false, righe: [
                { cat: "Mobile", pz: conta(fw, (x) => cat(x, "mobile")) },
                { cat: "Fisso", pz: conta(fw, (x) => cat(x, "fisso")) },
                { cat: "Luce & Gas", pz: conta(fw, (x) => cat(x, "energia")) },
            ],
        },
        {
            id: "s4", euro: 0, pt: false, righe: [
                { cat: "Luce", pz: conta(s4, (x) => prod(x, /luce/i)) },
                { cat: "Gas", pz: conta(s4, (x) => prod(x, /gas/i)) },
            ],
        },
        { id: "iliad", euro: 0, pt: false, righe: [{ cat: "Attivazioni", pz: il.length }] },
    ];

    /* I MINORI ENTRANO SOLO SE HANNO PRODOTTO (regola del disegno): con la
       corsia vuota lo spazio va alle carte dei brand. Mai spingere uno zero. */
    const MINORI: { id: string; match: RegExp }[] = [
        { id: "tim", match: /^tim/i },
        { id: "kenamobile", match: /^kena/i },
        { id: "verymobile", match: /^very/i },
        { id: "homobile", match: /^ho\./i },
        { id: "dojo", match: /^dojo/i },
        { id: "kipoint", match: /^kipoint/i },
    ];
    const minori = MINORI
        .map((m) => ({ id: m.id, pz: v.filter((x) => m.match.test(String(x.brand || ""))).length, e: 0 }))
        .filter((x) => x.pz > 0);

    /* MARGINALITÀ — ⚠️ LA BANDA PARLA IN EURO, NON IN PEZZI.
       Il report stampa questi valori con `fmtEuro`: contare le righe e
       metterle qui farebbe uscire «3 €» dove sono state vendute 3 cose. È
       esattamente il tipo di numero che nessuno mette in dubbio perché sembra
       plausibile. Finché la parte economica è ferma (Luca: «per ora l'aspetto
       economico tienilo a zero») questa banda resta a zero come il resto.

       Quando si accende: il margine per riga è prezzo − costo, e il catalogo
       vive in `marg_items` / `mag_articoli` (migrazione 20260829010000). Le
       cinque voci del report sono Prodotti · Importo · Sim · Bundle · Kasko;
       nel CRM le categorie sono Prodotti · SIM · Kasko · Telefono Cash · ESIM
       · Servizi — «Importo» e «Bundle» non esistono e restano vuote. */
    const quanteRighe = (margRes.data || []).length;
    const marginalita = [
        { l: "Prodotti", v: 0 },
        { l: "Importo", v: 0 },
        { l: "Sim", v: 0 },
        { l: "Bundle", v: 0 },
        { l: "Kasko", v: 0 },
    ];
    void quanteRighe;   // letto ma non mostrato: vedi sopra

    return {
        negozio,
        data: dataItaliana(giorno),
        // gli ingressi non esistono nel CRM: arrivano dal portale FootfallCam
        // (solo franchising W3 e Vodafone Store), lavoro a parte
        ingressi: 0,
        usati: usatiRes.count ?? 0,
        commento: commentoDiPartenza(v, brands, minori),
        brands,
        minori,
        marginalita,
    };
}

/** IL COMMENTO NON NASCE VUOTO. Alle otto di sera nessuno scrive in una casella
 *  bianca: si manda il report senza. Qui esce già una frase VERA — contata sui
 *  dati, mai inventata — e il negozio la corregge se ha qualcosa da aggiungere. */
function commentoDiPartenza(v: Vendita[], brands: BrandReport[], minori: { id: string; pz: number }[]): string {
    const totale = v.length;
    if (!totale) return "Nessuna vendita registrata in giornata.";

    const nomi: Record<string, string> = {
        windtre: "WindTre", vodafone: "Vodafone", sky: "Sky",
        fastweb: "Fastweb", s4: "S4", iliad: "Iliad",
    };
    const pezziDi = (b: BrandReport) => b.righe.reduce((t, r) => t + (Number(r.pz) || 0), 0);
    const classifica = [...brands]
        // ⚠️ Business e Luce&Gas sono TAGLI della stessa vendita, non vendite in
        // più: sommando le righe un contratto business conterebbe due volte.
        // Per la classifica va bene (serve solo l'ordine), per il totale no —
        // quello viene da `v.length`, che è il numero di contratti veri.
        .map((b) => ({ id: b.id, pz: pezziDi(b) }))
        .filter((x) => x.pz > 0)
        .sort((a, b) => b.pz - a.pz);

    const pezzi = `${totale} ${totale === 1 ? "vendita" : "vendite"} in giornata`;
    if (!classifica.length) return pezzi + ".";

    const primo = classifica[0];
    const testa = `${pezzi} · meglio ${nomi[primo.id] || primo.id}`;
    const coda = classifica.length > 1
        ? `, poi ${classifica.slice(1, 3).map((x) => nomi[x.id] || x.id).join(" e ")}`
        : "";
    const altri = minori.length ? ` · anche ${minori.map((m) => m.id).join(", ")}` : "";
    return (testa + coda + altri + ".").slice(0, 200);
}

/** «5 MNP» — il sotto-conteggio sotto una riga. Si omette se è zero: una
 *  scritta «0 MNP» è rumore, l'assenza si legge da sé. */
function dettaglio(v: Vendita[], re: RegExp, etichetta: string): string | undefined {
    const n = v.filter((x) => re.test(String(x.prodotto || ""))).length;
    return n > 0 ? `${n} ${etichetta}` : undefined;
}

/** «Venerdi 28 Agosto 2026» — già formattata, come vuole il componente. */
export function dataItaliana(iso: string): string {
    const [a, m, g] = String(iso).split("-").map(Number);
    const d = new Date(a, (m || 1) - 1, g || 1);
    const GG = ["Domenica", "Luned\u00EC", "Marted\u00EC", "Mercoled\u00EC", "Gioved\u00EC", "Venerd\u00EC", "Sabato"];
    const MM = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
    return `${GG[d.getDay()]} ${d.getDate()} ${MM[d.getMonth()]} ${d.getFullYear()}`;
}
