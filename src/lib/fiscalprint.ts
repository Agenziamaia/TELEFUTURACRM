// Integrazione stampante fiscale Epson RT (protocollo ePOS-Print / "fpMate").
//
// La stampante del negozio espone un servizio HTTP su /cgi-bin/fpmate.cgi:
//   POST, Content-Type "text/xml; charset=UTF-8", SOAPAction "", NESSUNA auth,
//   corpo = XML ePOS dentro una busta SOAP (identica al SDK epson.fiscalPrint).
//
// Il cloud NON raggiunge il LAN del negozio, quindi qui si costruisce solo l'XML;
// l'invio fisico lo fa l'agente di stampa nel negozio (scripts/print-agent).

/** Percorso del servizio sulla stampante. */
export const FPMATE_PATH = "/cgi-bin/fpmate.cgi";

/** Header HTTP richiesti da fpmate.cgi (presi dal SDK epson.fiscalPrint). */
export const FPMATE_HEADERS: Record<string, string> = {
  "Content-Type": "text/xml; charset=UTF-8",
  "SOAPAction": '""',
  "If-Modified-Since": "Thu, 01 Jan 1970 00:00:00 GMT",
};

/** Avvolge l'XML ePOS nella stessa busta SOAP usata dal SDK Epson. */
export function wrapSoap(request: string): string {
  return '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">\n' +
    '<s:Body>\n' + request + '</s:Body>\n</s:Envelope>\n';
}

const esc = (s: unknown) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── Comandi di SOLA LETTURA (sicuri: non stampano, non toccano il fiscale) ──

/** Stato stampante (Risultato/Codice/versioni/stato carta…). Comando già verificato. */
export function xmlQueryStatus(): string {
  return "<printerCommand><queryPrinterStatus /></printerCommand>";
}

/** Stato RT (in servizio, file da inviare, scadenze certificati…). */
export function xmlQueryRtStatus(): string {
  return '<printerCommand><queryPrinterStatus statusType="1" /></printerCommand>';
}

/** Chiusura fiscale giornaliera — Report Z (spec Francesco #4): stampa la chiusura
 *  e trasmette i corrispettivi all'Agenzia delle Entrate. ⚠️ azione FISCALE
 *  IRREVERSIBILE. Schema ePOS da CONFERMARE sul RT reale (Epson RT: printerFiscalReport
 *  con zReport). L'agente lo esegue via fpmate come gli altri comandi Epson. */
export function xmlZReport(operator = "1"): string {
  return `<printerFiscalReport><zReport operator="${esc(operator)}" /></printerFiscalReport>`;
}

// ── Documento NON fiscale (di cortesia) ─────────────────────────────────────
// Usa i comandi ePOS beginNonFiscal / printNormal / endNonFiscal: NON incide sul
// fiscale né sulle chiusure giornaliere. Schema da confermare alla prima prova
// su carta col modello reale (attributi operator/font secondo la doc Epson RT).

export function xmlNonFiscal(lines: string[], operator = "1"): string {
  const rows = (lines || [])
    .map((l) => `<printNormal operator="${esc(operator)}" font="1" data="${esc(l)}" />`)
    .join("");
  return `<printerNonFiscal>` +
    `<beginNonFiscal operator="${esc(operator)}" />` +
    rows +
    `<endNonFiscal operator="${esc(operator)}" />` +
    `</printerNonFiscal>`;
}

/** Scontrino di prova NON fiscale — usato per validare la stampa end-to-end. */
export function xmlTestSlip(): string {
  const now = new Date();
  const stamp = now.toLocaleString("it-IT");
  return xmlNonFiscal([
    "== TELEFUTURA CRM ==",
    "Stampa di prova (NON fiscale)",
    stamp,
    "--------------------------------",
    "Se leggi questo, la stampa dal",
    "CRM alla stampante funziona.",
    "",
    "",
    "",
  ]);
}

