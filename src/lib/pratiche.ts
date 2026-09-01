/* ═══ ORDINI CLIENTE E ASSISTENZE — il dominio ════════════════════════════
 *
 * Due sezioni sorelle, una tabella (`pratiche`). Qui stanno le regole che le
 * dividono: la TIPOLOGIA comanda quali campi compaiono, quali sono obbligatori
 * e quando si chiedono. Prima erano nella testa di chi sta al banco — ed è per
 * questo che un campo obbligatorio non lo era mai il venerdì sera.
 */

export type Sezione = "ordini" | "assistenze";

export type Tipologia = {
    label: string; icona: string; sez: Sezione; cosa: string;
    /** come si chiama il valore economico: un prezzo non è una stima */
    valoreLabel: string; valoreNota: string;
    /** "no" · "arrivo" (si prende quando la merce arriva) · "apertura" */
    imei: "no" | "arrivo" | "apertura";
    noteInterne: "facoltative" | "obbligatorie";
    approvvigionamento: boolean;
    approvvDaConfermare?: boolean;
    contenuto: "articoli" | "dispositivo";
};

export const TIPOLOGIE: Record<string, Tipologia> = {
    ord_accessorio: {
        sez: "ordini", label: "Ordine accessorio", icona: "🎧",
        cosa: "Cover, pellicole, cuffie, caricatori: roba che il cliente vuole e in negozio non c'è.",
        valoreLabel: "Costo totale",
        valoreNota: "è un prezzo, non una stima: l'accessorio costa quello e non cambia.",
        imei: "no", noteInterne: "facoltative", approvvigionamento: true, contenuto: "articoli",
    },
    ord_telefono: {
        sez: "ordini", label: "Ordine telefono", icona: "📲",
        cosa: "Uno smartphone o un tablet ordinato per il cliente.",
        valoreLabel: "Preventivo",
        valoreNota: "il prezzo può muoversi fino all'arrivo: è un preventivo, non un listino.",
        imei: "arrivo", noteInterne: "facoltative", approvvigionamento: true, contenuto: "articoli",
    },
    riparazione: {
        sez: "assistenze", label: "Riparazione", icona: "🔧",
        cosa: "Il dispositivo resta in negozio e va in laboratorio.",
        valoreLabel: "Preventivo presunto",
        valoreNota: "è una stima fatta prima di aprire l'apparecchio: dopo la diagnosi si rivede, e il cliente riapprova.",
        imei: "apertura", noteInterne: "facoltative", approvvigionamento: true, contenuto: "dispositivo",
    },
    backup: {
        sez: "assistenze", label: "Backup", icona: "💾",
        cosa: "Copia dei dati da un dispositivo che funziona.",
        valoreLabel: "Preventivo", valoreNota: "",
        imei: "apertura", noteInterne: "facoltative", approvvigionamento: false, contenuto: "dispositivo",
    },
    backup_rotto: {
        sez: "assistenze", label: "Backup da rotto", icona: "🧯",
        cosa: "Recupero dei dati da un dispositivo danneggiato. È un tentativo, non un risultato garantito: se non riesce non si paga e l'acconto diventa un buono.",
        valoreLabel: "Preventivo", valoreNota: "",
        imei: "apertura", noteInterne: "facoltative",
        /* acceso perché per far ripartire un telefono rotto quel tanto che
           basta a estrarre i dati serve spesso un pezzo (Luca 01/09) */
        approvvigionamento: true, approvvDaConfermare: true, contenuto: "dispositivo",
    },
    ass_tecnico: {
        sez: "assistenze", label: "Assistenza tecnico", icona: "🛠️",
        cosa: "Interventi che non stanno in nessuna casella: configurazioni, trasferimenti, diagnosi.",
        valoreLabel: "Preventivo", valoreNota: "",
        imei: "apertura",
        /* proprio perché non sta in una casella, la descrizione a mano NON è
           facoltativa: senza, fra un mese nessuno sa cosa è stato fatto */
        noteInterne: "obbligatorie", approvvigionamento: false, contenuto: "dispositivo",
    },
};
export const tipologieDi = (sez: Sezione) => Object.keys(TIPOLOGIE).filter((k) => TIPOLOGIE[k].sez === sez);

