// ═══════════════════════════════════════════════════════════════════════════
// IL CATALOGO DI CASSA (Luca 28/08 notte, «da CRM a software di cassa»)
//
// Dal 1° settembre il CRM è anche la cassa del negozio. Cambia la domanda che
// il software si sente fare: non più «quanto ci guadagniamo su questa voce»
// (la marginalità, che era un listino di REGOLE scritto a mano) ma «cosa
// vendo, quanto mi è costato, cosa resta a scaffale».
//
// Due nature, come le vuole Luca:
//   · PRODOTTO — l'hai comprato, ha un costo, e venderlo lo toglie dal
//     magazzino. Il margine è prezzo − costo: un numero, non una stima.
//   · SERVIZIO — assistenza, backup, installazione. Ha un prezzo e un
//     margine, ma non c'è niente da scaricare.
//
// La terza natura — SIM, sostituzioni, gettoni degli operatori — NON sta qui
// apposta: quelle voci il CRM le genera già da sé quando si registra la
// vendita del brand (computeAutoMarg). Il venditore non deve cercarle: le
// trova nel carrello. È il motivo per cui la cassa può restare a due schede.
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from "@/lib/supabaseClient";

export type NaturaCassa = "prodotto" | "servizio";

export type VoceCassa = {
    id: string;              // "p:<codice>" oppure "s:<uuid>"
    natura: NaturaCassa;
    codice: string | null;   // codice articolo (solo prodotti)
    barcode: string | null;
    nome: string;
    famiglia: string;        // il filtro rapido: sottogruppo o categoria
    marca: string | null;
    gruppo: string | null;   // il listino di provenienza (WIND3, Accessori, USATO…)
    prezzo: number | null;
    costo: number | null;
    iva: number | null;
    reparto: number | null;
    scarica_magazzino: boolean;
    /** falso = il prezzo è quello e basta: si vede, non si tocca (Luca 29/08) */
    prezzo_modificabile: boolean;
    /** la società a cui l'articolo è intestato in anagrafica, quando c'è. La
     *  verità però sta nella GIACENZA: è chi ha i pezzi che li vende. */
    azienda?: string | null;
};

/** Un pezzo con un seriale: un telefono, un modem. In cassa si spara l'IMEI
 *  e deve uscire QUEL pezzo — non l'articolo generico, il pezzo. */
export type PezzoSeriale = {
    seriale: string;
    provenienza: "nuovo" | "usato";
    codice: string | null;
    nome: string;
    negozio: string | null;
    stato: string | null;
    prezzo: number | null;
    costo: number | null;
    prezzo_modificabile: boolean;
    riferimento: string;
    /** LA SOCIETÀ DEL PEZZO (revisore 29/08). Il magazzino Wind3 è di
     *  Telefutura, il Multi di Telefutura 2: un pezzo appartiene a una delle
     *  due e lo scontrino lo deve emettere QUELLA. Senza, la merce esce da un
     *  inventario e il ricavo entra nella fattura dell'altra. */
    azienda: string | null;
    /** il reparto IVA: senza, il pezzo non è stampabile su scontrino */
    reparto: number | null;
};

export type Giacenza = {
    codice: string;
    quantita: number;
    soglia_min: number | null;
    /** di chi è la merce: la società che ha i pezzi in questo negozio. Se
     *  per assurdo ne avessero entrambe, vince quella che ne ha davvero
     *  (`ambigua` lo dice, così la cassa non sceglie a caso). */
    azienda: string | null;
    ambigua?: boolean;
};

/** Il margine di una riga, in euro. `null` quando non lo sappiamo: un margine
 *  inventato è peggio di un margine assente — su questo si decidono i premi. */
export function margineEuro(prezzo: number | null | undefined, costo: number | null | undefined, qta = 1): number | null {
    if (prezzo == null || costo == null) return null;
    return (Number(prezzo) - Number(costo)) * (Number(qta) || 1);
}

/** Lo stesso in percentuale sul prezzo. */
export function marginePct(prezzo: number | null | undefined, costo: number | null | undefined): number | null {
    const p = Number(prezzo);
    if (!p || costo == null) return null;
    return ((p - Number(costo)) / p) * 100;
}

/** Perché di questa riga non sappiamo il margine — da mostrare al posto del
 *  numero, così chi vende capisce cosa manca invece di vedere un trattino. */
export function perchéSenzaMargine(v: { prezzo: number | null; costo: number | null }): string | null {
    if (v.costo != null && v.prezzo != null) return null;
    if (v.costo == null && v.prezzo == null) return "senza costo né prezzo a listino";
    if (v.costo == null) return "manca il costo d'acquisto";
    return "manca il prezzo di listino";
}

const PAGINA = 1000;   // il server taglia OGNI risposta a 1000 righe

/* IL CATALOGO SI SCARICA UNA VOLTA SOLA (revisore 29/08). Sono 2.267 righe,
   circa 630 KB in tre chiamate in fila: scaricarle a ogni apertura della
   schermata — e la finestra dal carrello si riapre a ogni prodotto aggiunto —
   sono uno o due secondi di attesa ogni volta, sulla wifi di un centro
   commerciale. Resta in memoria finché la pagina è aperta. */
