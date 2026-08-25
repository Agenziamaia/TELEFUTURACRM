// PARSER Listino Terminali FASTWEB (canale retail) — cantiere gare FW 25/08.
// Il pdf è A BLOCCHI: titolo modello (bold) · «Prezzo listino vendor: € X» ·
// «Fascia di prezzo: Y» in alto a destra · tabella offerte (ignorata).
// Uso: node parse_listino_fastweb.js <file.pdf> [--json out.json]
// Stampa l'inventario (modelli, fasce, range prezzi) e, con --json, salva
// l'elenco {modello, prezzo, fascia} per l'import in listini_terminali.
const fs = require("fs");

(async () => {
  const file = process.argv[2];
  const outJson = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;

  const righe = [];   // {y, testi:[{x, s}]} per pagina → linee ordinate
  const blocchi = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    // raggruppa per riga (y arrotondata) e ordina
    const linee = new Map();
    for (const it of tc.items) {
      const s = (it.str || "").trim();
      if (!s) continue;
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      if (!linee.has(y)) linee.set(y, []);
      linee.get(y).push({ x, s });
    }
    const ordinate = [...linee.entries()].sort((a, b) => b[0] - a[0])
      .map(([y, arr]) => ({ y, testo: arr.sort((a, b) => a.x - b.x).map(t => t.s).join(" ") }));
    // scorri: quando trovi «Prezzo listino vendor», il modello è la riga sopra
    // (stessa riga del modello può contenere anche «Fascia di prezzo: X»)
    for (let i = 0; i < ordinate.length; i++) {
      const t = ordinate[i].testo;
      const mPrezzo = t.match(/Prezzo listino vendor:?\s*€?\s*([\d.,]+)/i);
      if (!mPrezzo) continue;
      // risali: la riga «Fascia di prezzo: X» sta TRA il titolo e il prezzo
      // (y leggermente diverso) — saltala e prendi il primo testo vero sopra
      let fascia = null, modello = "";
      for (let j = i - 1; j >= 0; j--) {
        const lt = ordinate[j].testo.replace(/\s+/g, " ").trim();
        const mF = lt.match(/^Fascia di prezzo:?\s*([A-Z+\-]{1,3})$/i);
        if (mF) { if (!fascia) fascia = mF[1]; continue; }
        const mMix = lt.match(/Fascia di prezzo:?\s*([A-Z+\-]{1,3})/i);
        modello = (mMix ? lt.replace(mMix[0], "") : lt).replace(/\s+/g, " ").trim();
        if (mMix && !fascia) fascia = mMix[1];
        break;
      }
      if (!fascia) {
        for (const cand of [t, ordinate[i + 1]?.testo || ""]) {
          const m = cand.match(/Fascia di prezzo:?\s*([A-Z+\-]{1,3})/i);
          if (m) { fascia = m[1]; break; }
        }
      }
      // formato americano del pdf: virgola = migliaia, punto = decimali
      const prezzo = Number(mPrezzo[1].replace(/,/g, ""));
      if (modello && Number.isFinite(prezzo)) blocchi.push({ modello, prezzo, fascia, pagina: p });
    }
  }

  console.log(`Blocchi trovati: ${blocchi.length}`);
  const perFascia = {};
  for (const b of blocchi) {
    const f = b.fascia || "(senza)";
    if (!perFascia[f]) perFascia[f] = { n: 0, min: Infinity, max: -Infinity, esempi: [] };
    const e = perFascia[f];
    e.n++; e.min = Math.min(e.min, b.prezzo); e.max = Math.max(e.max, b.prezzo);
    if (e.esempi.length < 3) e.esempi.push(`${b.modello} (${b.prezzo})`);
  }
  for (const [f, e] of Object.entries(perFascia))
    console.log(`fascia ${f}: ${e.n} modelli · ${e.min}-${e.max} € · es: ${e.esempi.join(" | ")}`);
  const samsungGara = blocchi.filter(b => /s26|fold/i.test(b.modello));
  console.log("Samsung S26/Fold:", samsungGara.map(b => `${b.modello} [${b.fascia}] ${b.prezzo}`).slice(0, 12).join(" · ") || "nessuno");
  const doppi = blocchi.length - new Set(blocchi.map(b => b.modello)).size;
  if (doppi) console.log(`⚠️ modelli duplicati (stesso nome): ${doppi}`);
  if (outJson) { fs.writeFileSync(outJson, JSON.stringify(blocchi, null, 1)); console.log("Salvato:", outJson); }
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
