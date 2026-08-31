/* ═══════════════════════════════════════════════════════════════════════════
   I TRASFERIMENTI — TUTTE LE SITUAZIONI IN CUI DELLA MERCE SI MUOVE
   (Luca 31/08)

   «C'è uno stato "in transito", però che significa in transito? Io invio un
    prodotto da un negozio, in quel momento è in transito, va bene. Nel momento
    in cui viene accettato va in disponibilità dell'altro negozio — ma il primo
    negozio che l'ha inviato come lo vede quel prodotto? Non lo vede. Non c'è
    uno storico dei prodotti che sono stati trasferiti. Costruisci meglio
    questa parte, dove posso andare ad applicare diversi tipi di filtri dentro
    i trasferimenti.»

   ── LE SITUAZIONI, E COSA DEVE SUCCEDERE IN OGNUNA ────────────────────────

   1. INVIO NORMALE (stessa società, due sedi diverse).
      Chi spedisce sceglie la merce, il CRM emette il DDT e la merce esce
      SUBITO dalla sua disponibilità. Chi riceve la vede fra «da accettare
      qui»; quando accetta, entra a scaffale. Resta scritto: la riga del
      documento, con negozio di partenza, di arrivo, chi ha spedito, chi ha
      accettato e quando.

   2. INVIO FRA SOCIETÀ DIVERSE (Telefutura → Telefutura 2).
      Non è un trasferimento: è una CESSIONE fra due soggetti giuridici. Il
      DDT va seguito da FATTURA, e la merce cambia proprietario — all'accetta-
      zione il pezzo passa alla società che riceve, se no lo scontrino uscirà
      dalla cassa sbagliata (regola §8a). Finché la fattura non c'è, il
      documento resta nell'elenco «da fatturare».

   3. INVIO FRA GEMELLI (Magliana W3 ↔ Magliana Multi, Acilia, Collatina).
      Due insegne nello STESSO locale, stesso scaffale, società diverse. La
      merce non si muove di un metro: cambia proprietario. Fiscalmente è una
      cessione come la 2 (e la fattura serve lo stesso), ma non c'è nessun
      trasporto e nessuno a cui consegnare: tenerlo «in transito» vorrebbe
      dire rendere invendibile per giorni un telefono che sta a quaranta
      centimetri. Quindi il documento si emette e si chiude nello stesso atto.

   4. MERCE A QUANTITÀ (accessori e SIM: l'84% del magazzino).
      Non ha un seriale, quindi non ha un `ddt_id` dove scriversi: fino a oggi
      NON SI POTEVA TRASFERIRE. Ora è una riga del documento come le altre; la
      giacenza si muove con un movimento (`trasferimento_out` alla partenza,
      `trasferimento_in` all'arrivo), mai scritta a mano (regola §8 «la
      giacenza non si scrive mai a mano»). Fra la partenza e l'arrivo quei
      pezzi non sono in nessun negozio: sono IN VIAGGIO, e i trasferimenti
      sono l'unico posto dove si vedono.

   5. DDT MAI ACCETTATO. Non si accetta da solo: un documento fiscale non lo
      firma un timer. Ma INVECCHIA, e si vede: dopo 3 giorni è in ritardo,
      dopo 7 è fermo. Lo vedono tutti e tre — chi ha spedito, chi deve
      ricevere, l'amministrazione.

   6. ACCETTATO IN PARTE («ne arrivano 5 su 6»). Si accetta riga per riga. Il
      documento si chiude «con differenze» e le righe che non sono arrivate
      restano APERTE, con un nome e un perché: nessuno le riassorbe di
      nascosto. Poi qualcuno decide: sono tornate al mittente, o sono perse.

   7. RIFIUTATO IN BLOCCO. La merce torna al mittente: i pezzi tornano suoi e
      disponibili, le quantità rientrano con un movimento. Il motivo è
      obbligatorio.

   8. VENDUTO MENTRE ERA IN VIAGGIO. Capita: il pacco arriva, si vende subito
      e il DDT lo accetta qualcun altro il giorno dopo. Non è un errore e non
      deve bloccare niente: la riga si chiude «venduta in viaggio» col link
      alla vendita, e il documento può chiudersi lo stesso.

   9. CESTINATO MENTRE ERA IN VIAGGIO. L'amministrazione lo toglie dal
      magazzino («mai arrivato», «rotto»): non può più essere accettato. La
      riga si chiude «annullata in viaggio» e il documento va a differenze.

  10. ANNULLAMENTO DI UN DDT GIÀ PARTITO. Solo prima che qualcuno accetti, e
      solo dal mittente o dall'amministrazione. Tutto torna indietro. Il
      DOCUMENTO NON SI CANCELLA: resta col suo numero, marcato annullato —
      un progressivo con i buchi non è un progressivo.

  11. RESO AL FORNITORE. La merce esce dal gruppo: il destinatario non è un
      negozio, è un soggetto esterno. Nessuno accetterà mai: il documento
      nasce già chiuso («uscito»), e la merce esce dal magazzino.

  12. «IL NEGOZIO CHE HA SPEDITO COME RIVEDE QUELLA MERCE?»
      `mag_unita.ddt_id` viene azzerato all'accettazione, quindi dalla riga
      del pezzo la prova sparisce nel momento esatto in cui il trasferimento
      riesce. La memoria sta nelle RIGHE del documento (`mag_ddt_righe`), che
      non si azzerano mai e portano `negozio_da`: il mittente filtra per il
      suo negozio e rivede tutto quello che ha spedito, per sempre, con la
      fine che ha fatto ogni pezzo.
   ═══════════════════════════════════════════════════════════════════════════ */

