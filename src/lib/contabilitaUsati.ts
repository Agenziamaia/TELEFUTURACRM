import { supabaseAdmin } from "@/lib/supabaseAdmin";

/* ═══ GLI USATI CHE CAMBIANO SOCIETÀ ═══════════════════════════════════════
   Luca 02/09: «noi compriamo i telefoni da una società e li vendiamo a
   un'altra — a Magliana gli usati vengono spesso venduti come Telefutura 2, ma
   la maggior parte vengono comprati con Telefutura 1. Nel momento in cui viene
   venduto un usato dobbiamo verificare qual è la società che lo ha comprato, e
   quando c'è disparità fra le due lo registriamo. Serve un file da portare al
   commercialista con il prezzo di vendita, la società che ha comprato, quella
   che ha venduto, quando l'abbiamo comprato e quando l'abbiamo venduto: così
   lui si aggiusta la contabilità, fa le fatture e ci dice gli importi da
   fatturare da una società all'altra».

   ⚠️ PERCHÉ SUCCEDE. Un usato non è merce di magazzino: non ha un'associazione
   automatica alla società, come le ricariche e i servizi. La società che
   compra è quella del documento d'acquisto; quella che vende è la società
   della CASSA su cui esce lo scontrino. Non c'è niente che le tenga allineate,
   e infatti spesso non lo sono.

   ⚠️ IL PREZZO D'ACQUISTO NEL FILE NON È SEMPRE QUELLO PAGATO. Regola di Luca:
   sotto i 100 € l'acquisto si porta a 100. «Comprato a 60 → nel file 100;
   comprato a 90 → 100; comprato a 130 → resta 130.» Vale SOLO nel file che
   esce da qui: l'archivio conserva la cifra vera, e le due si vedono affiancate
   così nessuno confonde il documento con il dato.

   ⚠️ E NON SI INVENTA UNA SOCIETÀ. 74 telefoni su 281 non hanno una società
   d'acquisto registrata (non erano nel file storico del vecchio gestionale):
   quelli si elencano a parte, marcati «da confermare», e NON entrano nel file
   del commercialista finché qualcuno non la scrive. Un documento fiscale con
   una società indovinata è peggio di un documento incompleto. */

/** Il minimo che il commercialista vede come costo d'acquisto. */
export const ACQUISTO_MINIMO = 100;

/** Il prezzo d'acquisto come va nel file: mai sotto il minimo — ma solo se un
 *  costo c'è.
 *
 *  ⚠️ ZERO NON VUOL DIRE «GRATIS», VUOL DIRE «NON REGISTRATO». 74 telefoni
 *  arrivano dal vecchio gestionale senza prezzo d'acquisto. Portandoli a 100
 *  come gli altri, il resoconto di agosto avrebbe dichiarato 27.561 € di costo
 *  nati da un `max()` — e quella cifra sarebbe finita nel corpo dell'email
 *  come importo da fatturare fra le due società.
 *  Un costo che non conosciamo si dice, non si arrotonda. */
export const acquistoPerCommercialista = (v: number | null | undefined): number | null => {
    const n = Number(v || 0);
    return n > 0 ? Math.max(n, ACQUISTO_MINIMO) : null;
};

export const NOME_SOCIETA: Record<string, string> = {
    T1: "Telefutura S.r.l.",
    T2: "Telefutura 2 S.r.l.",
};

export type RigaContabilita = {
    id: number;
    imei: string;
    modello: string;
    negozio: string | null;
    aziendaAcquisto: string | null;
    aziendaVendita: string | null;
    /** true quando le due società ci sono e sono diverse: qui ci va la fattura. */
    daFatturare: boolean;
    /** true quando manca la società d'acquisto: non si può dire niente. */
    daConfermare: boolean;
    acquistoReale: number;
    /** Quello che va nel file: la correzione a mano se c'è, se no la regola.
     *  null = costo non registrato, e nel file esce vuoto — non a 100. */
    acquistoFile: number | null;
    /** null = non ancora venduto: la colonna del prezzo resta vuota. */
    vendita: number | null;
    /** Il prezzo di vendita come va nel file: la correzione a mano se c'è. */
    venditaFile: number | null;
    /** Da dove viene `acquistoFile`: serve a colorarlo e a spiegarlo.
     *  «reale» = è la cifra pagata · «regola» = alzata al minimo di 100 €
     *  «mano» = deciso da una persona · «ignoto» = costo non registrato. */
    origineCosto: "reale" | "regola" | "mano" | "ignoto";
    origineVendita: "reale" | "mano" | "nessuna";
    corretti: { chi: string; quando: string } | null;
    /** In quale foglio sta questa riga: cambia cosa si può affermare. */
    lato: "venduto" | "comprato";
    compratoIl: string | null;
    vendutoIl: string | null;
    documentoAcquisto: string | null;
    /** Se una delle due società è stata scritta a mano qui dentro: chi e quando.
     *  ⚠️ Va IN EVIDENZA. Una società corretta a mano finisce su una fattura fra
     *  due società vere: chi legge il file deve sapere quali righe sono state
     *  toccate da una persona e quali vengono dal documento d'acquisto. */
    corretta: { chi: string; quando: string } | null;
};

