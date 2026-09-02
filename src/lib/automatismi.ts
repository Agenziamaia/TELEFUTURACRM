/* ═══ IL REGISTRO DEGLI AUTOMATISMI ═══════════════════════════════════════
   Luca 31/08: «creami una sezione dedicata agli automatismi… crealo già come
   Hub, io da qui voglio vedere in ogni sezione i relativi automatismi e
   funzionamenti, e voglio poter modificare tempistiche, destinatari e tutto
   ciò che è possibile modificare, nonché verificare che effettivamente
   funzionano».

   Un lavoro automatico è la cosa più facile da dimenticare che ci sia: gira
   di notte, non si lamenta, e quando smette di girare nessuno lo nota finché
   qualcuno non chiede «ma quel file non è arrivato?». Qui dentro ognuno
   dichiara chi è, cosa fa, quando gira, cosa si può cambiargli e come si
   prova — così l'hub non deve sapere niente di nessuno in particolare, e
   aggiungerne uno domani è aggiungere una voce a questo elenco.

   ⚠️ QUESTO FILE È LA VERITÀ SUL COMPORTAMENTO, non sui valori. L'orario vero
   sta in `cron.job`, i valori modificati in `automatismi_config`: qui c'è il
   valore di partenza e la spiegazione. Se i due divergono, comanda il
   database — ed è giusto che si veda, perché vuol dire che qualcuno l'ha
   cambiato apposta. */

export type AreaAuto = "amministrazione" | "comunicazioni" | "sicurezza" | "callcenter" | "vendite";

export const AREE: { id: AreaAuto; nome: string; emoji: string; cosa: string }[] = [
    { id: "amministrazione", nome: "Amministrazione", emoji: "🗂", cosa: "Ferie, malattie e adempimenti che partono da soli verso l'esterno: il consulente del lavoro, il commercialista, gli enti." },
    { id: "comunicazioni", nome: "Comunicazioni", emoji: "💬", cosa: "Chat, posta e codici usa-e-getta: tutto quello che arriva da fuori e che il CRM legge, classifica e mette in ordine senza che nessuno lo chieda." },
    { id: "sicurezza", nome: "Sicurezza", emoji: "🔒", cosa: "Dati che non devono restare in giro più del necessario: pulizie, scadenze, tracce da cancellare." },
    { id: "callcenter", nome: "Call Center", emoji: "📞", cosa: "Automatismi delle pratiche e dei caller." },
    { id: "vendite", nome: "Vendite", emoji: "🧾", cosa: "Automatismi di cassa, magazzino e documenti di vendita." },
];

export type Parametro =
    | { chiave: string; tipo: "email"; nome: string; spiega: string; predefinito: string[] }
    | { chiave: string; tipo: "numero"; nome: string; spiega: string; predefinito: number; min?: number; max?: number }
    | { chiave: string; tipo: "testo"; nome: string; spiega: string; predefinito: string }
    /* ⚠️ L'INTERRUTTORE È SEMPRE «SPENTO SE NON DICE SÌ». Serve agli
       automatismi che, accesi, fanno una cosa che non si annulla — erogare
       credito, mandare denaro. Il valore salvato è un vero booleano, non la
       parola «true»: chi lo legge non deve interpretare niente. */
    | { chiave: string; tipo: "interruttore"; nome: string; spiega: string; predefinito: boolean; pericoloso?: string };

export type Automatismo = {
    id: string;
    area: AreaAuto;
    nome: string;
    emoji: string;
    /** Cosa fa, detto a chi non ha scritto il codice. */
    cosaFa: string;
    /** Perché esiste: la frase che gli ha dato origine. */
    perche?: string;
    /** I lavori pianificati che lo fanno partire (i nomi in cron.job). */
    lavori: { nome: string; ruolo: string }[];
    /** La rotta che esegue il lavoro. */
    rotta: string;
    /** Dove resta scritto che è girato, se tiene un registro suo. */
    registro?: { tabella: string; quando: string; esito?: string; etichetta: string };
    parametri: Parametro[];
    /** Come si prova senza fare danni. `sicura` = non manda niente a nessuno.
     *
     *  ⚠️ `metodo` NON È UN DETTAGLIO. La prova faceva sempre POST, cioè
     *  chiamava la rotta nel modo in cui la chiama il lavoro vero: per un
     *  automatismo che EROGA DENARO, un pulsante che dice «cosa farebbe
     *  adesso» e intanto lo fa è la peggiore trappola possibile. Chi ha una
     *  rotta con un GET di sola lettura lo dichiara qui. */
    prova?: { etichetta: string; corpo: Record<string, unknown>; sicura: boolean; spiega: string; metodo?: "GET" | "POST" };
};