import { stessoMagazzino } from "@/lib/negoziNomi";

/* ── I DATI ─────────────────────────────────────────────────────────────── */

export type Ddt = {
    id: string; numero: number; anno: number | null;
    da_negozio: string; a_negozio: string;
    azienda_da: string | null; azienda_a: string | null;
    stato: string; tipo: string | null;
    causale: string | null; aspetto: string | null; trasporto: string | null;
    colli: number | null; inizio_trasporto: string | null;
    creato_da: string | null; creato_il: string;
    accettato_da: string | null; accettato_il: string | null;
    chiuso_da: string | null; chiuso_il: string | null;
    motivo: string | null; note: string | null;
    /* il destinatario ESTERNO (reso a fornitore): sul documento è il
       cessionario, quindi vuole gli stessi dati di una società — non una riga
       di testo libero */
    destinatario: string | null; destinatario_piva: string | null;
    destinatario_indirizzo: string | null; destinatario_civico: string | null;
    destinatario_cap: string | null; destinatario_citta: string | null;
    destinatario_provincia: string | null;
    fattura_stato: string | null; fattura_rif: string | null; fattura_il: string | null;
    valore: number | null;
};

export type RigaDdt = {
    id: string; ddt_id: string; riga: number;
    codice: string | null; descrizione: string;
    unita_id: string | null; seriale: string | null;
    quantita: number; quantita_accettata: number | null; valore_unitario: number | null;
    negozio_da: string; negozio_a: string;
    azienda_da: string | null; azienda_a: string | null;
    stato: string; motivo: string | null;
    chiusa_il: string | null; chiusa_da: string | null; creato_il: string;
};

/* ── COME SI CHIAMANO LE COSE ───────────────────────────────────────────── */

/** `tono` è il nome di una classe `.rvBadge-*` della cassetta: il colore non
 *  si scrive qui (regola 2), si nomina. */
export const STATI_DDT: Record<string, { et: string; ico: string; tono: string }> = {
    in_transito: { et: "In viaggio", ico: "🚚", tono: "rvBadge-acc" },
    accettato: { et: "Arrivato", ico: "✅", tono: "rvBadge-ok" },
    parziale: { et: "Con differenze", ico: "⚠️", tono: "rvBadge-warn" },
    rifiutato: { et: "Respinto", ico: "↩️", tono: "rvBadge-ko" },
    annullato: { et: "Annullato", ico: "🚫", tono: "rvBadge-empty" },
    uscito: { et: "Uscito dal gruppo", ico: "📤", tono: "rvBadge-empty" },
};