// ── Documento FISCALE (scontrino / documento commerciale) ───────────────────
// Comandi Epson ePOS fiscali: printerFiscalReceipt con una printRecItem per riga
// (ogni riga va su un REPARTO, che sulla stampante è mappato a un'aliquota IVA),
// poi printRecTotal per l'incasso, infine endFiscalReceipt.
//
// ⚠️ Questo EMETTE un documento fiscale VERO sull'RT (incide su totali/chiusure).
// Da usare solo dopo aver confermato la mappa reparti↔IVA e testato in modalità
// simulazione/training. La coda lo tratta come kind "fiscal_receipt".

export interface FiscalItem {
  description: string;     // descrizione riga (max ~38 char sullo scontrino)
  quantity?: number;       // default 1
  unitPrice: number;       // prezzo unitario IVA inclusa, es. 10.00
  department: number;      // reparto (mappa all'aliquota IVA impostata sull'RT)
}
export interface FiscalPayment {
  description?: string;    // es. "CONTANTE" / "CARTA"
  amount?: number;         // importo pagato; 0/assente = paga il totale esatto
  paymentType?: number;    // codice Epson: 0=contanti, 2=carte, ... (da confermare)
}

const money = (n: unknown) => Number(n || 0).toFixed(2);

export function xmlFiscalReceipt(items: FiscalItem[], payment: FiscalPayment | FiscalPayment[] = {}, operator = "1", sconto = 0): string {
  if (!items || !items.length) throw new Error("Scontrino fiscale senza righe.");
  const rows = items.map((it) => {
    // ⚠️ SICUREZZA IVA (richiamo di Luca 01/08/2026): il `department` e' il REPARTO
    // della stampante e DECIDE l'aliquota/natura IVA del documento fiscale VERO
    // (es. rep 2 = 22%, rep 1 = NON soggetta, rep 3 = 4%, rep 7 = usato…). Un
    // reparto sbagliato o mancante = IVA sbagliata su uno scontrino fiscale.
    // Percio' qui il reparto e' OBBLIGATORIO ed ESPLICITO: niente default a 1
    // (era `|| 1`, cioe' "Non soggetta"). Se manca, si RIFIUTA di costruire il
    // documento invece di indovinare.
    const dept = Number(it.department);
    if (!Number.isInteger(dept) || dept < 1 || dept > 40) {
      throw new Error(`Reparto IVA mancante o non valido per la riga "${it.description}" (department=${String(it.department)}). Indicare il reparto esatto della stampante (es. 2 = IVA 22%).`);
    }
    return `<printRecItem operator="${esc(operator)}"` +
      ` description="${esc(it.description)}"` +
      ` quantity="${Number(it.quantity ?? 1)}"` +
      ` unitPrice="${money(it.unitPrice)}"` +
      ` department="${dept}"` +
      ` justification="1" />`;
  }).join("");
  // PAGAMENTI (spec #2): una riga printRecTotal per forma (max 3 lato UI). Ogni riga
  // porta il suo importo + codice RT. Un tipo "non riscosso/finanziamento" ha un
  // paymentType dedicato (4) e l'importo NON è incassato fisicamente.
  // Importo pagato: se ASSENTE (pagamento singolo senza amount) si intende INCASSATO
  // l'intero totale (RISCOSSO). Prima `money(payment.amount)` con amount assente dava
  // "0.00" → l'RT segnava tutto "NON RISCOSSO / importo pagato 0" (bug scontrino CARTA).
  const totaleItems = items.reduce((s, it) => s + Number(it.unitPrice) * Number(it.quantity ?? 1), 0);
  const pays = (Array.isArray(payment) ? payment : [payment]).filter(Boolean);
  const list: FiscalPayment[] = pays.length ? pays : [{}];
  const singolo = list.length === 1;
  const total = list.map((p) => {
    // pagamento singolo senza amount → intero totale; altrimenti l'importo esplicito.
    const paid = p.amount != null ? Number(p.amount) : (singolo ? totaleItems : 0);
    return `<printRecTotal operator="${esc(operator)}"` +
      ` description="${esc(p.description || "CONTANTE")}"` +
      ` payment="${money(paid)}"` +
      ` paymentType="${Number(p.paymentType ?? 0)}"` +
      ` index="0" justification="2" />`;
  }).join("");
  // SCONTO COUPON (spec Francesco): abbassa l'IMPONIBILE. Sconto a valore sul
  // subtotale (ripartito sulle aliquote dal RT) → va DOPO le righe e PRIMA del totale.
  // adjustmentType da CONFERMARE sul RT reale (Epson RT: 1 = sconto valore su subtotale).
  const scontoNum = +Number(sconto || 0).toFixed(2);
  const adj = scontoNum > 0
    ? `<printRecSubtotalAdjustment operator="${esc(operator)}" description="SCONTO COUPON" amount="${money(scontoNum)}" adjustmentType="1" justification="1" />`
    : "";
  return `<printerFiscalReceipt>` +
    `<beginFiscalReceipt operator="${esc(operator)}" />` +
    rows + adj + total +
    `<endFiscalReceipt operator="${esc(operator)}" />` +
    `</printerFiscalReceipt>`;
}

