/* ═══ PERCHÉ QUESTA RICARICA NON PARTE DA SOLA ═════════════════════════════
   Luca 03/09, davanti a due righe con lo scontrino emesso e nessun errore in
   vista: «sembrano a tutto ok, non capisco il motivo per il quale non sono
   state fatte ancora in automatico. E se c'è stato un problema durante
   l'erogazione, perché non risulta tra lo stato che c'è stato un problema?»

   Aveva ragione due volte. Il motore SALTA delle righe di proposito — sono
   quattro motivi diversi, misurati stasera sulle 13 sospese: cinque in attesa
   del turno, quattro fuori dalla finestra dei sessanta minuti, due doppie, due
   con le credenziali rifiutate — e a schermo erano tutte «in sospeso», identiche.
   Una riga che il motore non farà MAI da sola e una che parte fra tre minuti
   avevano la stessa faccia.

   ⚠️ QUESTA SPIEGAZIONE DEVE DIRE QUELLO CHE IL MOTORE FA DAVVERO, non una
   versione simile: se le due regole divergono, la schermata diventa una
   bugia — e la bugia peggiore è quella che rassicura. Per questo i controlli
   qui sotto sono gli stessi, nello stesso ordine, di `motore/route.ts` (la
   selezione della coda) e di `paystoreEsegui.ts` (i controlli di erogazione).
   Se cambia una regola là, cambia qui: sono due punti, e vanno guardati
   insieme. */

export type ImpostazioniMotore = {
    acceso: boolean; max: number; finestra: number; tetto: number; tettoCorsa: number; lasso: number;
};

export type RigaDaPesare = {
    stato: string;
    scontrino_stato: string | null;
    creata_il: string;
    importo: number;
    numero: string | null;
    negozio: string | null;
    azienda: string | null;
    nota: string | null;
    errore: string | null;
    motore_preso_il?: string | null;
    /** quante righe IDENTICHE (stesso scontrino, numero e importo) ci sono */
    gemelle?: number;
};

/** Cosa impedisce alla riga di partire da sola, in una frase leggibile.
 *  Stringa vuota = niente la impedisce, tocca solo aspettare la corsa. */
export function percheNonParte(r: RigaDaPesare, imp: ImpostazioniMotore, adesso = Date.now()): string {
    if (r.stato !== "sospeso") return "";

    /* ⚠️ L'ERRORE GIÀ SCRITTO VIENE PRIMA DI TUTTO: è successo davvero, e
       raccontarne un altro sarebbe sostituire un fatto con una previsione. */
    if (r.errore) return r.errore;

    if (!imp.acceso) return "il motore automatico è spento: le ricariche partono solo a mano";

    if (r.scontrino_stato !== "emesso") {
        return r.scontrino_stato === "errore"
            ? "lo scontrino non è uscito: finché non risulta emesso il motore non eroga"
            : "non risulta ancora uno scontrino emesso per questa riga";
    }

    /* ⚠️ LA FINESTRA È LA PROTEZIONE PIÙ IMPORTANTE, e va spiegata per intero:
       una riga vecchia può essere già stata caricata a mano dal portale
       PayStore, e il CRM non lo saprebbe. Farla partire sarebbe un secondo
       credito sullo stesso numero. */
    const minuti = Math.floor((adesso - new Date(r.creata_il).getTime()) / 60000);
    if (minuti > imp.finestra) {
        return `è di ${minuti >= 120 ? Math.floor(minuti / 60) + " ore" : minuti + " minuti"} fa, oltre la finestra di ${imp.finestra}: `
            + "il motore non la fa da solo perché nel frattempo potrebbe essere stata caricata a mano. Guardala e falla partire tu, se serve";
    }

    const importo = Number(r.importo || 0);
    if (!(importo > 0)) return "l'importo è zero: non c'è niente da erogare";
    if (importo > imp.tetto) return `${importo.toFixed(2)} € superano il tetto di ${imp.tetto} € per singola ricarica: va fatta a mano`;

    if (String(r.nota || "").toUpperCase().includes("SOSPESO")) return "è segnata SOSPESO nella nota: il motore la lascia stare";

    const n = String(r.numero || "").replace(/\D/g, "");
    if (n.length < 7 || n.length > 11) return n ? `il numero ha ${n.length} cifre: non è un numero ricaricabile` : "manca il numero da ricaricare";

    if (!r.negozio || !r.azienda) return "manca il negozio o la società: il motore non saprebbe su quale plafond scaricarla";

    /* ⚠️ LA DOPPIA È IL CASO DI STASERA. Due righe identiche nello stesso
       scontrino sono quasi sempre un doppio clic al banco: erogarle entrambe
       vuol dire regalare il secondo credito. */
    if ((r.gemelle ?? 0) > 1) {
        return `ce ne sono ${r.gemelle} identiche sullo stesso scontrino (stesso numero, stesso importo): il motore non le fa da solo, sarebbero ${r.gemelle} crediti. Controlla e fai partire a mano quelle giuste`;
    }

    if (r.motore_preso_il && adesso - new Date(r.motore_preso_il).getTime() <= imp.lasso * 60000) {
        return "il motore l'ha presa in carico proprio adesso: sta partendo";
    }

    return "";
}