export const STATI_RIGA: Record<string, { et: string; ico: string; tono: string }> = {
    in_viaggio: { et: "In viaggio", ico: "🚚", tono: "rvBadge-acc" },
    accettata: { et: "Arrivata", ico: "✅", tono: "rvBadge-ok" },
    mancante: { et: "Non arrivata", ico: "❓", tono: "rvBadge-warn" },
    rifiutata: { et: "Respinta", ico: "↩️", tono: "rvBadge-ko" },
    venduta_in_viaggio: { et: "Venduta in viaggio", ico: "🧾", tono: "rvBadge-ok" },
    annullata_in_viaggio: { et: "Cestinata in viaggio", ico: "🗑", tono: "rvBadge-empty" },
    rientrata: { et: "Tornata al mittente", ico: "↩️", tono: "rvBadge-empty" },
    ammanco: { et: "Ammanco", ico: "🔴", tono: "rvBadge-ko" },
    // il reso a fornitore: la merce è uscita dal gruppo, nessuno la accetterà
    uscita: { et: "Uscita dal gruppo", ico: "📤", tono: "rvBadge-empty" },
    /* NON È MAI PARTITA. Fra il momento in cui l'operatore ha spuntato il pezzo
       e il momento in cui ha premuto «emetti», quel pezzo è stato venduto al
       banco o tolto dall'amministrazione. La riga è CHIUSA — non c'è niente da
       decidere: il pezzo è ancora al mittente, o non c'è più — e chiamarla
       «non arrivata» avrebbe raccontato un viaggio che non è mai cominciato. */
    mai_partita: { et: "Mai partita", ico: "⛔", tono: "rvBadge-empty" },
};

export const TIPI_DDT: Record<string, { et: string; corto: string; ico: string; spiega: string }> = {
    trasferimento: {
        et: "Trasferimento", corto: "Trasferimento", ico: "🔁",
        spiega: "Fra due sedi della stessa società: sono beni propri che cambiano scaffale.",
    },
    cessione: {
        et: "Cessione fra società", corto: "Cessione", ico: "🧾",
        spiega: "Due soggetti giuridici diversi: il DDT va seguito da FATTURA e la merce cambia proprietario.",
    },
    gemelli: {
        et: "Passaggio fra gemelli", corto: "Gemelli", ico: "🏠",
        spiega: "Due insegne nello stesso locale: la merce non si sposta, cambia solo di chi è. Il documento si chiude subito.",
    },
    reso_fornitore: {
        et: "Reso a fornitore", corto: "Reso", ico: "📤",
        spiega: "La merce esce dal gruppo: nessuno la accetterà, il documento nasce già chiuso.",
    },
};

/* ── LE REGOLE, IN FUNZIONI ─────────────────────────────────────────────── */

/** Dopo quanti giorni un documento in viaggio è in ritardo. Fra negozi di Roma
 *  la merce viaggia in giornata: tre giorni sono già un'anomalia, sette sono
 *  un pacco fermo da qualche parte. */
export const GIORNI_RITARDO = 3;
export const GIORNI_FERMO = 7;

const GIORNO = 86_400_000;

/** Da quanti giorni il documento è partito. */
export function giorniInViaggio(d: Ddt, ora = Date.now()): number {
    return Math.floor((ora - new Date(d.creato_il).getTime()) / GIORNO);
}

export function aperto(d: Ddt): boolean {
    return d.stato === "in_transito";
}

export function inRitardo(d: Ddt, ora = Date.now()): boolean {
    return aperto(d) && giorniInViaggio(d, ora) >= GIORNI_RITARDO;
}

export function fermo(d: Ddt, ora = Date.now()): boolean {
    return aperto(d) && giorniInViaggio(d, ora) >= GIORNI_FERMO;
}

/** Due società diverse = una cessione, con la fattura al seguito. */
export function eCessione(d: { azienda_da: string | null; azienda_a: string | null }): boolean {
    return !!d.azienda_da && !!d.azienda_a && d.azienda_da !== d.azienda_a;
}

/** Il tipo si DEDUCE dai fatti (chi spedisce, chi riceve, che società sono):
 *  non lo sceglie l'operatore, che altrimenti può sbagliarlo. L'unico che si
 *  dichiara è il reso, perché il destinatario non è un negozio. */
