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

/** Costruisce l'XML ePOS per un job in coda, dato il suo kind. */
export function buildRequestXml(kind: string, opts: { lines?: string[]; requestXml?: string } = {}): string | null {
  switch (kind) {
    case "status": return xmlQueryStatus();
    case "rt_status": return xmlQueryRtStatus();
    case "test": return xmlTestSlip();
    case "non_fiscal": return Array.isArray(opts.lines) ? xmlNonFiscal(opts.lines) : null;
    case "raw": return typeof opts.requestXml === "string" && opts.requestXml.trim() ? opts.requestXml : null;
    default: return null;
  }
}
