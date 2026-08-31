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
    { id: "amministrazione", nome: "Amministrazione", emoji: "🗂", cosa: "Documenti e adempimenti che partono da soli verso l'esterno: il consulente del lavoro, il commercialista, gli enti." },
    { id: "comunicazioni", nome: "Comunicazioni", emoji: "💬", cosa: "Chat e posta: quello che il CRM legge, classifica e mette in ordine senza che nessuno lo chieda." },
    { id: "sicurezza", nome: "Sicurezza", emoji: "🔒", cosa: "Pulizie e scadenze: codici usa-e-getta, dati che non devono restare in giro." },
    { id: "callcenter", nome: "Call Center", emoji: "📞", cosa: "Automatismi delle pratiche e dei caller." },
    { id: "vendite", nome: "Vendite", emoji: "🧾", cosa: "Automatismi di cassa, magazzino e documenti di vendita." },
];

export type Parametro =
    | { chiave: string; tipo: "email"; nome: string; spiega: string; predefinito: string[] }
    | { chiave: string; tipo: "numero"; nome: string; spiega: string; predefinito: number; min?: number; max?: number }
    | { chiave: string; tipo: "testo"; nome: string; spiega: string; predefinito: string };

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
    /** Come si prova senza fare danni. `sicura` = non manda niente a nessuno. */
    prova?: { etichetta: string; corpo: Record<string, unknown>; sicura: boolean; spiega: string };
};

export const AUTOMATISMI: Automatismo[] = [
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
            { chiave: "max", tipo: "numero", nome: "Chat per corsa", spiega: "Quante conversazioni classificare in un giro. Più alto = più veloce a smaltire l'arretrato, ma costa di più.", predefinito: 40, min: 5, max: 300 },
        ],
        prova: {
            etichetta: "Fai una corsa adesso",
            corpo: { max: 3 },
            sicura: false,
            spiega: "Classifica davvero tre chat, adesso. Consuma un pezzetto di credito AI ed è il modo più diretto di vedere se il motore risponde.",
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
            { chiave: "max", tipo: "numero", nome: "Email per corsa", spiega: "Quante email classificare in un giro.", predefinito: 40, min: 5, max: 300 },
        ],
        prova: {
            etichetta: "Fai una corsa adesso",
            corpo: { max: 3 },
            sicura: false,
            spiega: "Classifica davvero tre email, adesso. Consuma un pezzetto di credito AI.",
        },
    },
    {
        id: "otp-pulizia",
        area: "sicurezza",
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
        return `ogni ${nMin} minuti${m ? ` (al minuto ${m[1]}, ${nMin + 1 > 60 ? "" : ""}sfalsato)` : ""}`;
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

/** L'ora italiana di un orario UTC (l'Italia è UTC+2 d'estate, +1 d'inverno). */
export function oraItaliana(cron: string, quando = new Date()): string | null {
    const p = String(cron || "").trim().split(/\s+/);
    if (p.length !== 5 || !/^\d+$/.test(p[0]) || !/^\d+$/.test(p[1])) return null;
    // lo scarto vero, chiesto al fuso invece che indovinato dal mese
    const utc = new Date(Date.UTC(quando.getFullYear(), quando.getMonth(), quando.getDate(), Number(p[1]), Number(p[0])));
    return utc.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
}
