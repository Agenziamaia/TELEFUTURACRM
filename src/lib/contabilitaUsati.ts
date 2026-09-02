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

/** Il prezzo d'acquisto come va nel file: mai sotto il minimo. */
export const acquistoPerCommercialista = (v: number | null | undefined) =>
    Math.max(Number(v || 0), ACQUISTO_MINIMO);

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
    acquistoFile: number;
    vendita: number;
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

function componi(r: Grezza): RigaContabilita {
    const acquisto = Number(r.purchase_price || 0);
    /* il prezzo effettivo di vendita, non quello di vetrina: `sold_price` è
       quello che il cliente ha pagato davvero */
    const vendita = Number(r.sold_price ?? r.sale_price ?? 0);
    return {
        id: r.id, imei: String(r.imei || ""), modello: String(r.model || ""),
        negozio: r.store,
        aziendaAcquisto: r.azienda_acquisto, aziendaVendita: r.azienda_vendita,
        daFatturare: !!r.azienda_acquisto && !!r.azienda_vendita && r.azienda_acquisto !== r.azienda_vendita,
        daConfermare: !r.azienda_acquisto || !r.azienda_vendita,
        acquistoReale: acquisto,
        acquistoFile: acquistoPerCommercialista(acquisto),
        vendita,
        compratoIl: r.purchase_date, vendutoIl: r.sold_date,
        documentoAcquisto: r.doc_acquisto,
        corretta: ultimaCorrezione(r.status_history),
    };
}

const CAMPI = "id, imei, model, store, azienda_acquisto, azienda_vendita, purchase_price, sold_price, sale_price, purchase_date, sold_date, doc_acquisto, status_history";

/** Gli usati VENDUTI in un periodo. `da`/`a` sono giorni (YYYY-MM-DD). */
export async function usatiVenduti(da: string, a: string): Promise<RigaContabilita[]> {
    const { data, error } = await supabaseAdmin.from("usati").select(CAMPI)
        .eq("status", "venduto")
        .gte("sold_date", da + "T00:00:00Z").lte("sold_date", a + "T23:59:59Z")
        .order("sold_date", { ascending: false }).limit(20000);
    if (error) throw new Error(error.message);
    return ((data || []) as Grezza[]).map(componi);
}

/** Gli usati COMPRATI in un periodo: servono al resoconto mensile, che li
 *  vuole tutt'e due — «il resoconto dei telefoni usati venduti e comprati nel
 *  mese precedente». */
export async function usatiComprati(da: string, a: string): Promise<RigaContabilita[]> {
    const { data, error } = await supabaseAdmin.from("usati").select(CAMPI)
        .gte("purchase_date", da + "T00:00:00Z").lte("purchase_date", a + "T23:59:59Z")
        .order("purchase_date", { ascending: false }).limit(20000);
    if (error) throw new Error(error.message);
    return ((data || []) as Grezza[]).map(componi);
}

/** Le colonne del file, nell'ordine in cui il commercialista le legge. */
export const INTESTAZIONI = [
    "IMEI", "Modello", "Punto vendita",
    "Società che ha comprato", "Società che ha venduto", "Fattura tra società",
    "Comprato il", "Costo reale", `Costo per la contabilità (min. ${ACQUISTO_MINIMO} €)`,
    "Venduto il", "Prezzo di vendita", "Documento d'acquisto", "Società corretta a mano",
];

const giorno = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("it-IT") : "";

export const inRiga = (r: RigaContabilita) => [
    r.imei, r.modello, r.negozio || "",
    r.aziendaAcquisto ? NOME_SOCIETA[r.aziendaAcquisto] || r.aziendaAcquisto : "— da confermare",
    r.aziendaVendita ? NOME_SOCIETA[r.aziendaVendita] || r.aziendaVendita : "— da confermare",
    r.daFatturare ? "SÌ" : r.daConfermare ? "?" : "no",
    giorno(r.compratoIl), r.acquistoReale, r.acquistoFile,
    giorno(r.vendutoIl), r.vendita, r.documentoAcquisto || "",
    /* ⚠️ ANCHE NEL FILE. Il commercialista deve poter distinguere una società
       che viene dal documento d'acquisto da una scritta a mano da noi. */
    r.corretta ? `${r.corretta.chi} il ${giorno(r.corretta.quando)}` : "",
];
