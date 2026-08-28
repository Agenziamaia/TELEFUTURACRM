// I NUMERI DELLA GIORNATA, NELLA FORMA CHE IL REPORT SI ASPETTA (Luca 28/08).
//
// SOLO SERVER: legge con la chiave amministratore, perché il report riguarda
// un negozio intero e non solo quello che vede chi lo chiede. Il perimetro del
// negozio lo verifica la rotta, PRIMA di chiamare qui.
//
// ⚠️ Le categorie del report NON sono le categorie del CRM. Il report parla la
// lingua del volantino — «Luce & Gas», «Business», «3P» — il database parla la
// sua: `categoria`, `prodotto`, `tipo_cliente`. La traduzione sta qui, in un
// punto solo, e nasce dal CATALOGO REALE (migrazione 20260727000002), non da
// come uno si immagina che i prodotti si chiamino.
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isCtr, isExt, validaProduzione } from "@/lib/produzione";

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
    id: string | null; stato: string | null; nascosta_gestione: boolean | null;
    brand: string | null; categoria: string | null; prodotto: string | null;
    offerta: string | null; tipo_cliente: string | null;
};

const norm = (s: unknown) => String(s || "").trim().toLowerCase();
const conta = (v: Vendita[], f: (x: Vendita) => boolean) => v.filter(f).length;

const brandDi = (v: Vendita[], prefisso: string) =>
    v.filter((x) => norm(x.brand).startsWith(prefisso));

const eBusiness = (x: Vendita) => norm(x.tipo_cliente) === "business";
const cat = (x: Vendita, c: string) => norm(x.categoria) === c;
const prod = (x: Vendita, re: RegExp) => re.test(String(x.prodotto || ""));

