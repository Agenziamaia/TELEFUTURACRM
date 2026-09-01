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

import { stessoMagazzino } from "@/lib/negoziNomi";
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
    /** da quale insegna viene la società segnata: serve al pareggio fra gemelli */
    negozioAzienda?: string | null;
    /** LE DUE FORME, SEPARATE (revisore 29/08). `mag_disponibilita` somma le
     *  quantità sfuse e i pezzi con seriale, e sommate sembrano la stessa
     *  cosa: ma di un telefono si vende IL PEZZO, sparando l'IMEI — cliccarlo
     *  dall'elenco creerebbe un movimento a quantità su una riga di giacenza
     *  che per lui non esiste (nasce a −1) e lascerebbe tutti gli IMEI
     *  disponibili, rivendibili. A Donna sono 73 codici / 135 pezzi. */
    pezziConSeriale: number;
    pezziAQuantita: number;
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

/* NON SI SCARICA PIÙ TUTTO IL CATALOGO (Luca 29/08, dopo l'import del
   listino generale). Gli articoli sono passati da 2.223 a 17.052: la vista
   intera pesa **6,4 MB**, e la finestra della cassa si riapre a ogni prodotto
   aggiunto. Scaricare sei megabyte sulla wifi di un centro commerciale, ogni
   volta, non è una schermata lenta — è una schermata che il negozio smette di
   usare.

   Quello che serve SEMPRE è poco e si tiene in memoria: i servizi, gli
   articoli dei pulsanti rapidi, e quelli che in QUESTO negozio hanno pezzi.
   A Donna sono qualche centinaio, negli altri quattordici quasi nulla.
   Il resto si cerca dove sta già: sul database, quando qualcuno scrive. */
let _catalogo: VoceCassa[] | null = null;
let _catalogoDi: string | null = null;
let _inCorso: Promise<VoceCassa[]> | null = null;

/** Da chiamare quando il magazzino cambia davvero (un'importazione, un
 *  carico): la prossima lettura ripartirà dal database. */
export function scordaCatalogo() { _catalogo = null; _catalogoDi = null; _inCorso = null; }

/** Quello che serve senza cercare: servizi, pulsanti rapidi, e la merce che
 *  in questo negozio c'è davvero. */
export async function caricaCatalogo(negozio?: string | null): Promise<VoceCassa[]> {
    const chiave = negozio || "";
    if (_catalogo && _catalogoDi === chiave) return _catalogo;
    if (_inCorso && _catalogoDi === chiave) return _inCorso;
    _catalogoDi = chiave;
    _inCorso = _leggiBase(chiave).then((v) => { _catalogo = v; _inCorso = null; return v; });
    return _inCorso;
}

async function _paginato(codici: string[]): Promise<VoceCassa[]> {
    const out: VoceCassa[] = [];
    for (let i = 0; i < codici.length; i += 300) {
        const { data } = await supabase.from("cassa_catalogo").select(CAMPI)
            .in("codice", codici.slice(i, i + 300));
        if (data?.length) out.push(...(data as VoceCassa[]));
    }
    return out;
}

const CAMPI = "id,natura,codice,barcode,nome,famiglia,marca,gruppo,prezzo,costo,iva,reparto,scarica_magazzino,prezzo_modificabile,azienda";

async function _leggiBase(negozio: string): Promise<VoceCassa[]> {
    const out: VoceCassa[] = [];
    // i servizi: sono 44, si portano dietro sempre
    const { data: serv } = await supabase.from("cassa_catalogo").select(CAMPI).eq("natura", "servizio");
    if (serv?.length) out.push(...(serv as VoceCassa[]));

    const codici = new Set<string>();
    // gli articoli dei pulsanti rapidi, sennò i gruppi si aprono vuoti
    const { data: voci } = await supabase.from("cassa_gruppo_voci").select("codice").eq("attivo", true);
    (voci || []).forEach((v: { codice: string | null }) => { if (v.codice) codici.add(v.codice); });
    // e la merce che in questa SEDE c'è davvero — le due insegne dello stesso
    // locale sono un magazzino solo, e il catalogo deve conoscerle entrambe
    if (negozio) {
        const nomiSede = await negoziDellaSede(negozio);
        for (let da = 0; ; da += PAGINA) {
            const { data, error } = await supabase.from("mag_disponibilita")
                .select("codice").in("negozio", nomiSede).range(da, da + PAGINA - 1);
            if (error || !data?.length) break;
            (data as { codice: string }[]).forEach((g) => codici.add(g.codice));
            if (data.length < PAGINA) break;
        }
    }
    if (codici.size) out.push(...await _paginato([...codici]));
    // uno stesso codice può arrivare da due strade
    const visti = new Set<string>();
    return out.filter((v) => (visti.has(v.id) ? false : (visti.add(v.id), true)));
}

