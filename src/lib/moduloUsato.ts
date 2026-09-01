/* ═══ IL CONTRATTO DI ACQUISTO DELL'USATO ═════════════════════════════════
 *
 * Sostituisce il modulo che usciva dal vecchio gestionale. Non è una
 * riscrittura estetica: quel foglio aveva tre buchi che si pagano.
 *
 * ① NIENTE SUI BLOCCHI DI ATTIVAZIONE. Un iPhone con iCloud acceso o un
 *    Android con l'account Google agganciato non si rivende: è un fermacarte.
 *    Il vecchio modulo parlava solo di reset di fabbrica, che è un'altra cosa.
 * ② NIENTE SU PEGNI, RATE E FINANZIAMENTI. Il telefono comprato a rate resta
 *    del finanziatore finché non è pagato: comprarlo vuol dire comprare un
 *    problema di qualcun altro.
 * ③ NESSUNA CONSEGUENZA SCRITTA. Diceva «mi ritengo responsabile» e finiva lì:
 *    responsabile di cosa, e con quale effetto? Adesso c'è scritto cosa
 *    succede — riduzione del prezzo o restituzione — e in che tempi.
 *
 * ⚠️ Le clausole della sezione 8 sono vessatorie ex art. 1341 c.c.: valgono
 * SOLO se approvate a parte. Per questo il documento ha due firme.
 */
import { eur } from "@/lib/pratiche";

export type DatiUsato = {
    protocollo: string;
    negozio: string; operatore: string;
    societa: { nome: string; piva: string; sede: string };
    venditore: {
        etichetta?: string; cf?: string; natoIl?: string; natoA?: string;
        indirizzo?: string; cap?: string; citta?: string;
        cellulare?: string; email?: string;
        docTipo?: string; docNumero?: string; docRilasciato?: string;
    };
    dispositivo: { marca?: string; modello?: string; imei?: string; colore?: string; accessori?: string; grado?: string; note?: string };
    prezzo: number;
    pagamento?: string; iban?: string;
    /** i giorni della verifica tecnica e del blocco di rete: stanno qui perché
     *  sono numeri che si contrattano, non costanti di un file di codice */
    giorniVerifica?: number; mesiBloccoRete?: number;
};

const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const oggiIt = () => new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });

/* il prezzo anche in lettere: sul vecchio modulo era scritto a mano, ed è
   l'unica riga che rende difficile alterare un contratto dopo la firma */