/* ═══ DA DOVE ARRIVA ═══
   «Il pezzo c'è già» sta per primo: è il caso migliore, e chi sceglie deve
   leggerlo prima degli altri tre. «Ordinato» lo mette solo l'amministrazione —
   è l'unico dei quattro che dice che i soldi sono usciti. */
export const APPROVVIGIONAMENTO = [
    { k: "disponibile", label: "Il pezzo c'è già", icona: "📗", nota: "in magazzino qui: l'intervento si fa subito, senza aspettare", chi: "negozio" },
    { k: "altro_negozio", label: "In attesa d'altro negozio", icona: "🏪", nota: "ce l'ha un altro punto vendita: si sposta, non si compra", chi: "negozio" },
    { k: "da_ordinare", label: "Da ordinare", icona: "📙", nota: "non ce l'ha nessuno: l'amministrazione deve comprarlo", chi: "negozio" },
    { k: "ordinato", label: "Ordinato", icona: "🏭", nota: "l'amministrazione l'ha comprato — lo imposta solo lei", chi: "admin" },
];
export const siFaSubito = (a: string | null | undefined) => a === "disponibile";
export const etichettaApprovv = (k: string | null | undefined) => {
    const v = APPROVVIGIONAMENTO.find((x) => x.k === k);
    return v ? v.icona + " " + v.label : "—";
};

/* ═══ GLI STATI ═══
   Cinque per gli ordini, non otto (Luca 31/08): «Ordine ricevuto», «Preso in
   carico» e «In attesa di spedizione» raccontavano tutti la stessa cosa —
   l'amministrazione ha visto e non ha ancora comprato. */
