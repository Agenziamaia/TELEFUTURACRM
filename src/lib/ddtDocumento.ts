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
    codice: string; ragione_sociale: string; logo_url?: string | null;
    piva: string | null; codice_fiscale: string | null;
    sede: string | null; cap: string | null; citta: string | null; provincia: string | null;
    rea: string | null; telefono: string | null; email: string | null;
};
export type NegozioDdt = {
    name: string; address: string | null; civico?: string | null; cap: string | null;
    citta: string | null; provincia: string | null;
};

/** Via e civico, che nel database stanno separati per non essere approssimativi. */
const viaCivico = (n: NegozioDdt | undefined) =>
    [n?.address, n?.civico].filter(Boolean).join(", ");
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
    if (!n || !n.address) return `<span class="manca">manca l'indirizzo</span>`;
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
        const x = neg[n];
        if (!x?.address || !x?.civico || !x?.citta)
            out.push(`l'indirizzo di ${n} — si compila in Amministrazione → Negozi`);
    });
    return out;
}

const COPIE = [
    { et: "ORIGINALE", per: "destinatario" },
    { et: "COPIA", per: "mittente" },
    { et: "COPIA", per: "accompagnamento" },
];

/* ── LA FORMA (Luca 31/08, dopo aver visto un DDT vero) ────────────────────
   Il primo tentativo aveva i bordi tondi, i riquadri spaziati e delle
   grafiche di sfondo. Sbagliato: un documento di trasporto è un MODULO —
   una griglia fitta di caselle squadrate, etichette minuscole in maiuscolo
   nell'angolo, i dati dentro, e in mezzo un'area bianca grande dove alla
   consegna si scrive a mano («alla consegna c'è 1 bottiglia rotta») e si
   firma. Le decorazioni non servono a niente: rubano spazio a quello che
   serve, e su una fotocopia sono grigio.
   Ricalcato sul documento vero che Luca ha mandato. ────────────────────── */

/** Una casella del modulo: etichetta piccola sopra, dato sotto. */
const cella = (et: string, val: string, span = 1) =>
    `<td colspan="${span}"><i>${esc(et)}</i><b>${val}</b></td>`;

