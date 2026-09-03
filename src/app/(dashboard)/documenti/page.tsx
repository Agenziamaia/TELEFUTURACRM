"use client";

/* ═══ DOCUMENTI EMESSI ═══════════════════════════════════════════════════════
 *
 * Luca 01/09 sera: «dobbiamo creare una sezione di documenti dentro il lab di
 * vendite, dove mettiamo tutti gli scontrini che un negozio fa, ma anche le
 * fatture. Ogni punto vendita vede i suoi, l'amministrazione li vede tutti. Se
 * qualcosa non torna, cliccano e si apre il dettaglio di quello che hanno
 * scontrinato. E il punto vendita può fare una richiesta di modifica del
 * pagamento, che arriva in amministrazione.»
 *
 * DA DOVE VENGONO I DOCUMENTI. Non da una tabella nuova: dalla coda di stampa
 * (`print_jobs`), che è l'unico posto dove un documento esiste davvero — con
 * dentro l'XML mandato al registratore. Quell'XML contiene le righe una per
 * una, i reparti IVA e le forme di pagamento ESATTAMENTE come sono finite
 * sulla carta. Una tabella parallela avrebbe potuto divergere dallo scontrino
 * vero; questa no, per costruzione.
 *
 * ═══ COSA HA CAMBIATO LA REVISIONE DI STASERA ═══════════════════════════════
 * Due agenti — uno sulla sostanza, uno sul disegno — hanno trovato quindici
 * difetti su misura. I tre che contano davvero, e come sono chiusi qui:
 *
 *  ① CHI NON HA NEGOZI VEDEVA TUTTO. `if (!seesAll && stores.length)`: con la
 *    lista vuota il filtro non veniva applicato e la query tornava l'intero
 *    parco. Non è teorico — c'è un utente attivo con zero negozi assegnati che
 *    vedeva tutti e 14 i punti vendita. Sotto non c'è nessuna rete: la policy
 *    di `print_jobs` è «basta essere loggati». Ora si fallisce CHIUSI: lista
 *    vuota significa «non ho negozi», non «non ho restrizioni».
 *
 *  ② I GEMELLI SI SPEZZAVANO. Lo scontrino è archiviato sotto il negozio
 *    PROPRIETARIO del registratore, non sotto quello che vende: chi è
 *    assegnato al solo Collatina W3 vedeva 3 documenti su 6 fatti dal suo
 *    stesso bancone. L'ambito si espande ora ai gemelli di sede fisica, come
 *    fa già tutto il resto della pagina.
 *
 *  ③ IL NUMERO NON C'È SU META' DEL PARCO. Sui registratori Custom l'esito è
 *    `{"ok":true,"msg":"fiscale stampato","matricola":"…"}`: il numero non lo
 *    riporta — misurato su 224 documenti veri, zero. Non lo si inventa e non
 *    si finge: quei documenti si cercano per matricola, ora, e la pagina dice
 *    apertamente perché il numero manca.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { useVisibleStores, stessoMagazzino, negozioInValues } from "@/lib/visibleStores";
import { SelectMulti, SelectOpzioni } from "@/components/SelectPersona";
import { FileDown, RefreshCw, Receipt, Loader2 } from "lucide-react";
import { nomeSocieta } from "@/lib/societa";
import { FattureDaFare } from "./FattureDaFare";

const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
/** Gli euro come li scrive il resto del CRM: col punto delle migliaia. Prima
 *  questa tabella diceva «€ 1249,00» e quella del Magazzino «1.249,00 €». */
const eur = (n: number | null | undefined) => n == null ? "—"
    : Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const eurTondo = (n: number) =>
    new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(n) || 0);
const gg = (s: string | null) => (s ? new Date(s).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");
const ora = (s: string | null) => (s ? new Date(s).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "");
/** Il corpo del numero segue la LUNGHEZZA DELLA STRINGA, non la cifra: è la
 *  regola scritta nella cassetta (globals 985), ed è la stessa che usa il
 *  Magazzino. Decidendo sul valore, «1.000» usciva a 17px invece che a 24. */
const corpoNumero = (t: string) => t.length >= 11 ? "rvNum-s" : t.length >= 8 ? "rvNum-m" : undefined;

/* GIORNO LOCALE → ISTANTE UTC. Il database vive in UTC: chiedere
   `>= '2026-09-01T00:00:00'` significa chiedere dalle 02:00 di Roma. Con gli
   orari di negozio non si nota, ma la prima chiusura fatta a mezzanotte
   finirebbe nel giorno sbagliato — e una chiusura nel giorno sbagliato è un
   problema fiscale, non estetico. */
const inizioGiorno = (d: string) => new Date(`${d}T00:00:00`).toISOString();
const fineGiorno = (d: string) => new Date(`${d}T23:59:59.999`).toISOString();

/* ── COSA C'È DENTRO UN DOCUMENTO ────────────────────────────────────────────
   L'XML del registratore si legge una volta sola, qui, e diventa righe e
   pagamenti. Due dialetti, non uno:
     · FISCALE     <printRecItem …/> + <printRecTotal …/>
     · NON FISCALE <printerNonFiscal><printNormal data="E.Telefono  x1  EUR 1.00"/>
   Il secondo prima non veniva letto affatto: 73 documenti su 224 si aprivano
   dicendo «dettaglio non disponibile» mentre il dettaglio era lì dentro. */
type RigaDoc = { descrizione: string; quantita: number; prezzo: number; reparto: number | null };
type PagDoc = { descrizione: string; importo: number; tipo: number };

const dec = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function leggiXml(xml: string | null): { righe: RigaDoc[]; pagamenti: PagDoc[]; diagnostica: boolean; totaleDichiarato: number | null } {
    const righe: RigaDoc[] = [], pagamenti: PagDoc[] = [];
    if (!xml) return { righe, pagamenti, diagnostica: false, totaleDichiarato: null };
    const attr = (t: string, n: string) => { const m = t.match(new RegExp(`${n}="([^"]*)"`)); return m ? dec(m[1]) : ""; };

    for (const m of xml.matchAll(/<printRecItem\b[^>]*\/>/g)) {
        const t = m[0];
        righe.push({
            descrizione: attr(t, "description"),
            quantita: Number(attr(t, "quantity")) || 1,
            prezzo: Number(attr(t, "unitPrice")) || 0,
            reparto: attr(t, "department") ? Number(attr(t, "department")) : null,
        });
    }
    for (const m of xml.matchAll(/<printRecTotal\b[^>]*\/>/g)) {
        const t = m[0];
        pagamenti.push({ descrizione: attr(t, "description"), importo: Number(attr(t, "payment")) || 0, tipo: Number(attr(t, "paymentType")) || 0 });
    }

    /* IL NON FISCALE È UN FOGLIO BATTUTO A MACCHINA, non un elenco di articoli:
       dentro ci sono intestazioni, separatori, il totale e i pagamenti. Prima
       si prendeva OGNI riga come un articolo — 488 righe su 675 non lo erano —
       e dove mancava `meta.total` il documento veniva contato DOPPIO, perché
       la riga «TOTALE» finiva fra la merce. Si legge a sezioni, come è scritto. */
    let diagnostica = false, totaleDichiarato: number | null = null;
    if (!righe.length) {
        let neiPagamenti = false;
        for (const m of xml.matchAll(/<printNormal\b[^>]*\/>/g)) {
            const t = dec(m[0].match(/data="([^"]*)"/)?.[1] || "");
            if (!t.trim()) continue;
            /* LE PROVE DI COLLEGAMENTO NON SONO DOCUMENTI: «== CHECK COLLATINA
               W3 ==» è il tasto che verifica se la cassa risponde. */
            if (/^\s*=+\s*CHECK/i.test(t)) { diagnostica = true; continue; }
            if (/^\s*[-=_.*]{3,}\s*$/.test(t)) continue;                 // separatore
            if (/^\s*\*{2,}/.test(t)) continue;                          // intestazione
            if (/^\s*\(PROVA\)/i.test(t)) continue;
            if (/^\s*azienda\s*:/i.test(t)) continue;
            if (/non valido ai fini fiscali|documento non fiscale/i.test(t)) continue;
            if (/^\s*pagament/i.test(t)) { neiPagamenti = true; continue; }

            const p = t.match(/EUR\s*([0-9]+(?:[.,][0-9]+)?)\s*$/i);
            const importo = p ? Number(p[1].replace(",", ".")) || 0 : 0;
            const q = t.match(/\sx\s*([0-9]+)\b/i);
            const desc = t.replace(/EUR\s*[0-9]+(?:[.,][0-9]+)?\s*$/i, "").replace(/\sx\s*[0-9]+\b/i, "").trim();
            if (/^\s*tot(ale)?\b/i.test(desc)) { totaleDichiarato = importo; continue; }
            if (!desc || !p) continue;      // senza prezzo non è né merce né pagamento
            if (neiPagamenti) pagamenti.push({ descrizione: desc, importo, tipo: /cart|elettron|pos\b/i.test(desc) ? 2 : 0 });
            else righe.push({ descrizione: desc, quantita: q ? Number(q[1]) || 1 : 1, prezzo: importo, reparto: null });
        }
    }
    return { righe, pagamenti, diagnostica, totaleDichiarato };
}

/** Il numero del documento. L'Epson lo riporta nel suo XML di risposta; il
 *  Custom NON lo riporta affatto (verificato su 224 documenti: zero). Se non
 *  c'è, non si inventa — e la pagina lo dice, invece di lasciare una colonna
 *  misteriosamente vuota su nove negozi su quattordici. */
function numeroDoc(result: string | null): string | null {
    if (!result) return null;
    const a = result.match(/\(n\.\s*([0-9-]+)\)/i);
    if (a) return a[1];
    const b = result.match(/<(?:fiscalReceiptNumber|zRepNumber|receiptNumber)>([^<]+)</i);
    if (b) return b[1].trim();
    const c = result.match(/"(?:numero|nDoc|docNumber)"\s*:\s*"?([0-9-]+)"?/i);
    return c ? c[1] : null;
}

/** La matricola del registratore. Il Custom la mette nel suo JSON, l'Epson in
 *  `<serialNumber>`: prima si leggeva solo la prima, e sui documenti Epson non
 *  restava NIENTE con cui cercare — né numero né matricola. */
function matricolaDoc(result: string | null): string | null {
    if (!result) return null;
    return result.match(/"matricola"\s*:\s*"([^"]+)"/)?.[1]
        || result.match(/<serialNumber>([^<]+)</i)?.[1]?.trim()
        || null;
}

/* ── COM'È ANDATA DAVVERO ────────────────────────────────────────────────────
   `error` non vuol dire «non è uscito». Su 46 fallimenti, 40 hanno questo
   esito: «esito mai ricevuto: l'agente del negozio ha ritirato il lavoro ma
   non ha mai riportato com'è andata». Significa ESITO IGNOTO — la carta può
   benissimo essere uscita. Dire «non uscito» a un negozio che sta cercando di
   capire se ha fatto uno scontrino è la risposta sbagliata, e su quella
   risposta uno rifà lo scontrino e batte due volte. */
