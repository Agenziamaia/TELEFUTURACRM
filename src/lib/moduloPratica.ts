/* ═══ IL MODULO CHE IL CLIENTE FIRMA ══════════════════════════════════════
 *
 * Un documento solo per tutte e sei le tipologie: le sezioni che non c'entrano
 * restano fuori. Lo stesso HTML serve a due cose — si stampa per la firma su
 * carta, e si manda a DocuSeal per la firma col codice. Cambia una riga: nella
 * versione digitale al posto delle righe per la penna ci sono i campi firma.
 *
 * ⚠️ DUE FIRME, NON UNA. La seconda copre le clausole vessatorie (art. 1341 e
 * 1342 c.c.): perdita dell'acconto, i 14 giorni, i 90, la responsabilità sui
 * dati, il buono al posto del rimborso. Quelle valgono SOLO se sottoscritte a
 * parte — per questo il documento ha due campi e non uno.
 */
import { TIPOLOGIE, TERMINE_MAX_GG, GIORNI_RITIRO, GIORNI_CESSIONE, BUONO_MESI, BUONO_ESCLUSI, eur } from "@/lib/pratiche";

export type DatiModulo = {
    protocollo: string; tipologia: string; negozio: string; operatore: string;
    cliente: { etichetta?: string; email?: string; cellulare?: string; cf_piva?: string; indirizzo?: string; cap?: string; citta?: string };
    valore: number;
    acconto?: { importo?: number; forma?: string; scontrino?: string } | null;
    righe?: { descrizione: string; qta: number; prezzo: number; note?: string }[];
    dispositivo?: Record<string, string> | null;
    imei?: string | null;
    tempoMedio: number;
};

const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const oggiIt = () => new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });

/** Il modulo. `perFirmaDigitale` mette i campi di DocuSeal al posto delle
 *  righe per la penna: è l'unica differenza fra le due strade. */
