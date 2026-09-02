"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { rigaConImei } from "@/lib/rigaScontrino";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import { arrotonda5, totaleRighe, FORME_PAGAMENTO, FORME_A_MANO, isFormaCash, type RigaScontrino, type RigaPagamento } from "@/lib/pos";
import { stessoMagazzino } from "@/lib/negoziNomi";

/* Modale "Incasso & Scontrino" — l'output fiscale di Registra Vendita.
   Si apre a vendita registrata: si compone il pagamento (fino a 3 forme, spec #2),
   per la quota CONTANTI mette in coda un incasso sulla cassa automatica pagAmico
   (l'agente locale del negozio la comanda e riporta incassato/resto), poi mette in
   coda lo scontrino fiscale sul RT con una riga di pagamento per forma.
   Tutto passa dalla coda cloud (print_jobs) → l'agente del negozio esegue sul LAN:
   funziona da qualsiasi dispositivo, nessun collegamento diretto dal browser.
   Solo la quota Contanti guida la macchina; Carta/Bonifico = solo scontrino (POS a
   parte); Finanziamento/Non Riscosso = a credito, nessun incasso fisico.
   Il reset della vendita avviene alla chiusura (onDone). */

/* ═══ UN TELEFONO A RATE O FINANZIATO ══════════════════════════════════════
   Luca 01/09. Un telefono non si scontrina sempre allo stesso modo: cambia
   chi incassa il resto, e in un caso lo scontrino non esce proprio.
   Il REPARTO resta sempre il 2 (IVA 22%): l'imposta è dovuta alla cessione, e
   come paga il cliente non la cambia. La differenza sta nella FORMA DI
   PAGAMENTO, che nel registratore è un tipo a sé (non riscosso). */
export type ModoTelefono = "w3_finanziato" | "w3_rate" | "w3_fwa" | "vf_finanziato" | "vf_rate";
export interface TelefonoScontrino {
    chiave: string;
    imei: string;
    /** non ha una riga nel carrello: la riga dello scontrino la fa il modale */
    creaRiga?: boolean;
    modo: ModoTelefono;
    brand: string;
    categoria: string;
    prodotto: string;
    offerta: string;
    descrizione: string;
    codice: string | null;
}

/** Cosa chiedere, caso per caso. La nota dice all'operatore DOVE prendere il
 *  numero: senza, ognuno lo cerca dove capita e i conti non tornano. */
export const DOMANDE_TELEFONO: Record<ModoTelefono, {
    titolo: string; resto: string; nota: string; forma: string | null; scontrino: boolean;
}> = {
    w3_finanziato: { titolo: "WindTre · Finanziato", resto: "Importo finanziato", nota: "recuperalo dal PDA WindTre", forma: "FINANZIAMENTO", scontrino: true },
    w3_rate: { titolo: "WindTre · Telefono a rate", resto: "Importo rateizzato (VAR)", nota: "recuperalo dal PDA WindTre", forma: "NON_RISCOSSO", scontrino: true },
    w3_fwa: { titolo: "WindTre · FWA con apparato", resto: "Importo", nota: "recuperalo dal PDA WindTre, e scegli come lo paga il cliente", forma: null, scontrino: true },
    vf_finanziato: { titolo: "Vodafone · Finanziato", resto: "Importo finanziato", nota: "recuperalo dal PDA Compass, o dal listino Vodafone", forma: "FINANZIAMENTO", scontrino: true },
    vf_rate: { titolo: "Vodafone · Telefono a rate", resto: "", nota: "l'anticipo si recupera dal DDI o dal contratto Vodafone", forma: null, scontrino: false },
};

export interface ScontrinoData {
    items: RigaScontrino[];
    negozio: string | null;
    deviceUrl?: string;
    cliente?: string | null;   // per salvare/ritrovare il conto in sospeso
    azienda?: string | null;   // ragione sociale preselezionata (es. ripresa da sospeso)
    sospesoId?: string;        // se valorizzato: si sta COMPLETANDO un conto in sospeso
    /** la vendita a cui questo scontrino appartiene: serve alla task del
     *  bonifico, che deve riportare all'incasso vero e non a un elenco */
    contrattoId?: string | null;
    /** coupon GIÀ applicato sul carrello (Luca 31/08): qui arriva applicato,
     *  non si richiede al cliente di ripeterlo alla cassa */
    coupon?: { code: string; valore: number; sconto: number } | null;
    /** la vendita NON è ancora scritta: si registra a scontrino emesso */
    daRegistrare?: boolean;
    /** i telefoni a rate o finanziati di questa vendita: prima di incassare si
     *  chiedono anticipo e resto, perché da lì dipendono la riga dello
     *  scontrino e la forma di pagamento */
    telefoni?: TelefonoScontrino[];
}

const eur = (n: number) => "€ " + (Number(n) || 0).toFixed(2).replace(".", ",");
const POLL_MS = 1500;
const CASH_TIMEOUT_MS = 240000; // 4 min: il cliente inserisce i contanti
/* quanto si aspetta la conferma del registratore prima di registrare comunque.
   Venticinque secondi: la mediana misurata è 8, e oltre questa soglia tenere
   la cassa ferma col cliente davanti costa più di quanto renda. */
const ATTESA_STAMPA_MS = 25000;

type Fase = "telefoni" | "scelta" | "incasso" | "stampa" | "fatto" | "errore";