type Esito = { et: string; tono: string; spiega: string };
function esitoDi(stato: string, result: string | null, tentativi = 1, emessi = 0, inCoda = false, radiceFuori = false, graveAperto = false, fiscale = true, storno = false): Esito | null {
    /* ⚠️ «RIEMESSO», non «emesso» (Luca 02/09): se ci sono voluti due
       tentativi il documento è uscito, ma qualcosa era andato storto — e chi
       guarda l'elenco deve vederlo senza aprire la riga. Un «emesso» pulito
       su un documento rifatto nasconde proprio la cosa che si sta cercando. */
    if (stato === "done") {
        /* ⚠️⚠️ DUE DOCUMENTI FISCALI VERI PER LA STESSA VENDITA. È il caso che
           l'unione delle righe rischiava di nascondere: primo tentativo chiuso
           d'ufficio dopo dieci minuti, ristampa uscita, e poi l'agente del
           negozio riporta in ritardo anche il primo — che torna «done». Due
           numeri di documento, due volte l'importo nello Z di giornata.
           Dirgli «riemesso» in giallo sarebbe la bugia peggiore della pagina:
           qui è rosso, e si dice cosa fare. */
        /* ⚠️ IL TESTO CAMBIA CON IL TIPO DI DOCUMENTO. «Annullane uno dalla
           cassa» detto su un ANNULLO è l'istruzione opposta a quella giusta, e
           un documento non fiscale nello Z non c'è proprio. */
        if (emessi > 1) return { et: `DOPPIO · ${emessi} usciti`, tono: "rvBadge-ko",
            spiega: storno
                ? `dal registratore sono usciti ${emessi} documenti di annullo per lo stesso scontrino: guarda in cassa che non ne sia stato stornato uno di troppo.`
                : !fiscale
                    ? `dal registratore sono uscite ${emessi} copie di questo documento non fiscale. Non tocca lo Z di giornata, ma il cliente ne ha due.`
                    : `dal registratore sono usciti ${emessi} documenti fiscali per questa stessa vendita. L'importo è nello Z di giornata ${emessi} volte: annullane ${emessi - 1} DALLA CASSA, o la giornata non quadra.` };
        /* uscito, ma ce n'è un altro ancora in coda: se parte, diventa doppio */
        if (inCoda) return { et: "+1 IN CODA", tono: "rvBadge-ko",
            spiega: "il documento è già uscito, ma c'è un altro tentativo ancora in coda sulla cassa: se parte lo batti due volte. Toglilo dalla coda o preparati ad annullarlo." };
        /* ⚠️ NON si dice «il primo era andato male»: sui fallimenti di questa
           pagina 40 su 46 sono «esito ignoto», cioè la carta può essere uscita
           lo stesso. Si dice quello che si sa: che i tentativi sono stati due. */
        /* ⚠️ ANCHE QUANDO I PRIMI TENTATIVI SONO FUORI DAL PERIODO. Il filtro
           di ingresso è oggi→oggi: una ristampa guardata il giorno dopo perde
           la radice, resta sola, e con il solo conteggio dei tentativi
           sembrerebbe un documento pulito uscito al primo colpo — cioè
           l'opposto di quello che Luca ha chiesto di far vedere. */
        /* ⚠️ NON SI DICE «ALLARGA LE DATE». La radice può mancare per tre
           motivi — fuori periodo, tagliata dal tetto delle mille righe, o
           scartata perché diagnostica — e proprio quando manca per il tetto,
           allargare le date ne spinge fuori ancora di più. */
        if (radiceFuori) return { et: "riemesso", tono: "rvBadge-warn",
            spiega: "questo documento è la ristampa di un tentativo precedente che non è in questo elenco: era in un altro giorno, o è rimasto fuori dal tetto delle mille righe. Per vedere com'era andata la prima volta, cerca il numero o restringi le date sul giorno della vendita." };
        /* un tentativo ha lasciato il documento aperto sulla cassa: resta
           rosso anche se poi è uscito, perché quello aperto va chiuso a mano */
        if (graveAperto) return { et: `riemesso · ${tentativi}°`, tono: "rvBadge-ko",
            spiega: "un tentativo ha stampato le righe e poi ha rifiutato il totale: quel documento è rimasto APERTO sulla cassa e va chiuso o annullato DALLA CASSA. Il documento buono è quello col numero qui accanto." };
        if (tentativi > 1) return { et: `riemesso · ${tentativi}°`, tono: "rvBadge-warn",
            spiega: `ci sono voluti ${tentativi} tentativi, e il numero qui accanto è quello del documento uscito. Degli altri tentativi non risulta un numero — ma se dal rullo era uscita comunque della carta, controlla in cassa prima di considerarlo chiuso.` };
        return null;
    }
    if (stato === "pending") return { et: "in coda", tono: "rvBadge-warn", spiega: "è ancora in attesa che la cassa lo ritiri." };
    if (stato === "sent") return { et: "in stampa", tono: "rvBadge-warn", spiega: "la cassa l'ha ritirato e sta stampando: fra poco si saprà com'è andata." };
    if (stato === "error") {
        if (/esito mai ricevuto|chiuso d'ufficio/i.test(result || ""))
            return { et: "esito ignoto", tono: "rvBadge-warn", spiega: "la cassa l'ha ritirato ma non ha mai detto com'è andata: la carta può essere uscita lo stesso. Prima di rifarlo, guarda lo scontrino." };
        /* «NON USCITO» ERA FALSO, e Luca l'ha fotografato: a Garbatella il
           rullo aveva stampato l'articolo e il totale, e il display chiedeva
           ancora «DIFFERENZA 109,89». Quando la cassa rifiuta a metà, le righe
           della merce SONO GIÀ USCITE e il documento resta APERTO: dirgli che
           non è uscito lo porta a rifarlo, cioè a scontrinare due volte. */
        if (/PRINTER ERROR/i.test(result || ""))
            return { et: "rimasto aperto", tono: "rvBadge-ko",
                spiega: "la cassa ha stampato le righe e poi ha rifiutato il totale: dal rullo esce mezzo scontrino e il documento resta aperto. Chiudilo o annullalo DALLA CASSA prima di rifarlo, se no lo batti due volte." };
        return { et: "non uscito", tono: "rvBadge-ko", spiega: "la cassa ha risposto con un errore: il documento non è stato emesso." };
    }
    return { et: stato, tono: "rvBadge-empty", spiega: "" };
}

/* ═══ I TENTATIVI DELLO STESSO DOCUMENTO, IN UNA RIGA SOLA ═════════════════
   Luca 02/09: «nel momento in cui uno scontrino fallisce e lo si rifà, non
   deve generare una nuova riga: bisogna tenere il conto — che ne so, due
   tentativi — e aggiornare l'esito dell'ultimo. Se sono stati fatti due
   tentativi è chiaro che il primo è andato male, dopodiché l'esito può essere
   "riemesso" e non "emesso", così mi fa capire che c'è stato un problema.
   Comunque non deve generare due righe, sicuramente.»

   A database i lavori restano due, ed è giusto: sono due tentativi di
   documento fiscale, e se per caso fossero usciti entrambi la doppia
   emissione deve restare visibile. Ma nell'elenco vanno letti come uno solo —
   due righe identiche fanno pensare a due scontrini battuti, che è
   esattamente la cosa da non far credere a chi sta controllando la cassa.

   La riga che resta è la PRIMA (l'ora della vendita è quella), con l'esito e
   il numero dell'ULTIMO tentativo: è l'ultimo che dice come sono andate le
   cose adesso. */
function uniscoTentativi(tutti: Doc[]): Doc[] {
    const perId = new Map(tutti.map((d) => [d.id, d]));
    /* la radice della catena: una ristampa può essere a sua volta ristampata,
       quindi si risale finché si trova il primo tentativo. Il contatore è la
       rete contro un anello di dati storti, che bloccherebbe la pagina. */
    const radiceDi = (d: Doc): string => {
        let cur = d, giri = 0;
        while (cur.ristampaDi && perId.has(cur.ristampaDi) && giri++ < 200) cur = perId.get(cur.ristampaDi)!;
        return cur.id;
    };
    const catene = new Map<string, Doc[]>();
    for (const d of tutti) {
        const k = radiceDi(d);
        (catene.get(k) || catene.set(k, []).get(k)!).push(d);
    }
    const out: Doc[] = [];
    for (const [radice, righe] of catene) {
        /* ⚠️ ORDINE STABILE anche a parità di istante: `localeCompare` torna 0
           e `sort` è stabile, quindi l'ordine restava quello di arrivo (dal più
           NUOVO, come li legge la query) e «l'ultimo» diventava il più vecchio.
           A parità decide l'id, che almeno è deterministico. */
        const ordinate = [...righe].sort((a, b) =>
            a.quando < b.quando ? -1 : a.quando > b.quando ? 1 : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        const primo = ordinate.find((d) => d.id === radice) || ordinate[0];
        const ultimo = ordinate[ordinate.length - 1];
        /* ⚠️ QUALI TENTATIVI SONO USCITI DAVVERO. Ognuno di questi è un
           documento fiscale con un suo numero, e ognuno pesa sullo Z di
           giornata: se sono due, sono due — la pagina non li può fondere in
           uno e far sparire metà dell'incasso. */
        const usciti = ordinate.filter((d) => d.stato === "done");
        /* IL TENTATIVO CHE PORTA IL DOCUMENTO: l'ultimo uscito se ce n'è uno,
           se no l'ultimo provato.
           ⚠️ Il CONTENUTO va preso da lui, non dal primo: la ristampa
           RICOSTRUISCE l'XML (`api/vendita/ristampa`) — corregge l'indice IVA
           del non riscosso e ribilancia i pagamenti — quindi lo scontrino
           uscito è legittimamente diverso da quello tentato. Mostrare le righe
           del tentativo fallito sotto il titolo «cosa è stato scontrinato»,
           col reparto sbagliato, è esattamente il campo per cui quel pannello
           esiste. */
        const vero = usciti.length ? usciti[usciti.length - 1] : ultimo;
        /* l'avviso più grave dei tentativi PRECEDENTI non deve sparire quando
           l'ultimo è ancora in coda: «rimasto aperto» è il momento in cui il
           rischio di batterlo due volte è più alto */
        const prima = ordinate.filter((d) => d.id !== vero.id && d.stato === "error")
            .map((d) => esitoDi(d.stato, d.result))
            .find((e) => e && (e.et === "rimasto aperto" || e.et === "esito ignoto")) || null;
        /* ⚠️ «RIMASTO APERTO» NON SCENDE MAI A GIALLO. Un tentativo che ha
           stampato le righe e poi ha rifiutato il totale lascia il documento
           APERTO sulla cassa: è la situazione in cui rifarlo lo batte due
           volte, e non cambia gravità solo perché un ALTRO tentativo è andato
           a buon fine. Prima finiva in fondo al dettaglio, dietro un badge
           giallo «riemesso» — cioè il colore di una cosa risolta. */
        const graveAperto = ordinate.some((x) => x.stato === "error" && /PRINTER ERROR/i.test(x.result || ""));
        out.push({
            ...vero,
            /* la riga resta chiavata sulla RADICE: è l'id che usano il link
               profondo delle task e la regola «una ristampa sola» sul server */
            id: primo.id,
            negozio: primo.negozio,
            /* ⚠️ IL GIORNO È QUELLO DEL DOCUMENTO USCITO, non del primo
               tentativo: un tentativo fallito alle 23:55 e la ristampa uscita
               alle 00:03 sono due giornate fiscali diverse, e lo Z che porta
               quell'importo è quello del giorno dopo. Datandolo al primo, né
               l'una né l'altra giornata quadrava — e con il filtro di ingresso
               (oggi→oggi) la riga non si vedeva affatto. */
            quando: vero.quando,
            cliente: primo.cliente ?? vero.cliente,
            operatore: primo.operatore ?? vero.operatore,
            contrattoId: primo.contrattoId ?? vero.contrattoId,
            azienda: primo.azienda ?? vero.azienda,
            ristampaDi: primo.ristampaDi,
            prova: primo.prova || vero.prova,
            stato: usciti.length ? "done" : ultimo.stato,
            result: vero.result,
            matricola: vero.matricola ?? primo.matricola,
            emessi: usciti.length,
            /* TUTTI i numeri usciti, per la ricerca e per il conto: chi
               telefona con in mano lo scontrino del PRIMO tentativo deve
               trovarlo scrivendo quel numero nella casella Cerca. */
            numeriEmessi: usciti.map((d) => d.numero).filter(Boolean) as string[],
            /* ⚠️ NON SOLO L'ULTIMO. Un documento può avere DUE ristampe — in
               produzione ce n'è già una così, nata negli undici minuti prima
               che il blocco lato server andasse su. Con `ultimo` si guardava
               solo l'ultima nata: se quella era uscita e l'altra era ancora in
               coda, la riga diceva «riemesso» in giallo mentre sulla cassa
               c'era un secondo scontrino pronto a partire. */
            inCoda: usciti.length > 0 && ordinate.some((x) => x.id !== vero.id && (x.stato === "pending" || x.stato === "sent")),
            /* la radice è FUORI dal periodo scelto: i tentativi veri sono più
               di quelli che si vedono, e la riga non deve spacciarsi per un
               documento uscito al primo colpo */
            radiceFuori: !!primo.ristampaDi && !perId.has(primo.ristampaDi),
            avvisoPrima: prima ? prima.spiega : null,
            graveAperto,
            tentativi: ordinate.length,
            storia: ordinate.map((d) => ({ id: d.id, quando: d.quando, stato: d.stato, result: d.result, numero: d.numero })),
        });
    }
    /* ⚠️ una catena che ha la radice FUORI dal periodo scelto resta comunque
       una riga sola: la radice non si trova, quindi la ristampa fa catena per
       conto suo — meglio una riga in più che una riga persa. Che sia un pezzo
       di catena lo dice `radiceFuori`, se no una ristampa guardata il giorno
       dopo sembrerebbe un documento pulito uscito al primo tentativo. */
    return out.sort((a, b) => b.quando.localeCompare(a.quando));
}

type Doc = {
    id: string;
    quando: string;
    negozio: string;
    /** il computer che l'ha stampato: distingue i due banchi di un locale */
    agente: string;
    tipo: "scontrino" | "fattura";
    fiscale: boolean;
    storno: boolean;
    prova: boolean;
    stato: string;
    result: string | null;
    totale: number | null;
    numero: string | null;
    matricola: string | null;
    cliente: string | null;
    operatore: string | null;
    contrattoId: string | null;
    azienda: string | null;
    ristampaDi: string | null;   // se questo doc È una ristampa: id dell'originale
    righe: RigaDoc[];
    pagamenti: PagDoc[];
    /* ⚠️ I TENTATIVI DI UNO STESSO DOCUMENTO STANNO IN UNA RIGA SOLA (Luca
       02/09): «quando uno scontrino fallisce e lo si rifà non deve generare
       una nuova riga; bisogna tenere il conto dei tentativi e aggiornare
       l'esito dell'ultimo».
       A database i lavori restano DUE — sono due tentativi di documento
       fiscale e la tracciabilità non si tocca — ma qui si vedono come uno:
       due righe uguali fanno pensare a due scontrini emessi, che è la cosa
       peggiore da far credere a chi sta controllando la cassa. */
    tentativi: number;
    emessi: number;              // quanti tentativi sono usciti DAVVERO dal registratore
    numeriEmessi: string[];      // i numeri fiscali di tutti i documenti usciti
    inCoda: boolean;             // uno è uscito e un altro è ancora in coda
    radiceFuori: boolean;        // il primo tentativo è fuori dal periodo scelto
    graveAperto: boolean;        // un tentativo ha lasciato il documento APERTO sulla cassa
    avvisoPrima: string | null;  // l'avviso grave di un tentativo precedente
    storia: { id: string; quando: string; stato: string; result: string | null; numero: string | null }[];
};

const NOME_PAG: Record<number, string> = { 0: "Contanti", 1: "Assegno", 2: "Carta / elettronico", 3: "Ticket", 4: "Non riscosso" };
/* MILLE, non tremila: e' il `max-rows` di PostgREST su questo progetto —
   provato, `.limit(3000)` restituisce comunque 1000. Scrivendo 3000 l'avviso
   di troncamento non sarebbe uscito MAI, e a una settimana di documenti per
   l'amministrazione (~1.250) l'elenco si sarebbe tagliato in silenzio.
   Il conteggio esatto arriva a parte (`count`), cosi' la pagina non dice
   «1.000 documenti» quando ce ne sono quattromila. */
const TETTO = 1000;

/* ELENCO CHIUSO. `SelectOpzioni` e' una casella a testo libero: svuotandola si
   poteva mandare in amministrazione «Il cliente ha invece pagato: » — una
   richiesta che non chiede niente. Il bottone si spegne se il valore non e'
   uno di questi. */
const FORME_PAGAMENTO = ["Contanti", "Carta", "Bonifico", "Non riscosso / credito", "Finanziamento"];

function Documenti() {
    const { user } = useAuth();
    const { seesAll, stores: negoziVisibili, loaded: visibilitaPronta } = useVisibleStores();

    const [docs, setDocs] = useState<Doc[] | null>(null);
    const [errore, setErrore] = useState("");
    const [caricando, setCaricando] = useState(false);
    const [quantiInTutto, setQuantiInTutto] = useState<number | null>(null);
    /* ⚠️ QUANTE RIGHE SONO STATE LETTE DAVVERO, prima dell'unione dei
       tentativi. Confrontare il `count` del database con `docs.length` — che
       ora è il numero di righe FUSE — faceva scattare l'avviso «l'elenco è
       troncato, stringi le date» a ogni ristampa: su una giornata da dodici
       documenti, il che è falso e insegna a ignorare l'avviso. */
    const [quanteGrezze, setQuanteGrezze] = useState(0);
    const [tuttiNegozi, setTuttiNegozi] = useState<string[]>([]);
    const [uffici, setUffici] = useState<string[]>([]);

    /* ── I FILTRI ──────────────────────────────────────────────────────────── */
    const [tipo, setTipo] = useState<"" | "scontrino" | "fattura">("");
    const [scelti, setScelti] = useState<string[]>([]);
    const [cerca, setCerca] = useState("");
    const [utenti, setUtenti] = useState<string[]>([]);
    /* ⭐ I DUE PUNTI VENDITA DI UN LOCALE SI DISTINGUONO PER SOCIETÀ (Luca):
       «se devo fare una ricerca degli scontrini devo poter filtrare un punto
       vendita e poter filtrare l'altro». Da quando il negozio è uno solo, il
       nome non basta più: quello che separa i due banchi sono le due partite
       IVA, ed è già scritto su ogni documento. */
    const [societa, setSocieta] = useState<string[]>([]);
    const oggi = new Date().toLocaleDateString("sv-SE");
    const [dal, setDal] = useState(oggi);
    const [al, setAl] = useState(oggi);
    const [aperto, setAperto] = useState<string | null>(null);
    const [sort, setSort] = useState<{ col: number; desc: boolean }>({ col: 0, desc: true });

    /* CHI ARRIVA DA UNA TASK ATTERRA SUL DOCUMENTO, non sull'elenco di oggi.
       La richiesta di correzione porta con sé id e data: senza, Claudia apriva
       «/documenti» e trovava la giornata corrente dei SUOI negozi — cioè non il
       documento. È lo stesso errore già corretto il 31/08 sul bonifico. */
    /* `useSearchParams` E NON `window.location`, che e' la prassi di casa
       altrove: qui l'indirizzo cambia SENZA che la pagina si rimonti — chi e'
       gia' su Documenti e clicca un'altra task resterebbe fermo sul documento
       di prima. Il nonce `t=` che mette UrgentTasks serve proprio a questo, e
       con `window.location` letto una volta sola non sarebbe servito a niente. */
    const parametri = useSearchParams();
    /* ═══ LE FATTURE DA EMETTERE (Luca 04/09) ════════════════════════════════
       Una vista a sé dentro Documenti: non sono documenti emessi, sono lavoro
       da fare. Il flash dell'amministrazione atterra qui con `?fattura=<id>`,
       e in quel caso la vista si apre da sola sulla richiesta giusta. */
    const [vistaFatture, setVistaFatture] = useState(false);
    const [fatturaApri, setFatturaApri] = useState<string | null>(null);
    const [daFatturare, setDaFatturare] = useState(0);
    /* CHI PUÒ ESITARE una fattura è chi la emette davvero: la stessa lista che
       il database controlla in `fattura_esita`. Qui serve solo a non mostrare
       un pulsante che poi risponderebbe di no. */
    const puoiEsitareFatture = ["amministrativo", "direttore_generale", "admin", "dev"]
        .includes(String(user?.role || ""));
    useEffect(() => {
        const d = parametri.get("doc"), g = parametri.get("giorno"), f = parametri.get("fattura");
        if (g && /^\d{4}-\d{2}-\d{2}$/.test(g)) { setDal(g); setAl(g); }
        if (d) setAperto(d);
        if (f) { setFatturaApri(f); setVistaFatture(true); }
    }, [parametri]);
    useEffect(() => {
        let vivo = true;
        (async () => {
            const { count } = await supabase.from("fatture_richieste")
                .select("id", { count: "exact", head: true }).eq("stato", "da_fare");
            if (vivo) setDaFatturare(count || 0);
        })();
        return () => { vivo = false; };
    }, [vistaFatture]);

    /* TUTTI I NOMI DEI NEGOZI, che servono per trovare i gemelli di sede
       fisica: «Collatina W3» e «Collatina Multi» sono lo stesso bancone. */
    /* ⚠️ SUL DOCUMENTO C'È IL NOME DEL COMPUTER, NON DEL NEGOZIO (02/09).
       Da quando i punti vendita doppi sono un negozio solo, `print_jobs.negozio`
       porta il nome con cui si presenta l'agente di stampa — «Magliana W3»,
       «Magliana Multi» — perché è l'unico modo di mandare lo scontrino alla
       stampante giusta dove le casse sono collegate col cavo.
       L'elenco qui mescolava i due mondi: i negozi dall'anagrafica («Magliana»)
       PIÙ quelli trovati sui documenti («Magliana Multi»), e a schermo
       comparivano due voci incoerenti — come se un banco fosse stato
       rinominato e l'altro no.
       Adesso il documento si riconduce al suo NEGOZIO, e i due punti vendita
       si distinguono per SOCIETÀ: che è quello che li separa davvero, visto
       che sono due partite IVA. */
    const [perAgente, setPerAgente] = useState<Record<string, { negozio: string; azienda: string }>>({});
    useEffect(() => {
        supabase.from("pos_rt").select("negozio, azienda, agente").then(({ data }) => {
            const m: Record<string, { negozio: string; azienda: string }> = {};
            ((data ?? []) as { negozio: string; azienda: string; agente: string | null }[])
                .forEach(r => { if (r.agente) m[r.agente] = { negozio: r.negozio, azienda: r.azienda }; });
            setPerAgente(m);
        });
    }, []);

    useEffect(() => {
        supabase.from("stores").select("name, is_ufficio").order("name").then(({ data }) => {
            const righe = (data ?? []) as { name: string; is_ufficio?: boolean }[];
            setTuttiNegozi(righe.map(r => r.name).filter(Boolean));
            setUffici(righe.filter(r => r.is_ufficio).map(r => r.name));
        });
    }, []);

    /* L'AMBITO: i negozi visibili PIÙ i loro gemelli. `null` = nessun limite
       (solo per chi vede tutto). Un array VUOTO è un limite legittimo, e la
       query deve rispettarlo tornando zero righe. */
    const ambito = useMemo<string[] | null>(() => {
        if (seesAll) return null;
        const out = new Set(negoziVisibili);
        negoziVisibili.forEach(v => tuttiNegozi.forEach(n => { if (stessoMagazzino(n, v)) out.add(n); }));
        /* I NOMI OPERATIVI DEI GEMELLI. Da 02/09 `print_jobs.negozio` porta il nome
           dell'AGENTE/cassa ("Collatina Multi", "Collatina W3"), non quello del
           negozio: un login ristretto alla sola radice ("Collatina") costruiva
           `.in("negozio", ["Collatina"])` e non trovava NESSUNO dei propri scontrini,
           che sono archiviati sotto le casse (03/09: Collatina/Magliana/Acilia
           vedevano 0 documenti dei propri, pur avendone fatti). `pos_rt` mappa
           agente→negozio: aggiungiamo all'ambito i nomi-cassa dei negozi visibili,
           così il filtro server li ritrova. La tendina resta pulita (vedi `negozi`). */
        Object.entries(perAgente).forEach(([agente, info]) => {
            if (negoziVisibili.some(v => stessoMagazzino(v, info.negozio) || stessoMagazzino(v, agente))) out.add(agente);
        });
        return negozioInValues(Array.from(out));
    }, [seesAll, negoziVisibili, tuttiNegozi, perAgente]);

    /* ── LA LETTURA ──────────────────────────────────────────────────────────
       Per INTERVALLO DI DATE, non «gli ultimi N»: un negozio che cerca lo
       scontrino di martedì non deve scoprire che l'elenco si ferma a ieri. */
    const carica = useCallback(async () => {
        if (!visibilitaPronta) return;
        setCaricando(true); setErrore("");
        try {
            let q = supabase.from("print_jobs")
                .select("id, negozio, kind, status, result, request_xml, meta, created_at", { count: "exact" })
                .in("kind", ["fiscal_receipt", "non_fiscal", "fiscal_void"])
                .gte("created_at", inizioGiorno(dal))
                .lte("created_at", fineGiorno(al))
                .order("created_at", { ascending: false })
                .limit(TETTO);
            /* SI FALLISCE CHIUSI. Senza l'`if` sulla lunghezza: lista vuota →
               `.in("negozio", [])` → zero righe, che è la risposta giusta per
               chi non ha negozi. Prima, zero negozi significava vedere tutto. */
            if (ambito) q = q.in("negozio", ambito);
            const { data, error, count } = await q;
            if (error) throw error;
            type Riga = { id: string; negozio: string; kind: string; status: string; result: string | null; request_xml: string | null; meta: Record<string, unknown> | null; created_at: string };
            const grezze = (data ?? []) as Riga[];
            setQuantiInTutto(count ?? null);
            setQuanteGrezze(grezze.length);
            /* LE PROVE DI COLLEGAMENTO FUORI SUBITO: «== CHECK COLLATINA W3 ==»
               e' il tasto che verifica se la cassa risponde, non un documento. */
            const lette = grezze.map(r => ({ r, x: leggiXml(r.request_xml) })).filter(o => !o.x.diagnostica);
            setDocs(uniscoTentativi(lette.map(({ r, x }) => {
                const m = (r.meta || {}) as Record<string, unknown>;
                const { righe, pagamenti, totaleDichiarato } = x;
                return {
                    id: r.id,
                    quando: r.created_at,
                    /* il negozio VERO: il documento porta il nome del computer */
                    negozio: perAgente[r.negozio]?.negozio || r.negozio,
                    agente: r.negozio,
                    tipo: "scontrino" as const,
                    fiscale: r.kind !== "non_fiscal",
                    storno: r.kind === "fiscal_void",
                    prova: m.testMode === true,
                    stato: r.status,
                    result: r.result,
                    /* IL TOTALE, in ordine di attendibilita': quello che abbiamo
                       scritto noi nel `meta`, poi quello STAMPATO sul documento,
                       e solo per ultimo la somma delle righe. */
                    totale: m.total != null ? Number(m.total)
                        : totaleDichiarato != null ? totaleDichiarato
                        : (righe.reduce((a, r) => a + r.prezzo * r.quantita, 0) || null),
                    numero: numeroDoc(r.result),
                    matricola: matricolaDoc(r.result),
                    cliente: (m.cliente as string) || null,
                    operatore: (m.operatore as string) || null,
                    contrattoId: (m.contrattoId as string) || null,
                    azienda: (m.azienda as string) || null,
                    ristampaDi: (m.ristampaDi as string) || null,
                    righe, pagamenti,
                    tentativi: 1,
                    emessi: 0, numeriEmessi: [], inCoda: false, radiceFuori: false, avvisoPrima: null, graveAperto: false,
                    storia: [],
                };
            })));
        } catch (e) {
            setErrore((e as Error)?.message || "non sono riuscito a leggere i documenti");
        } finally { setCaricando(false); }
    }, [dal, al, ambito, visibilitaPronta, perAgente]);

    useEffect(() => { carica(); }, [carica]);

    /* I NEGOZI CHE SI POSSONO SCEGLIERE sono quelli visibili all'utente, gemelli
       compresi: chi ne ha tre ne sceglie fra tre, l'amministrazione fra tutti. */
    const negozi = useMemo(() => {
        /* NON si aggiungono più i negozi trovati sui documenti: quelli sono nomi
           di computer, e finivano nella tendina accanto a quelli veri. La tendina
           mostra i NOMI VERI (anagrafica), non i nomi-cassa: l'espansione ai gemelli
           delle casse vive solo in `ambito` (il filtro server), non qui. */
        const s = new Set<string>();
        if (seesAll) { tuttiNegozi.forEach(n => s.add(n)); }
        else {
            negoziVisibili.forEach(v => s.add(v));
            negoziVisibili.forEach(v => tuttiNegozi.forEach(n => { if (stessoMagazzino(n, v)) s.add(n); }));
        }
        return Array.from(s).filter(Boolean).sort();
    }, [seesAll, tuttiNegozi, negoziVisibili]);

    /* «I MIEI NEGOZI» PER CHI STA IN UFFICIO NON ESISTE. Claudia e Sandra hanno
       `primary_store = "Ufficio"`: preselezionando il loro negozio, il filtro
       scartava OGNI documento e Documenti si apriva vuota — 171 documenti letti,
       0 a schermo. E la task di correzione le portava proprio li'. Un ufficio
       non batte scontrini: per loro non si preseleziona niente, e vedono tutto
       quello che gli e' stato dato. */
    const miei = useMemo(() => {
        const n = user?.negozio as string | undefined;
        if (!n || uffici.some(u => stessoMagazzino(u, n))) return [];
        return negozi.filter(x => stessoMagazzino(x, n));
    }, [negozi, user?.negozio, uffici]);

    /* GIÀ SUL PROPRIO NEGOZIO ALL'INGRESSO, una volta sola: dietro il bancone la
       domanda è «cosa ho battuto io», non «cosa ha battuto il gruppo». Se poi
       uno allarga a tutti, non gli si richiude sotto le mani. */
    const primaVolta = useRef(true);
    useEffect(() => {
        if (!primaVolta.current || !miei.length) return;
        primaVolta.current = false; setScelti(miei);
    }, [miei]);

    /** «Telefutura 2 S.R.L.», non «T2». */
    /* ⚠️ IL NOME NON SI CHIEDE PIÙ AL DATABASE. Veniva da
       `pos_rt.ragione_sociale`, che è l'etichetta della CASSA e non una ragione
       sociale: la mappa era chiavata solo sul codice società, senza un ordine,
       e per Telefutura vinceva l'ultima riga letta — «Telefutura (Custom) -
       Acilia» su ogni documento di tutti e dieci i negozi.
       Filtrare per «ha la partita IVA» sarebbe bastato OGGI, con una sola riga
       T1 che ce l'ha: il giorno che qualcuno completa l'anagrafica — la
       pulizia più prevedibile che ci sia, visto che nove righe su dieci l'hanno
       vuota — lo stesso identico difetto tornerebbe, in silenzio. Il nome di
       una società non è un dato che cambia: sta scritto in `@/lib/societa`. */
    const nomeSoc = useCallback((c: string | null) => nomeSocieta(c), []);
    /* ⚠️ «SENZA SOCIETÀ» È UNA RISPOSTA POSSIBILE, e va potuta chiedere.
       Misurato: 28 documenti fiscali su 571 non hanno la società registrata —
       ventuno sono del 1° settembre, il giorno in cui si accendevano le casse.
       Con `.filter(Boolean)` non erano un'opzione, e siccome il filtro scarta
       chi non è nella lista scelta, premere «tutte e due» ne faceva sparire
       cinquanta senza dirlo. Adesso hanno una voce loro, e compare solo se ce
       ne sono davvero. */
    const SENZA_SOC = "senza società";
    const societaInElenco = useMemo(() => {
        const nomi = new Set((docs || []).map(d => nomeSoc(d.azienda)).filter(Boolean));
        const fuori = (docs || []).some(d => !d.azienda);
        return [...Array.from(nomi).sort(), ...(fuori ? [SENZA_SOC] : [])];
    }, [docs, nomeSoc]);

    const operatori = useMemo(() => Array.from(new Set((docs || []).map(d => d.operatore).filter(Boolean) as string[])).sort(), [docs]);

    /* ── CHI PASSA I FILTRI ───────────────────────────────────────────────── */
    const passa = useCallback((d: Doc) => {
        if (scelti.length && !scelti.some(n => stessoMagazzino(n, d.negozio))) return false;
        if (utenti.length && !utenti.includes(d.operatore || "")) return false;
        if (societa.length && !societa.includes(d.azienda ? nomeSoc(d.azienda) : SENZA_SOC)) return false;
        const q = cerca.trim().toLowerCase();
        if (q) {
            const qs = q.replace(/[\s./-]/g, "");
            /* ⚠️ TUTTI i numeri usciti, non solo l'ultimo: se di questa vendita
               sono usciti due documenti, il cliente ha in mano UNO dei due — e
               cercando quel numero deve trovare la riga. */
            const dentro = (d.numeriEmessi.length ? d.numeriEmessi : [d.numero || ""]).some((x) => x.toLowerCase().includes(q))
                || (d.cliente || "").toLowerCase().includes(q)
                || (d.matricola || "").toLowerCase().includes(q)
                || d.righe.some(r => r.descrizione.toLowerCase().includes(q)
                    || (qs.length >= 6 && r.descrizione.replace(/[\s./-]/g, "").toLowerCase().includes(qs)));
            if (!dentro) return false;
        }
        return true;
    }, [scelti, utenti, cerca, societa, nomeSoc]);

    /* I RIQUADRI CONTANO PRIMA DEL PROPRIO FILTRO — la regola di Magazzino: un
       riquadro spento deve dire quanti ce ne sarebbero, se no non lo preme
       nessuno. */
    const base = useMemo(() => (docs || []).filter(passa), [docs, passa]);
    /* GLI ORIGINALI GIÀ RIMESSI IN CODA UNA VOLTA (Luca 01/09 notte): l'insieme
       degli id-documento che compaiono come `ristampaDi` di qualche altro job. Su
       questi il tasto «Rifai» non si ripropone — una ristampa sola per documento,
       la stessa regola blindata sul server (evita le tasse triplicate). */
    /* ⚠️ SI LEGGE DALLA CATENA, non da `ristampaDi`. Dopo l'unione delle righe
       la riga porta la radice, e la radice per definizione NON è una ristampa:
       l'insieme restava vuoto e l'avviso non compariva più da nessuna parte.
       Un documento con più di un tentativo — o che continua una catena
       cominciata fuori periodo — è già stato rifatto una volta. */
    const giaRifatti = useMemo(() => {
        const s = new Set<string>();
        (docs || []).forEach(d => { if (d.tentativi > 1 || d.radiceFuori) s.add(d.id); });
        return s;
    }, [docs]);
    const conta = useMemo(() => {
        const s = base.filter(d => d.tipo === "scontrino");
        const f = base.filter(d => d.tipo === "fattura");
        /* GLI ANNULLI RESTANO FUORI DAL CONTO. Un `fiscal_void` e' solo un
           riferimento al documento annullato (`VOID 0012 0034 …`): non porta
           ne' righe ne' totale, quindi non si sa quanto vale. Moltiplicarlo
           per −1 sottraeva zero e faceva credere che il conto ne tenesse
           conto. Meglio dirlo sotto che fingerlo qui. */
        /* ⚠️ UNA RIGA PUÒ VALERE DUE DOCUMENTI. Quando la doppia emissione è
           reale, il registratore ha battuto l'importo due volte e lo Z di
           giornata lo porta due volte: contarlo una sola perché in elenco
           sta su una riga sola farebbe quadrare la pagina e non la cassa. */
        const somma = (l: Doc[]) => l.filter(d => d.stato === "done" && !d.prova && !d.storno)
            .reduce((a, d) => a + (d.totale || 0) * Math.max(1, d.emessi), 0);
        /* ⚠️ E ANCHE IL CONTEGGIO. Dentro lo stesso riquadro il numero contava
           RIGHE e la cifra contava DOCUMENTI: su una doppia emissione si
           leggeva «1 scontrino · 239,80 €», cioè uno scontrino medio da 239,80
           che non esiste. Una riga vale quanti documenti sono usciti. */
        const quanti = (l: Doc[]) => l.reduce((a, d) => a + Math.max(1, d.emessi), 0);
        return {
            scontrini: quanti(s), fatture: quanti(f),
            valScontrini: somma(s), valFatture: somma(f),
            incerti: base.filter(d => d.stato !== "done").length,
            /* ⚠️ SENZA NUMERO SI CONTA SUI DOCUMENTI USCITI: una catena mista
               (uno Epson col numero, uno Custom senza) ne ha uno solo senza. */
            senzaNumero: base.filter(d => d.stato === "done").reduce((a, d) => a + Math.max(0, Math.max(1, d.emessi) - d.numeriEmessi.length), 0),
            storni: quanti(base.filter(d => d.storno && d.stato === "done")),
            /* ⚠️ I DOPPI HANNO `stato === "done"`, quindi NON entrano in
               `incerti`: senza un contatore loro, la testata può dire tutto
               verde mentre in elenco ci sono quattro doppie emissioni. */
            doppi: base.filter(d => d.emessi > 1).length,
            inCoda: base.filter(d => d.inCoda).length,
        };
    }, [base]);

    const righe = useMemo(() => {
        const l = tipo ? base.filter(d => d.tipo === tipo) : base;
        const chiave = (d: Doc): string | number => {
            switch (sort.col) {
                case 1: return d.negozio || "";
                /* la società è entrata come colonna 2: da qui in giù gli indici
                   sono scalati di uno, e devono restare allineati a COLONNE */
                case 2: return nomeSoc(d.azienda) || "";
                /* «n. 12» dopo «n. 3», non prima: come testo l'ordine e'
                   quello dell'alfabeto, e su un elenco di scontrini non vuol
                   dire niente. */
                case 3: return d.numero ? Number(d.numero) || d.numero : (d.matricola || "");
                case 4: return d.righe.map(r => r.descrizione).join(" ");
                case 5: return d.operatore || "";
                case 6: return d.totale ?? -1;
                default: return d.quando;
            }
        };
        return [...l].sort((a, b) => {
            const x = chiave(a), y = chiave(b);
            const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "it");
            return sort.desc ? -c : c;
        });
    }, [base, tipo, sort, nomeSoc]);

    const esporta = () => {
        const righeCsv = [
            /* ⚠️ ANCHE NEL FILE C'È LA SOCIETÀ. È la prima cosa che si cerca
               quando si divide un elenco fra due partite IVA, ed è esattamente
               il motivo per cui questo file esiste. */
            ["Data", "Ora", "Negozio", "Società", "Tipo", "Numero", "Tutti i numeri usciti", "Tentativi", "Matricola", "Totale €", "Cliente", "Operatore", "Esito", "Voci"].join(";"),
            ...righe.map(d => [gg(d.quando), ora(d.quando), d.negozio, nomeSoc(d.azienda),
                d.storno ? "Annullo" : d.fiscale ? "Fiscale" : "Non fiscale",
                d.numero || "", d.numeriEmessi.join(" + "), String(d.tentativi),
                d.matricola || "",
                /* ⚠️ QUANTO HA REGISTRATO LA CASSA, non quanto vale la riga:
                   su una doppia emissione la pagina conta l'importo due volte
                   (perché due volte sta nello Z) e il file che va al
                   commercialista deve dire lo stesso numero. */
                String(d.totale != null ? d.totale * Math.max(1, d.emessi) : "").replace(".", ","), d.cliente || "", d.operatore || "",
                esitoDi(d.stato, d.result, d.tentativi, d.emessi, d.inCoda, d.radiceFuori, d.graveAperto, d.fiscale, d.storno)?.et || "emesso", d.righe.map(r => r.descrizione).join(" + ")].join(";")),
        ].join("\n");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob(["﻿" + righeCsv], { type: "text/csv;charset=utf-8" }));
        a.download = `documenti_${dal}_${al}.csv`; a.click();
    };

    /* ── LA RICHIESTA DI CORREZIONE ───────────────────────────────────────────
       Luca: «il punto vendita può fare una richiesta di modifica del pagamento
       — ha esito carta e si è sbagliato — cambiandola per contanti; questa
       modifica arriva in amministrazione».
       Il documento NON si tocca: uno scontrino emesso è emesso. Si apre una
       richiesta, e chi di dovere decide. È successo davvero oggi a Merulana:
       la cassa dava errore, il venditore ha battuto «carta» per far uscire lo
       scontrino, ma il cliente aveva pagato in contanti. */
    const [chiedendo, setChiedendo] = useState<Doc | null>(null);
    const [nuovaForma, setNuovaForma] = useState("Contanti");
    const [perche, setPerche] = useState("");
    const [inviando, setInviando] = useState(false);
    const [fatta, setFatta] = useState("");
    const [fallita, setFallita] = useState("");

    /* ── RIFAI IL DOCUMENTO (Luca 01/09 sera) ────────────────────────────────
       «In Documenti, quando c'è scritto NON USCITO in rosso, un tasto per rifare
       lo scontrino se non è uscito.» Rimette in coda la STESSA richiesta verso lo
       STESSO registratore (nuovo job; l'originale in errore resta come storico).
       ⚠️ Doppia stampa: su «esito ignoto» / «rimasto aperto» la carta può essere
       uscita lo stesso → si CONFERMA guardando prima lo scontrino / la cassa. */
    const [rifacendo, setRifacendo] = useState<Doc | null>(null);
    const [rifaLoad, setRifaLoad] = useState(false);
    const [rifaOk, setRifaOk] = useState("");
    const [rifaKo, setRifaKo] = useState("");
    /* i documenti già rimessi in coda IN QUESTA SESSIONE: il tasto si spegne
       subito, senza aspettare il ricarico (e comunque il server rifiuta il bis). */
    const [rifatti, setRifatti] = useState<Set<string>>(new Set());

    const rifaiDocumento = async (d: Doc) => {
        if (rifaLoad) return;
        setRifaLoad(true); setRifaOk(""); setRifaKo("");
        try {
            const res = await fetch("/api/vendita/ristampa", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jobId: d.id }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok || !j.ok) { setRifaKo(j.error || "non sono riuscito a rimetterlo in coda"); return; }
            // segna subito come rifatto: niente secondo invio dallo stesso browser
            setRifatti(prev => new Set(prev).add(d.id));
            setRifaOk("Rimesso in coda UNA volta: la cassa lo ritira e lo stampa fra pochi secondi. Chiudi SuiteMobile se è un registratore Custom. NON premere altro: controlla che esca la carta.");
            carica();
        } catch (e) {
            setRifaKo("Errore di rete: " + ((e as Error)?.message || "riprova"));
        } finally { setRifaLoad(false); }
    };

    const inviaRichiesta = async () => {
        if (!chiedendo || inviando) return;
        setInviando(true); setFatta(""); setFallita("");
        try {
            const vecchia = chiedendo.pagamenti.map(p => `${p.descrizione} ${eur(p.importo)}`).join(" + ") || "—";
            const giorno = new Date(chiedendo.quando).toLocaleDateString("sv-SE");
            const { error } = await supabase.from("admin_tasks").insert({
                tipo: "correzione_pagamento",
                titolo: `🧾 ${chiedendo.negozio}: correggere il pagamento di uno scontrino da ${eur(chiedendo.totale)}`,
                /* IL DETTAGLIO PORTA LA CHIAVE CERTA. Il numero non c'è sui
                   Custom, l'ora da sola non basta (a Merulana alle 17:37 ci
                   sono più documenti): l'id del lavoro di stampa è l'unica
                   cosa che identifica un documento senza ambiguità. */
                dettaglio: `${user?.name || "un operatore"} chiede di correggere la forma di pagamento del documento del `
                    + `${gg(chiedendo.quando)} alle ${ora(chiedendo.quando)}`
                    + `${chiedendo.numero ? ` (n. ${chiedendo.numero})` : chiedendo.matricola ? ` (cassa ${chiedendo.matricola})` : ""}.\n`
                    + `Sullo scontrino risulta: ${vecchia}.\nIl cliente ha invece pagato: ${nuovaForma}.\n`
                    + (perche.trim() ? `Motivo: ${perche.trim()}\n` : "")
                    + `Voci: ${chiedendo.righe.map(r => `${r.descrizione} ${eur(r.prezzo)}`).join(" · ")}\n`
                    + `Documento: ${chiedendo.id}`,
                link: `/documenti?doc=${encodeURIComponent(chiedendo.id)}&giorno=${giorno}`,
                target_role: "amministrativo",
                created_by: user?.name || null,
            });
            if (error) throw error;
            setFatta("Richiesta inviata all'amministrazione: la trovano nelle loro cose da fare, col documento allegato.");
            setPerche("");
        } catch (e) {
            setFallita("Non sono riuscito a inviarla: " + ((e as Error)?.message || "riprova"));
        } finally { setInviando(false); }
    };

    const QUADRI = [
        { id: "" as const, icona: "🧾", et: "Tutti", n: conta.scontrini + conta.fatture, val: conta.valScontrini + conta.valFatture, tinta: "rvT-indaco" },
        { id: "scontrino" as const, icona: "🧾", et: "Scontrini", n: conta.scontrini, val: conta.valScontrini, tinta: "rvT-verde" },
        { id: "fattura" as const, icona: "📄", et: "Fatture", n: conta.fatture, val: conta.valFatture, tinta: "rvT-ciano" },
    ];
    /* ⚠️ NEGOZIO E SOCIETÀ SONO DUE COSE, E VANNO IN DUE COLONNE. Luca 03/09:
       «è un po' confusionario, ci deve essere la colonna negozio e la colonna
       società, devono essere separate e chiare». Stavano incolonnate una sotto
       l'altra nella stessa cella, e la seconda si leggeva come una precisazione
       della prima — cioè «Baleniere, cioè Acilia». */
    const COLONNE = ["Quando", "Negozio", "Società", "Documento", "Contenuto", "Operatore", "Totale"];

    /* IL DETTAGLIO, che si apre DENTRO la riga: un pannello in fondo alla
       tabella, con trecento righe caricate, compare a migliaia di pixel dalla
       riga che l'ha aperto — cioè fuori schermo. */
    const dettaglio = (d: Doc) => {
        const es = esitoDi(d.stato, d.result, d.tentativi, d.emessi, d.inCoda, d.radiceFuori, d.graveAperto, d.fiscale, d.storno);
        return (
            <div className="rvDett">
                {es && (
                    <div className={cn("rvNota", es.tono === "rvBadge-ko" ? "rvNota-ko" : "rvNota-att")}>
                        <div className="rvNota-t">Questo documento è «{es.et}»</div>
                        <div className="rvNota-s">{es.spiega}</div>
                        {/* ⚠️ L'AVVISO DEL TENTATIVO PRECEDENTE È PARTE DI QUESTO
                            VERDETTO, non un secondo verdetto: due riquadri rossi
                            identici uno sotto l'altro non dicono a chi legge quale
                            dei due guardare. */}
                        {d.avvisoPrima && (
                            <div className="rvNota-s"><b>⚠️ Un tentativo precedente può aver già stampato.</b> {d.avvisoPrima}</div>
                        )}
                        {d.result && <div className="rvTab-min">La cassa ha risposto: {d.result.slice(0, 300)}</div>}
                        {/* RIFAI IL DOCUMENTO (Luca 01/09): il tasto sta QUI, dentro
                            l'avviso rosso «non uscito», dove lo si legge. Solo sui
                            documenti in errore; con conferma perché un fiscale non si
                            batte per sbaglio, e con l'avviso doppia-stampa dove serve. */}
                        {d.stato === "error" && (() => {
                            /* UNA SOLA VOLTA (Luca 01/09 notte): se questo documento è
                               già stato rimesso in coda, il tasto NON si ripropone. */
                            if (giaRifatti.has(d.id) || rifatti.has(d.id)) {
                                return (
                                    <div className="rvNota-s mt-2">
                                        ↻ <b>Già rimesso in coda una volta.</b> Guarda in elenco com'è andata la ristampa prima di rifarlo — se la cassa è «rimasta aperta», va chiusa o annullata DALLA CASSA (un altro invio non la chiude).
                                    </div>
                                );
                            }
                            return rifacendo?.id === d.id ? (
                                <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                                    {es.et !== "non uscito" && (
                                        <div className="rvNota-t">
                                            ⚠️ Attenzione: la carta potrebbe essere <b>già uscita</b>.
                                            {es.et === "rimasto aperto"
                                                ? " Chiudi o annulla il documento DALLA CASSA, poi rifallo — se no lo batti due volte."
                                                : " Guarda lo scontrino PRIMA di rifarlo — se no lo batti due volte."}
                                        </div>
                                    )}
                                    <div className="rvPillRow mt-1">
                                        <button onClick={() => rifaiDocumento(d)} disabled={rifaLoad} className="rvPill rvPill-on">
                                            {rifaLoad ? "rimetto in coda…" : "✅ Sì, rifai (una volta sola)"}
                                        </button>
                                        <button onClick={() => { setRifacendo(null); setRifaOk(""); setRifaKo(""); }} className="rvPill rvPill-sm">Annulla</button>
                                    </div>
                                    {rifaOk && <div className="rvNota rvNota-info mt-2"><div className="rvNota-t">✓ Rimesso in coda</div><div className="rvNota-s">{rifaOk}</div></div>}
                                    {rifaKo && <div className="rvNota rvNota-ko mt-2"><div className="rvNota-t">Non rifatto</div><div className="rvNota-s">{rifaKo}</div></div>}
                                </div>
                            ) : (
                                <div className="rvPillRow mt-2">
                                    <button onClick={(e) => { e.stopPropagation(); setRifacendo(d); setRifaOk(""); setRifaKo(""); }} className="rvPill rvPill-sm">
                                        🖨️ Rifai il documento
                                    </button>
                                </div>
                            );
                        })()}
                    </div>
                )}
                {/* LA STORIA DEI TENTATIVI, quando ce n'è più di uno: chi controlla
                    la cassa deve poter vedere che cosa è successo e quando, senza
                    andarsi a cercare due righe diverse in elenco. */}
                {(d.tentativi > 1 || d.radiceFuori) && (
                    <div className="rvNota rvNota-info">
                        <div className="rvNota-t">🖨️ {d.tentativi} tentativ{d.tentativi === 1 && !d.radiceFuori ? "o" : "i"} di stampa{d.radiceFuori ? " qui, più quelli che non sono in questo elenco" : ""}</div>
                        {d.storia.map((t, i) => {
                            const e2 = esitoDi(t.stato, t.result, 1, t.stato === "done" ? 1 : 0);
                            return (
                                <div key={t.id} className="rvDettR">
                                    <span className="rvTab-min">{i + 1}°</span>
                                    <span>{new Date(t.quando).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                                    <span className={cn("rvBadge", e2 ? e2.tono : "rvBadge-ok")}>{e2 ? e2.et : "emesso"}</span>
                                    {t.numero && <span className="rvBadge rvBadge-acc">n. {t.numero}</span>}
                                    {t.result && e2 && <span className="rvTab-min">{t.result.slice(0, 90)}</span>}
                                </div>
                            );
                        })}
                        <div className="rvNota-s">
                            A registro i tentativi restano distinti — sono due invii al registratore, e
                            se per caso fossero usciti entrambi la doppia emissione deve restare
                            visibile. Qui si leggono come un documento solo.
                        </div>
                    </div>
                )}
                {/* ⚠️ L'AVVISO DI UN TENTATIVO PRECEDENTE RESTA A VISTA. Appena
                    la ristampa entra in coda, la riga diventa «in coda» e il
                    «rimasto aperto» di prima uscirebbe dalla nota principale —
                    cioè proprio quando il rischio di batterlo due volte è più
                    alto. */}
                {d.avvisoPrima && (
                    <div className="rvNota rvNota-ko">
                        <div className="rvNota-t">⚠️ Un tentativo precedente può aver già stampato</div>
                        <div className="rvNota-s">{d.avvisoPrima}</div>
                    </div>
                )}
                <div className="rvDettT">
                    Cosa è stato scontrinato
                    {d.matricola ? ` · cassa ${d.matricola}` : ""}
                    {d.cliente ? ` · cliente ${d.cliente}` : ""}
                </div>
                {d.righe.length ? d.righe.map((r, i) => (
                    <div key={i} className="rvDettR">
                        <span>{r.descrizione}</span>
                        {r.quantita > 1 && <span className="rvTab-min">× {r.quantita}</span>}
                        {r.reparto != null && <span className="rvBadge rvBadge-acc">reparto {r.reparto}</span>}
                        <span className="rvDove-fine">{eur(r.prezzo * r.quantita)}</span>
                    </div>
                )) : <div className="rvTab-min">Di questo documento non abbiamo il dettaglio delle righe.</div>}

                <div className="rvDettT mt-2">Come è stato pagato</div>
                {d.pagamenti.length ? d.pagamenti.map((p, i) => (
                    <div key={i} className="rvDettR">
                        <span>{p.descrizione || NOME_PAG[p.tipo] || "—"}</span>
                        <span className="rvTab-min">{NOME_PAG[p.tipo] || `tipo ${p.tipo}`}</span>
                        <span className="rvDove-fine">{eur(p.importo)}</span>
                    </div>
                )) : (
                    <div className="rvTab-min">
                        {d.fiscale ? "Nessuna forma di pagamento registrata." : "I documenti non fiscali non registrano la forma di pagamento."}
                    </div>
                )}

                <div className="rvPillRow mt-2">
                    {d.contrattoId && (
                        <a href={`/ricerca-vendite?id=${encodeURIComponent(d.contrattoId)}`} className="rvPill rvPill-sm">
                            ↗ Apri la vendita
                        </a>
                    )}
                    {/* LA CORREZIONE SI CHIEDE SOLO SU UN DOCUMENTO USCITO: su
                        uno mai emesso, o di prova, non c'è niente da correggere
                        — e la richiesta farebbe perdere tempo a due persone. */}
                    {d.stato === "done" && !d.prova && d.fiscale && !d.storno ? (
                        <button onClick={(e) => { e.stopPropagation(); setChiedendo(chiedendo?.id === d.id ? null : d); setNuovaForma("Contanti"); setFatta(""); setFallita(""); }}
                            className={cn("rvPill rvPill-sm", chiedendo?.id === d.id && "rvPill-on")}>✏️ Chiedi la correzione del pagamento</button>
                    ) : (
                        <span className="rvTab-min">
                            {d.storno ? "Questo è un annullo: non ha una forma di pagamento da correggere."
                                : d.prova ? "Documento di prova: non c'è niente da correggere."
                                : !d.fiscale ? "Documento non fiscale: la forma di pagamento non c'è."
                                    : "Documento non emesso: non c'è niente da correggere."}
                        </span>
                    )}
                </div>

                {/* ═══ LA CORREZIONE SI CHIEDE QUI, SOTTO IL SUO BOTTONE ═══
                    Stava in fondo alla pagina, e il revisore l'ha misurato: con
                    una giornata di un negozio a schermo il bottone era a 1.107px
                    e il modulo a 4.589 — QUATTRO SCHERMATE più sotto. È lo stesso
                    errore che avevo appena corretto per il dettaglio, rifatto
                    venti righe dopo. Il documento non si tocca: si chiede, e lo
                    si chiede guardandolo. */}
                {chiedendo?.id === d.id && (
                    <div className="rvDett mt-2" onClick={(e) => e.stopPropagation()}>
                        <div className="rvDettT">✏️ Correzione della forma di pagamento</div>
                        <div className="rvNota rvNota-info">
                            <div className="rvNota-s">
                                Lo scontrino emesso non si modifica: questa è una <b>richiesta</b> che arriva
                                all&apos;amministrazione, con dentro cosa risulta, cosa dici tu e il documento allegato.
                            </div>
                        </div>
                        <div className="rvBarra mt-2">
                            <div className="rvCampo rvCampo-md"><span className="rvLab">Il cliente ha pagato con</span>
                                <SelectOpzioni className="rvIn" value={nuovaForma} onChange={setNuovaForma}
                                    opzioni={FORME_PAGAMENTO} /></div>
                            <label className="rvCampo rvCampo-lg"><span className="rvLab">Cosa è successo</span>
                                <input value={perche} onChange={e => setPerche(e.target.value)} className="rvIn"
                                    placeholder="es. la cassa dava errore" /></label>
                        </div>
                        <div className="rvPillRow mt-2">
                            <button onClick={inviaRichiesta} disabled={inviando || !FORME_PAGAMENTO.includes(nuovaForma)} className="rvPill rvPill-on">
                                {inviando ? "invio…" : "Invia all'amministrazione"}
                            </button>
                            <button onClick={() => setChiedendo(null)} className="rvPill rvPill-sm">Annulla</button>
                        </div>
                        {/* L'ESITO STA ACCANTO AL BOTTONE che l'ha prodotto. In cima
                            al riquadro era a 4.298px di distanza: chi premeva
                            «Invia» non vedeva né il «fatto» né l'errore. */}
                        {fatta && <div className="rvNota rvNota-info"><div className="rvNota-t">✓ Richiesta inviata</div><div className="rvNota-s">{fatta}</div></div>}
                        {fallita && <div className="rvNota rvNota-ko"><div className="rvNota-t">Richiesta non inviata</div><div className="rvNota-s">{fallita}</div></div>}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="max-w-[1500px]">
            <div className="rvTesta">
                <h1 className="rvTit"><Receipt size={25} /> Documenti</h1>
                <div className="rvPillRow">
                    <button onClick={carica} disabled={caricando} className="rvPill rvPill-sm">
                        <RefreshCw size={13} className="inline-block align-[-2px] mr-1" />{caricando ? "carico…" : "aggiorna"}
                    </button>
                    <button onClick={esporta} disabled={!righe.length} className="rvAzione rvAzione-sm">
                        <FileDown size={14} className="inline-block align-[-2px] mr-1.5" /> Excel
                    </button>
                </div>
            </div>

            <div className="rvBox">
                {/* ═══ I RIQUADRI ═══ premendone uno si vede solo quello. */}
                <div className="rvCampo rvCampo-flex"><span className="rvLab">Cosa è stato emesso</span>
                    <div className="rvRapidoG rvRapidoG-kpi rvRapidoG-pochi">
                        {QUADRI.map(q => {
                            const t = q.n.toLocaleString("it-IT");
                            return (
                                <button key={q.id || "tutti"} type="button" onClick={() => { setVistaFatture(false); setTipo(x => (x === q.id ? "" : q.id) as typeof tipo); }}
                                    className={cn("rvRapido", q.tinta, !vistaFatture && tipo === q.id && "rvRapido-on", !q.n && tipo !== q.id && "rvRapido-off")}>
                                    <em className={corpoNumero(t)}>{t}</em>
                                    <b>{q.icona} {q.et}</b>
                                    <small>{eurTondo(q.val)} incassati</small>
                                </button>
                            );
                        })}
                        {/* ═══ DA FATTURARE ═══ non è un tipo di documento emesso ma
                            una coda di lavoro, quindi apre una vista sua. Sta qui
                            perché è qui che l'amministrazione guarda la giornata. */}
                        <button type="button" onClick={() => { setVistaFatture(v => !v); setFatturaApri(null); }}
                            className={cn("rvRapido", "rvT-ambra", vistaFatture && "rvRapido-on", !daFatturare && !vistaFatture && "rvRapido-off")}>
                            <em className={corpoNumero(String(daFatturare))}>{daFatturare}</em>
                            <b>🧾 Da fatturare</b>
                            <small>richieste dalla cassa</small>
                        </button>
                    </div>
                    <div className="rvHint">
                        I valori contano solo i documenti riusciti e non di prova.
                        {conta.incerti > 0 ? ` ${conta.incerti} non risultano emessi: restano in elenco perché il tentativo c'è stato — apri la riga per sapere cos'ha risposto la cassa.` : ""}
                    </div>
                </div>

                {/* ═══ LA VISTA DELLE FATTURE DA EMETTERE ═══ prende il posto
                    di filtri e tabella: sono due lavori diversi, e mostrarli
                    insieme vorrebbe dire filtrare per data una coda di cose da
                    fare, che per definizione si guarda tutta. */}
                {vistaFatture ? (
                    <div className="mt-3">
                        <FattureDaFare puoiEsitare={puoiEsitareFatture} apriId={fatturaApri} />
                    </div>
                ) : (<>

                {/* ═══ I FILTRI ═══ */}
                <div className="rvBarra mt-3">
                    <label className="rvCampo rvCampo-lg"><span className="rvLab">Cerca</span>
                        <input value={cerca} onChange={e => setCerca(e.target.value)} className="rvIn"
                            placeholder="numero, IMEI, articolo o cliente" /></label>
                    <div className="rvCampo rvCampo-md"><span className="rvLab">Punto vendita</span>
                        <SelectMulti className="rvIn" values={scelti} onChange={setScelti} opzioni={negozi}
                            maxVoci={30} tuttiLabel="🌐 Tutti i miei negozi" placeholder="tutti quelli che vedo" /></div>
                    {/* SI VEDE SOLO DOVE SERVE: nei negozi con una società sola
                        sarebbe una domanda senza risposte. */}
                    {societaInElenco.length > 1 && (
                        <div className="rvCampo rvCampo-md"><span className="rvLab">Punto vendita (società)</span>
                            <SelectMulti className="rvIn" values={societa} onChange={setSocieta} opzioni={societaInElenco}
                                /* «tutte e due» era cablato al numero due: con la voce «senza società»
                                   sono tre, e il giorno di una terza società diventerebbe falso */
                                maxVoci={10} tuttiLabel="Tutte" placeholder="tutte" /></div>
                    )}
                    <div className="rvCampo rvCampo-md"><span className="rvLab">Operatore</span>
                        <SelectMulti className="rvIn" values={utenti} onChange={setUtenti} opzioni={operatori}
                            maxVoci={30} tuttiLabel="Tutti" placeholder="chiunque" /></div>
                    <label className="rvCampo"><span className="rvLab">Dal</span>
                        <input type="date" value={dal} max={al} onChange={e => setDal(e.target.value)} className="rvIn" /></label>
                    <label className="rvCampo"><span className="rvLab">Al</span>
                        <input type="date" value={al} min={dal} onChange={e => setAl(e.target.value)} className="rvIn" /></label>
                    <button onClick={() => { setTipo(""); setCerca(""); setUtenti([]); setSocieta([]); setScelti(miei); setDal(oggi); setAl(oggi); }}
                        className="rvPill rvPill-sm" title="Rimette tutto com'è entrando: i miei negozi, oggi">↺ Reset</button>
                </div>
                <div className="rvHint">L&apos;IMEI puoi spararlo col lettore dentro «Cerca»: lo trova dentro le voci dello scontrino.</div>

                {errore && <div className="rvNota rvNota-ko mt-3"><div className="rvNota-t">Non sono riuscito a leggere i documenti</div><div className="rvNota-s">{errore}</div></div>}

                {/* ═══ LE FATTURE ═══ la spiegazione sta PRIMA della tabella: chi
                    preme «Fatture» e trova vuoto deve leggere subito perché, non
                    scoprirlo in fondo alla pagina dopo aver cambiato le date. */}
                {tipo === "fattura" && !conta.fatture && (
                    <div className="rvNota rvNota-att mt-3">
                        <div className="rvNota-t">Qui ci sono le fatture EMESSE dal registratore, e non ce ne sono</div>
                        <div className="rvNota-s">
                            Le fatture non le stampa la cassa. Quando un cliente ne chiede una, la cassa
                            non emette scontrino e manda una richiesta all&apos;amministrazione: la trovi
                            nel riquadro <b>Da fatturare</b> qui sopra, con i dati del cliente pronti.
                            Non dipende dalle date: allargarle non farà comparire niente.
                        </div>
                    </div>
                )}

                {/* ═══ L'ELENCO ═══ */}
                {docs === null ? (
                    <div className="rvCarico"><Loader2 className="w-6 h-6 animate-spin" /> Carico i documenti…</div>
                ) : (
                    <>
                    {/* ⚠️ I DOPPI NON ENTRANO IN NESSUN ALTRO NUMERO DELLA TESTATA:
                        hanno `stato === "done"`, quindi `incerti` non li vede e i
                        riquadri possono dire tutto verde mentre in elenco ci sono
                        quattro vendite scontrinate due volte. Questo è l'unico
                        posto dove si leggono senza scorrere. */}
                    {(conta.doppi + conta.inCoda) > 0 && (
                        <div className="rvNota rvNota-ko mt-3">
                            <div className="rvNota-t">
                                🚨 {conta.doppi > 0 ? `${conta.doppi} vendit${conta.doppi === 1 ? "a" : "e"} con DUE documenti fiscali` : ""}
                                {conta.doppi > 0 && conta.inCoda > 0 ? " · " : ""}
                                {conta.inCoda > 0 ? `${conta.inCoda} con un secondo tentativo ancora in coda` : ""}
                            </div>
                            <div className="rvNota-s">
                                L&apos;importo sta nello Z di giornata più di una volta: finché non se ne annulla uno
                                DALLA CASSA la giornata non quadra. Sono le righe accese in rosso qui sotto.
                            </div>
                        </div>
                    )}
                    <div className="rvTabBox mt-3">
                        <table className="rvTab rvTab-large">
                            <thead>
                                <tr>
                                    {COLONNE.map((c, i) => (
                                        <th key={i} className={cn("rvTab-ord", i === 6 && "rvTab-eur")}
                                            onClick={() => setSort(s => ({ col: i, desc: s.col === i ? !s.desc : i === 0 || i === 6 }))}>
                                            {c}{sort.col === i ? <i>{sort.desc ? "↓" : "↑"}</i> : null}
                                        </th>))}
                                </tr>
                            </thead>
                            <tbody>
                                {!righe.length && (
                                    <tr><td colSpan={7} className="rvTab-vuoto">
                                        {tipo === "fattura"
                                            ? "Le fatture non sono ancora emesse dal CRM: qui non comparirà niente finché non ci sarà la parte che le crea."
                                            : "Nessun documento con questi filtri. Prova ad allargare le date: l'elenco parte da oggi."}
                                    </td></tr>
                                )}
                                {righe.map(d => {
                                    /* ⚠️ ANCHE PER L'ID DI UN TENTATIVO. Le task di correzione
                                        create prima dell'unione portano `?doc=<id-della-ristampa>`:
                                        ora quella riga è chiavata sulla radice, e senza questo
                                        l'amministrazione clicca la task e non si apre niente. */
                                    const apertaQui = aperto === d.id || (!!aperto && d.storia.some(t => t.id === aperto));
                                    const es = esitoDi(d.stato, d.result, d.tentativi, d.emessi, d.inCoda, d.radiceFuori, d.graveAperto, d.fiscale, d.storno);
                                    return (
                                        <Fragment key={d.id}>
                                            <tr onClick={() => setAperto(apertaQui ? null : d.id)}
                                                /* ⚠️ LA RIGA, NON IL BADGE. «DOPPIO» in una cella
                                                    da 253 px pesa quanto «annullo»: sull'unico stato
                                                    che dice «la giornata non quadra» si accende la
                                                    riga intera, con la barra rossa a sinistra. È
                                                    l'unica riga della pagina che lo fa. */
                                                className={cn("rvTab-riga rvTab-cl", (d.emessi > 1 || d.inCoda || d.graveAperto) && "rvTab-ko", apertaQui && "rvTab-on")}>
                                                <td className="rvTab-min">
                                                    <span className="rvTab-ap">{apertaQui ? "▾" : "▸"}</span>
                                                    {gg(d.quando)} <b>{ora(d.quando)}</b>
                                                </td>
                                                                {/* ⚠️ IL NEGOZIO È IL NOME PORTANTE DELLA RIGA, e va scritto
                                                    come tale: con `rvTab-min` — lo stile più smorto della
                                                    tabella — restava più silenzioso della pastiglia colorata
                                                    accanto, cioè si rovesciava di nuovo la gerarchia che
                                                    dividere le colonne doveva sistemare. */}
                                                <td className="rvTab-nome">{d.negozio}</td>
                                                <td className="rvTab-min">
                                                    {d.azienda
                                                        ? <span className="rvBadge rvBadge-acc">{nomeSoc(d.azienda)}</span>
                                                        /* ⚠️ VUOTO NON È «NESSUNA SOCIETÀ»: è un documento che
                                                            non l'ha registrata. Il trattino lo dice — con lo
                                                            stesso grigio che due colonne più in là usa per
                                                            l'operatore mancante, che si legge; un
                                                            `text-slate-600` sul fondo scuro sta a 2,4:1 e
                                                            sparisce, proprio sulla colonna appena aggiunta. */
                                                        : <span className="rvTab-min">—</span>}
                                                </td>
                                                <td className="rvTab-min">
                                                    {/* ⚠️ SE SONO USCITI IN DUE, SI VEDONO IN DUE. Mostrare solo
                                                        l'ultimo faceva sparire dall'elenco — e dalla ricerca — il
                                                        numero del primo documento, quello che il cliente ha in mano. */}
                                                    {/* ⚠️ `>= 1`, NON `> 1`. Su una catena mista — uno Epson
                                                        col numero, uno Custom senza — `numeriEmessi` ne ha uno
                                                        solo: si cadeva su `d.numero`, che viene dal tentativo
                                                        uscito per ultimo e può essere nullo. Risultato: la
                                                        pagina SAPEVA il numero (la ricerca lo trovava) e nella
                                                        cella scriveva «cassa MAT1». */}
                                                    {d.numeriEmessi.length >= 1
                                                        ? <b className={cn(d.emessi > 1 && "rvNumKo")}>n. {d.numeriEmessi.join(" + ")}</b>
                                                        : d.numero ? <b>n. {d.numero}</b>
                                                            : d.matricola ? <span>cassa {d.matricola}</span>
                                                                : <span>senza numero</span>}
                                                    <br />
                                                    {/* LA PASTIGLIA VERDE SOLO SU UN DOCUMENTO DAVVERO
                                                        EMESSO: «fiscale» accanto a «rimasto aperto» sono
                                                        due affermazioni che si contraddicono nella stessa
                                                        cella (revisione design). */}
                                                    {/* un annullo andato a buon fine è un'operazione VOLUTA:
                                                        dipingerlo di rosso come un documento non uscito insegna
                                                        a ignorare il rosso */}
                                                    {d.storno ? <span className={cn("rvBadge", d.stato === "done" ? "rvBadge-empty" : "rvBadge-ko")}>annullo</span>
                                                        : d.prova ? <span className="rvBadge rvBadge-warn">di prova</span>
                                                            : !d.fiscale ? <span className="rvBadge rvBadge-empty">non fiscale</span>
                                                                /* il verde si dà solo quando non c'è niente di
                                                                    peggio da dire: «fiscale» accanto a «DOPPIO»
                                                                    sono due affermazioni che si contraddicono
                                                                    nella stessa cella — è lo stesso difetto già
                                                                    corretto per «rimasto aperto», che era
                                                                    rientrato dalla finestra. */
                                                                : d.stato === "done" && d.emessi <= 1 && !d.inCoda && !d.graveAperto ? <span className="rvBadge rvBadge-ok">fiscale</span>
                                                                    : <span className="rvBadge rvBadge-empty">fiscale</span>}
                                                    {es && <span className={cn("rvBadge ml-1", es.tono)}>{es.et}</span>}
                                                    {/* ⚠️ QUANTE VOLTE ci si è provati. Sta accanto all'esito
                                                        perché è la stessa informazione: un documento uscito al
                                                        secondo tentativo non è come uno uscito al primo. */}
                                                    {/* ⚠️ IL CONTATORE DEI TENTATIVI STA DENTRO L'ESITO
                                                        («riemesso · 2°»), non in un secondo badge. Misurato:
                                                        «fiscale» + «DOPPIO» + «🖨️ 2 tentativi» fanno 231 px
                                                        in 225 disponibili — andavano a capo e la riga
                                                        cresceva del 48%, su tutte e tre le situazioni nuove.
                                                        Un elenco fiscale con le righe di altezza diversa a
                                                        seconda di quanto è andata male sembra un modulo. */}
                                                    </td>
                                                <td className="rvTab-nome">
                                                    {d.righe.length
                                                        ? d.righe.map(r => r.descrizione).join(" · ")
                                                        : <span className="rvTab-min">dettaglio non disponibile</span>}
                                                    {d.cliente && <><br /><span className="rvTab-min">cliente: {d.cliente}</span></>}
                                                </td>
                                                <td className="rvTab-min">{d.operatore || "—"}</td>
                                                <td className="rvTab-eur">{eur(d.totale)}</td>
                                            </tr>
                                            {apertaQui && (
                                                <tr className="rvTab-det"><td colSpan={7}>{dettaglio(d)}</td></tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                        {/* IL PIÈ DI PAGINA DICE QUANTI E, SE MANCA QUALCOSA, CHE MANCA.
                            Un elenco troncato in silenzio è un elenco che mente. */}
                        <div className="rvTab-pie">
                            {righe.length.toLocaleString("it-IT")} document{righe.length === 1 ? "o" : "i"}
{quantiInTutto != null && quantiInTutto > quanteGrezze
                                ? ` — ma nel periodo scelto ce ne sono ${quantiInTutto.toLocaleString("it-IT")}: il database ne consegna al massimo ${TETTO.toLocaleString("it-IT")} per volta, e i più vecchi restano fuori da questo elenco e dai riquadri. Stringi l'intervallo di date.`
                                : ""}
                            {conta.senzaNumero > 0 ? ` · ${conta.senzaNumero} senza numero: i registratori Custom non lo riportano al CRM, e quei documenti si cercano per matricola.` : ""}
                            {conta.storni > 0 ? ` · ${conta.storni} annull${conta.storni === 1 ? "o" : "i"}: restano fuori dagli incassi, perché il documento di annullo non porta con sé l'importo.` : ""}
                        </div>
                    </div>
                    </>
                )}

                </>)}

            </div>
        </div>
    );
}

/* IL CONFINE DI ATTESA lo chiede Next per `useSearchParams`: senza, la pagina
   non si costruisce. */
export default function DocumentiPage() {
    return <Suspense fallback={<div className="rvCarico">Carico i documenti…</div>}><Documenti /></Suspense>;
}
