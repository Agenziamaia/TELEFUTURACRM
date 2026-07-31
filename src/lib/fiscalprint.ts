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

export function xmlFiscalReceipt(items: FiscalItem[], payment: FiscalPayment = {}, operator = "1"): string {
  const rows = (items || []).map((it) =>
    `<printRecItem operator="${esc(operator)}"` +
    ` description="${esc(it.description)}"` +
    ` quantity="${Number(it.quantity ?? 1)}"` +
    ` unitPrice="${money(it.unitPrice)}"` +
    ` department="${Number(it.department) || 1}"` +
    ` justification="1" />`
  ).join("");
  const total =
    `<printRecTotal operator="${esc(operator)}"` +
    ` description="${esc(payment.description || "CONTANTE")}"` +
    ` payment="${money(payment.amount)}"` +
    ` paymentType="${Number(payment.paymentType ?? 0)}"` +
    ` index="0" justification="2" />`;
  return `<printerFiscalReceipt>` +
    `<beginFiscalReceipt operator="${esc(operator)}" />` +
    rows + total +
    `<endFiscalReceipt operator="${esc(operator)}" />` +
    `</printerFiscalReceipt>`;
}

/** Costruisce l'XML ePOS per un job in coda, dato il suo kind. */
export function buildRequestXml(
  kind: string,
  opts: { lines?: string[]; requestXml?: string; items?: FiscalItem[]; payment?: FiscalPayment } = {},
): string | null {
  switch (kind) {
    case "status": return xmlQueryStatus();
    case "rt_status": return xmlQueryRtStatus();
    case "test": return xmlTestSlip();
    case "non_fiscal": return Array.isArray(opts.lines) ? xmlNonFiscal(opts.lines) : null;
    case "fiscal_receipt": return Array.isArray(opts.items) && opts.items.length ? xmlFiscalReceipt(opts.items, opts.payment || {}) : null;
    case "raw": return typeof opts.requestXml === "string" && opts.requestXml.trim() ? opts.requestXml : null;
    default: return null;
  }
}