export function moduloHtml(d: DatiModulo, perFirmaDigitale = false): string {
    const t = TIPOLOGIE[d.tipologia];
    const acc = d.acconto || {};
    const accImporto = Number(acc.importo) || 0;
    const saldo = Math.round((d.valore - accImporto) * 100) / 100;
    const dev = d.dispositivo || {};
    const conDispositivo = !!t && t.contenuto === "dispositivo";
    const cli = d.cliente || {};

    /* ⚠️ NIENTE TAG DI DOCUSEAL NELL'HTML. Provati tutti e due i modi che la
       loro documentazione descrive — <signature-field> e i text tag {{…}} —
       e sull'host europeo i campi nascono SENZA POSIZIONE (`areas: []`):
       DocuSeal raccoglie la firma e poi non la stampa da nessuna parte, e il
       cliente si ritrova un PDF senza firme. È successo davvero, sulla prova
       di Luca.
       Quindi qui si mettono dei MARCATORI di testo, invisibili sul foglio
       (bianco su bianco) ma leggibili dal PDF: la rotta di firma li ritrova
       con le loro coordinate esatte e mette lì i campi. Deterministico, e non
       dipende da come DocuSeal impagina. */
    /* ⚠️ SERVONO TUTTI E DUE. Il tag <signature-field> fa nascere il campo e
       il firmatario; da solo pero' nasce SENZA POSIZIONE (`areas: []`) e la
       firma raccolta non finisce sul foglio — provato, ed e' quello che e'
       successo alla prima prova di Luca: PDF senza firme.
       Il marcatore accanto — scritto in bianco su bianco, invisibile ma
       leggibile dal testo del PDF — dice alla rotta DOVE mettere quel campo,
       qualunque impaginazione faccia DocuSeal. */
    const firma = (nome: string, segno: string) => perFirmaDigitale
        ? `<div class="riga-firma"><span class="segno">${segno}</span><signature-field name="${esc(nome)}" role="Cliente" style="width:1px;height:1px;"></signature-field></div>`
        : `<div class="riga-firma"></div>`;
    const dataFirma = perFirmaDigitale
        ? `<span class="riga-mini"><span class="segno">@@DATA@@</span><date-field name="Data firma" role="Cliente" style="width:1px;height:1px;"></date-field></span>`
        : `<span class="riga-mini"></span>`;

    const righeArticoli = (d.righe || []).map((r) => `
      <tr><td>${esc(r.descrizione)}${r.note ? ` <i>— ${esc(r.note)}</i>` : ""}</td>
          <td class="c">${esc(r.qta)}</td>
          <td class="n">${esc(eur(r.prezzo * r.qta))}</td></tr>`).join("");

    return `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">
<title>Modulo di accettazione ${esc(d.protocollo)}</title>
<style>
  @page { size: A4; margin: 14mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111; font-size: 10.5pt; line-height: 1.5; margin: 0; }
  h1 { font-size: 15pt; margin: 0 0 2mm; letter-spacing: -.2px; }
  h2 { font-size: 10.5pt; margin: 6mm 0 2mm; text-transform: uppercase; letter-spacing: .6px; color: #333;
       border-bottom: 1px solid #ccc; padding-bottom: 1.2mm; }
  .testa { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm;
           border-bottom: 2px solid #111; padding-bottom: 3mm; margin-bottom: 4mm; }
  .proto { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13pt; font-weight: 800; }
  .muto { color: #666; font-size: 8.6pt; }
  table { width: 100%; border-collapse: collapse; font-size: 9.6pt; }
  td, th { padding: 1.6mm 2mm; border-bottom: 1px solid #e2e2e2; vertical-align: top; }
  td.c { text-align: center; width: 14mm; } td.n { text-align: right; width: 26mm; font-variant-numeric: tabular-nums; }
  .griglia { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2mm 6mm; font-size: 9.6pt; }
  .griglia b { color: #444; font-weight: 700; }
  .soldi { display: flex; gap: 4mm; margin-top: 2mm; }
  .soldi div { flex: 1; border: 1px solid #ddd; border-radius: 2mm; padding: 2.5mm 3mm; }
  .soldi em { font-style: normal; display: block; font-size: 8.4pt; color: #666; text-transform: uppercase; letter-spacing: .5px; }
  .soldi strong { font-size: 13pt; }
  .clausole { border: 1.5px solid #111; border-radius: 2mm; padding: 3mm 4mm; margin-top: 3mm; }
  .clausole p { margin: 0 0 2.2mm; font-size: 9.4pt; }
  .riga-firma { border-bottom: 1px solid #111; height: 16mm; margin-top: 3mm; }
  .datariga { margin-top: 4mm; font-size: 9pt; color: #444; }
  .riga-mini { display: inline-block; border-bottom: 1px solid #111; width: 34mm; }
  .firme { display: flex; gap: 8mm; margin-top: 4mm; page-break-inside: avoid; }
  .firme > div { flex: 1; }
  .nota { font-size: 8.4pt; color: #555; margin-top: 1.5mm; }
  .pie { margin-top: 6mm; font-size: 8pt; color: #777; border-top: 1px solid #ddd; padding-top: 2mm; }
  /* i marcatori: ci sono nel testo del PDF, non sul foglio */
  .segno { color: #fff; font-size: 6pt; }
</style></head><body>

<div class="testa">
  <div>
    <h1>Modulo di accettazione</h1>
    <div class="muto">TELEFUTURA S.R.L. — punto vendita ${esc(d.negozio)} · operatore ${esc(d.operatore)}</div>
  </div>
  <div style="text-align:right">
    <div class="proto">${esc(d.protocollo)}</div>
    <div class="muto">${esc(t ? t.label : d.tipologia)} · ${oggiIt()}</div>
  </div>
</div>

<h2>1 · Il cliente</h2>
<div class="griglia">
  <div><b>Nome / Ragione sociale:</b> ${esc(cli.etichetta)}</div>
  <div><b>Codice fiscale / P. IVA:</b> ${esc(cli.cf_piva || "—")}</div>
  <div><b>Indirizzo:</b> ${esc([cli.indirizzo, cli.cap, cli.citta].filter(Boolean).join(", ") || "—")}</div>
  <div><b>Cellulare:</b> ${esc(cli.cellulare || "—")}</div>
  <div style="grid-column:1/-1"><b>Email:</b> ${esc(cli.email || "—")}</div>
</div>
<p class="nota">L'email è il recapito con cui Telefutura comunica: da un messaggio inviato a quell'indirizzo
decorrono i termini della sezione 6. Il cliente si impegna a comunicare ogni variazione.</p>

${conDispositivo ? `
<h2>2 · Il dispositivo lasciato in assistenza</h2>
<div class="griglia">
  <div><b>Marca e modello:</b> ${esc(`${dev.brand || ""} ${dev.modello || ""}`.trim() || "—")}</div>
  <div><b>IMEI / seriale:</b> ${esc(d.imei || "—")}</div>
  <div><b>Colore:</b> ${esc(dev.colore || "—")}</div>
  <div><b>Codice di sblocco comunicato:</b> ${dev.pin ? "sì" : "no"}</div>
  <div style="grid-column:1/-1"><b>Condizioni estetiche all'accettazione:</b> ${esc(dev.condizioni || "—")}</div>
  <div style="grid-column:1/-1"><b>Difetto lamentato dal cliente:</b> ${esc(dev.difetto || "—")}</div>
</div>
<p class="nota">L'IMEI identifica l'apparecchio: senza, nessuno dei termini della sezione 6 è applicabile,
perché non si può dire di quale dispositivo si stia parlando.</p>
` : `
<h2>2 · Che cosa ha ordinato</h2>
<table><tbody>${righeArticoli || `<tr><td class="muto">—</td><td class="c"></td><td class="n"></td></tr>`}</tbody></table>
`}

<h2>3 · Quanto paga</h2>
<div class="soldi">
  <div><em>${esc(t ? t.valoreLabel : "Valore")}</em><strong>${esc(eur(d.valore))}</strong></div>
  <div><em>Acconto versato oggi</em><strong>${accImporto > 0 ? esc(eur(accImporto)) : "—"}</strong>
       ${accImporto > 0 ? `<div class="muto">${esc(acc.forma || "")}${acc.scontrino ? ` · doc. ${esc(acc.scontrino)}` : ""}</div>` : ""}</div>
  <div><em>Saldo alla consegna</em><strong>${esc(eur(saldo))}</strong></div>
</div>
${accImporto > 0 ? `<p class="nota">L'acconto è versato a titolo di <b>caparra confirmatoria</b>. Alla consegna viene
emesso un secondo documento commerciale sul solo saldo, che richiama il numero di quello dell'acconto: i due
documenti insieme valgono come prova d'acquisto ai fini della garanzia.</p>`
            : `<p class="nota">Non è stato versato alcun acconto: questo modulo vale come riepilogo della pratica e
l'intero importo si paga alla consegna.</p>`}

