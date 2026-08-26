/* ═══ CHAT OMNICANALE — i tipi ═══════════════════════════════════════════
   Un solo tipo di «conversazione» per tre canali che a DB non si somigliano
   per niente (wa_conversations, email_conversations, chat_conversations):
   la fusione avviene QUI, in un punto solo, così la colonna di sinistra non
   sa nemmeno da dove arriva quello che mostra.

   Il RADAR di destra non è un componente che «si arrangia»: è un tipo con
   tre forme possibili, e le regole di Luca (26/08) dicono quale forma esce
   in quale caso. Metterle nel tipo invece che negli `if` del render è il
   modo per non poterle sbagliare: un prospect NON HA il campo `ltv`, quindi
   non c'è nessun posto dove potrebbe comparire per sbaglio. */

export type Canale = "wa" | "email" | "interna";
export type TabOmni = "tutti" | "interna" | "wa" | "email";

export type MessaggioOmni = {
    id: string;
    verso: "in" | "out";
    testo: string;
    ora: string;                 // già formattata per la lista
    autore?: string | null;      // solo per la chat interna e i gruppi
    isMail?: boolean;            // le mail si disegnano a tutta larghezza
};

export type ChatOmni = {
    id: string;                  // «wa:<uuid>» · «em:<uuid>» · «in:<uuid>»
    canale: Canale;
    nome: string;
    sottotitolo: string | null;  // oggetto per la mail, numero per WA
    anteprima: string;
    ora: string;
    daLeggere: boolean;
    iniziali: string;
    clientId: string | null;     // ⚠️ È LO STATUS: null = «Non Registrato»
    riferimento: string | null;  // numero WA o indirizzo email, per il match
    numero?: string | null;      // WA: il numero, che va in testata e non in lista
    utenteId: string | null;     // chat interna: l'id del collega
    aggiornata: string | null;   // last_message_at, per l'ordinamento
};

/* ── LE TRE FORME DEL RADAR ────────────────────────────────────────────── */

export type VoceTimeline = {
    id: string;
    icona: string;
    coloreIcona: string;
    data: string;
    titolo: string;
    sottotitolo: string;
    dettagli: { brand: string; desc: string; stato: string | null; logo: string }[] | null;
};

export type Hardware = {
    nome: string;
    finanziaria: string | null;
    rate: number;
    rateTotali: number;
    percentuale: number;
    scade: string;
    stato: string;
    stimata: boolean;   // la durata non è a catalogo: 24 mesi è lo standard
};

/** CASO A — cliente registrato: AI Summary, Valore, Hardware (se c'è), Timeline */
export type RadarCliente = {
    tipo: "cliente";
    stato: "Cliente Registrato";
    umore: string;
    coloreUmore: "emerald" | "indigo";
    aiSummary: string;
    ltv: { euro: number; nota: string };
    hardware: Hardware | null;          // null ⇒ il modulo NON si disegna
    timeline: VoceTimeline[];
};

/** CASO B — prospect: SOLO AI Summary e l'avviso di anagrafica mancante.
 *  Niente `ltv`, niente `timeline`: non esistono proprio come campi. */
export type RadarProspect = {
    tipo: "prospect";
    stato: "Non Registrato";
    umore: string;
    coloreUmore: "emerald" | "indigo";
    aiSummary: string;
};

/** CASO C — collega: confronto attivazioni di oggi, col valore da esplodere */
export type RadarStaff = {
    tipo: "staff";
    stato: "Staff";
    umore: string;
    coloreUmore: "emerald" | "indigo";
    aiSummary: string;
    kpi: {
        loro: { nome: string; pezzi: number; valore: number };
        tuo: { nome: string; pezzi: number; valore: number };
        maxPezzi: number;
    };
};

export type Radar = RadarCliente | RadarProspect | RadarStaff;