export const AUTOMATISMI: Automatismo[] = [
    {
        id: "paystore-motore",
        area: "vendite",
        nome: "Ricariche telefoniche PayStore",
        emoji: "📲",
        cosaFa: "Prende le ricariche vendute e scontrinate e le esegue da sé sull'API di PayStore, con le credenziali del negozio che le ha vendute. Quello che oggi fa una persona al terminale.",
        perche: "«Sono arrivate tutte le credenziali API di PayStore: ne hanno creata una per ogni punto vendita, divisa per società» — Luca, 02/09.",
        lavori: [{ nome: "paystore-motore", ruolo: "la corsa, ogni 5 minuti" }],
        rotta: "/api/paystore/motore",
        registro: { tabella: "paystore_ricariche", quando: "tentata_il", esito: "stato", etichetta: "Registro ricariche" },
        parametri: [
            {
                chiave: "acceso", tipo: "interruttore", nome: "Motore acceso", predefinito: false,
                spiega: "Finché è NO nessuna ricarica parte da sola: le carica una persona al terminale, come oggi.",
                pericoloso: "Acceso, il motore EROGA CREDITO VERO sul plafond dei negozi. Una ricarica partita non torna indietro. Prima di accenderlo fai una prova con una ricarica sola, dal pulsante «rifai» del pannello PayStore, e controlla che risulti anche sul pannello di PayStore.",
            },
            { chiave: "tetto", tipo: "numero", nome: "Tetto per ricarica (€)", spiega: "Sopra questa cifra il motore non tocca la ricarica e la lascia a una persona. Nei primi giorni tienilo basso: è la rete sotto il trapezio.", predefinito: 50, min: 1, max: 500 },
            { chiave: "max", tipo: "numero", nome: "Ricariche per corsa", spiega: "Quante ne esegue in un giro. Le fa una alla volta: il plafond è condiviso fra le ricariche dello stesso negozio.", predefinito: 10, min: 1, max: 50 },
            { chiave: "finestra", tipo: "numero", nome: "Finestra (minuti)", spiega: "Guarda solo le ricariche nate negli ultimi tot minuti. ⚠️ Serve a NON ereditare l'arretrato: le ricariche più vecchie possono essere già state caricate a mano al terminale senza che nessuno l'abbia segnato, e rifarle vorrebbe dire erogare il credito due volte.", predefinito: 60, min: 5, max: 1440 },
            { chiave: "lasso", tipo: "numero", nome: "Presa scaduta dopo (minuti)", spiega: "Se una corsa muore a metà, la ricarica che aveva preso torna disponibile dopo questo tempo. Troppo basso e due corse potrebbero sovrapporsi.", predefinito: 10, min: 2, max: 60 },
        ],
        prova: {
            etichetta: "Cosa farebbe adesso",
            corpo: {},
            metodo: "GET",          // ⚠️ di sola lettura: il POST ESEGUE
            sicura: true,
            spiega: "Elenca le ricariche che il motore prenderebbe in questo momento, con negozio e importo. Non ne esegue nessuna e non tocca niente.",
        },
    },
    {
        id: "assenze-report-mensile",
        area: "amministrazione",
        nome: "Ferie e malattia al consulente",
        emoji: "📨",
        cosaFa: "Il primo di ogni mese manda per email il riepilogo delle assenze del mese appena chiuso: due file Excel, ferie e malattia, ognuno con un foglio di dettaglio e uno di riepilogo per persona.",
        perche: "«Al primo di ogni mese dobbiamo inviare un'email con l'export delle ferie e quello della malattia» — Luca, 31/08.",
        lavori: [
            { nome: "assenze-report-mensile", ruolo: "la corsa vera" },
            { nome: "assenze-report-mensile-ritento", ruolo: "la rete di sicurezza: riprova se la prima è fallita, e se era andata bene non fa niente" },
        ],
        rotta: "/api/assenze/report-mensile",
        registro: { tabella: "report_assenze_inviati", quando: "inviato_il", esito: "esito", etichetta: "mese" },
        parametri: [
            {
                chiave: "destinatari", tipo: "email", nome: "Destinatari",
                spiega: "A chi arriva l'email. Uno per riga.",
                predefinito: ["telefuturasrl@hotmail.com", "studioandreavincioni@gmail.com"],
            },
        ],
        prova: {
            etichetta: "Prova senza mandare niente",
            corpo: { dryRun: true },
            sicura: true,
            spiega: "Fa tutti i conti del mese chiuso e dice quante righe e quante persone finirebbero nei due file, senza spedire una sola email.",
        },
    },
    {
        id: "wa-triage",
        area: "comunicazioni",
        nome: "Triage delle chat WhatsApp",
        emoji: "💬",
        cosaFa: "Ogni dieci minuti legge le conversazioni WhatsApp non ancora classificate e le divide in quattro stati (da rispondere, in attesa del cliente, chiusa, da guardare), dicendo perché. È quello che riempie il widget in Home.",
        lavori: [{ nome: "wa-triage", ruolo: "la corsa, ogni 10 minuti" }],
        rotta: "/api/whatsapp/triage",
        parametri: [
            { chiave: "max", tipo: "numero", nome: "Chat per corsa", spiega: "Quante conversazioni classificare in un giro. Più alto = più veloce a smaltire l'arretrato, ma costa di più. Il motore non ne fa comunque più di 60 per volta.", predefinito: 40, min: 1, max: 60 },
        ],
        prova: {
            etichetta: "Fai una corsa adesso",
            corpo: { max: 3, force: true },
            sicura: false,
            spiega: "Classifica davvero tre chat, adesso, scavalcando il freno che impedisce due corse ravvicinate. Consuma un pezzetto di credito AI.",
        },
    },
    {
        id: "email-triage",
        area: "comunicazioni",
        nome: "Triage della posta",
        emoji: "📧",
        cosaFa: "Ogni dieci minuti (sfalsato di cinque rispetto a WhatsApp, per non chiedere tutto insieme) fa lo stesso lavoro sulle caselle email collegate al CRM.",
        lavori: [{ nome: "email-triage", ruolo: "la corsa, ogni 10 minuti" }],
        rotta: "/api/email/triage",
        parametri: [
            { chiave: "max", tipo: "numero", nome: "Email per corsa", spiega: "Quante email classificare in un giro. Il motore non ne fa comunque più di 60 per volta.", predefinito: 40, min: 1, max: 60 },
        ],
        prova: {
            etichetta: "Fai una corsa adesso",
            corpo: { max: 3, force: true },
            sicura: false,
            spiega: "Classifica davvero tre email, adesso, scavalcando il freno fra due corse. Consuma un pezzetto di credito AI.",
        },
    },
    {
        id: "otp-pulizia",
        /* ⚠️ COMUNICAZIONI, non «sicurezza» (Luca 01/09: «dentro comunicazione
           ci avrei messo quelle di WhatsApp, email e dei codici usa e getta»).
           Ha ragione: quei codici arrivano per posta e vivono in una casella —
           è lo stesso mestiere del triage, non una faccenda a parte. Chi li
           cerca li cerca lì. */
        area: "comunicazioni",
        nome: "Pulizia dei codici usa-e-getta",
        emoji: "🧹",
        cosaFa: "Ogni dieci minuti cancella i codici OTP scaduti che il CRM ha pescato dalla posta. Un codice serve due minuti: tenerlo dopo è solo un rischio in più.",
        lavori: [{ nome: "otp-pulizia", ruolo: "la corsa, ogni 10 minuti" }],
        rotta: "/api/passwords/pulizia-otp",
        parametri: [],
    },
];