type Grezza = {
    id: number; imei: string | null; model: string | null; store: string | null;
    azienda_acquisto: string | null; azienda_vendita: string | null;
    purchase_price: number | null; sold_price: number | null; sale_price: number | null;
    purchase_date: string | null; sold_date: string | null; doc_acquisto: string | null;
    status_history: Record<string, unknown> | null;
    costo_contabile: number | null; vendita_contabile: number | null;
    prezzi_corretti_da: string | null; prezzi_corretti_il: string | null;
};

/** L'ultima correzione a mano della società, se c'è stata. La cronologia di un
 *  usato è un OGGETTO con chiave lo stato, non una lista: le correzioni si
 *  riconoscono dal prefisso della chiave. */
function ultimaCorrezione(storia: Record<string, unknown> | null): { chi: string; quando: string } | null {
    if (!storia || typeof storia !== "object" || Array.isArray(storia)) return null;
    let ultima: { chi: string; quando: string } | null = null;
    for (const [k, v] of Object.entries(storia)) {
        if (!k.startsWith("societa_")) continue;
        const e = v as { date?: string; operatore?: string } | null;
        if (!e?.date) continue;
        if (!ultima || e.date > ultima.quando) ultima = { chi: String(e.operatore || "—"), quando: e.date };
    }
    return ultima;
}

function componi(r: Grezza, lato: "venduto" | "comprato"): RigaContabilita {
    const acquisto = Number(r.purchase_price || 0);
    /* ⚠️ IL PREZZO DI VENDITA SOLO SE È STATO VENDUTO. Il ripiego su
       `sale_price` metteva il prezzo di VETRINA nella colonna «prezzo di
       vendita» di telefoni ancora in negozio: nel foglio dei comprati di agosto
       erano 41.449 € di ricavi mai incassati. `sold_price` è quello che il
       cliente ha pagato davvero, e su un invenduto non esiste. */
    const venduto = lato === "venduto" || !!r.sold_date;
    const vendita = venduto ? Number(r.sold_price ?? r.sale_price ?? 0) : null;

    /* ⚠️ LA CORREZIONE A MANO VINCE SU TUTTO, e non si ricalcola. È la
       decisione di una persona su un numero che diventerà una fattura: la
       regola dei 100 € è un ripiego per quando nessuno ha deciso, non
       un'autorità che sovrascrive chi ha deciso. */
    const aMano = r.costo_contabile != null;
    const daRegola = acquistoPerCommercialista(acquisto);
    const acquistoFile = aMano ? Number(r.costo_contabile) : daRegola;
    const origineCosto: RigaContabilita["origineCosto"] =
        aMano ? "mano"
            : daRegola == null ? "ignoto"
                : daRegola !== acquisto ? "regola" : "reale";
    const venditaFile = r.vendita_contabile != null ? Number(r.vendita_contabile) : vendita;
    return {
        id: r.id, imei: String(r.imei || ""), modello: String(r.model || ""),
        negozio: r.store, lato,
        aziendaAcquisto: r.azienda_acquisto, aziendaVendita: r.azienda_vendita,
        /* ⚠️ LA FATTURA LA DICE SOLO IL FOGLIO DEI VENDUTI. Un telefono comprato
           e venduto nello stesso mese sta in tutti e due, e con la stessa
           colonna a «SÌ» nulla impediva di emettere due fatture per lo stesso
           apparecchio: in agosto erano 32 su 32. */
        daFatturare: lato === "venduto"
            && !!r.azienda_acquisto && !!r.azienda_vendita && r.azienda_acquisto !== r.azienda_vendita,
        /* ⚠️ E UN INVENDUTO NON PUÒ AVERE UNA SOCIETÀ DI VENDITA. Pretenderla
           faceva uscire rosse 204 righe che erano solo telefoni ancora in
           negozio, sommerse insieme a quelle che mancano davvero. */
        daConfermare: !r.azienda_acquisto || (lato === "venduto" && !r.azienda_vendita),
        acquistoReale: acquisto,
        acquistoFile, origineCosto,
        vendita, venditaFile,
        origineVendita: r.vendita_contabile != null ? "mano" : venduto ? "reale" : "nessuna",
        corretti: r.prezzi_corretti_il ? { chi: r.prezzi_corretti_da || "—", quando: r.prezzi_corretti_il } : null,
        compratoIl: r.purchase_date, vendutoIl: r.sold_date,
        documentoAcquisto: r.doc_acquisto,
        corretta: ultimaCorrezione(r.status_history),
    };
}

const CAMPI = "id, imei, model, store, azienda_acquisto, azienda_vendita, purchase_price, sold_price, sale_price, purchase_date, sold_date, doc_acquisto, status_history, costo_contabile, vendita_contabile, prezzi_corretti_da, prezzi_corretti_il";

