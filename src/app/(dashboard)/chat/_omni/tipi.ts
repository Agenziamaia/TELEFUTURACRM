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
    // DI CHI È QUESTA CHAT. Vuoto quando la lista è di una persona sola (la
    // mia, o quella in cui mi immedesimo). Pieno quando guardo un PUNTO
    // VENDITA: lì il numero e la casella sono del negozio, ma le chat interne
    // sono di ciascuno, e senza il nome non si capisce di chi si sta leggendo
    // la conversazione (Luca 27/08).
    perChi?: string | null;
    // la chat interna è di un ALTRO (mi sto immedesimando): si legge e basta,
    // il thread della pagina Chat non può nemmeno mostrarla perché è costruito
    // sulle conversazioni a cui partecipo io
    altrui?: boolean;
    proprietarioId?: string | null;
    proprietarioNome?: string | null;   // per la testata della sola lettura
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
    // DOVE ALTRO L'ABBIAMO SENTITO (Luca 27/08): telefono, WhatsApp, email —
    // MAI il canale in cui sto già, che è sotto i miei occhi. Lista vuota ⇒ il
    // modulo non si disegna: «solo qui» non è un'informazione utile.
    contatti: PuntoContatto[];
};

export type PuntoContatto = {
    canale: "tel" | "wa" | "email";
    n: number;                          // quante volte
    ultimo: string | null;              // ISO dell'ultimo contatto
    nota?: string | null;               // es. «2 senza risposta»
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