/** LA RICERCA VA DOVE STANNO I DATI. Con diciassettemila articoli non si
 *  filtra più una lista in memoria: si chiede al database, che ha gli indici.
 *  Cerca su nome, codice e barcode; le parole si cercano tutte. */
export async function cercaArticoli(testo: string, limite = 150): Promise<VoceCassa[]> {
    const q = String(testo || "").trim();
    if (q.length < 2) return [];
    const esc = (t: string) => t.replace(/[%,()]/g, " ").trim();
    const soloCifre = q.replace(/\D/g, "");
    // un codice a barre incollato intero: se combacia, è quello e basta
    if (soloCifre.length >= 8) {
        const { data } = await supabase.from("cassa_catalogo").select(CAMPI)
            .eq("natura", "prodotto").eq("barcode", soloCifre).limit(limite);
        if (data?.length) return data as VoceCassa[];
    }
    const parole = esc(q).split(/\s+/).filter(Boolean).slice(0, 4);
    if (!parole.length) return [];
    // la prima parola la fa cercare al database, le altre affinano qui: così
    // basta una condizione sola e l'indice serve a qualcosa
    const p = parole[0];
    const { data } = await supabase.from("cassa_catalogo").select(CAMPI)
        .eq("natura", "prodotto")
        .or(`nome.ilike.%${p}%,codice.ilike.%${p}%,barcode.ilike.%${p}%`)
        .limit(600);
    let v = (data || []) as VoceCassa[];
    if (parole.length > 1) {
        const resto = parole.slice(1).map((x) => x.toLowerCase());
        v = v.filter((x) => {
            const t = `${x.nome} ${x.codice || ""} ${x.barcode || ""} ${x.marca || ""}`.toLowerCase();
            return resto.every((r) => t.includes(r));
        });
    }
    return v.slice(0, limite);
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
export type EsitoGiacenze = {
    mappa: Map<string, Giacenza>;
    /* NON SO ≠ NON C'È (revisore 29/08). Prima una lettura fallita tornava
       una mappa vuota, indistinguibile da «questo negozio non ha magazzino»:
       a Donna un wifi che cade accendeva il messaggio «magazzino non ancora
       caricato», spegneva ogni controllo e la vendita successiva non
       scaricava niente — in silenzio, su scontrino fiscale. */
    errore?: string;
};

/* I GEMELLI SONO UN MAGAZZINO SOLO — ANCHE PER GLI ARTICOLI A QUANTITÀ
   (Luca 31/08, e revisore 01/09 che ha misurato quanto costava non averlo).
   «Dobbiamo dare la possibilità ai negozi doppi di attingere a entrambi i
   magazzini»: per i pezzi con IMEI era già così, per la merce a quantità no —
   e la merce a quantità è la maggioranza. A Magliana W3 una SIM Fastweb non
   si poteva vendere perché quel codice sta sullo scaffale di Magliana Multi,
   a tre metri: 367 pezzi invisibili, e il cliente che se ne va. Stessa cosa
   per Sim Vodafone, Sost Fastweb, eSIM Fastweb, PLX, PLKasko — e nell'altro
   verso per Sim Wind3 e Sost Wind3.
   La società NON si perde: la porta la riga della giacenza, e il server la
   rilegge dal magazzino — anche del gemello — quando emette lo scontrino. */
let _sedi: string[] | null = null;
async function negoziDellaSede(negozio: string): Promise<string[]> {
    if (!_sedi) {
        const { data, error } = await supabase.from("stores").select("name");
        /* NON SO ≠ È SOLO (regola del repo). Se la lettura fallisce non si
           mette in cache una lista vuota: si risponde col negozio e basta, e
           la volta dopo si riprova. Con la cache avvelenata, la merce del
           gemello sarebbe sparita per tutta la sessione senza un segnale. */
        if (error || !data) return [negozio];
        _sedi = data.map((r: { name: string }) => String(r.name));
    }
    const suoi = _sedi.filter((n) => stessoMagazzino(n, negozio));
    return suoi.length ? suoi : [negozio];
}

export async function caricaGiacenze(negozio: string, azienda?: string | null): Promise<EsitoGiacenze> {
    const m = new Map<string, Giacenza>();
    if (!negozio) return { mappa: m };
    const nomi = await negoziDellaSede(negozio);
    for (let da = 0; ; da += PAGINA) {
        let q = supabase.from("mag_disponibilita")
            .select("codice,quantita,azienda,negozio,pezzi_con_seriale,pezzi_a_quantita").in("negozio", nomi);
        if (azienda) q = q.eq("azienda", azienda);
        const { data, error } = await q.range(da, da + PAGINA - 1);
        if (error) return { mappa: m, errore: error.message };
        if (!data?.length) break;
        (data as { codice: string; quantita: number; azienda: string | null; negozio: string; pezzi_con_seriale: number; pezzi_a_quantita: number }[]).forEach((g) => {
            const gia = m.get(g.codice);
            const q = Number(g.quantita) || 0;
            /* DI CHI È LA MERCE. Senza filtro di società lo stesso articolo
               può tornare due volte: si sommano le quantità, ma la società da
               segnare è quella che i pezzi ce li ha davvero. Oggi a Donna
               nessun codice sta in due società (verificato), quindi il caso
               ambiguo non si presenta — ma se un domani si presenta la cassa
               non deve tirare a indovinare. */
            /* CHI HA I PEZZI, E A PARITÀ IL NEGOZIO DOVE SI STA BATTENDO
               (revisore 01/09). La regola di prima era «vince la prima riga
               con pezzi», senza guardare da dove si vende — e questa società
               VIAGGIA con l'articolo fino al server, dove ha la precedenza su
               quella calcolata lì. Cioè: la regola sbagliata vinceva su quella
               giusta. A Magliana ci sono tre codici con pezzi in tutte e due
               le insegne e società diverse, e su quelli lo scontrino poteva
               uscire con la partita IVA dell'altra — con il movimento di
               scarico scritto su una riga che non esiste, cioè una giacenza
               fantasma a −1 che nessuno vede. */
            const primaAz = gia?.azienda ?? null;
            const teneva = Number(gia?.quantita || 0) > 0;
            const suo = g.negozio === negozio;
            const suoPrima = gia?.negozioAzienda === negozio;
            const azienda = q > 0
                ? (!teneva ? g.azienda
                    : suo ? g.azienda
                        : suoPrima ? primaAz
                            : (q > Number(gia?.quantita || 0) ? g.azienda : primaAz))
                : primaAz;
            const negozioAzienda = azienda === g.azienda && q > 0 ? g.negozio : (gia?.negozioAzienda ?? null);
            m.set(g.codice, {
                codice: g.codice,
                quantita: q + Number(gia?.quantita || 0),
                soglia_min: null,
                azienda: azienda ?? null,
                negozioAzienda,
                ambigua: teneva && q > 0 && !!primaAz && primaAz !== g.azienda,
                pezziConSeriale: Number(g.pezzi_con_seriale || 0) + Number(gia?.pezziConSeriale || 0),
                pezziAQuantita: Number(g.pezzi_a_quantita || 0) + Number(gia?.pezziAQuantita || 0),
            });
        });
        if (data.length < PAGINA) break;
    }
    return { mappa: m };
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

/* ── UN'ICONA PER OGNI COSA (Luca 29/08) ────────────────────────────────
   «Anche queste devono avere delle immagini o delle emoticon: le SIM le
   hanno già, per le altre creale.»
   Un pulsante fatto di solo testo si legge; un pulsante con un'icona si
   RICONOSCE, e al banco si va a colpo d'occhio. Le SIM hanno il logo del
   brand, che è meglio di qualunque emoji; per gli articoli di magazzino
   l'icona si ricava da com'è fatto l'articolo — è l'unica cosa che sappiamo
   di sicuro, il nome. Prima il termine più specifico: «cavo tipo C» è un
   cavo, non un tipo. */
/* Regola, emoji e NOME della famiglia. Il nome serve al magazzino: i 17.061
   articoli del gestionale hanno il sottogruppo vuoto su 10.702 righe, e al
   loro posto c'è il listino del fornitore — «LISTINO SBS», «Accessori». Chi
   cerca una custodia non pensa «SBS». Quando il sottogruppo manca, la
   famiglia si legge dal nome dell'articolo, con QUESTA lista: una sola, così
   l'icona alla cassa e la voce in magazzino non possono dire due cose diverse.
   L'ordine conta: vince la prima che riconosce, quindi il termine più
   specifico sta prima — «cavo tipo C» è un cavo, non un tipo. */
const TIPI: [RegExp, string, string][] = [
    [/pellicol|vetro temp|tempered|glass|screen protect/i, "🪟", "Pellicole e vetri"],
    /* I CARICABATTERIE PRIMA DELLE BATTERIE (revisore 31/08): «carica-BATTERI-e»
       contiene «batteri», e con l'ordine invertito 221 caricabatterie su 289
       si chiamavano «batterie di ricambio». Il lookahead non bastava: qui
       basta l'ordine, che è più semplice da leggere. */
    [/caricabatteri|caricator|alimentator|trasformator|charger|adattatore di rete/i, "⚡", "Caricabatterie"],
    [/power\s*bank|accumulator|batteria esterna/i, "🔋", "Power bank"],
    /* Le batterie di ricambio hanno il codice attaccato al modello —
       `BATTREDMI9`, `battredminote11s` — e «batteri» non ci si aggancia:
       finivano fra i «Telefoni» perché dentro c'era «redmi». */
    /* `\bbatteri` col confine di parola: senza, «Custodia con antiBATTERIco»
       diventava una batteria (44 custodie). Il confine non scatta dentro
       «antibatterico» né dentro «caricabatterie» — che comunque ha già
       risposto qui sopra. */
    [/^\s*batt|\bbatteri/i, "🔋", "Batterie di ricambio"],
    /* GLI AURICOLARI PRIMA DELLE CUSTODIE (revisore 31/08). Quaranta paia di
       auricolari TWS si chiamano «…with charging case» e finivano fra le
       custodie. Le custodie PER auricolari restano custodie lo stesso: il loro
       nome dice «cover»/«custodia», che qui sotto vince comunque — e «airpod»
       da solo, senza quelle parole, sono gli auricolari veri. */
    [/auricolar|cuffi|ear\s*bud|earphone|headphone|headset|\btws\b/i, "🎧", "Auricolari e cuffie"],
    /* `\bbook\b` CON ENTRAMBI I CONFINI: senza quello a sinistra prendeva
       Mac-book, Note-book, Chrome-book — 72 articoli, portatili veri, con
       l'icona della custodia. E `flip` da solo prendeva i pieghevoli
       (Galaxy Z Flip): qui vuole «flip case» o «flip cover». */
    [/cover|custodi|flip\s*(case|cover)|bumper|guscio|\bbook\b|wallet|jelly|handbag/i, "🛡️", "Custodie e cover"],
    [/airpod/i, "🎧", "Auricolari e cuffie"],
    [/speaker|cassa bluetooth|soundbar|altoparlant/i, "🔊", "Speaker"],
    [/micro\s*sd|memory|memori|usb|pen\s*drive|pendrive|flash/i, "💾", "Memorie e USB"],
    [/cavo|cable|type\s*-?c|lightning|micro\s*usb/i, "🔌", "Cavi"],
    [/adattator|adapter|adatt\b/i, "🔗", "Adattatori"],
    [/modem|router|fwa|internet key|hotspot/i, "📡", "Modem e router"],
    /* I RICAMBI PRIMA DEI TELEFONI (revisore 31/08): `DISPLAY IPHONE4B`
       contiene «iphone», e con l'ordine invertito la regola non serviva a
       niente — era proprio il caso per cui era stata scritta. L'ancora a
       inizio riga resta: «display 6.5"» dentro la scheda di un telefono non
       deve farlo diventare un ricambio. E `glue` non prende le «Glue Case». */
    [/^\s*display|^\s*glue\b(?!\s*case)/i, "🧩", "Ricambi"],
    /* L'USATO PRIMA DEI TELEFONI (confronto sui 17.061 articoli): 703 telefoni
       usati perdevano il simbolo del riciclo e diventavano telefoni normali.
       Al banco quel simbolo dice una cosa che serve sapere prima del modello.
       Sta comunque dopo le custodie: una cover per un usato è una cover.
       ED È SALITO ANCORA, sopra Tablet e Orologi (revisione finale 01/09):
       da quando «TAB A9» si riconosce, 62 tablet e 22 orologi USATI — tutti
       codici `RITUSATO` — prendevano il simbolo del modello invece di quello
       del riciclo. La regola c'era già scritta qui sopra; era l'ordine che
       non la rispettava più. */
    [/usato|ricondizion/i, "♻️", "Usato"],
    /* IL CONFINE DI PAROLA, di nuovo (revisore 01/09). `ipad` senza confine
       prendeva «PENIPAD» — un pennino — e «tablet» da solo non prendeva i
       «GALAXY TAB A9», che nel catalogo si scrivono «TAB» e basta: 27 tablet
       veri stavano fra i Telefoni perché nel nome c'era «galaxy» o «alcatel».
       Misurato sui 17.073 articoli: 37 tablet ritrovati, 8 persi e sono tutti
       display o cover PER iPad, che le regole del codice classificano meglio. */
    [/tablet|\bipad|\btab\s*[a-z]?\s*\d/i, "🧱", "Tablet"],
    /* `watch` senza confine prendeva «case-i-WATCH», che è una custodia. Con
       il confine si perderebbero però «applewatchultra2» e simili, scritti
       tutti attaccati: per questo `apple\s*watch` sta lì accanto. */
    [/\bwatch|apple\s*watch|smart\s*watch|orolog|band\b|smartband/i, "⌚", "Orologi e band"],
    [/e-?sim|esim/i, "📲", "eSIM"],
    [/\bsim\b|usim|iccid/i, "📶", "SIM"],
    /* UN «CASE» CHE NON HA INCONTRATO NESSUNA REGOLA PRIMA è una custodia —
       «Glue Case for iPhone XR». Sta qui, non in fondo: sotto ai Telefoni
       perderebbe contro «iphone», e sopra agli auricolari ruberebbe i TWS col
       guscio di ricarica. In mezzo va bene a tutti e due. */
    [/\bcase\b/i, "🛡️", "Custodie e cover"],
    /* I NOMI DEI PRODUTTORI in coda: un articolo che non ha detto nient'altro
       ma porta «ZTE Nubia» o «Oppo» è il telefono, non un accessorio per il
       telefono — chi vende accessori scrive sempre cos'è (cover, cavo,
       pellicola) e quelle regole hanno già parlato molto più in alto. */
    [/smartphone|telefon|phone|iphone|galaxy|redmi|xiaomi|motorola|\bzte\b|nubia|\boppo\b|honor|realme|nokia|alcatel|huawei|pixel/i, "📱", "Telefoni"],
    /* `stand` senza confine prende «STANDard»: una PlayStation 5 da 700 €
       finiva fra i supporti. */
    [/support|holder|\bstand\b|treppied/i, "📎", "Supporti"],
    [/charm|bijoux|portachiav|keyring/i, "✨", "Gadget e charm"],
    [/car\b|auto|ventol|parabrezza/i, "🚗", "Auto"],
    [/kasko|assicuraz|garanzi/i, "🧾", "Assicurazioni"],
];

/** L'emoji che descrive un articolo. Mai vuota: nel dubbio è una scatola. */
export function iconaArticolo(...testi: (string | null | undefined)[]): string {
    const t = testi.filter(Boolean).join(" ");
    for (const [rx, ico] of TIPI) if (rx.test(t)) return ico;
    return "📦";
}

/** La FAMIGLIA di un articolo letta dal nome, quando il gestionale non la dice.
 *  `null` se non si riconosce: inventarla sarebbe peggio che ammetterlo. */
export function famigliaDalNome(...testi: (string | null | undefined)[]): string | null {
    const t = testi.filter(Boolean).join(" ");
    for (const [rx, , nome] of TIPI) if (rx.test(t)) return nome;
    return null;
}