let _catalogo: VoceCassa[] | null = null;
let _inCorso: Promise<VoceCassa[]> | null = null;

/** Da chiamare quando il magazzino cambia davvero (un'importazione, un
 *  carico): la prossima lettura ripartirà dal database. */
export function scordaCatalogo() { _catalogo = null; _inCorso = null; }

/** Tutto il catalogo vendibile. Il tetto di 1000 righe per risposta è una
 *  trappola nota del PostgREST (già costata i brand «fino ad Azza» sui
 *  dispositivi): qui si pagina fino in fondo. */
export async function caricaCatalogo(): Promise<VoceCassa[]> {
    if (_catalogo) return _catalogo;
    // due aperture ravvicinate non devono scaricarlo due volte in parallelo
    if (_inCorso) return _inCorso;
    _inCorso = _leggiCatalogo().then((v) => { _catalogo = v; _inCorso = null; return v; });
    return _inCorso;
}

async function _leggiCatalogo(): Promise<VoceCassa[]> {
    const out: VoceCassa[] = [];
    for (let da = 0; ; da += PAGINA) {
        const { data, error } = await supabase.from("cassa_catalogo")
            .select("id,natura,codice,barcode,nome,famiglia,marca,gruppo,prezzo,costo,iva,reparto,scarica_magazzino,prezzo_modificabile,azienda")
            .order("nome").range(da, da + PAGINA - 1);
        if (error || !data?.length) break;
        out.push(...(data as VoceCassa[]));
        if (data.length < PAGINA) break;
    }
    return out;
}

/** Quanti pezzi ci sono, in UN negozio (e opzionalmente di UNA società).
 *
 *  Legge da `mag_disponibilita`, che è LA disponibilità del magazzino: somma
 *  i pezzi tenuti a quantità (gli accessori) e quelli con un seriale (i
 *  telefoni, i modem). Sono due forme della stessa merce, e chi vende non
 *  deve sapere in quale delle due è tenuta — Luca 29/08: «il magazzino è
 *  l'unica fonte, Registra Vendita attinge a quello».
 *
 *  Il magazzino è separato per società (T1 = Telefutura, T2 = Telefutura 2):
 *  senza `azienda` si somma tutto quello che c'è in negozio. */
export async function caricaGiacenze(negozio: string, azienda?: string | null): Promise<Map<string, Giacenza>> {
    const m = new Map<string, Giacenza>();
    if (!negozio) return m;
    for (let da = 0; ; da += PAGINA) {
        let q = supabase.from("mag_disponibilita")
            .select("codice,quantita,azienda").eq("negozio", negozio);
        if (azienda) q = q.eq("azienda", azienda);
        const { data, error } = await q.range(da, da + PAGINA - 1);
        if (error || !data?.length) break;
        (data as { codice: string; quantita: number; azienda: string | null }[]).forEach((g) => {
            const gia = m.get(g.codice);
            const q = Number(g.quantita) || 0;
            /* DI CHI È LA MERCE. Senza filtro di società lo stesso articolo
               può tornare due volte: si sommano le quantità, ma la società da
               segnare è quella che i pezzi ce li ha davvero. Oggi a Donna
               nessun codice sta in due società (verificato), quindi il caso
               ambiguo non si presenta — ma se un domani si presenta la cassa
               non deve tirare a indovinare. */
            const primaAz = gia?.azienda ?? null;
            const teneva = Number(gia?.quantita || 0) > 0;
            const azienda = q > 0 ? (teneva && primaAz && primaAz !== g.azienda ? primaAz : g.azienda) : primaAz;
            m.set(g.codice, {
                codice: g.codice,
                quantita: q + Number(gia?.quantita || 0),
                soglia_min: null,
                azienda: azienda ?? null,
                ambigua: teneva && q > 0 && !!primaAz && primaAz !== g.azienda,
            });
        });
        if (data.length < PAGINA) break;
    }
    return m;
}

/** I filtri rapidi di una natura: le famiglie che hanno davvero qualcosa
 *  dentro, in ordine di quante voci contengono (le più usate prima). */
export function famiglieDi(voci: VoceCassa[], natura: NaturaCassa): { nome: string; n: number }[] {
    const c = new Map<string, number>();
    voci.filter((v) => v.natura === natura).forEach((v) => c.set(v.famiglia || "Altro", (c.get(v.famiglia || "Altro") || 0) + 1));
    return [...c.entries()].map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome));
}

/** La ricerca: nome, codice, barcode e marca. Le parole si cercano TUTTE
 *  («cover iphone» non deve tirare fuori ogni cover e ogni iPhone). */