// ANNULLO / RESO di un documento commerciale già emesso (Epson RT). Verificato
// 29/08 sul RT di Donna: è SOLO un printRecMessage messageType="4", SENZA
// begin/endFiscalReceipt (avvolgerlo come uno scontrino normale → PRINTER ERROR).
// message = "<TIPO> <zRep> <doc> <ddMMyyyy> <matricola>", z e doc a 4 cifre.
//   TIPO = VOID (annullo) | REFUND (reso).
// Stampa un SECONDO documento (di annullo/reso) e viene trasmesso ad AE per la
// rettifica: NON cancella la storia, azzera il corrispettivo del doc riferito.
export type VoidType = "VOID" | "REFUND";
export function xmlVoidDoc(
  o: { zRep: number | string; docNum: number | string; date: string; matricola: string; type?: VoidType },
  operator = "1",
): string {
  const z = String(o.zRep).replace(/\D/g, "").padStart(4, "0");
  const d = String(o.docNum).replace(/\D/g, "").padStart(4, "0");
  const gg = String(o.date).replace(/\D/g, ""); // atteso ddMMyyyy (8 cifre)
  const mat = String(o.matricola).trim();
  const tipo = o.type === "REFUND" ? "REFUND" : "VOID";
  const message = `${tipo} ${z} ${d} ${gg} ${mat}`;
  return `<printerFiscalReceipt><printRecMessage operator="${esc(operator)}" messageType="4" message="${esc(message)}" /></printerFiscalReceipt>`;
}

/** Costruisce l'XML ePOS per un job in coda, dato il suo kind. */
export function buildRequestXml(
  kind: string,
  opts: { lines?: string[]; requestXml?: string; items?: FiscalItem[]; payment?: FiscalPayment | FiscalPayment[]; sconto?: number;
          voidRef?: { zRep: number | string; docNum: number | string; date: string; matricola: string; type?: VoidType } } = {},
): string | null {
  switch (kind) {
    case "status": return xmlQueryStatus();
    case "rt_status": return xmlQueryRtStatus();
    case "test": return xmlTestSlip();
    case "non_fiscal": return Array.isArray(opts.lines) ? xmlNonFiscal(opts.lines) : null;
    case "fiscal_receipt": return Array.isArray(opts.items) && opts.items.length ? xmlFiscalReceipt(opts.items, opts.payment || {}, "1", opts.sconto || 0) : null;
    case "z_report": return xmlZReport();
    case "fiscal_void": return opts.voidRef ? xmlVoidDoc(opts.voidRef) : null;
    case "raw": return typeof opts.requestXml === "string" && opts.requestXml.trim() ? opts.requestXml : null;
    default: return null;
  }
}