export function tipoDi(
    daNegozio: string, aNegozio: string,
    aziendaDa: string | null, aziendaA: string | null,
    esterno = false,
): keyof typeof TIPI_DDT {
    if (esterno) return "reso_fornitore";
    if (stessoMagazzino(daNegozio, aNegozio)) return "gemelli";
    if (eCessione({ azienda_da: aziendaDa, azienda_a: aziendaA })) return "cessione";
    return "trasferimento";
}

/** Un documento chiuso fra società diverse ha una fattura da fare, finché
 *  qualcuno non dice il contrario. */
export function daFatturare(d: Ddt): boolean {
    if (!eCessione(d)) return false;
    if (!["accettato", "parziale"].includes(d.stato)) return false;
    return d.fattura_stato !== "emessa" && d.fattura_stato !== "non_dovuta";
}

/** Righe che qualcuno deve ancora chiudere. È SOLO `mancante`: la merce che
 *  non è arrivata e che nessuno ha ancora né ridato al mittente né messo a
 *  perdita. Una riga «respinta» o «rientrata» è chiusa — il rientro l'ha già
 *  scritto il movimento — e metterla qui avrebbe chiesto due volte la stessa
 *  decisione. */
export const RIGHE_APERTE = ["mancante"];
export function haDifferenze(righe: RigaDdt[]): boolean {
    return righe.some((r) => RIGHE_APERTE.includes(r.stato));
}

/** IL NOME DELLA SOCIETÀ SENZA LA FORMA GIURIDICA. In una sotto-riga di
 *  tabella «Telefutura S.R.L. → Telefutura 2 S.R.L.» occupa quattro righe e
 *  fa alta la riga il doppio: quello che distingue le due società è
 *  «Telefutura» e «Telefutura 2», non le sigle. Il nome intero resta nelle
 *  tendine, nei modali e sul documento. */
export const nomeCorto = (rs: string | null | undefined) =>
    String(rs || "").replace(/\s*(s\.?r\.?l\.?|s\.?p\.?a\.?|s\.?a\.?s\.?|s\.?n\.?c\.?)\s*$/i, "").trim();

/** Quanti pezzi porta una riga (un seriale è sempre uno). */
export const pezziDi = (r: RigaDdt) => (r.seriale ? 1 : Number(r.quantita) || 0);

/** Il valore di una riga, quando si sa. Se non si sa non si inventa
 *  (regola §7): torna null, e chi lo mostra scrive perché. */
export function valoreRiga(r: RigaDdt): number | null {
    if (r.valore_unitario == null) return null;
    return Number(r.valore_unitario) * pezziDi(r);
}

/* ── LE SITUAZIONI CHE SI GUARDANO OGNI GIORNO ──────────────────────────── */

/** Le viste rapide: una pastiglia ciascuna, col suo contatore. Sono le
 *  domande che le tre persone che usano questa sezione fanno davvero.
 *   · chi sta al banco  → «è arrivato il telefono che ho chiesto?»
 *   · lo store manager  → «cosa è uscito dal mio negozio?»
 *   · l'amministrazione → «quali documenti sono ancora aperti?» */
export type Situazione =
    | "tutti" | "da_accettare" | "in_viaggio" | "in_ritardo"
    | "partiti_da_me" | "differenze" | "da_fatturare";

export const SITUAZIONI: { id: Situazione; et: string; ico: string; spiega: string }[] = [
    { id: "tutti", et: "Tutti", ico: "📄", spiega: "Ogni documento, in qualunque stato" },
    /* «QUI» E «ME» ESISTONO SOLO SE HAI UN NEGOZIO. Per chi non ce l'ha —
       amministrazione, direzione — queste due pastiglie contavano TUTTO, e
       tre pastiglie diverse mostravano lo stesso numero dicendo cose diverse
       (regola §7). La sezione non le disegna: vedi `soloConNegozio`. */
    { id: "da_accettare", et: "Da accettare qui", ico: "⏳", spiega: "Merce diretta ai tuoi negozi che aspetta di essere presa in carico" },
    { id: "in_viaggio", et: "In viaggio", ico: "🚚", spiega: "Tutto quello che è partito e non è ancora arrivato" },
    { id: "in_ritardo", et: "In ritardo", ico: "🔴", spiega: `Partiti da ${GIORNI_RITARDO} giorni o più e ancora fermi` },
    { id: "partiti_da_me", et: "Partiti da me", ico: "📤", spiega: "Tutto quello che è uscito dai tuoi negozi, anche già arrivato" },
    { id: "differenze", et: "Differenze aperte", ico: "⚠️", spiega: "Merce che non è arrivata e che nessuno ha ancora chiuso" },
    { id: "da_fatturare", et: "Da fatturare", ico: "🧾", spiega: "Cessioni fra le due società che aspettano la fattura" },
];

