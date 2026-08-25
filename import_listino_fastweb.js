// IMPORT «Listino Terminali» FASTWEB → listini_terminali (cantiere gare FW,
// 25/08/2026). Il pdf del canale retail è a blocchi: titolo modello ·
// «Prezzo listino vendor: € X» (formato americano) · «Fascia di prezzo: Y»
// (riga tra il titolo e il prezzo). Qui si importano modello + prezzo vendor
// + fascia (L/M/H); le tabelle rate per offerta NON si importano (variano
// per piano tariffario: il suggerimento 💰 mostra il solo street price,
// Fastweb resta senza marginalità).
// In coda: «Apple rigenerato» ESCLUSO A PRIORI (Luca 25/08 sera) — opzione
// di catalogo spenta + le sue 3 righe gettone disattivate.
// Rilanciabile: sostituisce il listino fastweb esistente (delete+insert).
// Uso: NODE_PATH=<dir con pg> node import_listino_fastweb.js <file.pdf>
const fs = require("fs");
const path = require("path");

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("pg");
const client = new Client({
  host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

const OFFERTA_FIN = "2ff10219-1690-406c-b396-9a39a945f495";   // catalog_offerte «Finanziamento» (fastweb)

async function parsePdf(file) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const blocchi = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const linee = new Map();
    for (const it of tc.items) {
      const s = (it.str || "").trim();
      if (!s) continue;
      const y = Math.round(it.transform[5]);
      if (!linee.has(y)) linee.set(y, []);
      linee.get(y).push({ x: it.transform[4], s });
    }
    const ordinate = [...linee.entries()].sort((a, b) => b[0] - a[0])
      .map(([, arr]) => arr.sort((a, b) => a.x - b.x).map(t => t.s).join(" "));
    for (let i = 0; i < ordinate.length; i++) {
      const mPrezzo = ordinate[i].match(/Prezzo listino vendor:?\s*€?\s*([\d.,]+)/i);
      if (!mPrezzo) continue;
      let fascia = null, modello = "";
      for (let j = i - 1; j >= 0; j--) {
        const lt = ordinate[j].replace(/\s+/g, " ").trim();
        const mF = lt.match(/^Fascia di prezzo:?\s*([A-Z+\-]{1,3})$/i);
        if (mF) { if (!fascia) fascia = mF[1]; continue; }
        const mMix = lt.match(/Fascia di prezzo:?\s*([A-Z+\-]{1,3})/i);
        modello = (mMix ? lt.replace(mMix[0], "") : lt).replace(/\s+/g, " ").trim();
        if (mMix && !fascia) fascia = mMix[1];
        break;
      }
      const prezzo = Number(mPrezzo[1].replace(/,/g, ""));   // formato americano
      // pulizie note del pdf: «SamsungGalaxy» attaccato
      modello = modello.replace(/^SamsungGalaxy/i, "Samsung Galaxy");
      if (modello && Number.isFinite(prezzo)) blocchi.push({ modello, prezzo, fascia: fascia ? fascia.toUpperCase() : null });
    }
  }
  return blocchi;
}

(async () => {
  const file = process.argv[2];
  if (!file) { console.error("Uso: node import_listino_fastweb.js <file.pdf>"); process.exit(1); }
  const blocchi = await parsePdf(file);
  // dedupe per modello (colori diversi = righe diverse; stesso nome = tieni il primo)
  const visti = new Map();
  for (const b of blocchi) if (!visti.has(b.modello)) visti.set(b.modello, b);
  const righe = [...visti.values()];
  console.log(`Dal pdf: ${blocchi.length} blocchi → ${righe.length} modelli unici`);
  const senzaFascia = righe.filter(r => !r.fascia);
  if (senzaFascia.length) console.log("⚠️ senza fascia:", senzaFascia.map(r => r.modello).join(" · "));

  await client.connect();
  // dump del listino fastweb esistente (mai sovrascritto)
  const { rows: pre } = await client.query("select * from listini_terminali where brand='fastweb'");
  let dumpFile = path.join(__dirname, "dump_listino_fastweb_pre.json");
  if (fs.existsSync(dumpFile)) dumpFile = dumpFile.replace(/\.json$/, `_${Date.now()}.json`);
  fs.writeFileSync(dumpFile, JSON.stringify(pre, null, 1));
  console.log(`Dump pre (${pre.length} righe):`, path.basename(dumpFile));

  try {
    await client.query("begin");
    // colonna fascia (mig 20260825200000, idempotente)
    await client.query("alter table listini_terminali add column if not exists fascia text");
    await client.query("delete from listini_terminali where brand='fastweb'");
    for (const r of righe) {
      // margine_pct 0 esplicito: Fastweb è senza marginalità (la colonna è
      // not-null con default 4 — lo 0 evita margini fantasma)
      await client.query(
        `insert into listini_terminali (brand, modello, prezzo, margine_pct, rate, fonte, fascia, aggiornato_il, aggiornato_da)
         values ('fastweb', $1, $2, 0, '[]'::jsonb, $3, $4, now(), $5)`,
        [r.modello, r.prezzo, "Listino Retail 11-24.08.2026 (canale retail mono e multibrand)", r.fascia, "Import cantiere gare FW"]);
    }
    // Apple rigenerato: escluso a priori (Luca 25/08 sera)
    await client.query(
      "update catalog_opzioni set attivo=false where offerta_id=$1 and nome='Apple rigenerato'", [OFFERTA_FIN]);
    const rig = await client.query(
      `update pay_righe set attivo=false, note='Esclusi a priori (Luca 25/08): i rigenerati Apple non si vendono — riattivare se mai servissero.'
       where brand='fastweb' and month='2026-08-01' and lato='azienda' and opzione like 'Apple rigenerato|%'`);
    console.log(`Rigenerati: opzione spenta, righe disattivate = ${rig.rowCount}`);
    await client.query("commit");
    console.log("Commit ok.");
  } catch (e) {
    await client.query("rollback");
    console.error("ROLLBACK:", e.message);
    process.exitCode = 1;
    await client.end();
    return;
  }

  const { rows: chk } = await client.query(
    "select fascia, count(*)::int n, min(prezzo) mn, max(prezzo) mx from listini_terminali where brand='fastweb' group by fascia order by fascia");
  for (const c of chk) console.log(` fascia ${c.fascia}: ${c.n} modelli · ${c.mn}-${c.mx} €`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