export function ScontrinoCassa({ data, onDone, onCommit }: { data: ScontrinoData | null; onDone: () => void; onCommit?: (extra?: { contoTerzi?: { descrizione: string; imei: string; importo: number; forma: string }[]; azienda?: string | null; aziendaScontrino?: string | null; sospesa?: boolean }) => Promise<{ ok: boolean; error?: string; rows?: any }> }) {

    // Pagamento come lista di forme (max 3). Default: tutto in contanti.
    /* NESSUNA FORMA PRESELEZIONATA (Luca 31/08). Era «Contanti» di partenza:
       chi non guardava premeva «Incassa ed emetti» e la vendita usciva a
       contanti senza che nessuno lo avesse deciso. Con una vendita di prova da
       1 centesimo — dove l'arrotondamento a 5 cent porta la quota contanti a
       ZERO e la cassa automatica non viene nemmeno chiamata — sembrava che il
       CRM non chiedesse proprio niente.
       È la stessa cosa che Luca voleva evitare fin dall'inizio: «rischi che io
       esca senza selezionare una modalità di pagamento». Ora si sceglie, e
       «Incassa ed emetti» resta spento finché non lo si fa. */
    const [righe, setRighe] = useState<RigaPagamento[]>([{ forma: "", importo: 0 }]);
    const [fase, setFase] = useState<Fase>("scelta");
    /* GLI IMPORTI DEI TELEFONI, chiesti prima di incassare. Testo e non
       numero: un campo che si azzera da solo mentre lo scrivi è il modo più
       veloce per far sbagliare una cifra a chi ha un cliente davanti. */
    const [importi, setImporti] = useState<Record<string, { anticipo: string; resto: string; forma: string }>>({});

    /** Un importo scritto a mano: la virgola è quella che si usa alla cassa. */
    const _n = (t: string) => { const v = Number(String(t ?? "").replace(",", ".").trim()); return isFinite(v) ? v : 0; };

    /* ═══ COSA PRODUCONO I TELEFONI ═════════════════════════════════════════
       NON una riga nuova. La riga del telefono nel carrello C'È GIÀ — la
       mette `computeAutoMarg` come «Telefono TNP (listino)», al prezzo pieno —
       e aggiungerne una seconda voleva dire scontrinare il telefono DUE VOLTE:
       totale doppio, e la cassa automatica che chiede al cliente il doppio di
       quello che deve (misurato dal revisore: 1.798 € invece di 899, contanti
       999 invece di 100).
       Quello che i telefoni producono è la DIVISIONE DEL PAGAMENTO: la parte
       finanziata o rateizzata viene ritagliata dal totale ed esce come non
       riscossa, il resto si incassa. L'anticipo serve a controllare che i due
       numeri tornino col prezzo di listino: se non tornano lo si dice, perché
       vuol dire che uno dei due è stato copiato male dal PDA. */
    const telefoni = useMemo<TelefonoScontrino[]>(() => data?.telefoni || [], [data]);

    /** Le forme non riscosse, già decise dal tipo di vendita: non si scelgono. */
    const pagamentiNonRiscossi = useMemo(() => telefoni
        .filter(t => DOMANDE_TELEFONO[t.modo].scontrino)
        .map(t => ({ forma: (importi[t.chiave]?.forma || DOMANDE_TELEFONO[t.modo].forma || ""), importo: _n(importi[t.chiave]?.resto) }))
        .filter(r => r.forma && r.importo > 0)
        /* UNA RIGA PER FORMA, non una per telefono: il registratore ne accetta
           tre in tutto, e con tre telefoni finanziati il residuo in contanti
           sarebbe stato tagliato via — incassato davvero e non scritto. */
        .reduce((acc: { forma: string; importo: number }[], r) => {
            const g = acc.find(x => x.forma === r.forma);
            if (g) g.importo = +(g.importo + r.importo).toFixed(2); else acc.push({ ...r });
            return acc;
        }, []), [telefoni, importi]);

    /* L'INCASSO PER CONTO DI VODAFONE: soldi che entrano davvero in cassa ma
       che sullo scontrino non ci vanno, perché la fattura al cliente la manda
       Vodafone. Restano tracciati — importo e modalità — perché servono al
       flusso di cassa e al conto con Vodafone, che deve rimborsare la
       differenza fra quanto abbiamo pagato il telefono e questo anticipo. */
    const contoTerzi = useMemo(() => telefoni
        .filter(t => !DOMANDE_TELEFONO[t.modo].scontrino)
        .map(t => ({ telefono: t, importo: _n(importi[t.chiave]?.anticipo), forma: importi[t.chiave]?.forma || "" }))
        .filter(r => r.importo > 0), [telefoni, importi]);

    /* ═══ IL TELEFONO SULLO SCONTRINO VALE QUELLO CHE PAGA IL CLIENTE ═══════
       Luca 01/09, con una vendita bloccata davanti: «stai confondendo il
       valore del telefono sul quale calcoliamo la marginalità con quello che
       poi paga il cliente e che andiamo a scontrinare».

       Il LISTINO (159,90 € su un TCL K70) è il valore del bene, ed è la base
       su cui l'azienda calcola il suo margine — quello NON si tocca.
       Ma il cliente paga anticipo + rateizzato: 0 + 109,90. **La differenza se
       la assorbe l'operatore**, perché è un cliente suo: quei 50 € non sono
       soldi che deve incassare la cassa, e non sono un ammanco.

       Prima la riga andava sullo scontrino al LISTINO, e il modale chiedeva di
       incassare la differenza: nell'esempio segnava «Rimanente 50,00 €» su una
       vendita in cui il cliente doveva solo i 10 € della SIM. I ragazzi non
       riuscivano a chiudere lo scontrino e le vendite restavano in sospeso.

       Adesso la riga del telefono vale ANTICIPO + RESTO. Nell'esempio lo
       scontrino diventa: SIM 10,00 + TCL K70 109,90 = 119,90, di cui 109,90
       non riscosso, e restano da incassare i 10 € della SIM — che è
       esattamente quello che il cliente paga.

       Vale per WindTre e per Vodafone, per tutte le tipologie: cambia solo la
       forma del non riscosso, non il principio.

       E NON C'È PIÙ NIENTE DA SEGNALARE: l'avviso «anticipo + resto non fa il
       prezzo del telefono» nasceva dalla premessa sbagliata — che i due numeri
       dovessero coincidere — e avrebbe gridato al lupo su ogni vendita
       rateizzata fatta bene. */
    const _telefoniConImporti = useMemo(() => telefoni.filter(t =>
        DOMANDE_TELEFONO[t.modo].scontrino && !t.creaRiga
        && importi[t.chiave] && (importi[t.chiave].anticipo.trim() !== "" || importi[t.chiave].resto.trim() !== "")
    ), [telefoni, importi]);

    /** Le parole di un nome, per confrontarlo con un altro: minuscole, senza
     *  punteggiatura, e via quelle di una lettera sola che non distinguono
     *  niente. «TCL K70 5G 4+128GB» → tcl · k70 · 5g · 4 · 128gb */
    const _parole = (x: string) => new Set(
        String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(w => w.length > 1));

    /** La riga di carrello che porta questo telefono.
     *
     *  IL PRIMO TENTATIVO ERA SBAGLIATO e non agganciava mai (Luca, 01/09
     *  sera: «continua a non funzionare»). Cercavo il nome del telefono DENTRO
     *  la descrizione della riga, ma i due nomi vengono da posti diversi e non
     *  si contengono: il telefono lo nomina il MAGAZZINO — «TCL K70 5G 4+128GB
     *  Stardust Blue» — e la riga lo nomina il campo «Modello Terminale» della
     *  pratica — «TCL K70 5G 4+128GB». Il primo è più LUNGO del secondo,
     *  quindi `riga.includes(telefono)` era falso ogni volta. E il codice di
     *  magazzino sulla riga è `null` (la voce automatica non ne ha uno),
     *  quindi non aggiungeva niente.
     *
     *  Adesso si contano le PAROLE IN COMUNE, che regge in tutti e due i versi
     *  e anche quando uno dei due nomi porta il colore e l'altro no. Servono
     *  almeno due parole condivise: «Sim Wind3» contro un TCL non ne ha
     *  nessuna, quindi non c'è modo di agganciare la riga sbagliata.
     *  Una riga sola per telefono: con due telefoni dello stesso modello, il
     *  secondo non può riprendersi la riga del primo. */
    const _righeCorrette = useMemo<RigaScontrino[]>(() => {
        const base = (data?.items || []).map(r => ({ ...r }));
        const usate = new Set<number>();
        const _giaSuRiga: Record<number, number> = {};    // quanto si è già messo su ogni riga
        const _quantiSuRiga: Record<number, number> = {}; // e per quanti telefoni
        _telefoniConImporti.forEach(t => {
            let idx = -1;
            /* ① L'IMEI: l'unica chiave davvero certa, e da oggi le righe se lo
               portano dietro. Due telefoni dello stesso modello, o due pezzi
               dello stesso articolo, si distinguono solo così. */
            if (t.imei) idx = base.findIndex((r, i) => !usate.has(i) && String(r.description || "").includes(String(t.imei)));
            /* ② IL CODICE DI MAGAZZINO NON BASTA DA SOLO: è il codice
               ARTICOLO, non del pezzo — «0TTCK75GOU7005» sono trenta TCL K70.
               Con due pezzi dello stesso articolo, uno a rate e uno in
               contanti, prendeva la riga del contanti e i due prezzi si
               scambiavano. Vale solo se una riga sola lo porta. */
            if (idx < 0 && t.codice) {
                const cand = base.map((r, i) => ({ r, i })).filter(({ r, i }) => !usate.has(i) && !!r.codice && String(r.codice) === String(t.codice));
                if (cand.length === 1) idx = cand[0].i;
            }
            /* ③ Le parole in comune, ma solo fra le righe che possono essere
               un telefono: reparto 2 e un prezzo che copre quello che il
               cliente paga. Senza questi due paletti, «Cover TCL K70» rubava
               la riga al «TCL K70», e lo scontrino usciva col prezzo del
               telefono sulla cover. A parità di parole vince la riga più cara:
               fra una cover e un telefono, il telefono. */
            if (idx < 0) {
                const pt = _parole(t.descrizione);
                const i2 = importi[t.chiave];
                const paga2 = +(_n(i2.anticipo) + _n(i2.resto)).toFixed(2);
                let meglio = 0, prezzoMeglio = -1;
                base.forEach((r, i) => {
                    if (usate.has(i)) return;
                    if (Number(r.reparto) !== 2) return;
                    const prezzoRiga = Number(r.unitPrice) * (Number(r.qty) > 0 ? Number(r.qty) : 1);
                    if (!(prezzoRiga + 0.02 >= paga2)) return;   // un telefono non costa meno di quanto il cliente ci paga
                    const pr = _parole(r.description);
                    let n = 0; pt.forEach(w => { if (pr.has(w)) n++; });
                    if (n >= 2 && (n > meglio || (n === meglio && prezzoRiga > prezzoMeglio))) { meglio = n; prezzoMeglio = prezzoRiga; idx = i; }
                });
            }
            if (idx < 0) return;   // niente riga da correggere: si lascia com'è
            const i = importi[t.chiave];
            const paga = +(_n(i.anticipo) + _n(i.resto)).toFixed(2);
            const qta = Number(base[idx].qty) > 0 ? Number(base[idx].qty) : 1;
            /* UNA RIGA DA DUE PEZZI NON SI CHIUDE DOPO IL PRIMO TELEFONO: se
               due telefoni stanno sulla stessa riga (`qty 2`), il secondo non
               troverebbe più niente e il suo non riscosso resterebbe scoperto
               — misurato: «Pagamento eccedente» e vendita bloccata. Si tiene
               aperta finché ci sono pezzi da coprire, e ogni telefono aggiunge
               la sua parte. */
            const gia = Number(_giaSuRiga[idx] || 0);
            const quanti = Number(_quantiSuRiga[idx] || 0);
            _giaSuRiga[idx] = gia + paga;
            _quantiSuRiga[idx] = quanti + 1;
            if (_quantiSuRiga[idx] >= qta) usate.add(idx);
            base[idx] = { ...base[idx], unitPrice: +((gia + paga) / qta).toFixed(2) };
        });
        return base;
    }, [data, _telefoniConImporti, importi]);

    /** Nella forma in cui va archiviato: importo, mezzo, e di quale telefono. */
    const contoTerziDaSalvare = useMemo(() => contoTerzi.map(r => ({
        descrizione: r.telefono.descrizione, imei: r.telefono.imei, importo: r.importo, forma: r.forma,
    })), [contoTerzi]);

    /* LE RIGHE CHE MANCANO. Solo per i telefoni che nel carrello una riga non
       ce l'hanno — oggi il solo apparato FWA: per tutti gli altri la riga c'è
       già e aggiungerne una seconda vorrebbe dire scontrinare due volte. */
    const righeOrfane = useMemo<RigaScontrino[]>(() => (data?.sospesoId ? [] : telefoni)
        /* SU UN CONTO RIPRESO NON SI RICOSTRUISCE NIENTE: le righe salvate
           comprendono già quella dell'apparato, e rifarla vorrebbe dire
           scontrinarlo due volte (revisore 01/09). */
        .filter(t => t.creaRiga && DOMANDE_TELEFONO[t.modo].scontrino)
        .map(t => ({
            /* INTERO O NIENTE, come per le altre righe: il registratore taglia
               a 38 caratteri e taglierebbe proprio l'IMEI. */
            description: rigaConImei(t.descrizione, t.imei, String(t.descrizione || "")),
            unitPrice: +(_n(importi[t.chiave]?.anticipo) + _n(importi[t.chiave]?.resto)).toFixed(2),
            qty: 1, reparto: 2, codice: t.codice,
        }))
        .filter(r => r.unitPrice > 0), [telefoni, importi]);

    const itemsTutte = useMemo<RigaScontrino[]>(() => [..._righeCorrette, ...righeOrfane], [_righeCorrette, righeOrfane]);

    /* LE RIGHE DI PAGAMENTO SI RICOSTRUISCONO SEMPRE COSÌ (revisore 01/09):
       prima le forme già decise — finanziato, rateizzato: quelle non le
       sceglie l'operatore — poi quello che resta da incassare.
       Prima il coupon le azzerava: applicandolo o togliendolo, la riga
       «Finanziamento 799 €» spariva e restava tutto da assegnare a mano fra
       contanti, carta e bonifico. Cioè il finanziato veniva certificato come
       INCASSATO. E permuta più telefono finanziato è la combinazione più
       comune che c'è, non un caso di scuola. */
    const rifaiRighe = (netto: number): RigaPagamento[] => {
        const fisse = pagamentiNonRiscossi;
        const gia = fisse.reduce((a, r) => a + r.importo, 0);
        const resta = +(netto - gia).toFixed(2);
        /* IL RESIDUO STA PRIMO quando le forme fisse sono tante: il
           registratore ne accetta tre, e il server taglia le ultime — con tre
           telefoni finanziati sarebbero caduti proprio i contanti, incassati
           davvero e non scritti sullo scontrino. */
        return resta > 0.004 ? [{ forma: "", importo: resta }, ...fisse] : [...fisse];
    };
    const totale = totaleRighe(itemsTutte);
    const [incassato, setIncassato] = useState(0);
    const [resto, setResto] = useState(0);
    const [msg, setMsg] = useState("");
    const [esclusi, setEsclusi] = useState<{ description: string; motivo: string }[]>([]);
    // Contanti già incassati: evita il DOPPIO incasso se lo scontrino fallisce e si riprova.
    const [cashDone, setCashDone] = useState(false);
    const [paidCash, setPaidCash] = useState(0);
    const [isTest, setIsTest] = useState(false);
    // Multi-societario: ragioni sociali/RT del negozio; se >1, l'operatore sceglie
    // quale EMETTE (default = azienda del negozio; i prodotti con azienda fissa
    // vanno comunque al loro RT).
    const [aziende, setAziende] = useState<{ code: string; label: string; negozio: string; propria: boolean }[]>([]);
    const [aziendaSel, setAziendaSel] = useState<string | null>(null);
    /* A QUALE CASSA INCASSO (Luca 31/08). «Sono al Wind3 e faccio uno scontrino
       di un prodotto che sta al Multi, ma faccio pagare il cliente da me: uso
       la cash machine del Wind3.»
       Sono due dispositivi diversi e vanno decisi separatamente: la CARTA
       fiscale la deve emettere il registratore della società che possiede la
       merce — non c'è modo di aggirarlo — mentre i SOLDI li prende la macchina
       davanti a cui sta il cliente. La domanda compare solo dove le insegne
       nello stesso locale sono più d'una. */
    /* SOLI SERVIZI (Luca 31/08): «uno scontrino di soli servizi deve chiedermi
       dove scontrinarlo, e di conseguenza in quale cash machine incassarlo».
       Un servizio non ha magazzino, quindi nessuna riga può dire di chi è la
       vendita: è l'unico caso in cui la domanda ha senso, e infatti negli altri
       la risposta la dà la merce. Se nel locale c'è una sola società non si
       chiede niente: non ci sarebbe niente da scegliere. */
    /* «SOLI SERVIZI» vuol dire che non c'è merce: un telefono È merce, anche
       quando non è agganciato al magazzino e quindi non porta né società né
       codice (revisore 01/09). Senza questa aggiunta il modale chiedeva «chi
       emette lo scontrino?» per una vendita di merce, e la ragione sociale
       finiva scelta a mano invece che seguire il prodotto. */
    /* ⭐ E VALE ANCHE PER LE RICARICHE (Luca 02/09): «così come i servizi
       devono poter scegliere dove scontrinare anche le ricariche: nel momento
       in cui vado a fare una ricarica devo poter decidere dove fare lo
       scontrino».
       VERIFICATO, non dato per scontato: una ricarica è una voce di
       `marg_items` con `azienda` NULL e `codice_magazzino` NULL — misurato sul
       database, tutte e diciotto — e la riga che il carrello manda qui porta
       quindi `azienda: null, codice: null`. Cade dentro questa condizione
       esattamente come un'assistenza o un backup: la domanda si faceva già.
       Quello che NON si faceva era dirlo. La domanda diceva «Sono tutti
       servizi», e una ricarica nessuno la chiama servizio: chi la vendeva
       leggeva una domanda che sembrava di qualcun altro, la scavalcava, e lo
       scontrino usciva sulla società preimpostata. Adesso la domanda nomina
       quello che c'è nel carrello.
       ⚠️ E RESTA VERO IL CONTRARIO (Luca, stessa frase): «sempre che questi
       servizi non siano gli unici articoli all'interno del carrello». Basta un
       prodotto di magazzino — che una società ce l'ha, ed è un fatto — perché
       la domanda sparisca: la ricarica segue il prodotto sul suo scontrino, e
       non si chiede niente. È la riga qui sotto, e non cambia. */
    const soloServizi = !!data && !telefoni.length && !itemsTutte.some((i) => i.azienda || i.codice);
    /** Le parole della domanda seguono quello che c'è davvero nel carrello:
     *  «ricariche» a chi vende ricariche, «servizi» a chi vende servizi. Non
     *  cambia nessuna regola — cambia solo il nome della cosa che si sta
     *  scontrinando, che è l'unico motivo per cui la domanda veniva saltata. */
    const _cosaCe = useMemo(() => {
        const nRic = itemsTutte.filter((i) => i.ricarica === true).length;
        const nAltro = itemsTutte.length - nRic;
        if (nRic && nAltro) return "Ricariche e servizi";
        if (nRic) return nRic > 1 ? "Ricariche" : "Ricarica";
        return "Servizi";
    }, [itemsTutte]);
    const [insegne, setInsegne] = useState<string[]>([]);
    const [cassaSel, setCassaSel] = useState<string | null>(null);
    // Coupon sconto (spec Francesco): abbassa l'imponibile. Il residuo rigenera un nuovo coupon.
    const [couponInput, setCouponInput] = useState("");
    const [coupon, setCoupon] = useState<{ code: string; valore: number; sconto: number } | null>(null);
    const [couponMsg, setCouponMsg] = useState("");
    const [nuovoCoupon, setNuovoCoupon] = useState<{ code: string; valore: number } | null>(null);
    // (b) Commit differito: lo scontrino è emesso ma il salvataggio a DB è fallito →
    // si offre il retry del SOLO salvataggio (senza riemettere lo scontrino).
    const [commitFail, setCommitFail] = useState(false);
    /* CHE COSA È ANDATO STORTO. Senza distinguerlo, dopo un incasso fallito il
       pulsante diceva «Ristampa scontrino» e la seconda pressione saltava
       l'incasso (che risultava «fatto») andando dritta alla stampa: uno
       scontrino emesso senza aver preso i soldi. Con una ricarica dentro
       sarebbe anche partita l'erogazione (Luca 02/09). */
    const [erroreDi, setErroreDi] = useState<"" | "pagamento" | "scontrino">("");
    // Annulla incasso (spec Francesco 31/08): un flag che ferma l'attesa dei contanti
    // dal CRM. Ref e non stato: il loop di poll lo legge subito, senza aspettare un re-render.
    const cancelCashRef = useRef(false);

    // Firma STABILE della vendita. Il reset qui sotto azzera anche la ragione sociale
    // scelta dall'operatore: deve scattare SOLO quando cambia DAVVERO la vendita, non a
    // ogni re-render del prop `data` (bug: la scelta Telefutura/Telefutura 2 tornava al
    // default → lo scontrino usciva sull'RT sbagliato). Con la firma-stringa, un re-render
    // con lo stesso contenuto NON rifa' il reset.
    const saleSig = JSON.stringify(data);
    // reset all'apertura di una NUOVA vendita (o alla chiusura del modale)
    useEffect(() => {
        /* al reset i telefoni non hanno ancora importi, quindi il totale è
           quello del carrello: si aggiorna da solo appena l'operatore scrive */
        const t = data ? totaleRighe(data.items) : 0;
        /* IL COUPON ARRIVA GIÀ APPLICATO DAL CARRELLO (Luca 31/08). Il totale
           da mettere in contanti è quindi quello SCONTATO: partire dal pieno
           avrebbe chiesto alla cassa automatica dei soldi che il cliente non
           deve. Lo sconto si ricapa sul totale di adesso, che è la verità di
           questo momento. */
        const cIn = data?.coupon || null;
        const sc = cIn ? Math.min(Number(cIn.sconto) || 0, t) : 0;
        setRighe([{ forma: "", importo: +(t - sc).toFixed(2) }]);   // al reset non ci sono ancora forme decise
        /* SE CI SONO TELEFONI, PRIMA GLI IMPORTI. Il totale dello scontrino
           non si conosce ancora: dipende da quanto è stato finanziato. */
        const tel = data?.telefoni || [];
        setImporti(Object.fromEntries(tel.map(t => [t.chiave, { anticipo: "", resto: "", forma: DOMANDE_TELEFONO[t.modo].forma || "" }])));
        setFase(tel.length ? "telefoni" : "scelta"); setIncassato(0); setResto(0);
        setMsg(""); setEsclusi([]); setCashDone(false); setPaidCash(0); setIsTest(false); setErroreDi("");
        setAssegna({}); setRighePerAz({});
        /* una nuova vendita non eredita una riga rimasta «in mano» da quella
           prima: sarebbe un riquadro acceso senza niente che lo tenga */
        trascinoRef.current = null; setTrascino(null); setSopra(null);
        setAziende([]); setAziendaSel(null);
        setCouponInput("");
        setCoupon(cIn ? { code: cIn.code, valore: Number(cIn.valore) || 0, sconto: sc } : null);
        setCouponMsg(""); setNuovoCoupon(null); setCommitFail(false); cancelCashRef.current = false;
        const neg = data?.negozio;
        if (!neg) return;
        // le insegne del LOCALE: quelle con un registratore hanno anche una cassa
        /* ⚠️ IL CASSETTO SI SCEGLIE PER AGENTE, non per nome negozio (02/09).
           Il comando di apertura viaggia come lavoro di stampa e lo ritira
           l'agente che si chiama così: dopo la fusione dei punti vendita i due
           banconi avranno lo stesso nome, ma restano due PC con due cassetti.
           `pos_rt.agente` è il nome con cui quel PC si presenta, e oggi
           coincide col negozio — quindi non cambia niente finora. */
        supabase.from("pos_rt").select("negozio, agente").then(({ data: tutti }) => {
            const nel = [...new Set((tutti || [])
                .filter((r: any) => stessoMagazzino(String(r.negozio), neg))
                .map((r: any) => String(r.agente || r.negozio)))].sort();
            setInsegne(nel);
            setCassaSel(nel.includes(neg) ? neg : (nel[0] || neg));
        });
        /* LE SOCIETÀ CHE POSSONO EMETTERE QUI comprendono i gemelli: a Magliana
           il registratore dell'altra insegna è a tre metri (Luca 31/08). */
        supabase.from("pos_rt").select("negozio, azienda, ragione_sociale, is_default").then(({ data: tuttiR }) => {
            const rows = (tuttiR || []).filter((r: any) => stessoMagazzino(r.negozio, neg));
            const list = rows.map((r: any) => ({
                code: r.azienda,
                negozio: String(r.negozio),
                label: (r.ragione_sociale || r.azienda) + (r.negozio !== neg ? ` · ${r.negozio}` : ""),
                isDef: !!r.is_default && r.negozio === neg,
                // ha un registratore SUO qui, o è quello del negozio accanto?
                propria: r.negozio === neg,
            }));
            setAziende(list.map((x) => ({ code: x.code, label: x.label, negozio: x.negozio, propria: x.propria })));
            // se si RIPRENDE un sospeso con azienda già scelta, rispettala; altrimenti default.
            /* ⚠️ LE SOLE RICARICHE LE EMETTE TELEFUTURA SRL (Luca 01/09):
               «nei negozi con due casse dentro lo stesso negozio, se non c'è
               nient'altro nel carrello e l'unica cosa da scontrinare è la
               ricarica, allora va su Telefutura SRL». Qui si PREIMPOSTA, non
               si impone: quello che l'operatore legge è quello che uscirà, e
               se il caso è diverso può cambiarlo. */
            /* ⚠️ E SOLO FRA I REGISTRATORI PROPRI. `list` comprende i
               gemelli di locale, e a Magliana Multi — che di società ne ha UNA,
               Telefutura 2 — ci sarebbe finito il T1 di Magliana W3: la
               ricarica sarebbe uscita a nome della società sbagliata, dalla
               cassa dell'insegna accanto. La regola di Luca parla dei negozi
               con DUE casse dentro, e quello è solo Donna. */
            const soleRicariche = itemsTutte.length > 0 && itemsTutte.every((i) => i.ricarica === true);
            const proprie = list.filter((x) => x.propria);
            const preset = (data?.azienda && list.find((x) => x.code === data.azienda))
                || (soleRicariche && proprie.length > 1 ? proprie.find((x) => x.code === "T1") : null);
            const def = preset || list.find((x) => x.isDef) || list[0];
            setAziendaSel(def ? def.code : null);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saleSig]);

    // Sconto coupon (capato al totale) → quanto resta DA PAGARE con le forme.
    const scontoCoupon = coupon ? Math.min(coupon.sconto, totale) : 0;
    const totaleDaPagare = +(totale - scontoCoupon).toFixed(2);
    /* NIENTE DA INCASSARE. Due casi diversi che qui finivano nello stesso: il
       coupon che copre tutto, e un carrello che vale ZERO. Il secondo non
       c'entra col coupon, e dirlo confonde chi sta cercando di capire perché
       non gli è stato chiesto il pagamento (Luca 31/08, prova a Promontori). */
    const coperto = totaleDaPagare <= 0.005;
    const nienteDaPagare = !coupon && totale <= 0.005;

    // Somme / bilancio del pagamento (sul netto da pagare).
    const sommaPag = +righe.reduce((s, r) => s + (Number(r.importo) || 0), 0).toFixed(2);
    const rimanente = +(totaleDaPagare - sommaPag).toFixed(2);
    // ogni riga deve avere una FORMA scelta, non solo un importo
    const bilanciato = coperto || (Math.abs(rimanente) < 0.005
        && righe.every((r) => Number(r.importo) > 0 && !!r.forma));
    const cashPortion = coperto ? 0 : +righe.filter((r) => isFormaCash(r.forma)).reduce((s, r) => s + (Number(r.importo) || 0), 0).toFixed(2);
    const cashRounded = arrotonda5(cashPortion);
    const arrotondamento = +(cashRounded - cashPortion).toFixed(2);

    // Forme di pagamento da inviare al RT: la quota contanti va arrotondata a 5 cent
    // (la macchina lavora a ≥5c); le altre forme all'importo esatto. Se il coupon copre
    // tutto, nessun tender (lo sconto azzera il netto).
    const pagamentiSend = (): RigaPagamento[] =>
        coperto ? [] : righe.filter((r) => Number(r.importo) > 0)
            .map((r) => ({
                forma: r.forma,
                importo: isFormaCash(r.forma) ? arrotonda5(Number(r.importo)) : +Number(r.importo).toFixed(2),
            }));

    /* ═══ DUE SOCIETÀ NEL CARRELLO SONO DUE SCONTRINI ═══════════════════════
       Luca, 02/09: «se ci sono più prodotti di diverse società, nella
       schermata dove chiede la modalità di pagamento deve splittarmi lo
       scontrino in due sezioni, coi nomi delle società sopra, i prodotti di
       ognuna e l'importo da incassare, e chiedermi la modalità per entrambi.
       Se pagano contanti mi deve chiedere anche in quale cash machine.
       I servizi devo poterli spostare da un carrello all'altro.»

       PERCHÉ ESISTE SOLO QUI DENTRO. Il carrello misto capita in quattro
       locali su quindici — quelli che dentro hanno due punti vendita di due
       società: Magliana, Collatina, Acilia, Donna Olimpia. Negli altri undici
       questo blocco non si accende mai, e il pagamento resta quello di sempre.
       Per questo è un modo IN PIÙ e non una riscrittura: il gesto che i negozi
       fanno duecento volte al giorno non cambia di una virgola.

       LA MERCE DECIDE, IL SERVIZIO NO. Ogni riga di merce porta la sua società
       dal magazzino: quella non si tocca, se no si emette con la partita IVA
       sbagliata. I servizi — ricariche, riparazioni, backup — una società non
       ce l'hanno: partono su quella della merce principale e si spostano. */
    const _chiaveRiga = (i: RigaScontrino, k: number) => `${i.productId || i.codice || i.description}|${k}`;
    const [assegna, setAssegna] = useState<Record<string, string>>({});
    const [righePerAz, setRighePerAz] = useState<Record<string, RigaPagamento[]>>({});
    /* QUALI INCASSI SONO GIÀ ANDATI. Ref e non stato: fra il primo incasso e il
       secondo non c'è un re-render, e uno stato letto qui sarebbe ancora quello
       di prima — cioè il primo cassetto si riaprirebbe. */
    /* UN SOLO GIRO PER VOLTA. `conferma` non aveva nessun lucchetto: due clic
       nello stesso istante superavano entrambi la guardia dell'incasso, che si
       scrive dopo due `await`, e la macchina si apriva DUE volte. */
    const inCorso = useRef(false);

    /* ═══ IL TRASCINAMENTO SI DEVE VEDERE ═══════════════════════════════════
       Luca 02/09: «passandoci sopra col mouse vedo e mi rendo conto che posso
       trascinarlo da una parte all'altra».
       Il trascinamento c'era già, ma era CIECO: la riga presa restava identica
       e il riquadro di arrivo non si accendeva. Chi provava non capiva se
       stesse succedendo qualcosa, mollava a metà, e concludeva che non si
       poteva fare.
       Due segnali, e bastano: quale riga ho in mano (`trascino`) e dove la
       sto per lasciare (`sopra`).
       ⚠️ ANCHE UN RIFERIMENTO, non solo lo stato. `onDragOver` deve decidere
       SUBITO se accettare il rilascio — chiamare `preventDefault()` è l'unico
       modo di dire «qui si può» — e al primo evento lo stato può non essere
       ancora arrivato: con il solo stato, il primo riquadro sfiorato rifiutava
       la riga. Il riferimento è aggiornato nello stesso istante del `dragstart`. */
    const trascinoRef = useRef<number | null>(null);
    const [trascino, setTrascino] = useState<number | null>(null);
    const [sopra, setSopra] = useState<string | null>(null);
    const mollaTrascinamento = () => { trascinoRef.current = null; setTrascino(null); setSopra(null); };

    /* ⚠️ CHI DECIDE LA SOCIETÀ È IL SERVER, NON QUESTA PAGINA (Luca 02/09).
       Guardare `i.azienda` non bastava: la riga del telefono che nasce da una
       pratica arriva senza società e senza codice, quindi il modale credeva ci
       fosse una società sola, non divideva niente, e il server rifiutava —
       dopo aver fatto prendere i contanti alla macchina.
       La verifica preventiva ora torna la società di OGNI riga, decisa con le
       stesse regole con cui verrà stampata: si chiede a lei, una volta, appena
       la finestra è pronta. Se la risposta non arriva si ricade su `i.azienda`,
       che è quello che si faceva prima: non si peggiora mai. */
    const [perRigaSrv, setPerRigaSrv] = useState<(string | null)[] | null>(null);
    const _firmaItems = itemsTutte.map((i) => `${i.description}|${i.unitPrice}|${i.qty ?? 1}`).join("~");
    useEffect(() => {
        let vivo = true;
        setPerRigaSrv(null);
        if (!data?.negozio || !itemsTutte.length) return;
        (async () => {
            try {
                const res = await fetch("/api/vendita/scontrino", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ negozio: data.negozio, items: itemsTutte, azienda: null, dryRun: true }),
                });
                const j = await res.json().catch(() => ({}));
                if (vivo && Array.isArray(j?.perRiga)) setPerRigaSrv(j.perRiga as (string | null)[]);
            } catch { /* si resta su quello che dice la riga */ }
        })();
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [_firmaItems, data?.negozio]);

    /** La società di una riga: quella che ha detto il server, se l'ha detta. */
    const _azDi = (i: RigaScontrino, k: number) => (perRigaSrv?.[k] ?? i.azienda) || null;

    /* LE SOCIETÀ CHE LA MERCE IMPONE. Solo quelle: se in carrello ci sono solo
       servizi la domanda è un'altra (chi emette), ed è già risolta sopra. */
    const aziendeMerce = useMemo(
        () => Array.from(new Set(itemsTutte.map((i, k) => _azDi(i, k)).filter(Boolean))) as string[],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [itemsTutte, perRigaSrv]);
    const multiSocieta = aziendeMerce.length > 1;

    const sezioni = useMemo(() => {
        if (!multiSocieta) return [] as { azienda: string; negozio: string; label: string; righe: { i: RigaScontrino; k: number }[]; totale: number }[];
        const per: Record<string, { i: RigaScontrino; k: number }[]> = {};
        aziendeMerce.forEach((a) => { per[a] = []; });
        itemsTutte.forEach((i, k) => {
            const az = _azDi(i, k) || assegna[_chiaveRiga(i, k)] || aziendeMerce[0];
            (per[az] ||= []).push({ i, k });
        });
        return aziendeMerce.map((a) => {
            const info = aziende.find((x) => x.code === a);
            const righeQui = per[a] || [];
            return {
                azienda: a,
                negozio: info?.negozio || data?.negozio || "",
                label: info?.label || a,
                righe: righeQui,
                totale: totaleRighe(righeQui.map((x) => x.i)),
            };
        });
    }, [multiSocieta, aziendeMerce, itemsTutte, assegna, aziende, data?.negozio]);

    /* IL «NON RISCOSSO» SEGUE IL SUO TELEFONO. Un finanziato dentro un carrello
       misto non è un caso di scuola: è permuta + telefono, la combinazione più
       comune che c'è. Se la riga «Finanziamento 1.359,90» finisse nella sezione
       sbagliata, uno scontrino direbbe di aver incassato soldi mai visti e
       l'altro non quadrerebbe. */
    const _nonRiscossi = useMemo(() => {
        const out: Record<string, { forma: string; importo: number }[]> = {};
        const orfani: { descrizione: string; importo: number }[] = [];
        telefoni.filter((t) => DOMANDE_TELEFONO[t.modo].scontrino).forEach((t) => {
            const forma = importi[t.chiave]?.forma || DOMANDE_TELEFONO[t.modo].forma || "";
            const importo = _n(importi[t.chiave]?.resto);
            if (!forma || importo <= 0) return;

            /* ⚠️ NON SI CERCA PER `codice`: la riga del telefono in carrello è
               la voce automatica «Telefono TNP (listino)», che il codice NON
               ce l'ha — lo dice il commento poco sopra e lo confermano le
               righe vere salvate. Cercando così la ricerca falliva SEMPRE e si
               ripiegava sulla «prima società che capita nell'ordine del
               carrello»: il non riscosso finiva sullo scontrino sbagliato, la
               sezione non quadrava e il pulsante restava spento per sempre —
               vicolo cieco, con permuta + finanziato che è la combinazione più
               comune che c'è (revisione ostile 02/09).
               Si cerca come fa `_righeCorrette`: prima l'IMEI, che dal 01/09 le
               righe se lo portano dietro, poi il codice se lo porta una riga
               sola, poi le parole in comune fra le righe che possono essere un
               telefono. */
            let riga = t.imei ? itemsTutte.find((i) => String(i.description || "").includes(String(t.imei))) : undefined;
            if (!riga && t.codice) {
                const cand = itemsTutte.filter((i) => !!i.codice && String(i.codice) === String(t.codice));
                if (cand.length === 1) riga = cand[0];
            }
            if (!riga) {
                const pt = _parole(t.descrizione);
                const paga = +(_n(importi[t.chiave]?.anticipo) + importo).toFixed(2);
                let meglio = 0, prezzoMeglio = -1;
                itemsTutte.forEach((r) => {
                    if (Number(r.reparto) !== 2) return;
                    const prezzo = Number(r.unitPrice) * (Number(r.qty) > 0 ? Number(r.qty) : 1);
                    if (!(prezzo + 0.02 >= paga)) return;
                    const pr = _parole(r.description);
                    let n = 0; pt.forEach((w) => { if (pr.has(w)) n++; });
                    if (n >= 2 && (n > meglio || (n === meglio && prezzo > prezzoMeglio))) { meglio = n; prezzoMeglio = prezzo; riga = r; }
                });
            }

            const az = riga ? _azDi(riga, itemsTutte.indexOf(riga)) : null;
            /* SE NON SI SA DI CHI È, NON SI INDOVINA. Attribuirlo alla società
               sbagliata farebbe incassare in contanti un importo finanziato. */
            if (!az) { orfani.push({ descrizione: t.descrizione, importo }); return; }
            (out[az] ||= []);
            const g = out[az].find((x) => x.forma === forma);
            if (g) g.importo = +(g.importo + importo).toFixed(2); else out[az].push({ forma, importo });
        });
        return { perAz: out, orfani };
    }, [telefoni, importi, itemsTutte]);
    const nonRiscossiPerAz = _nonRiscossi.perAz;

    /* OGNI SEZIONE NASCE COL SUO IMPORTO GIÀ SCRITTO e col cassetto della sua
       insegna: è la risposta giusta nove volte su dieci, e chi vuole cambiarla
       la cambia. Si rifà quando cambiano gli importi, non a ogni respiro. */
    const _firmaSez = sezioni.map((s2) => `${s2.azienda}:${s2.totale}:${s2.negozio}`).join("|");
    useEffect(() => {
        if (!sezioni.length) return;
        setRighePerAz((vecchie) => {
            const out: Record<string, RigaPagamento[]> = {};
            sezioni.forEach((s2) => {
                const v = vecchie[s2.azienda];
                const sommaV = (v || []).reduce((a, r) => a + (Number(r.importo) || 0), 0);
                /* si conserva quello che l'operatore ha già scelto, ma se il
                   totale è cambiato l'importo va riportato al vero: un residuo
                   vecchio farebbe uscire uno scontrino che non quadra. */
                if (v && v.length && Math.abs(sommaV - s2.totale) < 0.005) { out[s2.azienda] = v; return; }
                /* si ricostruisce come nel flusso normale: prima le forme già
                   decise dal telefono, poi quello che resta da incassare. */
                const fisse = nonRiscossiPerAz[s2.azienda] || [];
                const gia = fisse.reduce((x, r) => x + r.importo, 0);
                const resta = +(s2.totale - gia).toFixed(2);
                out[s2.azienda] = resta > 0.004
                    ? [{ forma: v?.[0]?.forma || "", importo: resta }, ...fisse]
                    : [...fisse];
            });
            return out;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [_firmaSez]);

    /* IL BILANCIO SI FA SEZIONE PER SEZIONE: uno scontrino che non quadra non
       esce, e non deve bloccare l'altro senza dire quale dei due è. */
    /* IL COUPON NON VALE SU DUE SCONTRINI: il server lo scarta (`nGruppi === 1`)
       e le sezioni chiedono il PIENO, mentre l'intestazione mostra il totale
       scontato. Due numeri che si contraddicono a schermo, e si poteva premere
       «Emetti» incassando il pieno. */
    const sezioniOk = !_nonRiscossi.orfani.length && !(coupon && scontoCoupon > 0) && sezioni.every((s2) => {
        const rr = righePerAz[s2.azienda] || [];
        const somma = +rr.reduce((a, r) => a + (Number(r.importo) || 0), 0).toFixed(2);
        return s2.totale <= 0.005 || (Math.abs(somma - s2.totale) < 0.005 && rr.every((r) => Number(r.importo) > 0 && !!r.forma));
    });
    const contantiDi = (az: string) => arrotonda5(
        +(righePerAz[az] || []).filter((r) => isFormaCash(r.forma)).reduce((a, r) => a + (Number(r.importo) || 0), 0).toFixed(2));

    const contantiTotali = +sezioni.reduce((a, s2) => a + contantiDi(s2.azienda), 0).toFixed(2);

    /** CHI EMETTERÀ, quando non lo sceglie l'operatore. Serve solo a scriverlo
     *  accanto alla domanda del cassetto: «la decide la merce» senza dire QUALE
     *  lascia in piedi il dubbio che fa scambiare le due domande. */
    const emittenti = multiSocieta
        ? sezioni.map((s2) => s2.label)
        : (aziendeMerce.length === 1
            ? [aziende.find((x) => x.code === aziendeMerce[0])?.label || aziendeMerce[0]]
            : []);

    /* SPOSTA UN SERVIZIO DA UNA SEZIONE ALL'ALTRA. La merce non si sposta: la
       sua società è un fatto, non una preferenza. */
    const spostaServizio = (i: RigaScontrino, k: number, verso: string) => {
        if (_azDi(i, k)) return;
        setAssegna((a) => ({ ...a, [_chiaveRiga(i, k)]: verso }));
    };

    // Incasso contanti via coda: enqueue → poll del job finché done/error.
    /** Toglie dalla coda un incasso che la cassa non ha ancora ritirato. */
    const fermaIncasso = async (jobId: string) => {
        try {
            await fetch("/api/vendita/incasso/annulla", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jobId }),
            });
        } catch { /* se non ci si riesce, resta la scadenza del server */ }
    };

    const incassaContanti = useCallback(async (amount: number, negozio: string | null) => {
        setFase("incasso");
        cancelCashRef.current = false;
        setMsg(`In attesa di ${eur(amount)} — il cliente inserisce i contanti nella cassa.`);
        try {
            const res = await fetch("/api/vendita/incasso", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ negozio, amount }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok || !j.jobId) throw new Error(j.error || "cassa non disponibile");
            const jobId = j.jobId as string;
            const start = Date.now();
            for (;;) {
                await new Promise((r) => setTimeout(r, POLL_MS));
                // Annulla dal CRM (spec Francesco): l'operatore ferma l'attesa. Il cliente
                // deve annullare anche sullo schermo della cassa se aveva già iniziato.
                if (cancelCashRef.current) {
                    /* SI TOGLIE DALLA CODA, se non l'ha ancora preso nessuno:
                       lasciandolo lì, il tentativo successivo si metteva DIETRO
                       e la macchina eseguiva prima quello abbandonato — cioè
                       chiedeva i soldi due volte. */
                    await fermaIncasso(jobId);
                    return { ok: false, cancelled: true, erroreMsg: "annullato dall'operatore" };
                }
                const { data: row } = await supabase.from("print_jobs").select("status, result").eq("id", jobId).single();
                if (row && (row.status === "done" || row.status === "error")) {
                    let out: any = {};
                    try { out = JSON.parse(row.result || "{}"); } catch { /* result non-JSON */ }
                    const ok = row.status === "done" && out.ok !== false && !out.errore;
                    return { ok, incassato: out.incassato ?? (ok ? amount : 0), resto: out.resto ?? 0, erroreMsg: out.msg || (row.status === "error" ? "errore cassa" : "") };
                }
                if (Date.now() - start > CASH_TIMEOUT_MS) {
                    await fermaIncasso(jobId);
                    return { ok: false, erroreMsg: "tempo scaduto: agente non attivo o cassa non risponde" };
                }
            }
        } catch (e: any) {
            return { ok: false, erroreMsg: String(e?.message || e) };
        }
    }, []);

    const stampaScontrino = useCallback(async (pagamenti: RigaPagamento[], couponPayload?: { code: string; sconto: number },
        perAzienda?: Record<string, RigaPagamento[]>) => {
        setFase("stampa");
        setMsg("Emissione scontrino fiscale…");
        try {
            const res = await fetch("/api/vendita/scontrino", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    negozio: data?.negozio ?? null,
                    deviceUrl: data?.deviceUrl,
                    items: itemsTutte,
                    /* la società la decide la MERCE, riga per riga — tranne
                       quando merce non ce n'è: lì l'ha scelta l'operatore */
                    azienda: soloServizi ? aziendaSel : null, aziendaScontrino: aziendaSel,
                    pagamenti,
                    /* I PAGAMENTI DI OGNI SOCIETÀ, quando il carrello ne ha due:
                       il server fa già due scontrini, ma fino a stasera i
                       pagamenti li buttava e usciva un CONTANTE secco su
                       entrambi. */
                    pagamentiPerAzienda: perAzienda || undefined,
                    contrattoId: data?.contrattoId ?? null,
                    /* IL CLIENTE VIAGGIA COL DOCUMENTO (Luca 01/09 sera): la
                       sezione Documenti deve poter aprire uno scontrino e dire
                       a chi è stato fatto, se no è un elenco di numeri. */
                    cliente: data?.cliente ?? null,
                    coupon: couponPayload,
                }),
            });
            const j = await res.json().catch(() => ({}));
            return { ok: res.ok && j.ok, ...j };
        } catch (e: any) {
            return { ok: false, error: String(e?.message || e) };
        }
    /* `itemsTutte` VA NELLE DIPENDENZE (revisore 01/09, difetto mio di
       stanotte). Da quando le righe comprendono anche quella dell'apparato
       FWA — che nasce dagli importi scritti nel modale — questa funzione
       teneva la fotografia del PRIMO render, quando gli importi erano ancora
       vuoti: il totale e la verifica usavano il valore vivo, la stampa quello
       vecchio. Lo scontrino usciva senza l'apparato, o non usciva affatto
       perché le righe erano zero. */
    }, [data, aziendaSel, itemsTutte, soloServizi]);

    /* LA SCHEDA CHE SI CHIUDE: con una vendita non ancora scritta, chiudere la
       finestra la faceva sparire. Questo hook DEVE stare PRIMA del "return null"
       qui sotto — un hook dopo un return condizionale cambia il numero di hook
       fra i render → React #310 (crash di Registra Vendita). Si auto-protegge
       dentro, quindi va chiamato sempre. */
    useEffect(() => {
        if (!data?.daRegistrare || fase === "fatto") return;
        const avvisa = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
        window.addEventListener("beforeunload", avvisa);
        return () => window.removeEventListener("beforeunload", avvisa);
    }, [data?.daRegistrare, fase]);

    if (!data) return null;

    const conferma = async () => {
        if (inCorso.current) return;
        inCorso.current = true;
        try { await _conferma(); } finally { inCorso.current = false; }
    };
    const _conferma = async () => {
        if (multiSocieta) {
            /* SI DICE QUALE DELLE DUE non torna: «manca qualcosa» davanti a due
               sezioni costringe a ricontrollarle entrambe. */
            const zoppa = sezioni.find((s2) => {
                const rr = righePerAz[s2.azienda] || [];
                const somma = +rr.reduce((x, r) => x + (Number(r.importo) || 0), 0).toFixed(2);
                return s2.totale > 0.005 && !(Math.abs(somma - s2.totale) < 0.005 && rr.every((r) => Number(r.importo) > 0 && !!r.forma));
            });
            if (zoppa) {
                const rr = righePerAz[zoppa.azienda] || [];
                const somma = +rr.reduce((x, r) => x + (Number(r.importo) || 0), 0).toFixed(2);
                const manca = +(zoppa.totale - somma).toFixed(2);
                setFase("errore");
                setMsg(`${zoppa.label}: ${!rr.every((r) => !!r.forma) ? "scegli come paga il cliente" : manca > 0 ? `manca ${eur(manca)}` : `pagamento eccedente di ${eur(-manca)}`}.`);
                return;
            }
        } else if (!bilanciato) {
            setFase("errore");
            setMsg(rimanente > 0 ? `Manca ${eur(rimanente)} da assegnare a una forma di pagamento.` : `Pagamento eccedente di ${eur(-rimanente)}.`);
            return;
        }
        const pagamenti = pagamentiSend();
        /* PRE-CHECK PRIMA DI QUALUNQUE INCASSO (revisore 29/08).
           Stava DENTRO il ramo dei contanti: pagando con carta si andava
           dritti alla stampa, e il POS fisico l'importo intero l'aveva già
           preso. La regola è la stessa per ogni forma di pagamento — non si
           incassa nulla che non si possa certificare — quindi la verifica
           esce dal ramo e si fa sempre. */
        setFase("stampa"); setMsg("Verifico lo scontrino…");
        let chk: any = {};
        try {
            const res = await fetch("/api/vendita/scontrino", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ negozio: data.negozio, items: itemsTutte, azienda: soloServizi ? aziendaSel : null, aziendaScontrino: aziendaSel, dryRun: true }),
            });
            chk = await res.json().catch(() => ({}));
            if (!res.ok) chk.ok = false;
            if (chk?.testMode) setIsTest(true);
        } catch (e: any) { chk = { ok: false, error: String(e?.message || e) }; }
        if (!chk.ok) {
            setFase("errore");
            setMsg("Scontrino non emettibile (" + (chk.error || "voci senza reparto") + "). Incasso NON avviato.");
            return;
        }
        /* ⚠️ L'ULTIMO CONTROLLO PRIMA DEI SOLDI (Luca 02/09). Se il server vede
           più società di quelle che questa finestra ha disegnato, mandarlo
           avanti significa far prendere i contanti alla macchina e poi
           incassare un rifiuto: soldi nel cassetto e nessuno scontrino.
           Non dovrebbe più capitare — le sezioni le disegna la risposta del
           server — ma se capitasse, ci si ferma qui, prima del cassetto. */
        if (Array.isArray(chk.aziende) && chk.aziende.length > 1 && !multiSocieta) {
            setFase("errore"); setErroreDi("pagamento");
            setMsg("Questo carrello contiene merce di più società e va emesso come più scontrini, "
                + "ma la finestra non è riuscita a dividerlo. Chiudi e rifai la vendita: nessun incasso è stato avviato.");
            return;
        }
        /* ⭐ UN SOLO CASSETTO, ANCHE CON DUE SCONTRINI (Luca 02/09): «quando
           selezionano cash, anche se sono due scontrini, l'importo va incassato
           su una sola cash machine, non su due, perché non ha senso».
           Ha ragione: il cliente tira fuori i soldi una volta sola, e la
           macchina calcola il resto sul totale. Chiedendone due, a Magliana la
           prima ha preso 5 € e reso 3, la seconda non si è mai accesa e la
           vendita è rimasta in mezzo al guado. Gli scontrini restano due —
           quelli li impone la partita IVA — l'incasso no. */
        if (multiSocieta && contantiTotali > 0 && !cashDone) {
            if (chk?.testMode) {
                setIncassato(contantiTotali); setResto(0); setCashDone(true); setPaidCash(contantiTotali);
            } else {
                const r = await incassaContanti(contantiTotali, cassaSel || data.negozio);
                if (!r || !r.ok) {
                    if (r?.cancelled) { setFase("scelta"); setMsg(""); return; }
                    setFase("errore"); setErroreDi("pagamento");
                    setMsg("Incasso non riuscito: " + (r?.erroreMsg || "annullato") + ". Lo scontrino NON è stato emesso.");
                    return;
                }
                setIncassato(r.incassato ?? contantiTotali);
                setResto(r.resto ?? 0);
                setPaidCash(contantiTotali);
                setCashDone(true);
            }
        }
        // Incasso contanti (una sola volta) se c'è una quota contanti e non è già fatta.
        if (!multiSocieta && cashRounded > 0 && !cashDone) {
            if (chk?.testMode) {
                /* PROVA / gestionale (spec Francesco 31/08): NON si chiama la cassa
                   automatica. Si segna l'importo come pagato in contanti — lo scontrino
                   gestionale riporta comunque la riga contanti — così il test scorre
                   senza inserire soldi veri nella macchina. */
                setIncassato(cashRounded); setResto(0); setCashDone(true); setPaidCash(cashRounded);
            } else {
                const r = await incassaContanti(cashRounded, cassaSel || data.negozio);
                if (!r || !r.ok) {
                    if (r?.cancelled) { setFase("scelta"); setMsg(""); return; }  // annullato: si torna al pagamento
                    setFase("errore"); setErroreDi("pagamento");
                    setMsg("Incasso non riuscito: " + (r?.erroreMsg || "annullato") + ". Lo scontrino NON è stato emesso.");
                    return;
                }
                setIncassato(r.incassato ?? cashRounded);
                setResto(r.resto ?? 0);
                setCashDone(true);
                setPaidCash(cashRounded);
            }
        }
        const p = await stampaScontrino(
            pagamenti,
            coupon ? { code: coupon.code, sconto: scontoCoupon } : undefined,
            multiSocieta ? Object.fromEntries(sezioni.map((s2) => [s2.azienda,
                (righePerAz[s2.azienda] || []).filter((r) => Number(r.importo) > 0).map((r) => ({
                    forma: r.forma,
                    importo: isFormaCash(r.forma) ? arrotonda5(Number(r.importo)) : +Number(r.importo).toFixed(2),
                }))])) : undefined);
        setEsclusi(Array.isArray(p.esclusi) ? p.esclusi : []);
        if (!p.ok) {
            setFase("errore"); setErroreDi("scontrino");
            setMsg("Scontrino non emesso: " + (p.error || "errore"));
            return;
        }
        if (p.testMode) setIsTest(true);
        if (p.nuovoCoupon) setNuovoCoupon(p.nuovoCoupon);
        // Se si stava COMPLETANDO un conto in sospeso, chiudilo.
        if (data.sospesoId) {
            try { await fetch("/api/vendita/sospendi", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: data.sospesoId, stato: "completata" }) }); } catch { /* non bloccare l'esito */ }
        }
        /* ═══ LO SCONTRINO È DAVVERO USCITO? (Luca 01/09) ═══════════════════
           «Ci eravamo detti che la vendita doveva essere registrata solo dopo
           che lo scontrino è confermato… altrimenti rischiamo che registrano
           le vendite con la stampante fiscale spenta e la vendita si registra
           comunque.»

           Aveva ragione: `p.ok` è la risposta di chi METTE IN CODA il lavoro,
           non dell'agente che stampa. Con l'agente spento il lavoro veniva
           accodato, la risposta era «ok», e la vendita si scriveva lo stesso.
           Oggi è successo davvero: due ricariche vere con «agente non attivo».

           ⚠️ MA NON SI PUÒ ASPETTARE ALL'INFINITO. Misurato sugli ultimi due
           giorni: l'agente conferma in 8 secondi (mediana), ma una volta su
           venti ci mette più di quattro minuti. Tenere la cassa ferma tutto
           quel tempo, col cliente davanti, sarebbe peggio del male che cura.

           Perciò si distinguono due cose diverse:
           • il lavoro va in ERRORE → è certo che non ha stampato: ci si ferma
             e si chiede, perché registrare sarebbe una vendita senza
             documento;
           • il tempo scade senza risposta → non si sa: si registra (la
             vendita non si perde) ma lo si DICE, e la riga resta segnata come
             scontrino non confermato. */
        const jobIds: string[] = Array.isArray(p.receipts) ? p.receipts.map((r: { jobId?: string }) => r.jobId).filter(Boolean) : [];
        let stampaConfermata: boolean | null = null;
        if (jobIds.length && !p.testMode) {
            setFase("stampa"); setMsg("Scontrino in stampa — attendo la conferma del registratore…");
            const inizio = Date.now();
            for (;;) {
                const { data: righe } = await supabase.from("print_jobs").select("id, status, result").in("id", jobIds);
                const stati = (righe || []).map((r) => r.status);
                if (stati.length === jobIds.length && stati.every((x) => x === "done")) { stampaConfermata = true; break; }
                const fallito = (righe || []).find((r) => r.status === "error");
                if (fallito) {
                    let dett = "";
                    try { dett = JSON.parse(fallito.result || "{}")?.msg || ""; } catch { dett = String(fallito.result || "").slice(0, 120); }
                    setCommitFail(true);
                    setFase("errore");
                    setMsg("⛔ Il registratore NON ha stampato lo scontrino" + (dett ? ` (${dett})` : "") +
                        ". La vendita NON è stata registrata: controlla la stampante e riprova. " +
                        "Se hai già incassato e vuoi registrare comunque, premi «Salva vendita».");
                    return;
                }
                if (Date.now() - inizio > ATTESA_STAMPA_MS) { stampaConfermata = null; break; }
                await new Promise((r) => setTimeout(r, POLL_MS));
            }
        }

        // (b) SALVATAGGIO DIFFERITO: ora che lo scontrino è EMESSO, scrivi la vendita a DB.
        // Se fallisce, lo scontrino è comunque uscito → si offre il retry del solo salvataggio.
        if (onCommit) {
            setFase("stampa"); setMsg("Scontrino emesso — registro la vendita…");
            const c = await onCommit({ contoTerzi: contoTerziDaSalvare, azienda: soloServizi ? aziendaSel : null, aziendaScontrino: aziendaSel });
            if (!c || !c.ok) {
                setCommitFail(true);
                setFase("errore");
                setMsg("⚠️ Scontrino EMESSO correttamente, ma la vendita NON è stata salvata (" + (c?.error || "errore") + "). Premi «Salva vendita» per riprovare SOLO il salvataggio — lo scontrino NON verrà riemesso.");
                return;
            }
        }
        setFase("fatto");
        setMsg((p.testMode ? "Documento NON fiscale in stampa (prova)"
                : stampaConfermata ? "Scontrino fiscale STAMPATO"
                : "⚠️ Vendita registrata, ma il registratore non ha ancora confermato la stampa: controlla che lo scontrino sia uscito")
            + (p.esclusi?.length ? ` — ${p.esclusi.length} voci senza reparto NON stampate` : ""));
    };

    // (b) Retry del SOLO salvataggio quando lo scontrino è già uscito ma il commit è fallito.
    const retrySalvataggio = async () => {
        if (!onCommit) { setCommitFail(false); setFase("fatto"); return; }
        setFase("stampa"); setMsg("Registro la vendita…");
        const c = await onCommit({ contoTerzi: contoTerziDaSalvare, azienda: soloServizi ? aziendaSel : null, aziendaScontrino: aziendaSel });
        if (!c || !c.ok) {
            setCommitFail(true); setFase("errore");
            setMsg("⚠️ Salvataggio ancora non riuscito (" + (c?.error || "errore") + "). Riprova o annota la vendita a mano. Lo scontrino è già stato emesso.");
            return;
        }
        setCommitFail(false);
        setFase("fatto");
        setMsg("Vendita registrata. Scontrino già emesso.");
    };

    /* ═══ USCIRE BUTTA LA VENDITA — E VA DETTO OGNI VOLTA (revisore 31/08) ══
       Da quando la registrazione è differita, chiudere il modale non lascia
       niente a database. È la cosa giusta — quella vendita non è stata né
       pagata né scontrinata — ma fino a ieri chiudere la lasciava SALVATA, e
       chi lavora ha quell'abitudine in mano.
       L'avviso c'era solo sulla × in fase «scelta». Mancava proprio dove fa
       più male: il pannello di ERRORE, dove i contanti possono essere GIÀ nel
       cassetto e la stampante non aver aperto lo scontrino. Scenario misurato
       dal revisore su job veri: iPhone da 899 €, macchina incassa, stampa
       fallita, il venditore preme «Chiudi» — 899 € nel cassetto, zero
       contratti, zero bozza, niente da cui ripartire. */
    const chiudiConCautela = () => {
        /* ⭐ SI CHIEDE SOLO SE CI SONO SOLDI DI MEZZO (Luca 02/09): «se clicco
           sulla ×, perché magari ho sbagliato a mettere l'importo
           dell'articolo, devo semplicemente poter chiudere quella sezione
           tornando al carrello, senza nessun popup».
           Ha ragione, e adesso è anche vero: il carrello non viene più buttato
           all'apertura della cassa, quindi chiudere non perde niente — si
           torna indietro a correggere il prezzo, che è il gesto per cui la ×
           esiste. L'avviso a ogni chiusura era diventato rumore, e il rumore
           si impara a scavalcare senza leggerlo.
           RESTA dove serve davvero: quando la macchina ha GIÀ preso i contanti
           e lo scontrino non è uscito. Lì uscire lascia i soldi nel cassetto e
           niente a database — lo scenario dell'iPhone da 899 € — e non è una
           chiusura, è una perdita. */
        if (cashDone && incassato > 0 && fase !== "fatto") {
            const testo = `Hai GIÀ incassato ${eur(incassato)} in contanti, ma la vendita non è ancora registrata.\n\n`
                + `Uscendo adesso il CRM non ne saprà niente: nessun contratto, nessuno scontrino.\n\n`
                + `Prova prima «Ristampa scontrino». Vuoi davvero uscire?`;
            if (!window.confirm(testo)) return;
        }
        onDone();
    };

    // Annulla l'attesa dei contanti dal CRM (spec Francesco 31/08). Il loop di poll
    // legge il flag e si ferma; si torna alla scelta del pagamento.
    const annullaIncasso = () => { cancelCashRef.current = true; setMsg("Annullo incasso…"); };

    /* «TIENI IN SOSPESO»: salva il conto per completarlo dopo (il cliente torna
       a pagare).

       PRIMA SI REGISTRA LA VENDITA (revisore 31/08 — era il difetto più grave
       di tutta la sezione). Nel flusso a soli PRODOTTI il salvataggio è
       differito: contratti, magazzino e usati si scrivono solo quando lo
       scontrino esce, e la funzione che li scrive vive in `pendingCommit`.
       «Tieni in sospeso» faceva solo la POST del conto e non la chiamava mai;
       alla ripresa, `riprendiSospeso` azzerava `pendingCommit`. Risultato: si
       incassava, lo scontrino fiscale usciva davvero, e nel CRM non restava
       NIENTE — nessun contratto, nessuna marginalità, nessuna provvigione,
       nessuno scarico di magazzino. Il negozio non veniva pagato per quella
       vendita, e la cassa fisica e il software divergevano.
       Un conto in sospeso è una vendita REGISTRATA che aspetta lo scontrino:
       è l'unico modo di registrarne una senza scontrino, e per questo pulsa
       rosso. Se il salvataggio non riesce, non si sospende niente. */
    const tieniInSospeso = async () => {
        if (onCommit) {
            setFase("stampa"); setMsg("Registro la vendita…");
            /* `sospesa` LO DICE AL REGISTRO DELLE RICARICHE: qui la vendita è
               scritta ma NON pagata e NON scontrinata, e chi carica il credito
               a mano deve saperlo (revisione ostile 02/09). */
            const c = await onCommit({ contoTerzi: contoTerziDaSalvare, azienda: soloServizi ? aziendaSel : null, aziendaScontrino: aziendaSel, sospesa: true });
            if (!c || !c.ok) {
                setCommitFail(true); setFase("errore");
                setMsg("⚠️ Non sono riuscito a registrare la vendita (" + (c?.error || "errore") + "). Il conto NON è stato messo in sospeso: riprova, o annota la vendita a mano.");
                return;
            }
        }
        setFase("stampa"); setMsg("Salvo il conto in sospeso…");
        try {
            const res = await fetch("/api/vendita/sospendi", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ negozio: data.negozio, cliente: data.cliente ?? null, items: itemsTutte, telefoni, totale, azienda: aziendaSel }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok || !j.ok) throw new Error(j.error || "salvataggio non riuscito");
            setFase("fatto");
            setMsg("Conto tenuto in sospeso — riprendilo dal pulsante «Conti in sospeso» in Registra Vendita.");
        } catch (e: any) {
            setFase("errore"); setMsg("Sospensione non riuscita: " + String(e?.message || e));
        }
    };

    // ── coupon ────────────────────────────────────────────────────────────────
    const applyCoupon = async () => {
        setCouponMsg("");
        const code = couponInput.trim().toUpperCase();
        if (!code) return;
        try {
            const res = await fetch("/api/vendita/coupon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "valida", code }) });
            const j = await res.json().catch(() => ({}));
            if (!j.valido) { setCouponMsg("Coupon non valido: " + (j.motivo || "sconosciuto")); return; }
            const valore = Number(j.valore_residuo) || 0;
            const sconto = +Math.min(valore, totale).toFixed(2);
            setCoupon({ code: j.code || code, valore, sconto });
            setRighe(rifaiRighe(+(totale - sconto).toFixed(2)));
            setCouponInput("");
        } catch { setCouponMsg("Errore nella verifica del coupon."); }
    };
    const removeCoupon = () => { setCoupon(null); setCouponMsg(""); setRighe(rifaiRighe(totale)); };

    // ── gestione righe pagamento ──────────────────────────────────────────────
    const setForma = (i: number, forma: string) => setRighe((rs) => rs.map((r, k) => (k === i ? { ...r, forma } : r)));
    const setImporto = (i: number, val: string) => {
        const n = Math.max(0, Number(String(val).replace(",", ".")) || 0);
        setRighe((rs) => rs.map((r, k) => (k === i ? { ...r, importo: n } : r)));
    };
    const addRiga = () => setRighe((rs) => {
        if (rs.length >= 3) return rs;
        const usate = new Set(rs.map((r) => r.forma));
        const next = FORME_A_MANO.find((f) => !usate.has(f.code)) || FORME_A_MANO[1];
        const manca = +(totaleDaPagare - rs.reduce((s, r) => s + (Number(r.importo) || 0), 0)).toFixed(2);
        return [...rs, { forma: next.code, importo: manca > 0 ? manca : 0 }];
    });
    const removeRiga = (i: number) => setRighe((rs) => (rs.length <= 1 ? rs : rs.filter((_, k) => k !== i)));

    return createPortal(
        /* ⚠️ LA FINESTRA DEVE POTER SCORRERE (revisione design 02/09). Con due
           sezioni, un telefono finanziato e tre voci per parte il pannello
           misura 1116px: l'intestazione usciva sopra e «Incassa ed emetti»
           restava 149px SOTTO la piega — e non si scorreva, perché l'overlay
           è `fixed` e non partecipa allo scorrimento della pagina. Cioè il
           pagamento non si poteva concludere, su nessun monitor: ne servivano
           1148px utili, che un 1920×1080 a schermo intero non ha.
           `items-start` e non `items-center`: centrato, un pannello più alto
           della finestra si taglia in cima e la parte sopra non si raggiunge
           nemmeno scorrendo. */
        <div className="fixed inset-0 z-[120] overflow-y-auto flex items-start justify-center p-4 bg-black/60 backdrop-blur-sm">
            {/* PIÙ LARGO (Luca 31/08): a `max-w-md` i tre pulsanti di pagamento
                finivano a «Co… Ca… Bo…» — tre etichette tagliate che bisogna
                indovinare, sull'ultimo gesto della vendita. Lo spazio c'è. */}
            {/* ⭐ E ANCORA PIÙ LARGO CON DUE SOCIETÀ, MA SOLO LÌ (Luca 02/09):
                «mi piacerebbe invece allargare molto quella finestra, in quel
                caso solo, e metterli di lato».
                A 672px i due scontrini stanno per forza uno sotto l'altro, e
                per confrontarli — o per trascinare una voce dall'uno all'altro
                — bisogna scorrere: cioè il gesto che deve essere ovvio diventa
                il più scomodo della finestra. A 1024 stanno affiancati e si
                vedono insieme.
                ⚠️ `w-full` TIENE IL TETTO: su un 1024×768 il massimo diventa
                992px (la finestra meno il margine), non 1024, quindi non esce
                mai dallo schermo. E la vendita a UNA società resta a
                `max-w-2xl`, identica a ieri: è il 99% dei casi e non si tocca. */}
            <div className={"glass-panel w-full p-6 space-y-4 my-auto " + (multiSocieta ? "max-w-5xl" : "max-w-2xl")}>
                <div className="flex items-baseline justify-between">
                    <h3 className="text-lg font-bold text-white">🧾 Incasso &amp; Scontrino</h3>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">{data.negozio || "—"}{isTest ? " · PROVA (non fiscale)" : ""}</span>
                        {/* X per uscire dal modale PRIMA di emettere (spec Francesco): non durante
                            l'incasso/stampa in corso, per non lasciare un'operazione a metà. */}
                        {fase !== "incasso" && fase !== "stampa" && (
                            <button type="button" onClick={chiudiConCautela} title="Chiudi senza emettere" aria-label="Chiudi"
                                className="shrink-0 w-7 h-7 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 text-lg leading-none flex items-center justify-center">×</button>
                        )}
                    </div>
                </div>

                {/* ⚠️ CON DUE SCONTRINI QUESTO ELENCO È UN DOPPIONE, e costa
                    176px in una finestra che a 768px già non ci sta. Le stesse
                    voci stanno tutte, una per una, dentro le due sezioni qui
                    sotto — divise per società, che è l'informazione in più.
                    Sparisce SOLO nella schermata del pagamento: nelle altre
                    fasi (stampa, fatto, errore) le sezioni non ci sono e
                    l'elenco resta l'unico posto dove si legge cosa si è
                    venduto. */}
                {!(multiSocieta && fase === "scelta") && (
                <div className="rounded-xl bg-white/5 border border-white/10 divide-y divide-white/5 max-h-40 overflow-y-auto">
                    {itemsTutte.map((r, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-1.5 text-sm">
                            <span className="text-slate-200 truncate mr-2">{r.description}{(r.qty ?? 1) > 1 ? ` ×${r.qty}` : ""}</span>
                            <span className="text-slate-100 tabular-nums whitespace-nowrap">{eur((Number(r.unitPrice) || 0) * (Number(r.qty) > 0 ? Number(r.qty) : 1))}</span>
                        </div>
                    ))}
                </div>
                )}

                <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Totale</span>
                    <span className={"font-bold tabular-nums " + (scontoCoupon > 0 ? "text-slate-500 line-through text-base" : "text-white text-xl")}>{eur(totale)}</span>
                </div>
                {scontoCoupon > 0 && (
                    <div className="flex items-center justify-between text-sm -mt-2">
                        <span className="text-emerald-300">🎟️ Sconto coupon {eur(-scontoCoupon)} · da pagare</span>
                        <span className="text-white font-bold text-xl tabular-nums">{eur(totaleDaPagare)}</span>
                    </div>
                )}

                {/* ═══ PRIMA GLI IMPORTI DEL TELEFONO ══════════════════════
                    Luca 01/09: «lo step finale dello scontrino deve chiedere
                    anticipo e importo finanziato». Viene prima del pagamento
                    perché finché non si sanno quei due numeri il totale dello
                    scontrino non esiste: la riga del telefono vale
                    anticipo + finanziato, e l'IVA è dovuta su tutto. */}
                {fase === "telefoni" && (
                    <div className="space-y-3">
                        <div className="text-sm text-slate-300">
                            Prima di incassare servono gli importi del telefono. Il resto lo scriverà
                            il CRM sullo scontrino: la parte che non incassiamo esce come <b>non riscossa</b>,
                            così non finisce nei flussi di cassa.
                        </div>
                        {/* QUESTI DUE NUMERI FANNO IL PREZZO SULLO SCONTRINO, e non
                            devono tornare col listino: la differenza la assorbe
                            l'operatore telefonico, perché è un cliente suo. Un
                            TCL K70 da 159,90 di listino, con anticipo 0 e
                            rateizzato 109,90, sullo scontrino vale 109,90 — e
                            al cliente si chiedono solo gli altri articoli del
                            carrello. */}
                        {telefoni.map((t) => {
                            const q = DOMANDE_TELEFONO[t.modo];
                            const i = importi[t.chiave] || { anticipo: "", resto: "", forma: "" };
                            const set = (k: "anticipo" | "resto" | "forma", v: string) =>
                                setImporti((p) => ({ ...p, [t.chiave]: { ...i, [k]: v } }));
                            return (
                                <div key={t.chiave} className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="text-sm font-semibold text-white truncate">{t.descrizione}</span>
                                        <span className="text-[11px] text-slate-400 whitespace-nowrap">{q.titolo}</span>
                                    </div>
                                    {t.imei
                                        ? <div className="text-[11px] text-slate-400 tabular-nums">IMEI {t.imei}</div>
                                        : <div className="text-[11px] text-amber-300">Manca l&apos;IMEI: lo scontrino uscirà senza.</div>}
                                    <div className="flex gap-2 flex-wrap">
                                        <label className="flex-1 min-w-[130px]">
                                            <span className="block text-[11px] text-slate-400 mb-1">Anticipo incassato €</span>
                                            <input value={i.anticipo} onChange={(e) => set("anticipo", e.target.value)}
                                                inputMode="decimal" placeholder="0,00"
                                                className="w-full rounded-lg bg-black/30 border border-white/10 px-2.5 py-2 text-sm text-white tabular-nums" />
                                        </label>
                                        {q.scontrino && (
                                            <label className="flex-1 min-w-[130px]">
                                                <span className="block text-[11px] text-slate-400 mb-1">{q.resto} €</span>
                                                <input value={i.resto} onChange={(e) => set("resto", e.target.value)}
                                                    inputMode="decimal" placeholder="0,00"
                                                    className="w-full rounded-lg bg-black/30 border border-white/10 px-2.5 py-2 text-sm text-white tabular-nums" />
                                            </label>
                                        )}
                                    </div>
                                    {/* CONTO TERZI: l'anticipo lo incassiamo NOI ma la fattura
                                        la manda Vodafone. Non finisce sullo scontrino, però
                                        la modalità va chiesta lo stesso: serve al flusso di
                                        cassa e al conto con Vodafone, che deve rimborsare la
                                        differenza fra quanto abbiamo pagato il telefono e
                                        questo anticipo. Senza, sono soldi che entrano e non
                                        si sa da dove. */}
                                    {!q.scontrino && (
                                        <div className="flex gap-2">
                                            {FORME_A_MANO.map((f) => (
                                                <button key={f.code} type="button" onClick={() => set("forma", f.code)}
                                                    className={"flex-1 rounded-lg border px-2 py-2 text-xs font-semibold " +
                                                        (i.forma === f.code ? "bg-violet-500/25 border-violet-400/70 text-white"
                                                            : "bg-white/5 border-white/10 text-slate-300")}>
                                                    {f.icona} {f.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {/* FWA: la forma la sceglie l'utente, perché il cliente può
                                        averlo finanziato o preso in VAR e il CRM non lo sa */}
                                    {t.modo === "w3_fwa" && (
                                        <div className="flex gap-2">
                                            {["FINANZIAMENTO", "NON_RISCOSSO"].map((f) => (
                                                <button key={f} type="button" onClick={() => set("forma", f)}
                                                    className={"flex-1 rounded-lg border px-2 py-2 text-xs font-semibold " +
                                                        (i.forma === f ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-100"
                                                            : "bg-white/5 border-white/10 text-slate-300")}>
                                                    {f === "FINANZIAMENTO" ? "🏛️ Finanziamento" : "📄 VAR / Non riscosso"}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <div className="text-[11px] text-slate-400">
                                        {q.nota}
                                        {!q.scontrino && <> — <b className="text-amber-300">per questo importo NON esce lo scontrino</b>: lo incassi per conto di Vodafone, che fattura lei al cliente.</>}
                                    </div>
                                </div>
                            );
                        })}
                        <button type="button" onClick={() => {
                            /* PASSANDO AL PAGAMENTO le righe non riscosse sono
                               GIÀ decise: il finanziato e il rateizzato non si
                               scelgono, li ha decisi il tipo di vendita. Restano
                               a schermo come riquadro fisso — il modale le
                               riconosce e non offre i pulsanti — e all'operatore
                               resta da dire solo come incassa il resto. */
                            /* NIENTE DA SCONTRINARE, MA QUALCOSA DA INCASSARE
                               (revisore 01/09). Vodafone Business a rate: la
                               riga automatica del telefono non c'è e lo
                               scontrino non è dovuto — quindi il carrello
                               resta vuoto. Prima si finiva nella schermata di
                               pagamento con «non c'è niente da incassare», si
                               premeva Emetti, il server rispondeva «carrello
                               vuoto» e da lì non si usciva più: né avanti né
                               indietro, e la vendita si buttava.
                               Qui invece si chiude come dev'essere: la vendita
                               si registra, l'anticipo resta archiviato con la
                               sua modalità, e nessuno scontrino esce. */
                            /* SOLO SE NESSUN TELEFONO VUOLE LO SCONTRINO
                               (revisore 01/09). La condizione guardava solo il
                               carrello vuoto, e prendeva dentro anche i casi
                               WindTre: una FWA venduta da sola — dove il fisso
                               non genera nessuna voce automatica — chiudeva la
                               vendita SENZA scontrino, dicendo pure «incassato
                               per conto di Vodafone» su una vendita WindTre.
                               L'apparato usciva dal negozio senza documento. */
                            if (!itemsTutte.length && telefoni.every(t => !DOMANDE_TELEFONO[t.modo].scontrino)) {
                                setFase("stampa"); setMsg("Registro la vendita…");
                                (async () => {
                                    if (onCommit) {
                                        const c = await onCommit({ contoTerzi: contoTerziDaSalvare, azienda: soloServizi ? aziendaSel : null, aziendaScontrino: aziendaSel });
                                        if (!c || !c.ok) {
                                            setCommitFail(true); setFase("errore");
                                            setMsg("⚠️ Non sono riuscito a registrare la vendita (" + (c?.error || "errore") + "). Riprova.");
                                            return;
                                        }
                                    }
                                    setFase("fatto");
                                    setMsg("Vendita registrata. Nessuno scontrino: l'anticipo è incassato per conto di Vodafone, che fattura lei al cliente.");
                                })();
                                return;
                            }
                            setRighe(rifaiRighe(+(totale - scontoCoupon).toFixed(2)));
                            setFase("scelta");
                        }}
                            disabled={telefoni.some((t) => {
                                const i = importi[t.chiave] || { anticipo: "", resto: "", forma: "" };
                                const q = DOMANDE_TELEFONO[t.modo];
                                if (i.anticipo.trim() === "") return true;                       // anche zero va scritto
                                if (q.scontrino && i.resto.trim() === "") return true;
                                if (t.modo === "w3_fwa" && !i.forma) return true;
                                // conto terzi: l'anticipo si incassa, quindi si dice come
                                if (!q.scontrino && _n(i.anticipo) > 0 && !i.forma) return true;
                                return false;
                            })}
                            className="w-full primary-btn py-2.5 text-sm font-semibold disabled:opacity-40">
                            Avanti · come si paga
                        </button>
                    </div>
                )}

                {fase === "scelta" && (
                    <>
                                                {/* ═══ LA SOCIETÀ NON SI SCEGLIE PIÙ (Luca 31/08) ═══════════
                            «La ragione sociale non deve più chiedermela, perché lui sa
                            benissimo su quale società è caricato il prodotto.»
                            È vero, e il server lo faceva già: la società di ogni riga
                            viene dal catalogo, dalla riga stessa o dalla giacenza a
                            magazzino, e QUESTO selettore era solo l'ultimo ripiego per
                            le righe che una società non ce l'hanno da nessuna parte.
                            Chiederla ogni volta significava far decidere all'operatore
                            una cosa che il sistema sa meglio di lui — e sbagliarla vuol
                            dire emettere uno scontrino con la partita IVA sbagliata.
                            Il carrello misto non arriva più fin qui: si ferma quando si
                            aggiunge il secondo prodotto (`addMargItem`). */}
                        {/* ⬇️ LE DUE DOMANDE — chi emette lo scontrino e in quale
                            cassetto entrano i contanti — sono scese in fondo, dove si
                            sceglie come paga il cliente: è lì che Luca ha chiesto di
                            trovarle («nel momento in cui andiamo a chiedere il metodo
                            di pagamento»). Il blocco si chiama «Dove va questa
                            vendita» e sta subito sotto le forme di pagamento. */}

                        {/* Coupon: sconto che abbassa l'imponibile (sostituisce "Altro") */}
                        <div className="space-y-1.5">
                            <p className="text-[11px] text-slate-500">Coupon sconto (dal ritiro usato)</p>
                            {!coupon ? (
                                <div className="flex gap-2">
                                    <input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") applyCoupon(); }}
                                        placeholder="CPN-XXX-XXXX" spellCheck={false}
                                        className="flex-1 rounded-xl bg-white/5 border border-white/10 text-slate-100 text-sm px-3 py-2 outline-none focus:border-emerald-400/60 uppercase tracking-wide" />
                                    <button type="button" onClick={applyCoupon} disabled={!couponInput.trim()}
                                        className="shrink-0 px-4 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-sm font-semibold hover:bg-emerald-500/30 disabled:opacity-40">Applica</button>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-400/30 px-3 py-2">
                                    <span className="text-sm text-emerald-200">🎟️ {coupon.code} — sconto {eur(scontoCoupon)}{coupon.valore > scontoCoupon ? ` (di ${eur(coupon.valore)})` : ""}</span>
                                    <button type="button" onClick={removeCoupon} className="text-emerald-300/70 hover:text-rose-300 text-lg leading-none">×</button>
                                </div>
                            )}
                            {couponMsg && <p className="text-[11px] text-rose-300">{couponMsg}</p>}
                        {/* si può applicare anche prima, dal carrello: qui resta
                            per chi riprende un conto sospeso o se lo ricorda tardi */}
                        </div>

                        {/* ═══ DUE SOCIETÀ: DUE SCONTRINI, DUE INCASSI ═══════════════
                            Compare solo nei quattro locali che dentro hanno due
                            punti vendita. Ogni riquadro è uno scontrino: sopra
                            la società che lo emette, dentro le sue voci, sotto
                            come paga il cliente e in quale cassetto entrano i
                            contanti. I servizi si trascinano da un riquadro
                            all'altro — o si spostano col pulsante, che sui
                            banconi con lo schermo tattile è l'unico gesto che
                            funziona sempre. */}
                        {multiSocieta && (
                            <div className="space-y-3">
                                <p className="text-[11px] text-slate-300">
                                    Nel carrello c&apos;è merce di <b className="text-white">{sezioni.length} società</b>: sono {sezioni.length} scontrini,
                                    ognuno con il suo incasso. <span className="text-slate-400">📦 la merce sta dove la mette il magazzino e non si muove;</span>{" "}
                                    <span className="text-sky-200">🔧 servizi e ricariche li sposti tu — trascinali, o usa il pulsante →.</span>
                                </p>
                                {/* ⭐ AFFIANCATI, NON UNO SOTTO L'ALTRO (Luca 02/09): «ho
                                    fatto una simulazione e ho visto che questi vengono
                                    messi uno sotto l'altro. Mi piacerebbe invece […]
                                    metterli di lato, una a fianco all'altra».
                                    Due scontrini si confrontano, non si leggono in fila:
                                    e una voce si trascina dall'uno all'altro solo se
                                    l'altro è a schermo nello stesso momento. Sotto i
                                    1024px si torna in colonna — a quel punto affiancarli
                                    li spezzerebbe soltanto, e gli undici negozi con una
                                    cassa sola qui non ci arrivano nemmeno.
                                    ⚠️ E NON `lg:` (revisione ostile 02/09, difetto mio):
                                    `lg` scatta a 1024px ESATTI, misurati sulla finestra
                                    AL NETTO della barra di scorrimento. Su un 1024×768 —
                                    che è uno dei due monitor di riferimento — con la barra
                                    classica di Windows la media query vede 1009px e NON
                                    scatta: le due sezioni tornavano una sotto l'altra
                                    proprio sullo schermo per cui erano state affiancate.
                                    La mia misura non l'aveva visto perché Chrome headless
                                    girava con `--hide-scrollbars`. A 960 il margine c'è. */}
                                <div className="grid grid-cols-1 min-[960px]:grid-cols-2 gap-3 items-start">
                                {sezioni.map((s2) => {
                                    const altre = sezioni.filter((x) => x.azienda !== s2.azienda);
                                    const rr = righePerAz[s2.azienda] || [];
                                    const somma = +rr.reduce((x, r) => x + (Number(r.importo) || 0), 0).toFixed(2);
                                    const manca = +(s2.totale - somma).toFixed(2);
                                    const quadra = s2.totale <= 0.005 || (Math.abs(manca) < 0.005 && rr.every((r) => Number(r.importo) > 0 && !!r.forma));
                                    const contanti = contantiDi(s2.azienda);
                                    /* IL RIQUADRO SOTTO IL PUNTATORE. Si accende solo se
                                       la riga che si ha in mano può DAVVERO finire qui:
                                       niente merce, e non quella che già ci sta. Un
                                       riquadro che si accende e poi rifiuta è peggio di
                                       uno che non si accende. */
                                    const bersaglio = sopra === s2.azienda;
                                    /** Questa riga può passare su questo riquadro? */
                                    const _accetta = (k: number | null) => {
                                        if (k == null) return false;
                                        const riga = itemsTutte[k];
                                        if (!riga || _azDi(riga, k)) return false;          // la merce non si sposta
                                        return !s2.righe.some((x) => x.k === k);            // ed è già qui
                                    };
                                    return (
                                        <div key={s2.azienda}
                                            onDragOver={(e) => {
                                                /* `preventDefault` È il consenso al rilascio: senza,
                                                   il browser mostra il divieto e `onDrop` non arriva.
                                                   Si legge il RIFERIMENTO e non lo stato, che al primo
                                                   evento può non essere ancora arrivato. */
                                                if (!_accetta(trascinoRef.current)) return;
                                                e.preventDefault();
                                                e.dataTransfer.dropEffect = "move";
                                                if (sopra !== s2.azienda) setSopra(s2.azienda);
                                            }}
                                            onDragLeave={(e) => {
                                                /* passando su un FIGLIO il browser manda `dragleave`
                                                   al padre: senza questo controllo il riquadro
                                                   lampeggiava a ogni voce attraversata. */
                                                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                                                setSopra((x) => (x === s2.azienda ? null : x));
                                            }}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                /* ⚠️ LA RIGA LA DICE IL RIFERIMENTO, NON IL PACCHETTO
                                                   DEL BROWSER (revisione ostile 02/09). Qui c'era
                                                   `Number(e.dataTransfer.getData("text/plain"))`, e
                                                   `Number("")` fa ZERO: un rilascio che non viene da
                                                   questa finestra — un file, un link, del testo da
                                                   un'altra scheda — sarebbe passato per la riga 0 e
                                                   l'avrebbe spostata sull'altro scontrino in silenzio.
                                                   Perché arrivasse fin qui bastava che la sorgente
                                                   sparisse a metà trascinamento (il `dragend` allora
                                                   non arriva e il riferimento resta pieno). È una voce
                                                   che esce con la partita IVA sbagliata, quindi si
                                                   legge il riferimento e si pretende un intero. */
                                                const k = trascinoRef.current;
                                                mollaTrascinamento();
                                                if (!Number.isInteger(k)) return;
                                                const riga = itemsTutte[k as number];
                                                if (riga && !_azDi(riga, k as number)) spostaServizio(riga, k as number, s2.azienda);
                                            }}
                                            className={"relative rounded-2xl border p-3 space-y-2.5 transition-all "
                                                + (bersaglio
                                                    ? "border-sky-300 bg-sky-500/[0.07] ring-2 ring-sky-300/80 shadow-xl shadow-sky-900/30"
                                                    : quadra ? "border-emerald-400/40 bg-emerald-500/[0.06]" : "border-white/10 bg-white/[0.03]")}>

                                            {/* L'INVITO STA SOPRA, NON DENTRO IL FLUSSO: aggiungere
                                                un elemento mentre si trascina sposta quello che c'è
                                                sotto il puntatore e fa rimbalzare il trascinamento.
                                                In posizione assoluta e trasparente ai click non
                                                sposta niente e non ruba nessun evento. */}
                                            {bersaglio && (
                                                <span className="pointer-events-none absolute -top-2.5 right-3 rounded-full bg-sky-400 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-950 shadow-lg">
                                                    ⤵ Rilascia qui
                                                </span>
                                            )}

                                            <div className="flex items-baseline justify-between gap-2">
                                                <span className="text-sm font-extrabold text-white truncate">🏢 {s2.label}</span>
                                                <span className="text-base font-extrabold text-emerald-300 shrink-0">{eur(s2.totale)}</span>
                                            </div>

                                            <div className="space-y-1.5">
                                                {s2.righe.map(({ i, k }) => {
                                                    /* ⚠️ LA MERCE È INCHIODATA E SI DEVE VEDERE (Luca
                                                       02/09): «i prodotti che fanno parte del magazzino
                                                       e che devono per forza stare in quello scontrino
                                                       rimangono fermi lì, mentre quegli altri magari
                                                       hanno un colore diverso».
                                                       Prima le due righe si distinguevano solo per una
                                                       velatura azzurra e un'emoji: chi provava a
                                                       trascinare la merce non capiva perché non si
                                                       muoveva. Adesso la merce è grigia, ferma, con il
                                                       lucchetto; il servizio è azzurro, col bordo
                                                       tratteggiato e la presa — e al passaggio del
                                                       mouse si solleva. Il segnale arriva PRIMA di
                                                       provare, che è il punto. */
                                                    const mobile = !_azDi(i, k);
                                                    const presa = trascino === k;
                                                    return (
                                                    <div key={k}
                                                        draggable={mobile}
                                                        onDragStart={(e) => {
                                                            /* ⚠️ SOLO SE LA RIGA SI PUÒ SPOSTARE (revisione
                                                               ostile 02/09). `draggable` è false sulla merce,
                                                               ma trascinando una SELEZIONE DI TESTO l'evento
                                                               parte dallo span figlio e sale fin qui: la riga
                                                               bloccata si disegnava «in mano» — il contrario
                                                               del segnale che questa modifica deve dare — e
                                                               sporcava il riferimento. */
                                                            if (!mobile) return;
                                                            e.dataTransfer.setData("text/plain", String(k));
                                                            e.dataTransfer.effectAllowed = "move";
                                                            trascinoRef.current = k; setTrascino(k);
                                                        }}
                                                        onDragEnd={mollaTrascinamento}
                                                        title={mobile
                                                            ? "Trascinalo sull'altro scontrino, o usa il pulsante →"
                                                            : "La società la decide il magazzino: questa riga non si sposta"}
                                                        className={"flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs min-h-[44px] transition-all "
                                                            + (!mobile
                                                                ? "bg-white/5 text-slate-300 border border-transparent cursor-default"
                                                                : presa
                                                                    /* ⚠️ NIENTE `border-2` QUI: un bordo più
                                                                       spesso alza la riga di due pixel proprio
                                                                       mentre la si sta trascinando, e la sezione
                                                                       sotto il puntatore si muove. L'anello non
                                                                       occupa spazio. */
                                                                    ? "bg-sky-500/25 text-white border border-dashed border-sky-300 ring-2 ring-inset ring-sky-300/70 opacity-50 cursor-grabbing"
                                                                    : "bg-sky-500/10 text-sky-100 border border-dashed border-sky-400/50 cursor-grab active:cursor-grabbing hover:bg-sky-500/25 hover:border-sky-300 hover:shadow-lg hover:shadow-sky-900/30")}>
                                                        <span className="shrink-0" aria-hidden="true">{mobile ? "🔧" : "📦"}</span>
                                                        {/* ⚠️ LA QUANTITÀ VA SCRITTA ANCHE QUI (revisione
                                                            ostile 02/09, difetto mio). L'elenco in cima —
                                                            che con due scontrini adesso non c'è — era
                                                            l'unico posto che scriveva «×3», e il prezzo
                                                            mostrato è già quello moltiplicato: restava
                                                            «Sim Wind3 — € 30,00» e nessun modo di
                                                            controllare il totale contro il carrello,
                                                            proprio davanti al cliente che paga. */}
                                                        <span className="flex-1 min-w-0 truncate">{i.description}{(i.qty ?? 1) > 1 ? ` ×${i.qty}` : ""}</span>
                                                        <span className="shrink-0 font-semibold tabular-nums">{eur(Number(i.unitPrice) * (Number(i.qty) > 0 ? Number(i.qty) : 1))}</span>
                                                        {mobile
                                                            /* ⭐ IL PULSANTE PER IL DITO (Luca 02/09). Misurava
                                                               23×20 px: sotto il minimo di 44, cioè il
                                                               polpastrello copriva il bersaglio e prendeva
                                                               quello che c'era intorno. Sui banconi tattili
                                                               è l'unico modo di spostare una voce — il
                                                               trascinamento col dito lì non c'è. */
                                                            ? altre.map((o) => (
                                                                <button key={o.azienda} type="button"
                                                                    title={`Sposta su ${o.label}`} aria-label={`Sposta «${i.description}» su ${o.label}`}
                                                                    onClick={() => spostaServizio(i, k, o.azienda)}
                                                                    className="shrink-0 w-11 h-11 flex items-center justify-center rounded-xl border border-sky-400/50 bg-sky-500/20 hover:bg-sky-400/40 hover:border-sky-300 text-base font-extrabold text-white transition-colors">→</button>
                                                            ))
                                                            /* la merce tiene il posto del pulsante, se no le
                                                               due colonne di prezzi non si allineano */
                                                            : <span className="shrink-0 w-11 h-11 flex items-center justify-center text-slate-300 text-base" aria-hidden="true" title="Fissa: è merce di magazzino">🔒</span>}
                                                    </div>
                                                    );
                                                })}
                                                {!s2.righe.length && (
                                                    <p className={"text-[11px] italic py-3 text-center rounded-lg border border-dashed transition-colors "
                                                        + (bersaglio ? "border-sky-300 text-sky-100 bg-sky-500/10" : "border-white/15 text-slate-400")}>
                                                        Niente in questo scontrino: trascina qui un servizio o una ricarica, o non verrà emesso.
                                                    </p>
                                                )}
                                            </div>

                                            {s2.totale > 0.005 && (
                                                <div className="space-y-2">
                                                    <p className="text-[11px] text-slate-400">Come paga il cliente</p>
                                                    {rr.map((r, ri) => (
                                                        <div key={ri} className="flex gap-2 items-center">
                                                            {(!r.forma || FORME_A_MANO.some((f) => f.code === r.forma)) ? (
                                                                <div className="flex gap-1.5 flex-1 min-w-0">
                                                                    {FORME_A_MANO.map((f) => (
                                                                        <button key={f.code} type="button"
                                                                            onClick={() => setRighePerAz((v) => ({ ...v, [s2.azienda]: (v[s2.azienda] || []).map((x, xi) => xi === ri ? { ...x, forma: f.code } : x) }))}
                                                                            className={"flex-1 min-w-0 flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-bold transition-colors "
                                                                                + (r.forma === f.code
                                                                                    ? "bg-violet-500/25 border-violet-400/70 text-white"
                                                                                    : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200")}>
                                                                            <span className="text-base leading-none">{f.icona}</span>{f.label}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                /* la forma decisa dal carrello — finanziato, rateizzato —
                                                                   non si cambia a mano: si mostra com'è */
                                                                <span className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs font-bold text-slate-300">
                                                                    {FORME_PAGAMENTO.find((f) => f.code === r.forma)?.label || r.forma}
                                                                </span>
                                                            )}
                                                            <span className="shrink-0 w-24 text-right text-sm font-bold text-slate-200">{eur(Number(r.importo))}</span>
                                                        </div>
                                                    ))}
                                                    {!quadra && (
                                                        <p className="text-[11px] text-amber-300">
                                                            {!rr.every((r) => !!r.forma) ? "Scegli come paga il cliente."
                                                                : manca > 0 ? `Manca ${eur(manca)}.` : `Eccedenza di ${eur(-manca)}.`}
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            {contanti > 0 && (
                                                <p className="text-[11px] text-slate-400">
                                                    {eur(contanti)} in contanti — si incassano una volta sola, insieme all&apos;altro scontrino.
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                                </div>
                                {/* SE IL PULSANTE È SPENTO, SI DICE PERCHÉ e cosa fare:
                                    un pulsante grigio senza spiegazione manda a
                                    cercare l'errore nel posto sbagliato. */}
                                {!!_nonRiscossi.orfani.length && (
                                    <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-2.5">
                                        <p className="text-xs font-bold text-rose-200">Non riesco a capire su quale scontrino va il finanziamento</p>
                                        <p className="text-[11px] text-rose-100/80 mt-1">
                                            {_nonRiscossi.orfani.map((o) => `${o.descrizione} (${eur(o.importo)})`).join(" · ")} — non trovo la sua riga
                                            nel carrello, quindi non so a quale società appartiene. Metterlo su quella sbagliata
                                            farebbe incassare in contanti un importo finanziato: <b>fai le due vendite separate</b>.
                                        </p>
                                    </div>
                                )}
                                {!!coupon && scontoCoupon > 0 && (
                                    <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-2.5">
                                        <p className="text-xs font-bold text-amber-200">Il coupon non vale su due scontrini</p>
                                        <p className="text-[11px] text-amber-100/80 mt-1">
                                            Lo sconto di {eur(scontoCoupon)} il registratore lo applica a un documento solo, e qui ne
                                            escono due: le sezioni chiedono il totale pieno. <b>Togli il coupon</b> e usalo su una
                                            vendita sola, oppure fai le due vendite separate.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {multiSocieta ? null : coperto ? (
                            <p className="text-sm text-emerald-300 text-center py-1">
                                {nienteDaPagare
                                    ? "Non c'è niente da incassare: il totale è zero. Lo scontrino esce lo stesso, senza forma di pagamento."
                                    : "Coperto interamente dal coupon — nessun pagamento da incassare."}
                            </p>
                        ) : (
                        <div className="space-y-2">
                            <p className="text-[11px] text-slate-500">Forme di pagamento (max 3)</p>
                            {righe.map((r, i) => (
                                /* TRE PULSANTI, NON UNA TENDINA (Luca 31/08). Il pagamento è
                                   l'ultimo gesto di una vendita e si fa di fretta, col cliente
                                   davanti: una tendina costa due clic e una lettura. Qui si
                                   preme quello che serve.
                                   La forma scelta dal carrello — credito, finanziamento — non
                                   ha un pulsante: si mostra com'è, e non si cambia a mano. */
                                <div key={i} className="flex gap-3 items-end flex-wrap">
                                    {/* vuota = ancora da scegliere: i pulsanti si mostrano
                                        tutti spenti, non il riquadro «deciso dal carrello» */}
                                    {(!r.forma || FORME_A_MANO.some((f) => f.code === r.forma)) ? (
                                        <div className="flex gap-1.5 flex-1 min-w-0">
                                            {FORME_A_MANO.map((f) => {
                                                const on = r.forma === f.code;
                                                return (
                                                    <button key={f.code} type="button" onClick={() => setForma(i, f.code)}
                                                        className={"flex-1 min-w-0 flex flex-col items-center justify-center gap-1 rounded-2xl border px-3 py-3.5 text-sm font-bold transition-colors "
                                                            + (on
                                                                ? "bg-violet-500/25 border-violet-400/70 text-white shadow-lg shadow-violet-900/30"
                                                                : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200")}>
                                                        <span className="text-2xl leading-none">{f.icona}</span>
                                                        <span>{f.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <span className="flex-1 min-w-0 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm px-2.5 py-2.5">
                                            {FORME_PAGAMENTO.find((f) => f.code === r.forma)?.icona}{" "}
                                            {FORME_PAGAMENTO.find((f) => f.code === r.forma)?.label || r.forma}
                                            <span className="text-[10px] text-slate-500 ml-1.5">deciso dal carrello</span>
                                        </span>
                                    )}
                                    {/* UNA RIGA DECISA DAL CARRELLO NON SI TOCCA (revisore
                                        01/09). Il commento sopra diceva «non si cambia a
                                        mano», ma il campo dell'importo e la × stavano fuori
                                        dal ramo: si cancellava la riga «Finanziamento» e si
                                        rimetteva tutto su Contanti, col segno di spunta
                                        verde. Cioè si certificava come incassato un importo
                                        che la finanziaria pagherà settimane dopo. */}
                                    {(!r.forma || FORME_A_MANO.some((f) => f.code === r.forma)) ? (
                                    <>
                                    <div className="relative w-32 shrink-0">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-base">€</span>
                                        <input type="number" min={0} step={0.05} value={r.importo || ""} onChange={(e) => setImporto(i, e.target.value)}
                                            className="w-full rounded-2xl bg-white/5 border border-white/10 text-slate-100 text-lg font-bold text-right tabular-nums pl-6 pr-3 py-3 outline-none focus:border-violet-400/60" />
                                    </div>
                                    <button type="button" onClick={() => removeRiga(i)} disabled={righe.length <= 1}
                                        className="shrink-0 w-9 h-11 rounded-xl border border-white/10 text-slate-400 hover:text-rose-300 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent text-lg leading-none">×</button>
                                    </>
                                    ) : (
                                        /* decisa dal carrello: si legge, non si tocca */
                                        <span className="w-32 shrink-0 text-right text-lg font-bold tabular-nums text-slate-300 py-3">{eur(r.importo)}</span>
                                    )}
                                </div>
                            ))}
                            <div className="flex items-center justify-between">
                                {righe.length < 3 ? (
                                    <button type="button" onClick={addRiga} className="text-xs text-violet-300 hover:text-violet-200">+ Aggiungi pagamento</button>
                                ) : <span />}
                                <span className={"text-xs tabular-nums " + (bilanciato ? "text-emerald-400" : "text-amber-300")}>
                                    {bilanciato ? "✓ Bilanciato"
                                        : righe.some((r) => !r.forma) ? "Scegli come paga il cliente"
                                            : `Rimanente ${eur(rimanente)}`}
                                </span>
                            </div>
                        </div>
                        )}

                        {/* ═══ DUE DOMANDE DIVERSE CHE SI SOMIGLIAVANO TROPPO ═══════
                            Luca 02/09: «la selezione della cash machine ad oggi viene
                            confusa con quella dello scontrino: è importante evidenziare
                            bene che in quel momento stanno selezionando la CASH MACHINE,
                            e dargli la possibilità di selezionare invece in quale CASSA
                            fare lo scontrino».

                            Ha ragione, ed era prevedibile: erano due file di pulsanti
                            identici — stessa forma, stessa misura, stessa etichetta in
                            grigio da undici pixel — a mezzo metro l'uno dall'altro, uno
                            in cima alla finestra e uno in fondo. L'unica differenza era
                            l'emoji, e a Magliana perfino i NOMI si somigliano: la
                            società si chiama «Telefutura 2 S.R.L. · Magliana Multi» e il
                            cassetto «Magliana Multi».

                            Sono due cose di natura diversa e adesso lo dicono:
                            • 🧾 LA CASSA — quale società emette il documento. È un fatto
                              FISCALE: sbagliarla vuol dire una partita IVA sbagliata su
                              una carta che resta.
                            • 💶 IL CASSETTO — dove il cliente mette i soldi. È un fatto
                              FISICO: la macchina davanti a cui sta.
                            Parole diverse (CASSA / CASSETTO), icone diverse, colori
                            diversi (azzurro / verde), e ognuna dice a voce cosa NON
                            decide. Stanno vicine di proposito — è il momento in cui si
                            ragiona di soldi — ma dentro due riquadri separati.

                            Compare nei quattro LOCALI che hanno due insegne dentro —
                            Magliana, Collatina, Acilia, Donna — che però sono SETTE
                            postazioni, non quattro: chi lavora a Magliana W3 e chi lavora
                            a Magliana Multi entrano con due nomi diversi e vedono
                            entrambi le due società (`stessoMagazzino` guarda la prima
                            parola del nome). Misurato su `pos_rt`: 7 nomi-negozio su 15
                            hanno `aziende.length === 2` — Acilia Multi, Acilia VS,
                            Collatina Multi, Collatina W3, Donna, Magliana Multi,
                            Magliana W3. Negli altri OTTO — Baleniere, Castani,
                            Garbatella, Libia, Mazzini, Merulana, Promontori, San Paolo —
                            `aziende` e `insegne` hanno un elemento solo e qui non esce
                            niente: la finestra è quella di sempre.
                            (A Donna il riquadro del cassetto non esce comunque: i due
                            registratori li serve lo stesso agente, quindi il cassetto è
                            uno solo e non c'è niente da scegliere.) */}
                        {(aziende.length > 1 || insegne.length > 1) && (
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-2.5">
                                <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
                                    Dove va questa vendita
                                </p>

                                {/* ① LA CASSA FISCALE — chi firma il documento */}
                                {aziende.length > 1 && (
                                    <div className="rounded-xl border border-sky-400/40 bg-sky-500/[0.09] p-2.5 space-y-2">
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-base leading-none shrink-0" aria-hidden="true">🧾</span>
                                            <span className="text-xs font-extrabold uppercase tracking-wide text-sky-100">
                                                La cassa · chi emette lo scontrino
                                            </span>
                                        </div>
                                        {soloServizi ? (
                                            <>
                                                {/* LA DOMANDA NOMINA QUELLO CHE C'È NEL CARRELLO.
                                                    «Sono tutti servizi» a chi sta vendendo una ricarica
                                                    sembrava la domanda di qualcun altro. */}
                                                <p className="text-[11px] text-slate-300">
                                                    {_cosaCe} senza merce: nessun prodotto può decidere al posto tuo.
                                                    <b className="text-sky-100"> Scegli su quale cassa esce la carta</b> — è la partita IVA che ci finisce sopra.
                                                </p>
                                                <div className="flex gap-2 flex-wrap">
                                                    {aziende.map((a) => (
                                                        <button key={a.code} type="button" onClick={() => setAziendaSel(a.code)}
                                                            aria-pressed={aziendaSel === a.code}
                                                            className={"flex-1 min-w-[150px] min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-bold transition "
                                                                + (aziendaSel === a.code
                                                                    ? "bg-sky-500/35 border-sky-300 text-white shadow-lg shadow-sky-900/30"
                                                                    : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white")}>
                                                            <span aria-hidden="true">{aziendaSel === a.code ? "✅" : "🏢"}</span>
                                                            <span className="truncate">{a.label}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        ) : (
                                            /* CON LA MERCE NON SI SCEGLIE, e va detto qui — non in
                                               una riga grigia in cima alla finestra, dove nessuno la
                                               collegava alla domanda del cassetto. Si nomina anche
                                               CHI emetterà: senza il nome, «la decide la merce»
                                               lascia esattamente il dubbio che apre lo scambio. */
                                            <p className="text-[11px] text-slate-300">
                                                La decide la merce: ogni riga esce dalla società su cui è caricata
                                                {emittenti.length ? <> — <b className="text-sky-100">{emittenti.join(" e ")}</b></> : null}.
                                                Qui non c&apos;è niente da scegliere.
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* ② IL CASSETTO — dove entrano i contanti. Solo dove le
                                    insegne sono più d'una e solo se contanti ce ne sono. */}
                                {insegne.length > 1 && (multiSocieta ? contantiTotali : cashRounded) > 0 && (
                                    <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/[0.09] p-2.5 space-y-2">
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-base leading-none shrink-0" aria-hidden="true">💶</span>
                                            <span className="text-xs font-extrabold uppercase tracking-wide text-emerald-100">
                                                Il cassetto · dove entrano i contanti
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-slate-300">
                                            La <b className="text-emerald-100">cash machine</b> davanti a cui sta il cliente: prende {eur(multiSocieta ? contantiTotali : cashRounded)} e dà il resto.
                                            <b className="text-emerald-100"> Non cambia chi emette lo scontrino.</b>
                                        </p>
                                        <div className="flex gap-2 flex-wrap">
                                            {insegne.map((n) => (
                                                <button key={n} type="button" onClick={() => setCassaSel(n)}
                                                    aria-pressed={cassaSel === n}
                                                    className={"flex-1 min-w-[150px] min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-bold transition "
                                                        + (cassaSel === n
                                                            ? "bg-emerald-500/35 border-emerald-300 text-white shadow-lg shadow-emerald-900/30"
                                                            : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white")}>
                                                    <span aria-hidden="true">{cassaSel === n ? "✅" : "💶"}</span>
                                                    <span className="truncate">{n}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {cashRounded > 0 && (
                            <p className="text-[11px] text-slate-500 text-center">
                                La cassa automatica chiederà {eur(cashRounded)} in contanti ed erogherà il resto.
                                {arrotondamento !== 0 && <> Arrotondamento {arrotondamento > 0 ? "+" : ""}{eur(arrotondamento)}.</>}
                            </p>
                        )}

                        <div className="space-y-2 pt-1">
                            <div className="flex gap-2">
                                {!data.sospesoId && (
                                    <button type="button" onClick={tieniInSospeso} className="flex-1 py-2.5 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-200 hover:bg-amber-500/25 text-sm font-semibold">
                                        Tieni in sospeso
                                    </button>
                                )}
                                <button type="button" onClick={conferma} disabled={multiSocieta ? !sezioniOk : !bilanciato} className="flex-1 primary-btn py-2.5 text-sm font-semibold disabled:opacity-40">
                                    {/* IL PULSANTE DICE QUANTI DOCUMENTI USCIRANNO: premere
                                        «Emetti scontrino» e vederne uscire due, su due casse
                                        diverse, è una sorpresa che al banco non serve. */}
                                    {(multiSocieta ? contantiTotali : cashRounded) > 0 ? "Incassa ed emetti" : "Emetti"}
                                    {multiSocieta ? ` i ${sezioni.length} scontrini` : cashRounded > 0 ? "" : " scontrino"}
                                </button>
                            </div>
                            {/* VIA «CHIUDI SENZA SCONTRINO» (Luca 31/08: «non ha alcun
                                senso»). Aveva ragione: era l'uscita che lasciava una vendita
                                registrata e nessuno scontrino emesso — merce uscita, magari
                                col commissioning già pagato sopra, e niente di fiscale.
                                Chi non incassa adesso ha «Tieni in sospeso», che quel conto
                                lo tiene in vista finché il cliente non torna a pagare.
                                Riprendendo un sospeso, invece, chiudere è legittimo: il conto
                                resta dov'era. */}
                            {data.sospesoId && (
                                <button type="button" onClick={onDone} className="w-full text-[11px] text-slate-500 hover:text-slate-300">
                                    Chiudi (resta in sospeso)
                                </button>
                            )}
                        </div>
                    </>
                )}

                {fase === "incasso" && (
                    <div className="space-y-3 text-center py-3">
                        <div className="text-3xl animate-pulse">💶</div>
                        <p className="text-sm text-slate-300">{msg}</p>
                        <button type="button" onClick={annullaIncasso}
                            className="mx-auto px-5 py-2 rounded-xl bg-rose-500/15 border border-rose-400/40 text-rose-200 hover:bg-rose-500/25 text-sm font-semibold">
                            Annulla incasso
                        </button>
                        <p className="text-[11px] text-slate-500">Se il cliente ha già iniziato a inserire i contanti, annulla <b>anche</b> dallo schermo della cassa.</p>
                    </div>
                )}

                {fase === "stampa" && (
                    <div className="text-center py-4 text-slate-300 text-sm animate-pulse">{msg}</div>
                )}

                {fase === "fatto" && (
                    <div className="space-y-3 text-center py-1">
                        <div className="text-4xl">✅</div>
                        <p className="text-emerald-300 font-semibold">{msg}</p>
                        {/* ⚠️ ANCHE COL CARRELLO MISTO. `cashPortion` legge `righe`, lo
                            stato del percorso a una società: in modo diviso vale sempre
                            zero, e la schermata finale non diceva né quanto era entrato
                            né quanto resto aveva dato la macchina — i due numeri del
                            guasto di Magliana (revisione ostile 02/09). */}
                        {(multiSocieta ? paidCash : cashPortion) > 0 && <p className="text-sm text-slate-300">Incassato {eur(incassato)} · Resto <span className="text-white font-bold">{eur(resto)}</span></p>}
                        {nuovoCoupon && (
                            <div className="text-left text-[12px] text-emerald-100 bg-emerald-500/10 border border-emerald-400/30 rounded-lg p-2">
                                🎟️ Nuovo coupon resto: <b className="tracking-wide">{nuovoCoupon.code}</b> ({eur(nuovoCoupon.valore)}) — consegnalo al cliente.
                            </div>
                        )}
                        {!!esclusi.length && (
                            <div className="text-left text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded-lg p-2">
                                Voci NON stampate (reparto non assegnato in Catalogo): {esclusi.map((e) => e.description).join(", ")}
                            </div>
                        )}
                        <button type="button" onClick={onDone} className="primary-btn w-full py-2.5 text-sm font-semibold">Chiudi</button>
                    </div>
                )}

                {fase === "errore" && (
                    <div className="space-y-3 text-center py-1">
                        <div className="text-4xl">⚠️</div>
                        <p className="text-rose-300 text-sm">{msg}</p>
                        {/* ⭐ LO SCONTRINO SI FA SOLO DOPO CHE IL PAGAMENTO È
                            CERTIFICATO (Luca 02/09): «se va in errore perché
                            magari la cash non funziona, non deve chiedermi di
                            ristampare lo scontrino, se no faccio uno scontrino
                            senza aver incassato soldi — e se c'è una ricarica di
                            mezzo erogo una ricarica quando il cliente non ha
                            pagato».
                            Prima il pulsante diceva «Ristampa scontrino» anche
                            quando a fallire era l'INCASSO, e premendolo l'incasso
                            veniva saltato perché risultava già fatto. */}
                        {erroreDi === "pagamento" ? (
                            <p className="text-[12px] text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg p-2 text-left">
                                <b>Lo scontrino non è stato emesso</b>, e non lo sarà finché l&apos;incasso non riesce.
                                Prima di riprovare <b>guarda nel cassetto</b>: se la macchina i soldi li ha già presi,
                                non farli mettere una seconda volta — chiudi qui e chiama l&apos;amministrazione.
                            </p>
                        ) : cashDone && (
                            <p className="text-[12px] text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg p-2">
                                Contanti GIÀ incassati: {eur(incassato)} · Resto {eur(resto)} (quota {eur(paidCash)}). NON reincassare — usa «Ristampa scontrino».
                            </p>
                        )}
                        <div className="flex gap-2">
                            <button type="button" onClick={chiudiConCautela} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 text-sm">Chiudi</button>
                            {commitFail
                                ? <button type="button" onClick={retrySalvataggio} className="flex-1 primary-btn py-2.5 text-sm font-semibold">Salva vendita</button>
                                : erroreDi === "pagamento"
                                    ? <button type="button" onClick={() => { setFase("scelta"); setMsg(""); setErroreDi(""); }} className="flex-1 primary-btn py-2.5 text-sm font-semibold">Torna al pagamento</button>
                                    : <button type="button" onClick={conferma} className="flex-1 primary-btn py-2.5 text-sm font-semibold">{cashDone ? "Ristampa scontrino" : "Riprova"}</button>}
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
