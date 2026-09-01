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
        ? `<div class="rf"><span class="segno">${segno}</span><signature-field name="${esc(nome)}" role="Venditore" style="width:1px;height:1px;"></signature-field></div>`
        : `<div class="rf"></div>`;
    const dataFirma = perFirmaDigitale
        ? `<span class="rm"><span class="segno">@@DATA@@</span><date-field name="Data firma" role="Venditore" style="width:1px;height:1px;"></date-field></span>`
        : `<span class="rm"></span>`;
    const dato = (et: string, val?: string) => `<div><b>${esc(et)}</b> ${esc(val || "—")}</div>`;

    /* ⚠️ UNA PAGINA SOLA, e non è vezzo: un foglio si firma al banco, si
       fotografa in un colpo e non si perde la seconda facciata — che è il modo
       classico in cui un contratto diventa mezzo contratto. Ci sta tutto
       perché il testo è stretto, non perché manchi qualcosa: le dichiarazioni
       sono sette, le clausole vessatorie quattro, e la seconda firma c'è. */
    return `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">
<title>Contratto di acquisto usato ${esc(d.protocollo)}</title>
<style>
  @page { size: A4; margin: 9mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111; font-size: 8.7pt; line-height: 1.36; margin: 0; }
  h1 { font-size: 13pt; margin: 0; letter-spacing: -.3px; }
  h2 { font-size: 8pt; margin: 2.6mm 0 1mm; text-transform: uppercase; letter-spacing: .7px; color: #000;
       border-bottom: 1px solid #111; padding-bottom: .6mm; }
  .testa { display: flex; justify-content: space-between; align-items: flex-start; gap: 6mm;
           border-bottom: 2px solid #111; padding-bottom: 2mm; margin-bottom: 2mm; }
  .proto { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11pt; font-weight: 800; }
  .muto { color: #666; font-size: 7.2pt; line-height: 1.3; }
  .due { display: flex; gap: 5mm; }
  .due > div { flex: 1; min-width: 0; }
  .tre { gap: 4mm; }
  .g { display: grid; grid-template-columns: 1fr 1fr; gap: .5mm 4mm; }
  .g > div { min-width: 0; word-break: break-word; }
  .g b, .riga b { color: #444; font-weight: 700; }
  .box { border: 1.2px solid #111; border-radius: 1.5mm; padding: 1.8mm 2.4mm; }
  .imei { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 10pt; font-weight: 800; letter-spacing: .4px; }
  .prezzo { display: flex; gap: 4mm; align-items: baseline; border: 1.2px solid #111; border-radius: 1.5mm; padding: 1.8mm 2.4mm; margin-top: 1.2mm; }
  .prezzo strong { font-size: 12.5pt; }
  ol { margin: .8mm 0 0; padding-left: 4.2mm; }
  ol li { margin-bottom: .7mm; }
  .cl { border: 1.2px solid #111; border-radius: 1.5mm; padding: 1.8mm 2.4mm; margin-top: 1.6mm; font-size: 7.9pt; }
  .cl p { margin: 0 0 1mm; }
  .cl p:last-child { margin-bottom: 0; }
  .rf { border-bottom: 1px solid #111; height: 15mm; margin-top: 1.5mm; }
  .rm { display: inline-block; border-bottom: 1px solid #111; width: 26mm; }
  .firme { display: flex; gap: 6mm; margin-top: 2.5mm; page-break-inside: avoid; }
  .firme > div { flex: 1; }
  .datariga { margin-top: 2.6mm; font-size: 8pt; color: #444; }
  .nota { font-size: 7.2pt; color: #555; margin: .8mm 0 0; }
  .pie { margin-top: 2.5mm; font-size: 6.8pt; color: #777; border-top: 1px solid #ddd; padding-top: 1.2mm; }
  .segno { color: #fff; font-size: 5pt; }
</style></head><body>

<div class="testa">
  <div>
    <h1>Contratto di acquisto di bene usato</h1>
    <div class="muto"><b>${esc(d.societa.nome)}</b> · P. IVA ${esc(d.societa.piva)} · ${esc(d.societa.sede)}
      &nbsp;—&nbsp; punto vendita ${esc(d.negozio)} · ${esc(d.operatore)}</div>
  </div>
  <div style="text-align:right">
    <div class="proto">${esc(d.protocollo)}</div>
    <div class="muto">${oggiIt()}</div>
  </div>
</div>

<div class="due">
  <div>
    <h2>1 · Il Venditore</h2>
    <div class="g">
      <div style="grid-column:1/-1"><b>Nome</b> ${esc(v.etichetta || "—")}</div>
      ${dato("C.F.", v.cf)}
      ${dato("Nato il", v.natoIl)}
      <div style="grid-column:1/-1"><b>Residenza</b> ${esc([v.indirizzo, v.cap, v.citta].filter(Boolean).join(", ") || "—")}</div>
      <div style="grid-column:1/-1"><b>Telefono</b> ${esc(v.cellulare || "—")} &nbsp;·&nbsp; <b>Email</b> ${esc(v.email || "—")}</div>
      <div style="grid-column:1/-1"><b>Documento</b> ${esc([v.docTipo, v.docNumero].filter(Boolean).join(" n. ") || "allegato alla pratica")}${v.docRilasciato ? ` · rilasciato da ${esc(v.docRilasciato)}` : ""}</div>
    </div>
    <p class="nota">Dichiara di essere <b>maggiorenne</b> e di agire in proprio, non nell'esercizio d'impresa.
    Copia del documento è acquisita e conservata dall'Acquirente, <b>${esc(d.societa.nome)}</b>.</p>
  </div>
  <div>
    <h2>2 · Il bene</h2>
    <div class="box">
      <div class="g">
        <div style="grid-column:1/-1"><b>Modello</b> ${esc(`${dev.marca || ""} ${dev.modello || ""}`.trim() || "—")}</div>
        <div style="grid-column:1/-1"><b>IMEI</b> <span class="imei">${esc(dev.imei || "—")}</span></div>
        ${dato("Colore", dev.colore)}
        ${dato("Stato d'uso", dev.grado)}
        <div style="grid-column:1/-1"><b>Accessori</b> ${esc(dev.accessori || "nessuno")}</div>
      </div>
      ${dev.note ? `<div style="margin-top:1mm"><b>Difetti dichiarati:</b> ${esc(dev.note)}</div>` : ""}
    </div>
    <div class="prezzo">
      <div style="flex:1"><span class="muto">PREZZO PATTUITO</span><br><strong>${esc(eur(d.prezzo))}</strong>
        <br><span class="muto">${esc(euroInLettere(d.prezzo))} euro</span></div>
      <div style="flex:1"><span class="muto">PAGAMENTO</span><br><b>${esc(d.pagamento || "—")}</b>
        ${d.iban ? `<br><span class="muto">IBAN ${esc(d.iban)}</span>` : ""}</div>
    </div>
    <p class="nota">Corrisposto contestualmente alla consegna a mani, presso il punto vendita. Nessuna spesa accessoria.</p>
  </div>
</div>

<h2>3 · Che cosa dichiara il Venditore</h2>
<ol>
  <li><b>È di sua esclusiva proprietà</b> e nella sua piena disponibilità: nessun terzo può vantarvi diritti.</li>
  <li><b>Ha provenienza lecita</b>: non proviene da furto, rapina, appropriazione indebita, smarrimento o ricettazione, e non è oggetto di denuncia.</li>
  <li><b>Non è gravato</b> da pegno, riserva di proprietà, leasing, noleggio, finanziamento in corso o rate residue, né legato a un contratto di telefonia ancora in essere.</li>
  <li><b>Non è segnalato</b>: l'IMEI non risulta in alcuna lista di apparecchi rubati o smarriti.</li>
  <li><b>È libero da blocchi di attivazione</b> — iCloud, Google, Samsung o altri — che dichiara di aver rimosso prima della consegna e si impegna a rimuovere senza indugio se risultassero attivi.</li>
  <li><b>Non contiene suoi dati personali</b>: ne ha fatto copia e li ha cancellati, ed è consapevole che l'Acquirente procederà comunque alla <b>formattazione immediata</b>, dopo la quale non saranno più recuperabili.</li>
  <li><b>Non presenta difetti</b> diversi da quelli dichiarati alla sezione 2.</li>
</ol>

<div class="due tre" style="margin-top:2.4mm">
  <div>
    <h2 style="margin-top:0">4 · La verifica tecnica</h2>
    <p style="margin:0">L'Acquirente può sottoporre il bene a verifica <b>entro ${gg} giorni</b>, prima della rivendita. Se emergono malfunzionamenti non dichiarati, blocchi non rimossi, o una dichiarazione della sezione 3 risulta non veritiera, può a sua scelta — dandone avviso ai recapiti della sezione 1 — proporre una <b>riduzione del prezzo</b> proporzionata, oppure <b>risolvere il contratto</b> restituendo il bene e riavendo quanto pagato. Il Venditore risponde entro cinque giorni.</p>
  </div>
  <div>
    <h2 style="margin-top:0">5 · Il blocco di rete</h2>
    <p style="margin:0">Il Venditore risponde del <b>blocco disposto dall'operatore telefonico</b> quando dipenda da un contratto da lui sottoscritto e non onorato. L'impegno vale <b>${mesi} mesi</b> da oggi e comporta, a scelta dell'Acquirente, la restituzione del prezzo o il rimborso del danno.</p>
  </div>
  <div>
    <h2 style="margin-top:0">6 · Dati personali</h2>
    <p style="margin:0" class="muto">Trattati ai sensi del Reg. UE 2016/679 e del D.lgs. 101/2018 per la gestione del contratto (art. 6 lett. b) e per gli obblighi fiscali, contabili e di pubblica sicurezza. Conservati per il tempo previsto dalla legge. Diritti artt. 15-22 presso il Titolare: <b>${esc(d.societa.nome)}</b>, P. IVA ${esc(d.societa.piva)}.</p>
  </div>
</div>

<div class="cl">
  <b style="font-size:8pt;letter-spacing:.5px">7 · CLAUSOLE DA APPROVARE SPECIFICAMENTE (ARTT. 1341 E 1342 C.C.)</b>
  <p style="margin-top:1mm"><b>7.1 Manleva.</b> Il Venditore tiene indenne l'Acquirente da ogni pretesa di terzi sulla proprietà o provenienza del bene e da ogni conseguenza della non veridicità delle dichiarazioni della sezione 3, spese di difesa comprese.</p>
  <p><b>7.2 Verifica e rimedi.</b> Accetta la verifica della sezione 4 e i rimedi ivi previsti — riduzione del prezzo o risoluzione con restituzione — entro ${gg} giorni.</p>
  <p><b>7.3 Blocco di rete.</b> Accetta la responsabilità della sezione 5 per ${mesi} mesi.</p>
  <p><b>7.4 Bene non ritirato.</b> In caso di risoluzione, se non ritira il bene entro <b>trenta giorni</b> dall'avviso, il bene si intende acquisito dall'Acquirente a compensazione delle spese, e nulla è più dovuto ad alcun titolo.</p>
</div>

<div class="datariga">Luogo e data: <b>${esc(d.negozio)}</b>, ${dataFirma}</div>
<div class="firme">
  <div>
    <div class="muto"><b>Firma del Venditore — accettazione</b> · quanto precede corrisponde al vero</div>
    ${firma("Firma del Venditore", "@@FIRMA1@@")}
  </div>
  <div>
    <div class="muto"><b>Firma del Venditore — clausole 7.1 · 7.2 · 7.3 · 7.4</b> · artt. 1341 e 1342 c.c.</div>
    ${firma("Seconda sottoscrizione", "@@FIRMA2@@")}
  </div>
</div>

<div class="pie">${esc(d.societa.nome)} · ${esc(d.negozio)} · contratto ${esc(d.protocollo)} · generato dal CRM il ${oggiIt()} · documento d'identità del Venditore allegato alla pratica</div>
</body></html>`;
}

/** Apre il contratto in una finestra e chiama la stampa. */
export function stampaContrattoUsato(d: DatiUsato) {
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) { window.alert("Il browser ha bloccato la finestra di stampa: consenti le finestre pop-up per crm.telefuturasrl.com."); return; }
    w.document.write(contrattoUsatoHtml(d).replace("</body>", `<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body>`));
    w.document.close();
}