/** Gli usati VENDUTI in un periodo. `da`/`a` sono giorni (YYYY-MM-DD). */
export async function usatiVenduti(da: string, a: string): Promise<RigaContabilita[]> {
    const { data, error } = await supabaseAdmin.from("usati").select(CAMPI)
        .eq("status", "venduto")
        .gte("sold_date", da + "T00:00:00Z").lte("sold_date", a + "T23:59:59Z")
        .order("sold_date", { ascending: false }).limit(20000);
    if (error) throw new Error(error.message);
    return ((data || []) as Grezza[]).map((r) => componi(r, "venduto"));
}

/** Gli usati COMPRATI in un periodo: servono al resoconto mensile, che li
 *  vuole tutt'e due — «il resoconto dei telefoni usati venduti e comprati nel
 *  mese precedente». */
export async function usatiComprati(da: string, a: string): Promise<RigaContabilita[]> {
    const { data, error } = await supabaseAdmin.from("usati").select(CAMPI)
        .gte("purchase_date", da + "T00:00:00Z").lte("purchase_date", a + "T23:59:59Z")
        .order("purchase_date", { ascending: false }).limit(20000);
    if (error) throw new Error(error.message);
    return ((data || []) as Grezza[]).map((r) => componi(r, "comprato"));
}

/** Le colonne del file, nell'ordine in cui il commercialista le legge. */
export const INTESTAZIONI = [
    "IMEI", "Modello", "Punto vendita",
    "Società che ha comprato", "Società che ha venduto", "Fattura tra società",
    "Comprato il", "Costo reale", `Costo per la contabilità (min. ${ACQUISTO_MINIMO} €)`,
    "Venduto il", "Prezzo di vendita", "Documento d'acquisto", "Società corretta a mano",
    "Da dove viene il costo", "Prezzi corretti a mano da",
];

const giorno = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("it-IT") : "";

export const inRiga = (r: RigaContabilita) => [
    r.imei, r.modello, r.negozio || "",
    r.aziendaAcquisto ? NOME_SOCIETA[r.aziendaAcquisto] || r.aziendaAcquisto : "— da confermare",
    /* su un telefono non ancora venduto la casella resta vuota: non è un dato
       che manca, è un dato che non esiste ancora */
    r.aziendaVendita ? NOME_SOCIETA[r.aziendaVendita] || r.aziendaVendita
        : r.lato === "venduto" ? "— da confermare" : "",
    r.lato === "comprato" ? "" : r.daFatturare ? "SÌ" : r.daConfermare ? "?" : "no",
    giorno(r.compratoIl),
    r.acquistoReale > 0 ? r.acquistoReale : "costo non registrato",
    r.acquistoFile ?? "costo non registrato",
    giorno(r.vendutoIl), r.venditaFile ?? "", r.documentoAcquisto || "",
    /* ⚠️ ANCHE NEL FILE. Il commercialista deve poter distinguere una società
       che viene dal documento d'acquisto da una scritta a mano da noi. */
    r.corretta ? `${r.corretta.chi} il ${giorno(r.corretta.quando)}` : "",
    /* ⚠️ IL COMMERCIALISTA DEVE SAPERE DA DOVE VIENE OGNI CIFRA. Un costo
       alzato dalla regola e uno deciso da una persona non sono la stessa cosa,
       e da un numero secco non si distinguono. */
    ({ reale: "pagato", regola: "portato al minimo di 100 €", mano: "deciso a mano", ignoto: "costo non registrato" })[r.origineCosto],
    r.corretti ? `${r.corretti.chi} il ${giorno(r.corretti.quando)}` : "",
];

/* ═══ IL MESE APPENA CHIUSO ════════════════════════════════════════════════
   ⚠️ ERA SCRITTO DUE VOLTE, e in due modi diversi: il pannello contava i mesi
   in UTC, il lavoro automatico sul giorno di Roma. Divergevano 19 ore l'anno —
   sempre fra mezzanotte e le due del 1° del mese — e in quella finestra il
   pannello mostrava un mese e l'email ne avrebbe mandato un altro, interrogando
   pure la riga sbagliata del registro degli invii.
   Roma vince: il mese contabile è quello italiano. */
export function meseAppenaChiuso() {
    const oggiRoma = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
    const [y, m] = oggiRoma.split("-").map(Number);
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    const ultimo = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    const mm = String(pm).padStart(2, "0");
    return {
        da: `${py}-${mm}-01`, a: `${py}-${mm}-${String(ultimo).padStart(2, "0")}`,
        etichetta: new Date(Date.UTC(py, pm - 1, 1)).toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "UTC" }),
    };
}

/** Il mese in corso: è quello che l'amministrazione guarda tutti i giorni,
 *  mentre il resoconto parla di quello prima. */
export function meseInCorso() {
    const oggiRoma = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
    const [y, m] = oggiRoma.split("-").map(Number);
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const mm = String(m).padStart(2, "0");
    return { da: `${y}-${mm}-01`, a: `${y}-${mm}-${String(ultimo).padStart(2, "0")}` };
}