export function ddtHtml(
    d: DatiDdt, righe: RigaDdt[],
    az: Record<string, AziendaDdt>, neg: Record<string, NegozioDdt>,
): string {
    const mit = az[d.azienda_da], des = az[d.azienda_a];
    const negDa = neg[d.da_negozio], negA = neg[d.a_negozio];
    const manca = cosaMancaAlDdt(az, neg, d);
    const cessione = d.azienda_da !== d.azienda_a;
    const pezzi = righe.reduce((s, r) => s + (Number(r.quantita) || 1), 0);
    const logo = mit?.logo_url || "/telefutura.png";

    const rigaCitta = (n: NegozioDdt | undefined) =>
        [n?.cap, n?.citta, n?.provincia ? `(${n.provincia})` : null].filter(Boolean).join(" ");
    const sedeSoc = (a: AziendaDdt | undefined) =>
        [a?.sede, [a?.cap, a?.citta, a?.provincia ? `(${a.provincia})` : null].filter(Boolean).join(" ")]
            .filter(Boolean).join(" — ");

    const pagina = (copia: typeof COPIE[number]) => `
    <section class="pag">
      <!-- TESTATA: chi spedisce a sinistra, chi riceve a destra -->
      <div class="testa">
        <div class="mit">
          <img class="logo" src="${esc(logo)}" alt="">
          <div>
            <div class="rs">${esc(mit?.ragione_sociale || d.azienda_da)}</div>
            <div class="rsDati">${sedeSoc(mit) ? esc(sedeSoc(mit)) : `<span class="manca">manca la sede legale</span>`}</div>
            <!-- niente REA (Luca 31/08): «non serve che lo metti dentro i
                documenti di trasporto». Sul DDT la società si identifica con
                la partita IVA, e per una S.R.L. il codice fiscale è lo stesso
                numero — infatti la casella qui sotto ci ricade da sola. -->
            <div class="rsDati">C.F. / P. IVA ${oManca(mit?.piva, "la partita IVA")}</div>
          </div>
        </div>
        <div class="des">
          <div class="spett">Spett.le</div>
          <div class="rs">${esc(des?.ragione_sociale || d.azienda_a)}</div>
          <div class="rsDati">${sedeSoc(des) ? esc(sedeSoc(des)) : `<span class="manca">manca la sede legale</span>`}</div>
          <div class="rsDati">C.F. / P. IVA ${oManca(des?.piva, "la partita IVA")}</div>
          <div class="dest"><span>Dest.</span>
            <b>${esc(d.a_negozio)}</b><br>
            ${viaCivico(negA) ? esc(viaCivico(negA)) : `<span class="manca">manca l'indirizzo</span>`}
            ${rigaCitta(negA) ? "<br>" + esc(rigaCitta(negA)) : ""}
          </div>
        </div>
      </div>

      <div class="partenza">
        <!-- l'indirizzo si compone in UNA espressione: spezzato su più righe,
             l'HTML trasformava gli a capo del template in spazi e usciva
             «Via della Magliana, 263 , 00146 Roma» -->
        <b>In partenza da:</b> ${esc(d.da_negozio)} — ${viaCivico(negDa)
            ? esc([viaCivico(negDa), rigaCitta(negDa)].filter(Boolean).join(", "))
            : `<span class="manca">manca l'indirizzo</span>`}
        <span class="copiaEt">${esc(copia.et)} · ${esc(copia.per)}</span>
      </div>

      <!-- I DATI DEL DOCUMENTO -->
      <table class="griglia">
        <tr>
          <td class="tit" rowspan="1"><b>DOCUMENTO DI TRASPORTO</b><small>D.P.R. 14-8-96, n. 472</small></td>
          ${cella("Partita IVA", oManca(mit?.piva, "—"))}
          ${cella("Codice fiscale", mit?.codice_fiscale ? esc(mit.codice_fiscale) : oManca(mit?.piva, "—"))}
          ${cella("N. documento", `<span class="big">${d.numero}</span>`)}
          ${cella("Data documento", gg(d.creato_il))}
          ${cella("Foglio n.", "1")}
        </tr>
      </table>

      <!-- I BENI -->
      <table class="beni">
        <thead><tr>
          <th class="l">Codici e descrizione dei beni</th>
          <th style="width:150px">Matricola / IMEI</th>
          <th style="width:44px">U.M.</th>
          <th style="width:60px">Quantità</th>
        </tr></thead>
        <tbody>
          ${righe.map((r) => `<tr>
            <td class="l">${r.codice ? `<span class="cod">(${esc(r.codice)})</span> ` : ""}${esc(r.descrizione)}</td>
            <td class="mono">${esc(r.seriale || "—")}</td>
            <td class="c">PZ</td>
            <td class="c">${r.quantita}</td>
          </tr>`).join("")}
          ${righe.length === 0 ? `<tr><td colspan="4" class="c vuoto">Nessun bene in questo documento</td></tr>` : ""}
          <!-- lo spazio bianco è parte del documento: alla consegna ci si
               scrive a mano quello che non torna, e si firma lì -->
          <tr class="spazio"><td colspan="4"></td></tr>
        </tbody>
      </table>

      <!-- LA FASCIA DEL TRASPORTO -->
      <table class="griglia">
        <tr>
          ${cella("Totale beni", String(pezzi))}
          ${cella("Trasporto a cura di", esc(d.trasporto))}
          ${cella("Aspetto esteriore dei beni", esc(d.aspetto))}
          ${cella("Causale del trasporto", esc(d.causale), 2)}
        </tr>
        <tr>
          ${cella("N. colli", d.colli != null ? String(d.colli) : "&nbsp;")}
          ${cella("Peso (kg)", "&nbsp;")}
          ${cella("Porto", "&nbsp;")}
          ${cella("Data e ora inizio trasporto", gghh(d.inizio_trasporto || d.creato_il))}
          ${cella("Targa", "&nbsp;")}
        </tr>
      </table>

      <table class="griglia">
        <tr>
          <td class="ann" colspan="3"><i>Annotazioni e/o variazioni</i><b>${esc(d.note || "")}</b></td>
          <td class="firma" colspan="2"><i>Firma del destinatario</i></td>
        </tr>
      </table>

      <!-- I VETTORI: due, come sul documento vero -->
      <table class="griglia vettori">
        <tr>
          <td class="vet" rowspan="2">Vettore</td>
          <td><i>Ditta — residenza o domicilio</i><b>&nbsp;</b></td>
          <td style="width:150px"><i>Data e ora del ritiro</i><b>&nbsp;</b></td>
          <td style="width:200px" class="firma"><i>Firma del vettore</i></td>
        </tr>
        <tr>
          <td><i>Ditta — residenza o domicilio</i><b>&nbsp;</b></td>
          <td><i>Data e ora del ritiro</i><b>&nbsp;</b></td>
          <td class="firma"><i>Firma del vettore</i></td>
        </tr>
      </table>

      <table class="griglia">
        <tr>
          <td class="firma" style="width:50%"><i>Firma del mittente</i><b class="chi">${esc(d.creato_da || "")}</b></td>
          <td class="firma"><i>Firma del conducente</i></td>
        </tr>
      </table>

      ${cessione ? `<div class="nota">Trasferimento fra <b>società diverse</b> (${esc(mit?.ragione_sociale || d.azienda_da)} → ${esc(des?.ragione_sociale || d.azienda_a)}): cessione fra due soggetti, da seguire con <b>fattura</b>.</div>` : ""}
      ${manca.length ? `<div class="notaRossa"><b>Documento non ancora valido.</b> Mancano: ${manca.map(esc).join(" · ")}.</div>` : ""}
    </section>`;

    return `<!doctype html><html lang="it"><head><meta charset="utf-8">
<title>DDT ${d.numero}/${d.anno} — ${esc(d.da_negozio)} → ${esc(d.a_negozio)}</title>
<style>${STILE}</style></head><body>
${COPIE.map(pagina).join("")}
</body></html>`;
}

/* ═══ L'ARCHIVIO DI UN PERIODO IN UN FILE SOLO ════════════════════════════
   Luca 31/08: «dentro Trasferimenti dobbiamo avere tutto lo storico delle DDT,
   dove possiamo anche fare un export complessivo dei PDF mensilmente».
   Un documento unico con dentro tutti i DDT del periodo, ognuno che comincia a
   pagina nuova: il browser lo salva come UN pdf — che è la forma in cui questa
   roba si manda al commercialista e si mette da parte. Uno per documento
   vorrebbe dire aprire quaranta finestre e salvare quaranta file a mano. */
export function ddtRaccolta(
    documenti: { d: DatiDdt; righe: RigaDdt[]; az: Record<string, AziendaDdt>; neg: Record<string, NegozioDdt> }[],
    titolo: string,
): string {
    /* SI RIUSA `ddtHtml`, non se ne scrive una copia: due generatori dello
       stesso documento divergono al primo ritocco, e te ne accorgi quando il
       commercialista chiede perché l'archivio non somiglia a quello che avete
       consegnato in mano al corriere. Qui si prende il corpo di ciascuno. */
    const corpo = documenti.map(x => {
        const html = ddtHtml(x.d, x.righe, x.az, x.neg);
        const i = html.indexOf("<body>"), j = html.lastIndexOf("</body>");
        return i < 0 || j < 0 ? "" : html.slice(i + "<body>".length, j);
    }).join("\n");
    return `<!doctype html><html lang="it"><head><meta charset="utf-8">
<title>${esc(titolo)}</title>
<style>${STILE}</style></head><body>
${documenti.length ? corpo : `<p style="font-family:Arial;padding:40px">Nessun documento di trasporto in questo periodo.</p>`}
</body></html>`;
}

/** Il foglio di stile del modulo: uno solo, per il documento singolo e per
 *  l'archivio — se no le due stampe si somigliano finché qualcuno non tocca
 *  una delle due. */
const STILE = `
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; color: #000; margin: 0; font-size: 10.5px; }
  .pag { page-break-after: always; }
  .pag:last-child { page-break-after: auto; }

  /* testata */
  .testa { display: flex; gap: 14px; align-items: flex-start; }
  .mit { display: flex; gap: 10px; width: 52%; }
  .logo { width: 54px; height: 54px; object-fit: contain; flex: 0 0 auto; }
  .rs { font-size: 14px; font-weight: 800; letter-spacing: .2px; }
  .rsDati { font-size: 9px; line-height: 1.4; color: #222; }
  .des { flex: 1; border: 1px solid #000; padding: 6px 8px; min-height: 76px; }
  .spett { font-size: 9px; color: #444; }
  .dest { margin-top: 5px; padding-top: 4px; border-top: 1px dotted #999; font-size: 9.5px; line-height: 1.4; }
  .dest span { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; color: #444; }
  .partenza { border: 1px solid #000; border-top: none; padding: 3px 8px; font-size: 9.5px; display: flex; justify-content: space-between; align-items: baseline; }
  .copiaEt { font-size: 8.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }

  /* la griglia di caselle: è la forma di un DDT */
  table.griglia { width: 100%; border-collapse: collapse; margin-top: -1px; }
  .griglia td { border: 1px solid #000; padding: 2px 5px 3px; vertical-align: top; height: 30px; }
  .griglia i { display: block; font-style: normal; font-size: 7.5px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: #444; }
  .griglia b { font-size: 10.5px; font-weight: 700; }
  .griglia .big { font-size: 14px; font-weight: 800; }
  .griglia .tit { width: 34%; }
  .griglia .tit b { font-size: 10px; letter-spacing: .3px; }
  .griglia .tit small { display: block; font-size: 8px; color: #444; }
  .griglia .ann { height: 52px; }
  .griglia .firma { height: 52px; }
  .griglia .firma .chi { font-weight: 400; font-size: 9px; color: #444; }
  .vettori .vet { width: 20px; writing-mode: vertical-rl; transform: rotate(180deg); text-align: center;
                  font-size: 7.5px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 4px 1px; }

  /* i beni */
  table.beni { width: 100%; border-collapse: collapse; margin-top: -1px; }
  .beni th, .beni td { border: 1px solid #000; padding: 3px 6px; }
  .beni thead th { font-size: 7.5px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; text-align: center; height: 20px; }
  .beni th.l, .beni td.l { text-align: left; }
  .beni .c { text-align: center; }
  .beni .mono { font-family: ui-monospace, Menlo, monospace; font-size: 10px; text-align: center; }
  .beni .cod { color: #333; }
  .beni .vuoto { color: #666; padding: 12px; }
  /* lo spazio per scrivere a mano alla consegna */
  .beni .spazio td { height: 150px; border-top: none; }

  .manca { color: #b00; font-weight: 700; font-style: italic; }
  .nota { margin-top: 6px; border: 1px solid #000; padding: 4px 8px; font-size: 9px; }
  .notaRossa { margin-top: 4px; border: 1.5px solid #b00; color: #b00; padding: 4px 8px; font-size: 9px; }
`;