${conDispositivo ? `
<h2>4 · I dati dentro il dispositivo</h2>
<p style="font-size:9.4pt;margin:0 0 2mm">Il cliente <b>autorizza</b> Telefutura S.r.l. e i tecnici da essa incaricati ad accendere
il dispositivo, ad accedervi e a trattare i dati personali in esso contenuti <b>per la sola finalità</b> di eseguire il
servizio richiesto. Il trattamento è limitato a quanto tecnicamente necessario, non comporta comunicazione a terzi e
cessa con la riconsegna.</p>
<p style="font-size:9.4pt;margin:0 0 2mm">Il cliente dichiara di essere consapevole che le lavorazioni su apparati elettronici — comprese
quelle correttamente eseguite — <b>possono comportare la perdita totale o parziale dei dati</b>, e che il ripristino del
software può richiedere la cancellazione della memoria. <b>Dichiara di aver effettuato una copia dei propri dati</b>,
ovvero di rinunciare consapevolmente a farlo.</p>
<p style="font-size:9.4pt;margin:0">Il cliente è tenuto a rimuovere i blocchi di attivazione legati al proprio account
(Google, Apple, Samsung o altri): senza le credenziali o senza la loro rimozione l'apparecchio non è lavorabile né collaudabile.</p>
` : ""}

<h2>5 · Quando è pronto</h2>
<p style="font-size:9.4pt;margin:0 0 2mm">Tempo medio previsto per questa lavorazione: <b>${esc(d.tempoMedio)} giorni lavorativi</b>.
<b>Termine massimo: ${TERMINE_MAX_GG} (trenta) giorni lavorativi</b>, tutto compreso — l'eventuale attesa di un ricambio o
della merce e la lavorazione. Nessun termine si somma a un altro.</p>
<p style="font-size:9.4pt;margin:0 0 2mm">Ai fini di questo modulo si intendono giorni lavorativi quelli <b>dal lunedì al
venerdì</b>, esclusi i festivi. I punti vendita sono aperti anche il sabato, ma il conteggio dei termini non lo comprende.</p>
<p style="font-size:9.4pt;margin:0">Superato il termine massimo senza che la merce sia disponibile o la lavorazione conclusa,
il cliente può recedere <b>senza alcuna penale</b> e ottenere la restituzione integrale dell'acconto.</p>
${d.tipologia === "backup_rotto" ? `<p class="nota"><b>Backup da rotto.</b> Il recupero dei dati da un apparecchio danneggiato è un
tentativo, non un risultato garantito. Se il recupero non riesce il tentativo non si paga: l'importo versato non viene
trattenuto come corrispettivo ma si trasforma in un buono acquisto, secondo la clausola 7.6.</p>` : ""}

