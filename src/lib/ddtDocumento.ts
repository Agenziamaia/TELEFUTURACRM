/* ═══════════════════════════════════════════════════════════════════════════
   IL DOCUMENTO DI TRASPORTO (Luca 31/08)

   «Nel momento in cui andiamo a fare un trasferimento, la sezione deve
    generarmi un DDT: deve essere un PDF ben fatto… ricordati che abbiamo due
    società, per cui devono poter essere da una all'altra o dall'altra
    all'altra, citando i nomi dei punti vendita. È un documento di trasporto
    completo e valido anche ai fini fiscali.»
   E poi: «organizza le DDT, perché a prescindere va fatto un documento di
    trasporto».

   Quello che un DDT deve avere (DPR 472/1996, art. 1 c. 3):
     · data di emissione e numero progressivo
     · generalità di cedente, cessionario ed eventuale incaricato del trasporto
     · descrizione della natura, qualità e quantità dei beni
     · luogo di destinazione, se diverso da quello del cessionario
     · data di inizio del trasporto
   e per prassi: causale, aspetto esteriore dei beni, numero di colli, a cura
   di chi è il trasporto, le tre firme.

   TRE COPIE, non una: originale al destinatario, una al mittente, una che
   viaggia col vettore. La differenza è una riga di testo — per questo le
   grafiche di sfondo non hanno lettere dentro.

   SE MANCA UN DATO, IL DOCUMENTO LO DICE. Un DDT con la sede legale vuota
   non è valido, e stampare uno spazio bianco al posto di un indirizzo è il
   modo di accorgersene fra sei mesi, quando arriva un controllo. Qui il campo
   mancante si vede: rosso, con scritto cosa manca e dove si compila.
   ═══════════════════════════════════════════════════════════════════════════ */