export async function datiGiornata(negozio: string, giorno: string): Promise<DatiReport> {
    /* Il giorno d'acquisto degli usati è un TIMESTAMP CON L'ORA, non una data:
       `purchase_date` viene scritto con `now.toISOString()`. Chiedere `= "2026-08-29"`
       combacia solo con la mezzanotte esatta — un telefono comprato alle 15:42
       non veniva contato MAI, e la casella «Usati comprati» era sempre vuota.
       Ci vuole l'intervallo del giorno. */
    const domani = new Date(giorno + "T00:00:00Z");
    if (Number.isNaN(domani.getTime())) throw new Error(`Data non valida: ${giorno}`);
    domani.setUTCDate(domani.getUTCDate() + 1);
    const giornoDopo = domani.toISOString().slice(0, 10);

    const [venditeRes, usatiRes] = await Promise.all([
        supabaseAdmin.from("contracts")
            .select("id, stato, nascosta_gestione, brand, categoria, prodotto, offerta, tipo_cliente")
            .eq("negozio", negozio).eq("data", giorno)
            .or("is_demo.is.null,is_demo.eq.false")
            .or("non_valida.is.null,non_valida.eq.false"),
        supabaseAdmin.from("usati")
            .select("id", { count: "exact", head: true })
            .eq("store_acquisto", negozio)
            .gte("purchase_date", giorno).lt("purchase_date", giornoDopo),
    ]);

    /* ⚠️ supabase-js NON LANCIA: in caso di errore restituisce {data: null, error}.
       Senza questo controllo un errore di query usciva come una giornata a zero —
       cioè come un report perfettamente plausibile, che nessuno mette in dubbio,
       pubblicato sul canale. Meglio un messaggio d'errore che un numero falso. */
    if (venditeRes.error) throw new Error("vendite: " + venditeRes.error.message);
    if (usatiRes.error) throw new Error("usati: " + usatiRes.error.message);

    /* LA REGOLA DI PRODUZIONE È QUELLA DEL CRM, non una nuova (`@/lib/produzione`):
       fuori le ANNULLATE e le nascoste dalla gestione. Senza, il report della
       sera contava una pratica annullata alle 17:00 e la Home dello stesso
       negozio, nello stesso momento, ne mostrava una in meno.
       E le righe `EXT-` (marginalità) NON sono vendite brand: una giornata con
       2 SIM e 6 accessori diceva «8 vendite». */
    const tutte = ((venditeRes.data || []) as Vendita[]).filter(validaProduzione);
    const v = tutte.filter(isCtr);
    const margRighe = tutte.filter(isExt);

    const w3 = brandDi(v, "windtre"), vf = brandDi(v, "vodafone"), sky = brandDi(v, "sky");
    const fw = brandDi(v, "fastweb"), s4 = brandDi(v, "s4"), il = brandDi(v, "iliad");

    /* `pt: null` = questo brand non dà punti su quella riga (punto pallido)
       `pt: 0`    = punti previsti, ma oggi zero (trattino)
       Sono due cose diverse e il componente le disegna diverse.
       ⚠️ I PUNTI SONO A ZERO finché non entra il motore delle gare: sarebbe
       peggio inventarli. La parte economica arriva dopo (Luca). */
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
                /* A catalogo il telefono finanziato NON si chiama «TNP»: la
                   categoria è «Telefono a Rate» e i prodotti «Tel. Rate» e
                   «Tel. Rate CB». Cercando la parola «tnp» la riga restava a
                   zero anche nei giorni in cui ne erano stati fatti tre. */
                { cat: "TNP", pz: conta(w3, (x) => cat(x, "telefono a rate") || prod(x, /tel\.?\s*rate|tnp/i)), pt: null },
                { cat: "Customer Base", pz: conta(w3, (x) => cat(x, "customer base")), pt: 0 },
                { cat: "Luce & Gas", pz: conta(w3, (x) => cat(x, "energia")), pt: null },
                { cat: "Assicurazioni", pz: conta(w3, (x) => prod(x, /assicuraz/i)), pt: 0 },
                { cat: "Protecta", pz: conta(w3, (x) => prod(x, /protect/i)), pt: 0 },
            ],
        },
        {
            /* SKY — ⚠️ le righe del disegno erano Fibra / TV / 3P, ma a catalogo
               un prodotto Sky che si chiama «Fibra» NON ESISTE: quella riga era
               uno zero perpetuo, e Fisso, 4P e Mobile non li contava nessuno.
               Un negozio che vendeva 1 Sky Fisso + 1 Sky Mobile si vedeva la
               carta grigia con scritto «NESSUNA PRODUZIONE» — una bugia in
               stampatello, spedita sul canale.
               I prodotti veri (migrazione 20260727000002): Mobile GA/MNP,
               Sostituzione SIM, Fisso, 3P, 3P 35,80, 4P, TV, Sky Glass,
               TV Ufficio/Bar/Hotel.
               Sky è anche l'unico brand dove i punti si CALCOLANO dai pezzi e si
               sommano: i valori per unità vengono dal tabellare del CRM, mai
               scritti qui — finché non li leggiamo restano a zero. */
            id: "sky", euro: 0, pt: true, calcPt: true, totPt: true, righe: [
                { cat: "Mobile", pz: conta(sky, (x) => cat(x, "mobile")), val: 0 },
                { cat: "Fisso", pz: conta(sky, (x) => cat(x, "fisso") && !prod(x, /^[34]p/i)), val: 0 },
                { cat: "TV", pz: conta(sky, (x) => cat(x, "tv")), val: 0 },
                { cat: "3P e 4P", pz: conta(sky, (x) => prod(x, /^[34]p/i)), val: 0 },
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

    /* LA RETE DI SICUREZZA: se una vendita non entra in nessuna riga, deve
       vedersi. Vodafone vende anche Verisure, Vodafone Care, Kasko Facile
       (categoria Multi-Servizi, consumer): senza questa riga sparivano, e il
       foglio mostrava meno pezzi di quanti ne fossero stati fatti — senza dirlo.
       La riga compare SOLO se c'è qualcosa dentro, quindi in una giornata
       normale il disegno resta quello di prima.
       ⚠️ «Business» è un taglio TRASVERSALE (una SIM business sta in Mobile E in
       Business): per capire cosa è coperto conta la VENDITA, non la riga. */
    const COPERTURA: Record<string, (x: Vendita) => boolean> = {
        vodafone: (x) => cat(x, "mobile") || cat(x, "fisso") || cat(x, "customer base") || cat(x, "energia") || eBusiness(x),
        windtre: (x) => cat(x, "mobile") || cat(x, "fisso") || cat(x, "customer base") || cat(x, "energia")
            || eBusiness(x) || cat(x, "telefono a rate") || prod(x, /tel\.?\s*rate|tnp|assicuraz|protect/i),
        sky: (x) => cat(x, "mobile") || cat(x, "fisso") || cat(x, "tv") || prod(x, /^[34]p/i),
        fastweb: (x) => cat(x, "mobile") || cat(x, "fisso") || cat(x, "energia"),
        s4: (x) => prod(x, /luce|gas/i),
        iliad: () => true,
    };
    const perBrand: Record<string, Vendita[]> = { vodafone: vf, windtre: w3, sky, fastweb: fw, s4, iliad: il };
    brands.forEach((b) => {
        const scoperte = (perBrand[b.id] || []).filter((x) => !COPERTURA[b.id](x)).length;
        if (scoperte > 0) b.righe.push({ cat: "Altro", pz: scoperte, pt: b.pt ? null : undefined });
    });

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
       Il report stampa questi valori con `fmtEuro`: contare le righe e metterle
       qui farebbe uscire «3 €» dove sono state vendute 3 cose. È esattamente il
       tipo di numero che nessuno mette in dubbio perché sembra plausibile.
       Finché la parte economica è ferma (Luca: «per ora l'aspetto economico
       tienilo a zero») questa banda resta a zero come il resto.
       Quando si accende: il margine per riga è prezzo − costo, e il catalogo
       vive in `marg_items`/`mag_articoli` (migrazione 20260829010000). */
    const marginalita = [
        { l: "Prodotti", v: 0 }, { l: "Importo", v: 0 }, { l: "Sim", v: 0 },
        { l: "Bundle", v: 0 }, { l: "Kasko", v: 0 },
    ];

    return {
        negozio,
        data: dataItaliana(giorno),
        // gli ingressi non esistono nel CRM: arrivano dal portale FootfallCam
        // (solo franchising W3 e Vodafone Store), lavoro a parte
        ingressi: 0,
        usati: usatiRes.count ?? 0,
        commento: commentoDiPartenza(v, perBrand, minori, margRighe.length),
        brands,
        minori,
        marginalita,
    };
}

/** «5 MNP» — il sotto-conteggio sotto una riga. Si omette se è zero: una
 *  scritta «0 MNP» è rumore, l'assenza si legge da sé. */
function dettaglio(v: Vendita[], re: RegExp, etichetta: string): string | undefined {
    const n = v.filter((x) => re.test(String(x.prodotto || ""))).length;
    return n > 0 ? `${n} ${etichetta}` : undefined;
}

/** IL COMMENTO NON NASCE VUOTO. Alle otto di sera nessuno scrive in una casella
 *  bianca: si manda il report senza. Qui esce già una frase VERA — contata sui
 *  dati, mai inventata — e il negozio la corregge se ha qualcosa da aggiungere. */
function commentoDiPartenza(
    v: Vendita[],
    perBrand: Record<string, Vendita[]>,
    minori: { id: string; pz: number }[],
    righeMarginalita: number,
): string {
    const totale = v.length;
    if (!totale) {
        return righeMarginalita > 0
            ? `Nessun contratto in giornata · ${righeMarginalita} ${righeMarginalita === 1 ? "voce" : "voci"} di marginalità.`
            : "Nessuna vendita registrata in giornata.";
    }

    const nomi: Record<string, string> = {
        windtre: "WindTre", vodafone: "Vodafone", sky: "Sky",
        fastweb: "Fastweb", s4: "S4", iliad: "Iliad",
    };
    /* ⚠️ LA CLASSIFICA SI FA SUI CONTRATTI, NON SULLE RIGHE. Sommando le righe,
       «Business» conta due volte (una SIM business sta anche in Mobile): con 3
       mobile consumer WindTre e 2 mobile business Vodafone usciva «meglio
       Vodafone» (2+2=4) mentre WindTre ne aveva venduti di più. */
    const classifica = Object.entries(perBrand)
        .map(([id, righe]) => ({ id, pz: righe.length }))
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

/** «Venerdì 28 Agosto 2026» — già formattata, come vuole il componente. */
export function dataItaliana(iso: string): string {
    const [a, m, g] = String(iso).split("-").map(Number);
    if (!a || !m || !g) return String(iso);
    const d = new Date(a, m - 1, g);
    const GG = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
    const MM = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
    return `${GG[d.getDay()]} ${d.getDate()} ${MM[d.getMonth()]} ${d.getFullYear()}`;
}