<h2>6 · Il ritiro</h2>
<p style="font-size:9.4pt;margin:0">Quando la merce arriva o la lavorazione è conclusa, Telefutura invia al cliente un
<b>avviso di pronta consegna</b> all'indirizzo email indicato alla sezione 1, e per messaggio al numero di cellulare.
<b>Da quell'avviso decorrono i termini che seguono.</b> Il cliente è tenuto a ritirare entro <b>${GIORNI_RITIRO} giorni</b>.</p>

<div class="clausole">
  <h2 style="margin-top:0;border:0;padding:0">7 · Clausole da approvare specificamente (artt. 1341 e 1342 c.c.)</h2>
  <p><b>7.1 — Recesso e perdita dell'acconto.</b> Il cliente può recedere in qualsiasi momento. Se il recesso avviene dopo
  che Telefutura ha ordinato la merce o il ricambio, o dopo che la lavorazione è iniziata, l'acconto versato è trattenuto
  a titolo di caparra confirmatoria. Nulla è dovuto oltre l'acconto.</p>
  <p><b>7.2 — Mancato ritiro entro ${GIORNI_RITIRO} giorni.</b> Trascorsi ${GIORNI_RITIRO} giorni dall'avviso di pronta consegna senza che il
  cliente abbia ritirato, l'acconto è definitivamente acquisito da Telefutura.</p>
  <p><b>7.3 — Mancato ritiro entro ${GIORNI_CESSIONE} giorni.</b> Trascorsi ${GIORNI_CESSIONE} giorni dall'avviso senza che il cliente abbia
  ritirato l'apparecchio, il dispositivo si intende abbandonato e ceduto a Telefutura S.r.l., che potrà smontarlo e
  destinarne le parti a pezzi di ricambio, senza obbligo di ulteriore avviso e senza rimborso.</p>
  <p><b>7.4 — Limitazione di responsabilità sui dati.</b> Telefutura non risponde in alcun caso della perdita dei dati
  presenti sul dispositivo, secondo quanto previsto alla sezione 4.</p>
  <p><b>7.5 — Servizio reso senza collaudo.</b> Se il cliente non comunica il codice di sblocco, il servizio si intende
  regolarmente reso anche in assenza del collaudo finale.</p>
  <p style="margin-bottom:0"><b>7.6 — Buono acquisto in luogo del rimborso.</b> Se il tentativo di recupero dei dati da
  apparecchio danneggiato non va a buon fine, l'importo già versato non viene restituito in denaro: Telefutura emette un
  <b>buono acquisto di pari importo</b>, spendibile presso i punti vendita Telefutura per qualsiasi prodotto o servizio,
  <b>a esclusione di ${BUONO_ESCLUSI}</b>. Il buono è utilizzabile in una o più volte fino a esaurimento, non è
  convertibile in denaro, è nominativo e ha validità di <b>${BUONO_MESI} mesi</b> dall'emissione.</p>
</div>

<div class="datariga">Luogo e data: <b>${esc(d.negozio)}</b>, ${dataFirma}</div>
<div class="firme">
  <div>
    <div class="muto"><b>Prima firma — accettazione della pratica</b></div>
    <div class="nota">Il cliente dichiara di aver letto e accettato tutto quanto precede.</div>
    ${firma("Firma del Cliente", "@@FIRMA1@@")}
  </div>
  <div>
    <div class="muto"><b>Seconda firma — clausole della sezione 7</b></div>
    <div class="nota">Ai sensi degli artt. 1341 e 1342 c.c. approva specificamente le clausole 7.1 · 7.2 · 7.3 · 7.4 · 7.5 · 7.6.</div>
    ${firma("Seconda sottoscrizione", "@@FIRMA2@@")}
  </div>
</div>

<div class="pie">TELEFUTURA S.R.L. · ${esc(d.negozio)} · pratica ${esc(d.protocollo)} · documento generato dal CRM il ${oggiIt()}</div>
</body></html>`;
}

/** Apre il modulo in una finestra e chiama la stampa: stampa IL DOCUMENTO,
 *  non la pagina che si sta guardando. */
export function stampaModulo(d: DatiModulo) {
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) { window.alert("Il browser ha bloccato la finestra di stampa: consenti le finestre pop-up per crm.telefuturasrl.com."); return; }
    w.document.write(moduloHtml(d).replace("</body>", `<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body>`));
    w.document.close();
}
