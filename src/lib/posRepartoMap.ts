// ─────────────────────────────────────────────────────────────────────────────
// TRADUZIONE REPARTO CRM → REPARTO REGISTRATORE, per MACCHINA.
//
// Il CRM assegna a ogni articolo un reparto "logico" (pos_reparti: 1=non soggetta,
// 2=22%, 3=4%, 4=regime del margine, 7=usato, …). Ogni registratore ha però la SUA
// numerazione, e non è detto coincida col CRM. Qui si traduce, per i registratori
// di cui la numerazione è stata MISURATA, il reparto logico nel reparto FISICO che
// su QUELLA macchina produce l'IVA giusta.
//
// ⚠️ LA CHIAVE È IL REGISTRATORE (`pos_rt.rt_url`), NON IL NEGOZIO.
// Prima questa mappa era indicizzata sul nome del punto vendita, e non funzionava
// per due ragioni indipendenti, scoperte da una revisione il 03/09/2026:
//   1. il nome che arriva qui è `stores.name`, e dal 02/09 i due Magliana sono
//      stati FUSI in un unico negozio che si chiama «Magliana»: una mappa su
//      «Magliana Multi» non veniva mai trovata — inerte, mentre il commento
//      dichiarava di aver riparato l'IVA;
//   2. peggio, la correzione "ovvia" (mappare «Magliana») avrebbe colpito
//      ENTRAMBE le casse del locale, compresa quella di Magliana W3
//      (192.168.1.150) che è programmata CORRETTAMENTE: le sue ricariche
//      sarebbero finite in regime del margine.
// L'indirizzo del registratore invece è unico per macchina, ed è esattamente il
// livello a cui il problema esiste: è la singola cassa a essere fuori standard.
// (I registratori Custom hanno tutti `rt_url = 'custom'`, quindi NON sono
// distinguibili con questa chiave: se un giorno servisse mappare un Custom, prima
// va dato a `pos_rt` un identificativo per macchina.)
//
// UN NEGOZIO NON ELENCATO → identità, si comporta come prima. Si aggiunge una
// macchina SOLO dopo averne misurato i reparti su scontrini veri, mai a indovinare:
// un reparto sbagliato è uno scontrino fiscalmente falso.
// ─────────────────────────────────────────────────────────────────────────────

// registratore (pos_rt.rt_url) → { reparto_logico_CRM : reparto_fisico }
const REPARTO_MAP: Record<string, Record<number, number>> = {
  /* ═══ MAGLIANA MULTI (Telefutura 2) — Epson 99IEB077017, 192.168.1.106 ═══
     ⚠️ TAMPONE, NON UNA SCELTA DI DESIGN. Questa macchina è l'UNICA del parco
     programmata fuori standard: è il registratore storico dell'insegna Multi
     (876 chiusure Z) e ha una numerazione tutta sua. Tutte le altre — Epson
     nuovi e vecchi, e i Custom — hanno 1=ESENTE, 2=CELLULARI 22%, 7=USATO,
     cioè quello che il CRM si aspetta (verificato il 03/09/2026 riconciliando
     le chiusure di Collatina T2, Garbatella e Baleniere con l'XML mandato).

     COSA HA COMBINATO: dall'1 al 3 settembre, **3.028,90 €** di corrispettivi
     davvero usciti da quella cassa e già trasmessi all'Agenzia — ricariche e
     SIM al 22% invece che in art. 74, usati al 22% invece che in regime del
     margine, accessori al 4% invece che al 22%. (Il totale delle righe MANDATE
     è 3.038,90: dieci euro sono una ricarica Iliad il cui job è fallito e che
     quindi non è mai stata stampata.)

     COME SONO STATI MISURATI I REPARTI (03/09/2026):
     · reparti 1, 2 e 7 dalla chiusura Z della giornata riconciliata con l'XML
       mandato (1.030,00 € = 880,00 al 22% + 150,00 al 4%, nessuna natura);
     · gli altri da nove scontrini diagnostici da un centesimo battuti alle
       21:08-21:09 (documenti 0877-0001…0009), leggendo la lettera IVA
       stampata riga per riga.
       ⚠️ Di quei nove, CINQUE sono usciti regolari (3, 4, 8, 9, 12); i quattro
       sui reparti 5, 6, 10 e 11 hanno stampato la riga ma il registratore ha
       poi ANNULLATO il documento (job in errore, PRINTER ERROR). La loro
       lettura si legge sulla riga stampata, ma vale meno delle altre: non
       usarli come destinazione senza una nuova prova.

        1 → 22%    2 → 4%     3 → RM (regime del margine)   4 → NS (non soggetta)
        5 → 5% ⚠️   6 → 22% ⚠️  7 → 22%   8 → 22%   9 → 22%
       10 → EE ⚠️  11 → NS ⚠️  12 → NI (non imponibile)

     ⛔ NON TOGLIERE QUESTA VOCE PER FARE PULIZIA. Non è provvisoria: Luca ha
     deciso il 04/09/2026 di NON far riprogrammare il misuratore e di lasciare
     i parametri come stanno, quindi finché quella macchina resta in servizio
     questa traduzione è l'unica cosa che tiene diritta l'IVA di quel negozio.
     Toglierla rimette le ricariche al 22% e gli usati fuori dal regime del
     margine, cioè rifà esattamente il danno che ha riparato.
     Va tolta SOLO se un giorno quella cassa viene riprogrammata o sostituita —
     e quel giorno va tolta lo STESSO GIORNO, se no ribalta gli scontrini al
     contrario: è la lezione dei malus Sky, una regola accesa e dimenticata fa
     danni uguali e opposti. Prima di toccarla: uno scontrino di prova per
     reparto su 99IEB077017 e si guarda la lettera IVA stampata. */
  "http://192.168.1.106": {
    1: 4,    // Non soggetta, art. 74 (ricariche, SIM)     → NS
    2: 1,    // IVA 22% (accessori, assistenza, telefoni)  → 22%
    3: 2,    // IVA 4%                                     → 4%
    4: 3,    // Regime del margine                         → RM
    6: 2,    // IVA 4% (2)                                 → 4%
    7: 3,    // Usato · regime del margine                 → RM
    8: 4,    // C/VOD · non soggetta                       → NS
    9: 12,   // Non imponibile                             → NI
    10: 4,   // Esente VOD · non soggetta (a DB natura N2) → NS
    // NON mappati di proposito: 5 («Esclusa», natura N1) — su questa macchina
    // un N1 non è stato trovato. Una riga con un reparto non mappato NON si
    // stampa (vedi sotto): meglio una vendita che si ferma di una vendita
    // certificata con la natura sbagliata.
  },
};

/**
 * Traduce il reparto logico del CRM nel reparto fisico del registratore.
 * @param registratore `pos_rt.rt_url` della cassa che stamperà il documento.
 * @returns il reparto da mandare, oppure `null` se quella macchina ha una mappa
 *          ma non copre questo reparto — nel qual caso la riga NON va stampata.
 *
 * ⚠️ Sulle macchine mappate NON esiste il ripiego per identità: se una macchina
 * è lì dentro è perché la sua numerazione NON coincide con quella del CRM,
 * quindi lasciar passare il numero "com'è" è garantito sbagliato. È lo stesso
 * meccanismo silenzioso che ha prodotto i 3.028,90 € di Magliana.
 */
export function repartoFisico(registratore: string | null | undefined, repartoLogico: number): number | null {
  if (!registratore) return repartoLogico;
  const m = REPARTO_MAP[registratore];
  if (!m) return repartoLogico;
  const f = m[repartoLogico];
  return Number.isInteger(f) ? f : null;
}
