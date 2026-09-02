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
import { LOGO_TELEFUTURA } from "@/lib/logoTelefutura";
import { nomeDispositivo } from "@/lib/nomeDispositivo";

export type DatiUsato = {
    protocollo: string;
    negozio: string; operatore: string;
    societa: { nome: string; piva: string; sede: string };
    venditore: {
        etichetta?: string; cf?: string; natoIl?: string; natoA?: string;
        /** un'azienda non puo' dichiarare di «non agire nell'esercizio d'impresa» */
        business?: boolean; referente?: string;
        indirizzo?: string; cap?: string; citta?: string;
        cellulare?: string; email?: string;
        docTipo?: string; docNumero?: string; docRilasciato?: string;
    };
    dispositivo: { marca?: string; modello?: string; imei?: string; colore?: string; accessori?: string; grado?: string; note?: string };
    prezzo: number;
    pagamento?: string; iban?: string;
    /** come si chiude il pagamento: cambia la frase sotto il prezzo, e un
     *  contratto che dice «corrisposto» quando il bonifico deve ancora partire
     *  e' una quietanza per soldi mai usciti */
    modoPagamento?: "contanti" | "bonifico" | "buono";
    /** ceduto per ricambi: niente dichiarazione di assenza difetti */
    perRicambi?: boolean;
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
    /* l'elisione dell'italiano: cento+ottanta fa «centottanta», non
       «centoottanta»; venti+uno fa «ventuno». Su un contratto la cifra in
       lettere è la riga che rende difficile alterarlo dopo la firma: se è
       scritta male, la prima cosa che si contesta è proprio quella. */
    const eliso = inLettere(int)
        .replace(/([a-z])[oa](otto|undici|otta|uno)/g, "$1$2")
        .replace(/tao/g, "to");
    return `${eliso}/${String(cent).padStart(2, "0")}`;
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
  /* ═══ STILE CRM SU CARTA ══════════════════════════════════════════════
     Non è il CRM fotografato: quello è scuro, e su un foglio bianco il
     fondo scuro è illeggibile e mangia un cartuccia. È la sua GRAMMATICA —
     il blu del marchio come unico accento, i riquadri con l'angolo
     arrotondato, le testate in maiuscoletto spaziato, i dati in griglia —
     portata su bianco. E deve restare leggibile anche stampata in
     bianco e nero, perché in negozio succede. */
  @page { size: A4; margin: 8mm 9mm; }
  * { box-sizing: border-box; }
  :root { --blu: #0000e6; --inchiostro: #111827; --tenue: #6b7280; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111827; font-size: 8.6pt; line-height: 1.36; margin: 0; }
  h1 { font-size: 14pt; margin: 0; letter-spacing: -.4px; color: #0b1020; }
  h2 { font-size: 7.6pt; margin: 2.4mm 0 1.2mm; text-transform: uppercase; letter-spacing: 1px; color: #0000e6;
       display: flex; align-items: center; gap: 2mm; }
  h2::after { content: ""; flex: 1; height: 1px; background: rgba(0,0,230,.22); }
  h2 .n { display: inline-flex; align-items: center; justify-content: center; width: 4.6mm; height: 4.6mm;
          border-radius: 1.2mm; background: #0000e6; color: #fff; font-size: 7pt; font-weight: 800; letter-spacing: 0; }

  .testa { display: flex; align-items: center; gap: 4mm; padding-bottom: 2.4mm; margin-bottom: 2.4mm;
           border-bottom: 2px solid #0000e6; }
  .marchio { width: 15mm; height: 15mm; flex: none; object-fit: contain; }
  .testa .mid { flex: 1; min-width: 0; }
  .proto { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 10pt; font-weight: 800; color: #fff;
           background: #0000e6; padding: 1.4mm 2.6mm; border-radius: 1.6mm; white-space: nowrap; letter-spacing: .3px; }
  .muto { color: #6b7280; font-size: 7.2pt; line-height: 1.32; }

  .due { display: flex; gap: 4.5mm; }
  .due > div { flex: 1; min-width: 0; }
  .tre { gap: 4mm; }
  .g { display: grid; grid-template-columns: 1fr 1fr; gap: .6mm 4mm; }
  .g > div { min-width: 0; word-break: break-word; }
  .g b, .riga b { color: #374151; font-weight: 700; }

  .box { border: 1px solid rgba(0,0,230,.28); border-radius: 2mm; padding: 2mm 2.6mm; background: #fafaff; }
  .imei { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 10pt; font-weight: 800; letter-spacing: .5px; color: #0b1020; }
  .prezzo { display: flex; gap: 4mm; align-items: stretch; border: 1px solid rgba(0,0,230,.28); border-left: 2.4mm solid #0000e6;
            border-radius: 2mm; padding: 2mm 2.6mm; margin-top: 1.4mm; background: #fafaff; }
  .prezzo strong { font-size: 13pt; color: #0000e6; letter-spacing: -.4px; }
  .et { font-size: 6.4pt; letter-spacing: .8px; text-transform: uppercase; color: #6b7280; }

  ol { margin: .8mm 0 0; padding-left: 4.4mm; }
  ol li { margin-bottom: .75mm; }
  ol li::marker { color: #0000e6; font-weight: 800; }

  .cl { border: 1px solid rgba(0,0,230,.32); border-radius: 2mm; padding: 2mm 2.6mm; margin-top: 1.8mm; font-size: 7.8pt; background: #fafaff; }
  .cl-t { font-size: 7.4pt; font-weight: 800; letter-spacing: .8px; text-transform: uppercase; color: #0000e6; margin-bottom: 1.2mm; }
  .cl p { margin: 0 0 1mm; }
  .cl p:last-child { margin-bottom: 0; }

  .datariga { margin-top: 2.4mm; font-size: 8pt; color: #374151; }
  .rf { border-bottom: 1px solid #111827; height: 15mm; margin-top: 1.6mm; }
  .rm { display: inline-block; border-bottom: 1px solid #111827; width: 26mm; }
  .firme { display: flex; gap: 5mm; margin-top: 2.2mm; page-break-inside: avoid; }
  .firme > div { flex: 1; }
  .fe { font-size: 7.4pt; font-weight: 700; color: #0b1020; }
  .nota { font-size: 7.2pt; color: #6b7280; margin: .8mm 0 0; }
  .pie { margin-top: 2.4mm; font-size: 6.6pt; color: #9ca3af; border-top: 1px solid rgba(0,0,230,.2); padding-top: 1.2mm;
         display: flex; justify-content: space-between; gap: 4mm; }
  .segno { color: #fff; font-size: 5pt; }
</style></head><body>

<div class="testa">
  <img class="marchio" src="${LOGO_TELEFUTURA}" alt="">
  <div class="mid">
    <h1>Contratto di acquisto di bene usato</h1>
    <div class="muto"><b>${esc(d.societa.nome)}</b> · P. IVA ${esc(d.societa.piva)} · ${esc(d.societa.sede)}<br>
      punto vendita <b>${esc(d.negozio)}</b> · operatore ${esc(d.operatore)}</div>
  </div>
  <div style="text-align:right">
    <div class="proto">${esc(d.protocollo)}</div>
    <div class="muto" style="margin-top:1.2mm">${oggiIt()}</div>
  </div>
</div>

<div class="due">
  <div>
    <h2><span class="n">1</span> Il Venditore</h2>
    <div class="g">
      <div style="grid-column:1/-1"><b>Nome</b> ${esc(v.etichetta || "—")}</div>
      ${dato(v.business ? "P. IVA" : "C.F.", v.cf)}
      ${dato(v.business ? "Rappresentante" : "Nato il", v.business ? v.referente : v.natoIl)}
      <div style="grid-column:1/-1"><b>Residenza</b> ${esc([v.indirizzo, v.cap, v.citta].filter(Boolean).join(", ") || "—")}</div>
      <div style="grid-column:1/-1"><b>Telefono</b> ${esc(v.cellulare || "—")} &nbsp;·&nbsp; <b>Email</b> ${esc(v.email || "—")}</div>
      <div style="grid-column:1/-1"><b>Documento</b> ${esc([v.docTipo, v.docNumero].filter(Boolean).join(" n. ") || "allegato al ritiro")}${v.docRilasciato ? ` · rilasciato da ${esc(v.docRilasciato)}` : ""}</div>
    </div>
    <p class="nota">${v.business
        ? `Chi firma dichiara di agire <b>in nome e per conto dell'impresa</b> sopra indicata e di averne i poteri.`
        : `Dichiara di essere <b>maggiorenne</b> e di agire in proprio, non nell'esercizio d'impresa.`}
    Copia del documento è acquisita e conservata dall'Acquirente, <b>${esc(d.societa.nome)}</b>.</p>
  </div>
  <div>
    <h2><span class="n">2</span> Il bene</h2>
    <div class="box">
      <div class="g">
        <div style="grid-column:1/-1"><b>Modello</b> ${esc(nomeDispositivo(dev.marca, dev.modello) || "—")}</div>
        <div style="grid-column:1/-1"><b>IMEI</b> <span class="imei">${esc(dev.imei || "—")}</span></div>
        ${dato("Colore", dev.colore)}
        ${dato("Stato d'uso", dev.grado)}
        <div style="grid-column:1/-1"><b>Accessori</b> ${esc(dev.accessori || "nessuno")}</div>
      </div>
      ${dev.note ? `<div style="margin-top:1mm"><b>Difetti dichiarati:</b> ${esc(dev.note)}</div>` : ""}
    </div>
    <div class="prezzo">
      <div style="flex:1"><span class="et">Prezzo pattuito</span><br><strong>${esc(eur(d.prezzo))}</strong>
        <br><span class="muto">${esc(euroInLettere(d.prezzo))} euro</span></div>
      <div style="flex:1"><span class="et">Pagamento</span><br><b>${esc(d.pagamento || "—")}</b>
        ${d.iban ? `<br><span class="muto">IBAN ${esc(d.iban)}</span>` : ""}</div>
    </div>
    <p class="nota">${d.modoPagamento === "bonifico"
        ? `Sarà corrisposto con <b>bonifico</b> sull'IBAN qui sopra, intestato al Venditore. <b>Il presente non vale quietanza</b>: il pagamento si intende eseguito con l'accredito.`
        : d.modoPagamento === "buono"
        ? `Corrisposto con <b>buono d'acquisto</b> spendibile presso i punti vendita dell'Acquirente, consegnato contestualmente.`
        : `Corrisposto <b>per contanti</b> contestualmente alla consegna, presso il punto vendita.`} Nessuna spesa accessoria.</p>
  </div>
</div>

<h2><span class="n">3</span> Che cosa dichiara il Venditore</h2>
<ol>
  <li><b>È di sua esclusiva proprietà</b> e nella sua piena disponibilità: nessun terzo può vantarvi diritti.</li>
  <li><b>Ha provenienza lecita</b>: non proviene da furto, rapina, appropriazione indebita, smarrimento o ricettazione, e non è oggetto di denuncia.</li>
  <li><b>Non è gravato</b> da pegno, riserva di proprietà, leasing, noleggio, finanziamento in corso o rate residue, né legato a un contratto di telefonia ancora in essere.</li>
  <li><b>Non è segnalato</b>: l'IMEI non risulta in alcuna lista di apparecchi rubati o smarriti.</li>
  <li><b>È libero da blocchi di attivazione</b> — iCloud, Google, Samsung o altri — che dichiara di aver rimosso prima della consegna e si impegna a rimuovere senza indugio se risultassero attivi.</li>
  <li><b>Non contiene suoi dati personali</b>: ne ha fatto copia e li ha cancellati, ed è consapevole che l'Acquirente procederà comunque alla <b>formattazione immediata</b>, dopo la quale non saranno più recuperabili.</li>
  <li>${d.perRicambi
    ? `<b>Il bene è ceduto per ricambi</b>, come non funzionante: il Venditore non ne garantisce il funzionamento e nulla è dovuto per i difetti, restando ferme le dichiarazioni da 1 a 6.`
    : `<b>Non presenta difetti</b> diversi da quelli dichiarati alla sezione 2.`}</li>
</ol>

<div class="due tre" style="margin-top:2.4mm">
  <div>
    <h2 style="margin-top:0"><span class="n">4</span> La verifica tecnica</h2>
    <p style="margin:0">L'Acquirente può sottoporre il bene a verifica <b>entro ${gg} giorni</b>, prima della rivendita. Se emergono malfunzionamenti non dichiarati, blocchi non rimossi, o una dichiarazione della sezione 3 risulta non veritiera, può a sua scelta — dandone avviso ai recapiti della sezione 1 — proporre una <b>riduzione del prezzo</b> proporzionata, oppure <b>risolvere il contratto</b> restituendo il bene e riavendo quanto pagato. Il Venditore risponde entro cinque giorni.</p>
  </div>
  <div>
    <h2 style="margin-top:0"><span class="n">5</span> Il blocco di rete</h2>
    <p style="margin:0">Il Venditore risponde del <b>blocco disposto dall'operatore telefonico</b> quando dipenda da un contratto da lui sottoscritto e non onorato. L'impegno vale <b>${mesi} mesi</b> da oggi e comporta, a scelta dell'Acquirente, la restituzione del prezzo o il rimborso del danno.</p>
  </div>
  <div>
    <h2 style="margin-top:0"><span class="n">6</span> Dati personali</h2>
    <p style="margin:0" class="muto">Trattati ai sensi del Reg. UE 2016/679 e del D.lgs. 101/2018 per la gestione del contratto (art. 6 lett. b) e per gli obblighi fiscali, contabili e di pubblica sicurezza. Conservati per il tempo previsto dalla legge. Diritti artt. 15-22 presso il Titolare: <b>${esc(d.societa.nome)}</b>, P. IVA ${esc(d.societa.piva)}.</p>
  </div>
</div>

<div class="cl">
  <div class="cl-t"><span class="n" style="display:inline-flex;align-items:center;justify-content:center;width:4.6mm;height:4.6mm;border-radius:1.2mm;background:#0000e6;color:#fff;font-size:7pt;font-weight:800;vertical-align:middle">7</span>&nbsp; Clausole da approvare specificamente — artt. 1341 e 1342 c.c.</div>
  <p><b>7.1 Manleva.</b> Il Venditore tiene indenne l'Acquirente da ogni pretesa di terzi sulla proprietà o provenienza del bene e da ogni conseguenza della non veridicità delle dichiarazioni della sezione 3, spese di difesa comprese.</p>
  <p><b>7.2 Verifica e rimedi.</b> Accetta la verifica della sezione 4 e i rimedi ivi previsti — riduzione del prezzo o risoluzione con restituzione — entro ${gg} giorni.</p>
  <p><b>7.3 Blocco di rete.</b> Accetta la responsabilità della sezione 5 per ${mesi} mesi.</p>
  <p><b>7.4 Bene non ritirato.</b> In caso di risoluzione, se non ritira il bene entro <b>trenta giorni</b> dall'avviso, il bene si intende acquisito dall'Acquirente a compensazione delle spese, e nulla è più dovuto ad alcun titolo.</p>
</div>

<div class="datariga">Luogo e data: <b>${esc(d.negozio)}</b>, ${dataFirma}</div>
<div class="firme">
  <div>
    <div class="fe">Firma del Venditore — accettazione</div><div class="muto">quanto precede corrisponde al vero</div>
    ${firma("Firma del Venditore", "@@FIRMA1@@")}
  </div>
  <div>
    <div class="fe">Firma del Venditore — clausole 7.1 · 7.2 · 7.3 · 7.4</div><div class="muto">artt. 1341 e 1342 c.c.</div>
    ${firma("Seconda sottoscrizione", "@@FIRMA2@@")}
  </div>
</div>

<div class="pie"><span>${esc(d.societa.nome)} · ${esc(d.negozio)} · documento d'identità del Venditore allegato al ritiro</span><span>${esc(d.protocollo)} · generato dal CRM il ${oggiIt()}</span></div>
</body></html>`;
}

/** Apre il contratto in una finestra e chiama la stampa. */
export function stampaContrattoUsato(d: DatiUsato) {
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) { window.alert("Il browser ha bloccato la finestra di stampa: consenti le finestre pop-up per crm.telefuturasrl.com."); return; }
    w.document.write(contrattoUsatoHtml(d).replace("</body>", `<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body>`));
    w.document.close();
}