export type AziendaDdt = {
    codice: string; ragione_sociale: string;
    piva: string | null; codice_fiscale: string | null;
    sede: string | null; cap: string | null; citta: string | null; provincia: string | null;
    rea: string | null; telefono: string | null; email: string | null;
};
export type NegozioDdt = {
    name: string; address: string | null; cap: string | null;
    citta: string | null; provincia: string | null;
};
export type RigaDdt = {
    codice: string | null; descrizione: string;
    seriale: string | null; quantita: number;
};
export type DatiDdt = {
    numero: number; anno: number; creato_il: string;
    da_negozio: string; a_negozio: string;
    azienda_da: string; azienda_a: string;
    causale: string; aspetto: string; trasporto: string;
    colli: number | null; inizio_trasporto: string | null;
    creato_da: string | null; note: string | null;
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const gg = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString("it-IT") : "—";
const gghh = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

/** Un campo che manca si vede, invece di essere uno spazio bianco. */
const oManca = (v: string | null | undefined, cosa: string) =>
    v && String(v).trim() ? esc(v) : `<span class="manca">manca ${esc(cosa)}</span>`;

function indirizzoAzienda(a: AziendaDdt | null | undefined): string {
    if (!a) return `<span class="manca">società non trovata</span>`;
    const via = a.sede && a.sede.trim() ? esc(a.sede) : `<span class="manca">manca la sede legale</span>`;
    const cit = [a.cap, a.citta, a.provincia ? `(${a.provincia})` : null].filter(Boolean).join(" ");
    return `${via}<br>${cit ? esc(cit) : `<span class="manca">mancano CAP e città</span>`}`;
}

function indirizzoNegozio(n: NegozioDdt | null | undefined, nome: string): string {
    if (!n || !n.address) return `<span class="manca">manca l'indirizzo di ${esc(nome)} — si compila in Amministrazione → Punti vendita</span>`;
    const cit = [n.cap, n.citta, n.provincia ? `(${n.provincia})` : null].filter(Boolean).join(" ");
    return `${esc(n.address)}${cit ? "<br>" + esc(cit) : `<br><span class="manca">mancano CAP e città</span>`}`;
}

/** Le cose che, mancando, rendono il documento non valido. */
export function cosaMancaAlDdt(
    az: Record<string, AziendaDdt>, neg: Record<string, NegozioDdt>, d: DatiDdt,
): string[] {
    const out: string[] = [];
    ([[d.azienda_da, "mittente"], [d.azienda_a, "destinatario"]] as const).forEach(([c, ruolo]) => {
        const a = az[c];
        if (!a) { out.push(`la società ${c} (${ruolo}) non è in anagrafica`); return; }
        if (!a.sede) out.push(`la sede legale di ${a.ragione_sociale} (${ruolo})`);
        if (!a.citta) out.push(`CAP e città di ${a.ragione_sociale} (${ruolo})`);
        if (!a.piva) out.push(`la partita IVA di ${a.ragione_sociale}`);
    });
    ([[d.da_negozio, "partenza"], [d.a_negozio, "destinazione"]] as const).forEach(([n, ruolo]) => {
        if (!neg[n]?.address) out.push(`l'indirizzo del punto vendita di ${ruolo} (${n})`);
    });
    return out;
}

const COPIE = [
    { et: "ORIGINALE", per: "copia per il destinatario" },
    { et: "COPIA", per: "copia per il mittente" },
    { et: "COPIA", per: "copia di accompagnamento" },
];

/** Il documento, pronto per la stampa. Tre copie in tre pagine. */
export function ddtHtml(
    d: DatiDdt, righe: RigaDdt[],
    az: Record<string, AziendaDdt>, neg: Record<string, NegozioDdt>,
    grafiche?: { testata?: string; filigrana?: string; sigillo?: string; firme?: string },
): string {
    const mit = az[d.azienda_da], des = az[d.azienda_a];
    const manca = cosaMancaAlDdt(az, neg, d);
    const cessione = d.azienda_da !== d.azienda_a;
    const pezzi = righe.reduce((s, r) => s + (Number(r.quantita) || 1), 0);

    const testata = (copia: typeof COPIE[number]) => `
      <div class="hdr">
        ${grafiche?.testata ? `<img class="banner" src="${esc(grafiche.testata)}" alt="">` : ""}
        <div class="hdrTxt">
          <div class="soc">${esc(mit?.ragione_sociale || d.azienda_da)}</div>
          <div class="socDati">${indirizzoAzienda(mit)}</div>
          <div class="socDati">P. IVA ${oManca(mit?.piva, "la partita IVA")}${mit?.rea ? ` · REA ${esc(mit.rea)}` : ""}</div>
        </div>
        <div class="tipo">
          <div class="tipoT">DOCUMENTO DI TRASPORTO</div>
          <div class="tipoN">n. <b>${d.numero}</b> / ${d.anno}</div>
          <div class="tipoD">del ${gg(d.creato_il)}</div>
          <div class="copia">${esc(copia.et)}<small>${esc(copia.per)}</small></div>
        </div>
      </div>`;

    const parti = `
      <div class="parti">
        <div class="parte">
          <div class="parteT">Mittente</div>
          <b>${esc(mit?.ragione_sociale || d.azienda_da)}</b><br>
          ${indirizzoAzienda(mit)}<br>
          P. IVA ${oManca(mit?.piva, "la partita IVA")}
          <div class="luogo"><span>Luogo di partenza</span>
            <b>${esc(d.da_negozio)}</b><br>${indirizzoNegozio(neg[d.da_negozio], d.da_negozio)}</div>
        </div>
        <div class="parte">
          <div class="parteT">Destinatario</div>
          <b>${esc(des?.ragione_sociale || d.azienda_a)}</b><br>
          ${indirizzoAzienda(des)}<br>
          P. IVA ${oManca(des?.piva, "la partita IVA")}
          <div class="luogo"><span>Luogo di destinazione</span>
            <b>${esc(d.a_negozio)}</b><br>${indirizzoNegozio(neg[d.a_negozio], d.a_negozio)}</div>
        </div>
      </div>`;

    const tabella = `
      <table class="beni">
        <thead><tr>
          <th style="width:34px">#</th><th style="width:150px">Codice</th>
          <th>Descrizione dei beni</th><th style="width:170px">Matricola / IMEI</th>
          <th style="width:60px" class="c">Q.tà</th>
        </tr></thead>
        <tbody>
          ${righe.map((r, i) => `<tr>
            <td class="c">${i + 1}</td>
            <td class="mono">${esc(r.codice || "—")}</td>
            <td>${esc(r.descrizione)}</td>
            <td class="mono">${esc(r.seriale || "—")}</td>
            <td class="c">${r.quantita}</td>
          </tr>`).join("")}
          ${righe.length === 0 ? `<tr><td colspan="5" class="c vuoto">Nessun bene in questo documento</td></tr>` : ""}
        </tbody>
        <tfoot><tr><td colspan="4" class="tot">Totale beni trasportati</td><td class="c tot">${pezzi}</td></tr></tfoot>
      </table>`;

    const piede = `
      <div class="dati4">
        <div><span>Causale del trasporto</span><b>${esc(d.causale)}</b></div>
        <div><span>Aspetto esteriore dei beni</span><b>${esc(d.aspetto)}</b></div>
        <div><span>Numero dei colli</span><b>${d.colli ?? "—"}</b></div>
        <div><span>Trasporto a cura di</span><b>${esc(d.trasporto)}</b></div>
      </div>
      <div class="dati4">
        <div><span>Data e ora di inizio trasporto</span><b>${gghh(d.inizio_trasporto || d.creato_il)}</b></div>
        <div style="grid-column:span 3"><span>Note</span><b>${esc(d.note || "—")}</b></div>
      </div>
      ${cessione ? `<div class="avviso">⚠️ Trasferimento fra <b>società diverse</b> (${esc(mit?.ragione_sociale || d.azienda_da)} → ${esc(des?.ragione_sociale || d.azienda_a)}): è una cessione fra due soggetti, e questo documento va seguito da <b>fattura</b>.</div>` : ""}
      ${manca.length ? `<div class="avvisoRosso"><b>Questo documento non è ancora valido.</b> Mancano: ${manca.map(esc).join(" · ")}.</div>` : ""}
      <div class="firme">
        ${grafiche?.firme ? `<img class="firmeImg" src="${esc(grafiche.firme)}" alt="">` : ""}
        <div class="firmeRighe">
          <div><span>Firma del mittente</span><i>${esc(d.creato_da || "")}</i></div>
          <div><span>Firma del vettore</span><i></i></div>
          <div><span>Firma del destinatario</span><i></i></div>
        </div>
      </div>`;

    const pagina = (copia: typeof COPIE[number]) => `
      <section class="pag">
        ${grafiche?.filigrana ? `<img class="filigrana" src="${esc(grafiche.filigrana)}" alt="">` : ""}
        ${testata(copia)}${parti}${tabella}${piede}
      </section>`;

    return `<!doctype html><html lang="it"><head><meta charset="utf-8">
<title>DDT ${d.numero}/${d.anno} — ${esc(d.da_negozio)} → ${esc(d.a_negozio)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; margin: 0; font-size: 12px; }
  .pag { position: relative; page-break-after: always; padding-bottom: 6mm; }
  .pag:last-child { page-break-after: auto; }
  .filigrana { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; opacity: .5; z-index: 0; }
  .pag > *:not(.filigrana) { position: relative; z-index: 1; }
  .hdr { display: flex; align-items: flex-start; gap: 16px; border-bottom: 2px solid #111; padding-bottom: 8px; }
  .banner { position: absolute; top: 0; left: 0; width: 100%; height: 58px; object-fit: cover; opacity: .9; z-index: -1; }
  .hdrTxt { flex: 1; }
  .soc { font-size: 17px; font-weight: 800; letter-spacing: .2px; }
  .socDati { font-size: 11px; color: #333; line-height: 1.45; }
  .tipo { text-align: right; min-width: 190px; }
  .tipoT { font-size: 11px; font-weight: 800; letter-spacing: 1.1px; }
  .tipoN { font-size: 16px; margin-top: 2px; }
  .tipoD { font-size: 11px; color: #333; }
  .copia { margin-top: 6px; font-size: 10px; font-weight: 800; letter-spacing: 1px; border: 1.5px solid #111; border-radius: 4px; padding: 3px 8px; display: inline-block; }
  .copia small { display: block; font-weight: 500; letter-spacing: 0; text-transform: none; font-size: 9px; color: #444; }
  .parti { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
  .parte { border: 1px solid #999; border-radius: 5px; padding: 8px 10px; line-height: 1.5; }
  .parteT { font-size: 9.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #555; margin-bottom: 3px; }
  .luogo { margin-top: 7px; padding-top: 6px; border-top: 1px dashed #bbb; }
  .luogo span { display: block; font-size: 9.5px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: #555; }
  table.beni { width: 100%; border-collapse: collapse; margin-top: 10px; }
  .beni th, .beni td { border: 1px solid #999; padding: 5px 8px; text-align: left; }
  .beni thead th { background: #f1f1f1; font-size: 10px; letter-spacing: .4px; text-transform: uppercase; }
  .beni .c { text-align: center; }
  .beni .mono { font-family: ui-monospace, Menlo, monospace; font-size: 11px; }
  .beni .tot { font-weight: 800; background: #f7f7f7; }
  .beni .vuoto { color: #777; padding: 14px; }
  .dati4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 9px; }
  .dati4 > div { border: 1px solid #999; border-radius: 5px; padding: 6px 9px; }
  .dati4 span { display: block; font-size: 9px; font-weight: 700; letter-spacing: .7px; text-transform: uppercase; color: #555; }
  .dati4 b { font-size: 11.5px; }
  .avviso { margin-top: 9px; border: 1px solid #b45309; background: #fffbeb; color: #7c2d12; border-radius: 5px; padding: 7px 10px; font-size: 11px; }
  .avvisoRosso { margin-top: 9px; border: 1.5px solid #b91c1c; background: #fef2f2; color: #7f1d1d; border-radius: 5px; padding: 7px 10px; font-size: 11px; }
  .manca { color: #b91c1c; font-weight: 700; font-style: italic; }
  .firme { margin-top: 14px; position: relative; }
  .firmeImg { width: 100%; height: 80px; object-fit: fill; position: absolute; inset: 0; }
  .firmeRighe { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .firmeRighe > div { border: 1px solid #999; border-radius: 5px; height: 76px; padding: 6px 9px; display: flex; flex-direction: column; justify-content: space-between; }
  .firmeRighe span { font-size: 9px; font-weight: 700; letter-spacing: .7px; text-transform: uppercase; color: #555; }
  .firmeRighe i { font-style: normal; font-size: 10px; color: #666; border-top: 1px solid #bbb; padding-top: 3px; }
  @media print { .noprint { display: none; } }
</style></head><body>
${COPIE.map(pagina).join("")}
</body></html>`;
}