/** Quanto spesso gira, detto in italiano invece che in cron. */
export function leggiPianificazione(cron: string): string {
    const s = String(cron || "").trim();
    const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
    const p = s.split(/\s+/);
    if (p.length !== 5) return s || "—";
    const [min, ora, gg, , dow] = p;
    const ogniN = (v: string) => {
        const m = v.match(/^(?:\*|(\d+)-(\d+))\/(\d+)$/);
        return m ? Number(m[3]) : null;
    };
    const nMin = ogniN(min);
    if (nMin && ora === "*") {
        const m = min.match(/^(\d+)-/);
        return `ogni ${nMin} minuti${m && m[1] !== "0" ? ` (sfalsato: parte al minuto ${m[1]})` : ""}`;
    }
    if (/^\d+$/.test(min) && /^\d+$/.test(ora)) {
        const orario = `${String(ora).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
        if (gg === "1") return `il primo del mese alle ${orario} UTC`;
        if (/^\d+$/.test(gg)) return `il ${gg} di ogni mese alle ${orario} UTC`;
        if (/^\d$/.test(dow)) return `ogni ${GIORNI[Number(dow)]} alle ${orario} UTC`;
        return `ogni giorno alle ${orario} UTC`;
    }
    return s;
}

/** L'ora italiana di un orario UTC. Lo scarto si chiede al fuso, non si
 *  indovina dal mese — e si chiede per la PROSSIMA volta che il lavoro gira,
 *  non per oggi: un lavoro mensile a cavallo del cambio dell'ora legale
 *  altrimenti mostrerebbe un'ora che quel giorno non sarà vera. */
export function oraItaliana(cron: string, adesso = new Date()): string | null {
    const p = String(cron || "").trim().split(/\s+/);
    if (p.length !== 5 || !/^\d+$/.test(p[0]) || !/^\d+$/.test(p[1])) return null;
    const min = Number(p[0]), ora = Number(p[1]);
    const giorno = /^\d+$/.test(p[2]) ? Number(p[2]) : null;
    let d = new Date(Date.UTC(adesso.getUTCFullYear(), adesso.getUTCMonth(), giorno ?? adesso.getUTCDate(), ora, min));
    if (d.getTime() <= adesso.getTime()) {
        d = giorno
            ? new Date(Date.UTC(adesso.getUTCFullYear(), adesso.getUTCMonth() + 1, giorno, ora, min))
            : new Date(d.getTime() + 864e5);
    }
    return d.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
}

/* ═══ CAMBIARE L'ORARIO SENZA SCRIVERE CRON ════════════════════════════════
   Il pannello lo apre Luca, non un sistemista: chiedergli «0 5 1 * *» è
   chiedergli di imparare una sintassi per fare una cosa che sa dire in
   italiano. Qui si generano le scelte sensate PER QUEL LAVORO — le cadenze se
   è ricorrente, gli orari se parte una volta al mese — e il cron lo scriviamo
   noi. Il campo grezzo resta comunque, sotto, per i casi che qui non ci sono.

   ⚠️ LO SFALSAMENTO SI CONSERVA. `email-triage` gira su «5-59/10»: cinque
   minuti dopo WhatsApp, di proposito, per non chiedere tutto insieme al
   fornitore. Una scorciatoia che scrivesse la cadenza secca lo riallineerebbe
   a WhatsApp e nessuno capirebbe perché il fornitore ha ricominciato a
   rifiutare le richieste. */
export type Scorciatoia = { etichetta: string; cron: string };

/** Lo scarto in ore fra Roma e UTC nel momento indicato (1 d'inverno, 2 d'estate). */
function scartoRoma(quando = new Date()): number {
    const q = new Date(quando.toLocaleString("en-US", { timeZone: "Europe/Rome" }));
    const u = new Date(quando.toLocaleString("en-US", { timeZone: "UTC" }));
    return Math.round((q.getTime() - u.getTime()) / 3600000);
}

export function scorciatoieOrario(cron: string, adesso = new Date()): Scorciatoia[] {
    const p = String(cron || "").trim().split(/\s+/);
    if (p.length !== 5) return [];
    const [min, ora, gg, , dow] = p;

    // ── ricorrente: «ogni N minuti», con l'eventuale sfalsamento conservato
    const ric = min.match(/^(?:\*|(\d+)-(\d+))\/(\d+)$/);
    if (ric && ora === "*") {
        const off = Number(ric[1] || 0);
        return [5, 10, 15, 20, 30, 60].map((n) => ({
            etichetta: n === 60 ? "ogni ora" : `ogni ${n} minuti`,
            // l'offset ha senso solo se sta dentro il passo: a 5 minuti non
            // esiste un «parte al minuto 10»
            cron: off > 0 && off < n && n < 60 ? `${off}-59/${n} * * * *` : n === 60 ? `${off % 60} * * * *` : `*/${n} * * * *`,
        }));
    }

    // ── a orario fisso: si sceglie l'ora ITALIANA, il cron lo scriviamo in UTC
    if (/^\d+$/.test(min) && /^\d+$/.test(ora)) {
        const scarto = scartoRoma(adesso);
        return [6, 7, 8, 9, 12, 18].map((h) => {
            const utc = ((h - scarto) % 24 + 24) % 24;
            return { etichetta: `alle ${String(h).padStart(2, "0")}:00`, cron: `0 ${utc} ${gg} * ${dow}` };
        });
    }
    return [];
}