export type StatoInfo = { label: string; icona: string; classe: string; chi: "negozio" | "admin" | "tecnico" | null };
export const STATI_ORD: Record<string, StatoInfo> = {
    inviato: { label: "Inviato", icona: "📨", classe: "text-indigo-300 bg-indigo-500/15 border-indigo-500/30", chi: "admin" },
    ordinato: { label: "Ordinato al fornitore", icona: "🏭", classe: "text-orange-300 bg-orange-500/15 border-orange-500/30", chi: "admin" },
    spedito: { label: "Spedito al negozio", icona: "🚚", classe: "text-teal-300 bg-teal-500/15 border-teal-500/30", chi: "admin" },
    in_negozio: { label: "Arrivato in negozio", icona: "🏪", classe: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30", chi: "negozio" },
    consegnato: { label: "Consegnato", icona: "✅", classe: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30", chi: null },
    annullato: { label: "Annullato", icona: "❌", classe: "text-rose-300 bg-rose-500/15 border-rose-500/30", chi: null },
};
export const FLUSSO_ORD = ["inviato", "ordinato", "spedito", "in_negozio", "consegnato"];

export const STATI_ASS: Record<string, StatoInfo> = {
    aperta: { label: "Aperta al banco", icona: "🆕", classe: "text-indigo-300 bg-indigo-500/15 border-indigo-500/30", chi: "negozio" },
    diagnosi: { label: "In diagnosi", icona: "🔎", classe: "text-cyan-300 bg-cyan-500/15 border-cyan-500/30", chi: "tecnico" },
    attesa_ricambio: { label: "In attesa ricambio", icona: "🧩", classe: "text-orange-300 bg-orange-500/15 border-orange-500/30", chi: "admin" },
    in_lavorazione: { label: "In lavorazione", icona: "🔧", classe: "text-sky-300 bg-sky-500/15 border-sky-500/30", chi: "tecnico" },
    pronta: { label: "Pronta al ritiro", icona: "🔔", classe: "text-teal-300 bg-teal-500/15 border-teal-500/30", chi: "negozio" },
    consegnata: { label: "Consegnata", icona: "✅", classe: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30", chi: null },
    non_riuscita: { label: "Non riuscita", icona: "⛔", classe: "text-rose-300 bg-rose-500/15 border-rose-500/30", chi: "negozio" },
};
export const FLUSSO_ASS = ["aperta", "diagnosi", "attesa_ricambio", "in_lavorazione", "pronta", "consegnata"];

export const statiDi = (sez: Sezione) => (sez === "ordini" ? STATI_ORD : STATI_ASS);
export const flussoDi = (sez: Sezione) => (sez === "ordini" ? FLUSSO_ORD : FLUSSO_ASS);

/* ═══ IL BUONO ═══
   Quando la lavorazione non si conclude e il cliente non salda, i soldi già
   versati NON restano a noi come corrispettivo: diventano un buono spendibile
   (clausola 7.6 del modulo). Non è un rimborso perché lo scontrino è già stato
   emesso — restituire denaro dopo un documento fiscale è un reso. Il buono è un
   «buono corrispettivo multiuso»: l'IVA si applica quando lo si spende, ed è
   anche il motivo per cui non si può spendere fuori campo IVA. */
export const BUONO_MESI = 12;
export const BUONO_ESCLUSI = "ricariche telefoniche e ogni altra operazione non soggetta a IVA";

/* ═══ I TERMINI ═══
   Trenta giorni lavorativi per tutto (Luca 01/09), tutto compreso: l'attesa del
   pezzo e la lavorazione non si sommano. Il termine massimo non è decorativo —
   è la parte che rende difendibile la trattenuta dell'acconto. */
export const TERMINE_MAX_GG = 30;
export const GIORNI_RITIRO = 14;
export const GIORNI_CESSIONE = 90;
const TEMPO_BASE: Record<string, number> = {
    ord_accessorio: 3, ord_telefono: 5, riparazione: 3, backup: 2, backup_rotto: 2, ass_tecnico: 1,
};
/** Il tempo medio DIPENDE DA DOVE ARRIVA IL PEZZO (Luca 01/09: «se è DA
 *  ORDINARE non mettere mai meno di 5 giorni»). Promettere tre giorni per una
 *  cosa che dobbiamo ancora comprare è il modo più rapido di far tornare il
 *  cliente arrabbiato il quarto. */
export const MEDIO_SE_DA_ORDINARE = 5;
export function tempoMedio(tipologia: string, approvvigionamento?: string | null): number {
    const base = TEMPO_BASE[tipologia] || 3;
    if (approvvigionamento === "da_ordinare") return Math.max(base, MEDIO_SE_DA_ORDINARE);
    if (approvvigionamento === "altro_negozio") return Math.max(base, 2);
    return base;
}
/** valore di partenza, senza sapere ancora da dove arriva */
export const TEMPO_MEDIO = TEMPO_BASE;

/** Giorni lavorativi (lunedì–venerdì) fra due date: è la definizione scritta
 *  nel modulo che il cliente firma, e va usata la stessa dappertutto. */
export function giorniLavorativi(da: string | Date, a: string | Date): number {
    const d1 = new Date(da), d2 = new Date(a);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
    let n = 0;
    const cur = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
    const fine = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
    while (cur < fine) {
        cur.setDate(cur.getDate() + 1);
        const g = cur.getDay();
        if (g !== 0 && g !== 6) n++;
    }
    return n;
}

/** La firma è un cancello: o il codice, o la carta — e in tutti e due i casi
 *  il documento d'identità, che archiviamo noi come in Registra Vendita. */
export type Firma = {
    via?: "otp" | "cartacea";
    otp?: "da_fare" | "inviata" | "fatta";
    modulo?: { nome: string; path: string } | null;
    identita?: { nome: string; path: string } | null;
    firmata_il?: string | null;
    controllo?: { stato: string } | null;
    /** la richiesta DocuSeal, quando si firma col codice */
    submissionId?: number | null;
    link?: string | null;
};
export function firmaCompleta(f: Firma | null | undefined): boolean {
    if (!f || !f.via) return false;
    if (!f.identita) return false;
    return f.via === "otp" ? f.otp === "fatta" : !!f.modulo;
}

export const eur = (n: number) => (Number(n) || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