export function cerca(voci: VoceCassa[], testo: string): VoceCassa[] {
    const q = testo.trim().toLowerCase();
    if (!q) return voci;
    // un codice a barre si incolla intero: se combacia, è quello e basta
    const soloCifre = q.replace(/\D/g, "");
    if (soloCifre.length >= 8) {
        const esatto = voci.filter((v) => (v.barcode || "").replace(/\D/g, "") === soloCifre);
        if (esatto.length) return esatto;
    }
    const parole = q.split(/\s+/).filter(Boolean);
    return voci.filter((v) => {
        const testo = `${v.nome} ${v.codice || ""} ${v.barcode || ""} ${v.marca || ""}`.toLowerCase();
        return parole.every((p) => testo.includes(p));
    });
}

/** Cerca un pezzo dal suo seriale (IMEI). Restituisce null se non esiste da
 *  nessuna parte: in quel caso il pezzo NON è in magazzino, e chi vende deve
 *  saperlo prima di battere lo scontrino. */
export async function cercaSeriale(seriale: string): Promise<PezzoSeriale | null> {
    const s = normalizzaSeriale(seriale);
    if (s.length < 6) return null;
    const { data } = await supabase.from("cassa_seriali")
        .select("seriale,provenienza,codice,nome,negozio,stato,prezzo,costo,prezzo_modificabile,riferimento,azienda,reparto")
        .eq("seriale", s).limit(1);
    return (data && data[0]) ? (data[0] as PezzoSeriale) : null;
}

/** Ripulisce quello che si è digitato o sparato col lettore: via gli spazi e
 *  i trattini, tutto maiuscolo. Il seriale si confronta così com'è. */
export function normalizzaSeriale(testo: string): string {
    return String(testo || "").replace(/[\s\-_.]/g, "").toUpperCase();
}

/** Vale la pena provare a cercarlo fra i PEZZI? Basta che sia una parola
 *  sola di lettere e cifre: costa una query e non disturba nessuno.
 *
 *  IL SERIALE NON È FATTO SOLO DI CIFRE (revisore 29/08). Prima si cercava un
 *  pezzo solo con 15 o 19 CIFRE esatte, e per giunta prima della ricerca si
 *  buttavano via le lettere: l'Apple Watch `4S44MM` diventava «444», l'iPad
 *  `DLXTM0FKHND6` diventava «06», i due Meta sparivano. Cinque pezzi veri per
 *  ~1.270 € erano introvabili proprio dalla strada per cui erano stati
 *  caricati. Un IMEI ha 15 cifre e un ICCID 19, ma il seriale di un
 *  accessorio è alfanumerico e non ha una lunghezza sola. */
export function puoEssereSeriale(testo: string): boolean {
    const s = normalizzaSeriale(testo);
    return s.length >= 6 && /^[A-Z0-9]+$/.test(s) && /\d/.test(s);
}

/** È SICURAMENTE un seriale: 15 cifre (IMEI) o 19 (ICCID). Solo qui si può
 *  dire «questo pezzo non c'è» con un pop-up — perché è l'unico caso in cui
 *  quello che è stato digitato non può essere altro.
 *  Su una ricerca qualunque il pop-up sarebbe un fastidio: chi scrive
 *  «iphone 15 pro» sta cercando un articolo, non un seriale. */
export function sembraSeriale(testo: string): boolean {
    const d = normalizzaSeriale(testo);
    return /^\d+$/.test(d) && (d.length === 15 || d.length === 19);
}

/* ── I GRUPPI DELLA CASSA: pulsanti a due livelli (Luca 29/08) ───────────
   «Alcuni di questi devono avere dei sotto pulsanti, in quanto sono delle
   sotto categorie che contengono altri prodotti.»
   Premi «Accessori» e trovi dentro i pezzi che vendi davvero, già pronti —
   senza cercarli. Stanno a database perché i negozi cambiano assortimento:
   aggiungere un pulsante non deve voler dire toccare il programma. */
export type GruppoCassa = {
    id: string; nome: string; icona: string | null; ordine: number;
    voci: { id: string; codice: string | null; margItemId: string | null; etichetta: string | null }[];
};

let _gruppi: GruppoCassa[] | null = null;

export async function caricaGruppi(): Promise<GruppoCassa[]> {
    if (_gruppi) return _gruppi;
    const { data: g } = await supabase.from("cassa_gruppi")
        .select("id,nome,icona,ordine").eq("attivo", true).order("ordine");
    if (!g?.length) { _gruppi = []; return _gruppi; }
    const { data: v } = await supabase.from("cassa_gruppo_voci")
        .select("id,gruppo_id,codice,marg_item_id,etichetta,ordine").eq("attivo", true).order("ordine");
    _gruppi = (g as { id: string; nome: string; icona: string | null; ordine: number }[]).map((x) => ({
        ...x,
        voci: (v || []).filter((y: { gruppo_id: string }) => y.gruppo_id === x.id)
            .map((y: { id: string; codice: string | null; marg_item_id: string | null; etichetta: string | null }) =>
                ({ id: y.id, codice: y.codice, margItemId: y.marg_item_id, etichetta: y.etichetta })),
    })).filter((x) => x.voci.length > 0);
    return _gruppi;
}
export function scordaGruppi() { _gruppi = null; }