/** Le due situazioni che parlano di «qui» e di «me»: hanno senso solo per chi
 *  un negozio ce l'ha. */
export const soloConNegozio: Situazione[] = ["da_accettare", "partiti_da_me"];

/** Il documento rientra nella situazione? `miei` sono i negozi della persona
 *  (i gemelli contano come uno solo: chi sta a Magliana W3 riceve anche
 *  quello che arriva al Multi, è lo stesso bancone). */
export function nellaSituazione(
    s: Situazione, d: Ddt, righe: RigaDdt[], miei: readonly string[], ora = Date.now(),
): boolean {
    const mio = (n: string) => miei.some((m) => stessoMagazzino(n, m));
    switch (s) {
        case "tutti": return true;
        case "da_accettare": return aperto(d) && (!miei.length || mio(d.a_negozio));
        case "in_viaggio": return aperto(d);
        case "in_ritardo": return inRitardo(d, ora);
        case "partiti_da_me": return !miei.length || mio(d.da_negozio);
        case "differenze": return haDifferenze(righe);
        case "da_fatturare": return daFatturare(d);
    }
}

/* ── I PERIODI ──────────────────────────────────────────────────────────── */

export type Periodo = "sempre" | "oggi" | "sette" | "mese" | "scorso";
export const PERIODI: { id: Periodo; et: string }[] = [
    { id: "sempre", et: "Sempre" },
    { id: "oggi", et: "Oggi" },
    { id: "sette", et: "7 giorni" },
    { id: "mese", et: "Questo mese" },
    { id: "scorso", et: "Mese scorso" },
];

/** Estremi del periodo, in ISO. `null` = senza limite da quel lato. */
export function estremi(p: Periodo, adesso = new Date()): { da: string | null; a: string | null } {
    const g = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    switch (p) {
        case "oggi": return { da: g(adesso), a: null };
        case "sette": return { da: g(new Date(adesso.getTime() - 7 * GIORNO)), a: null };
        case "mese": return { da: new Date(adesso.getFullYear(), adesso.getMonth(), 1).toISOString(), a: null };
        case "scorso": return {
            da: new Date(adesso.getFullYear(), adesso.getMonth() - 1, 1).toISOString(),
            a: new Date(adesso.getFullYear(), adesso.getMonth(), 1).toISOString(),
        };
        default: return { da: null, a: null };
    }
}

/* ── COSA MANCA PERCHÉ IL DOCUMENTO SIA VALIDO ──────────────────────────── */

/** Si dice PRIMA, non dopo (regola §7): chi emette un DDT deve sapere che
 *  uscirà incompleto prima di stamparlo, non scoprirlo fra sei mesi. */
export function cosaMancaPerEmettere(
    aziende: { codice: string; ragione_sociale: string; piva: string | null; sede: string | null; cap: string | null; citta: string | null }[],
    negozi: { name: string; address: string | null; civico: string | null; cap: string | null; citta: string | null }[],
): string[] {
    const out: string[] = [];
    aziende.forEach((a) => {
        const buchi: string[] = [];
        if (!a.sede) buchi.push("la sede legale");
        // il CAP si CARICA e non si guardava: una società con la città e senza
        // CAP passava la guardia, e poi il documento stampava «manca il CAP»
        if (!a.cap) buchi.push("il CAP");
        if (!a.citta) buchi.push("la città");
        if (!a.piva) buchi.push("la partita IVA");
        if (buchi.length) out.push(`${a.ragione_sociale}: ${buchi.join(", ")}`);
    });
    const senzaVia = negozi.filter((n) => !n.address || !n.civico || !n.cap || !n.citta).map((n) => n.name);
    if (senzaVia.length) out.push(`indirizzo incompleto: ${senzaVia.join(", ")}`);
    return out;
}