const UNI = ["zero", "uno", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove", "dieci", "undici", "dodici", "tredici", "quattordici", "quindici", "sedici", "diciassette", "diciotto", "diciannove"];
const DEC = ["", "", "venti", "trenta", "quaranta", "cinquanta", "sessanta", "settanta", "ottanta", "novanta"];
function inLettere(n: number): string {
    n = Math.floor(Math.abs(n));
    if (n < 20) return UNI[n];
    if (n < 100) {
        const d = Math.floor(n / 10), u = n % 10;
        const base = DEC[d];
        if (u === 0) return base;
        if (u === 1 || u === 8) return base.slice(0, -1) + UNI[u];
        return base + UNI[u];
    }
    if (n < 1000) {
        const c = Math.floor(n / 100), r = n % 100;
        return (c === 1 ? "cento" : UNI[c] + "cento") + (r ? inLettere(r) : "");
    }
    if (n < 1000000) {
        const m = Math.floor(n / 1000), r = n % 1000;
        return (m === 1 ? "mille" : inLettere(m) + "mila") + (r ? inLettere(r) : "");
    }
    return String(n);
}
export function euroInLettere(v: number): string {
    const n = Math.round((Number(v) || 0) * 100) / 100;
    const int = Math.floor(n), cent = Math.round((n - int) * 100);
    return `${inLettere(int)}/${String(cent).padStart(2, "0")}`;
}

export function contrattoUsatoHtml(d: DatiUsato, perFirmaDigitale = false): string {
    const v = d.venditore || {};
    const dev = d.dispositivo || {};
    const gg = d.giorniVerifica || 7;
    const mesi = d.mesiBloccoRete || 24;
    const firma = (nome: string, segno: string) => perFirmaDigitale
        ? `<div class="riga-firma"><span class="segno">${segno}</span><signature-field name="${esc(nome)}" role="Venditore" style="width:1px;height:1px;"></signature-field></div>`
        : `<div class="riga-firma"></div>`;
    const dataFirma = perFirmaDigitale
        ? `<span class="riga-mini"><span class="segno">@@DATA@@</span><date-field name="Data firma" role="Venditore" style="width:1px;height:1px;"></date-field></span>`
        : `<span class="riga-mini"></span>`;
    const dato = (et: string, val?: string) => `<div><b>${esc(et)}:</b> ${esc(val || "—")}</div>`;

    return `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">
<title>Contratto di acquisto usato ${esc(d.protocollo)}</title>
<style>
  @page { size: A4; margin: 13mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111; font-size: 10.2pt; line-height: 1.48; margin: 0; }
  h1 { font-size: 15pt; margin: 0 0 1.5mm; letter-spacing: -.2px; }
  h2 { font-size: 10pt; margin: 5mm 0 1.8mm; text-transform: uppercase; letter-spacing: .6px; color: #222;
       border-bottom: 1.2px solid #111; padding-bottom: 1mm; }
  .testa { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm;
           border-bottom: 2px solid #111; padding-bottom: 3mm; margin-bottom: 4mm; }
  .proto { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12.5pt; font-weight: 800; }
  .muto { color: #666; font-size: 8.6pt; }
  .griglia { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2mm 6mm; font-size: 9.5pt; }
  .griglia b { color: #444; font-weight: 700; }
  .bene { border: 1.5px solid #111; border-radius: 2mm; padding: 3mm 4mm; margin-top: 2mm; }
  .bene .imei { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12pt; font-weight: 800; letter-spacing: .5px; }
  .soldi { display: flex; gap: 4mm; margin-top: 2mm; }
  .soldi div { flex: 1; border: 1px solid #ddd; border-radius: 2mm; padding: 2.5mm 3mm; }
  .soldi em { font-style: normal; display: block; font-size: 8.2pt; color: #666; text-transform: uppercase; letter-spacing: .5px; }
  .soldi strong { font-size: 13pt; }
  ol { margin: 1.5mm 0 0; padding-left: 5mm; }
  ol li { margin-bottom: 1.6mm; font-size: 9.5pt; }
  .clausole { border: 1.5px solid #111; border-radius: 2mm; padding: 3mm 4mm; margin-top: 3mm; }
  .clausole p { margin: 0 0 2mm; font-size: 9.2pt; }
  .riga-firma { border-bottom: 1px solid #111; height: 15mm; margin-top: 3mm; }
  .riga-mini { display: inline-block; border-bottom: 1px solid #111; width: 32mm; }
  .firme { display: flex; gap: 8mm; margin-top: 4mm; page-break-inside: avoid; }
  .firme > div { flex: 1; }
  .nota { font-size: 8.3pt; color: #555; margin-top: 1.5mm; }
  .pie { margin-top: 5mm; font-size: 7.8pt; color: #777; border-top: 1px solid #ddd; padding-top: 2mm; }
  .segno { color: #fff; font-size: 6pt; }
</style></head><body>

<div class="testa">
  <div>
    <h1>Contratto di acquisto di bene usato</h1>
    <div class="muto"><b>${esc(d.societa.nome)}</b> — P. IVA ${esc(d.societa.piva)} — ${esc(d.societa.sede)}</div>
    <div class="muto">punto vendita ${esc(d.negozio)} · operatore ${esc(d.operatore)}</div>
  </div>
  <div style="text-align:right">
    <div class="proto">${esc(d.protocollo)}</div>
    <div class="muto">${oggiIt()}</div>
  </div>
</div>

<h2>1 · Le parti</h2>
<p style="margin:0 0 2mm;font-size:9.5pt">
  <b>${esc(d.societa.nome)}</b>, P. IVA ${esc(d.societa.piva)}, di seguito <b>l'Acquirente</b>, e la persona qui
  identificata, di seguito <b>il Venditore</b>:
</p>
<div class="griglia">
  ${dato("Nome e cognome", v.etichetta)}
  ${dato("Codice fiscale", v.cf)}
  ${dato("Nato a", v.natoA)}
  ${dato("Data di nascita", v.natoIl)}
  <div style="grid-column:1/-1"><b>Residente in:</b> ${esc([v.indirizzo, v.cap, v.citta].filter(Boolean).join(", ") || "—")}</div>
  ${dato("Telefono", v.cellulare)}
  ${dato("Email", v.email)}
  ${dato("Documento d'identità", [v.docTipo, v.docNumero].filter(Boolean).join(" n. ") || "allegato alla pratica")}
  ${dato("Rilasciato da", v.docRilasciato)}
</div>
<p class="nota">Copia del documento d'identità del Venditore è acquisita e conservata dall'Acquirente.
Il Venditore dichiara di essere <b>maggiorenne</b> e di agire in proprio, non nell'esercizio di attività d'impresa.</p>

<h2>2 · Il bene</h2>
<div class="bene">
  <div class="griglia">
    ${dato("Marca e modello", `${dev.marca || ""} ${dev.modello || ""}`.trim())}
    ${dato("Colore", dev.colore)}
    <div style="grid-column:1/-1"><b>IMEI / numero di serie:</b> <span class="imei">${esc(dev.imei || "—")}</span></div>
    ${dato("Stato d'uso dichiarato", dev.grado)}
    ${dato("Accessori consegnati", dev.accessori)}
  </div>
  ${dev.note ? `<div style="margin-top:2mm;font-size:9.2pt"><b>Condizioni e difetti dichiarati:</b> ${esc(dev.note)}</div>` : ""}
</div>
<p class="nota">L'IMEI identifica l'apparecchio: è l'elemento su cui si fondano tutte le dichiarazioni che seguono.</p>

<h2>3 · Prezzo e pagamento</h2>
<div class="soldi">
  <div><em>Prezzo pattuito</em><strong>${esc(eur(d.prezzo))}</strong>
       <div class="muto">(${esc(euroInLettere(d.prezzo))} euro)</div></div>
  <div><em>Modalità di pagamento</em><strong style="font-size:11pt">${esc(d.pagamento || "—")}</strong>
       ${d.iban ? `<div class="muto">IBAN ${esc(d.iban)}</div>` : ""}</div>
</div>
<p class="nota">Il prezzo è corrisposto contestualmente alla consegna del bene, che avviene a mani presso il punto
vendita indicato in intestazione. Nessuna spesa accessoria è a carico di alcuna delle parti.</p>

<h2>4 · Che cosa dichiara il Venditore</h2>
<p style="margin:0;font-size:9.5pt">Il Venditore, consapevole della responsabilità che assume, dichiara che il bene:</p>
<ol>
  <li><b>è di sua esclusiva proprietà</b> e nella sua piena disponibilità, e che nessun terzo può vantarvi diritti;</li>
  <li><b>ha provenienza lecita</b>: non proviene da furto, rapina, appropriazione indebita, smarrimento o ricettazione,
      e non risulta oggetto di denuncia;</li>
  <li><b>non è gravato</b> da pegno, riserva di proprietà, leasing, noleggio, finanziamento in corso o rate residue,
      e non è stato acquistato con un contratto di telefonia ancora in essere;</li>
  <li><b>non è bloccato né segnalato</b>: l'IMEI non risulta inserito in alcuna lista di apparecchi rubati o smarriti;</li>
  <li><b>è libero da blocchi di attivazione</b> — account iCloud, Google, Samsung o altri — che il Venditore dichiara
      di aver <b>rimosso prima della consegna</b>, e si impegna a rimuovere senza indugio ove risultassero ancora attivi;</li>
  <li><b>non contiene suoi dati personali</b>: il Venditore dichiara di averne effettuato copia e di averli cancellati,
      ed è consapevole che l'Acquirente procederà comunque alla <b>formattazione immediata</b>, dopo la quale i dati
      non saranno più recuperabili;</li>
  <li><b>non presenta difetti diversi</b> da quelli dichiarati alla sezione 2.</li>
</ol>

<h2>5 · La verifica tecnica</h2>
<p style="margin:0;font-size:9.5pt">
  L'Acquirente si riserva di sottoporre il bene a verifica tecnica <b>entro ${gg} giorni</b> dalla data del presente atto,
  prima di destinarlo alla rivendita. Se dalla verifica emergono <b>malfunzionamenti non dichiarati</b>, blocchi di
  attivazione non rimossi, o una delle dichiarazioni della sezione 4 risulta non veritiera, l'Acquirente può, a sua
  scelta e previo avviso al Venditore ai recapiti della sezione 1:
</p>
<ol>
  <li>proporre una <b>riduzione del prezzo</b> proporzionata al difetto riscontrato; oppure</li>
  <li><b>risolvere il contratto</b>, restituendo il bene e ottenendo la restituzione integrale di quanto pagato.</li>
</ol>
<p class="nota">Il Venditore si impegna a rispondere entro cinque giorni dall'avviso. Decorso tale termine senza
riscontro, e in mancanza del ritiro del bene entro trenta giorni, si applica la clausola 8.4.</p>

<h2>6 · Il blocco di rete</h2>
<p style="margin:0;font-size:9.5pt">
  Il Venditore risponde dell'eventuale <b>blocco dell'apparecchio disposto dall'operatore telefonico</b> — che ne
  inibisce l'utilizzo — quando il blocco dipenda da un contratto di telefonia sottoscritto dal Venditore e non onorato.
  L'impegno vale per <b>${mesi} mesi</b> dalla data del presente atto e comporta, a scelta dell'Acquirente, la
  restituzione del prezzo o il rimborso del danno subito.
</p>

<h2>7 · Trattamento dei dati personali</h2>
<p style="margin:0;font-size:9pt">
  I dati raccolti sono trattati ai sensi del <b>Reg. UE 2016/679</b> e del D.lgs. 101/2018 per la gestione del presente
  contratto (base giuridica: art. 6, lett. b) e per gli obblighi fiscali, contabili e di pubblica sicurezza cui
  l'Acquirente è tenuto. Sono conservati per il tempo previsto dalla legge. L'interessato può esercitare i diritti
  degli artt. 15-22 scrivendo al Titolare del trattamento: <b>${esc(d.societa.nome)}</b>, P. IVA ${esc(d.societa.piva)}.
</p>

<div class="clausole">
  <h2 style="margin-top:0;border:0;padding:0">8 · Clausole da approvare specificamente (artt. 1341 e 1342 c.c.)</h2>
  <p><b>8.1 — Manleva.</b> Il Venditore <b>tiene indenne l'Acquirente</b> da ogni pretesa, azione o richiesta di terzi
  relativa alla proprietà o alla provenienza del bene, e da ogni conseguenza derivante dalla non veridicità delle
  dichiarazioni della sezione 4, comprese le spese di difesa.</p>
  <p><b>8.2 — Verifica tecnica e rimedi.</b> Il Venditore accetta la verifica di cui alla sezione 5 e i rimedi ivi
  previsti — riduzione del prezzo o risoluzione con restituzione — entro ${gg} giorni dalla data del presente atto.</p>
  <p><b>8.3 — Blocco di rete per ${mesi} mesi.</b> Il Venditore accetta la responsabilità di cui alla sezione 6 per
  l'intera durata indicata.</p>
  <p style="margin-bottom:0"><b>8.4 — Bene non ritirato.</b> In caso di risoluzione, se il Venditore non ritira il bene
  entro <b>trenta giorni</b> dall'avviso, il bene si intende definitivamente acquisito dall'Acquirente a compensazione
  delle spese sostenute, e nulla è più dovuto ad alcun titolo.</p>
</div>

<div class="firme">
  <div>
    <div class="muto"><b>Firma del Venditore — accettazione</b></div>
    <div class="nota">Dichiara che quanto precede corrisponde al vero e accetta il contratto in ogni sua parte.</div>
    ${firma("Firma del Venditore", "@@FIRMA1@@")}
    <div class="nota">Data: ${dataFirma}</div>
  </div>
  <div>
    <div class="muto"><b>Firma del Venditore — clausole della sezione 8</b></div>
    <div class="nota">Ai sensi degli artt. 1341 e 1342 c.c. approva specificamente le clausole 8.1 · 8.2 · 8.3 · 8.4.</div>
    ${firma("Seconda sottoscrizione", "@@FIRMA2@@")}
  </div>
</div>

<div class="pie">${esc(d.societa.nome)} · ${esc(d.negozio)} · contratto ${esc(d.protocollo)} · generato dal CRM il ${oggiIt()}
 · il documento d'identità del Venditore è allegato alla pratica</div>
</body></html>`;
}

/** Apre il contratto in una finestra e chiama la stampa. */
export function stampaContrattoUsato(d: DatiUsato) {
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) { window.alert("Il browser ha bloccato la finestra di stampa: consenti le finestre pop-up per crm.telefuturasrl.com."); return; }
    w.document.write(contrattoUsatoHtml(d).replace("</body>", `<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body>`));
    w.document.close();
}
