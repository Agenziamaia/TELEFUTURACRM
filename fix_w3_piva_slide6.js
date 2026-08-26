// EXTRA GARA P.IVA — allineamento alla SLIDE 6 (Luca 26/08: «la slide 6 è
// chiarissima, una linea business vale 1 sia la principale sia l'eventuale
// seconda, l'opzione del FRITZ vale +1,5»).
// Riquadro «Punti Soglia» della slide:
//   Mobile → World, Staff 1,5 · Full Plus, Country, Data 60/100,
//            Super Internet Wi-Fi Pro 5G 1 · Flex, Special, Data 10 0,5
//   Fisso  → Fisso/FWA 1 PER LINEA · FRITZ!Box 1,5
//   New Business → Luce&Gas 1 · Protezione Pro 5 · Negozio Protetti 5
// A DB mancavano: il FRITZ, la seconda linea e il Super Internet Wifi Pro 5G.
// Le prime due sono COMPONENTI: si sommano alla riga base della gara grazie
// a matchRigheGaraParallela (i flag sono gli stessi del modello fisso), così
// un Professional Box porta 1 + 1 + 1,5 = 3,5 punti invece di 1.
// Idempotente. Lancio: NODE_PATH=<dir pg> node fix_w3_piva_slide6.js
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

const B = "windtre", M = "2026-08-01", L = "azienda", P = "business_piva";
const TIERS = [25, 35, 45, 55];   // premio a evento, come le altre righe della pista

// [nome, componente, tipo_cliente, categoria, prodotto, offerta, punti, nota]
const RIGHE = [
  ["FRITZ!Box (Professional Box)", "fritz", null, null, null, null, 1.5,
    "Slide 6, Punti Soglia · Fisso: «FRITZ!Box 1,5». Si somma alla linea (che vale 1): un Professional Box porta 1 + 1 (2ª linea inclusa) + 1,5 = 3,5. Si accende dal nome offerta, come nel fisso."],
  ["2ª linea inclusa (Professional Box)", "seconda_linea_inclusa", null, null, null, null, 1,
    "Slide 6: «Fisso/FWA 1 PER LINEA» — il Professional Box include la seconda linea, che conta come una linea a sé."],
  ["2ª linea Professional (opzione)", "seconda_linea", null, null, null, null, 1,
    "Slide 6: «Fisso/FWA 1 PER LINEA» — vale anche per la 2ª linea venduta come opzione sulle offerte non-Box."],
  ["Super Internet Wifi Pro 5G", null, "Business", null, null, "Super Internet Wifi Pro 5G", 1,
    "Slide 6, Punti Soglia · Mobile: «Super Internet Wi-Fi Pro 5G: 1»."],
];

(async () => {
  await client.connect();
  const { rows: pre } = await client.query(
    "select nome, componente, punti from pay_righe where brand=$1 and month=$2 and lato=$3 and pista=$4 order by ordine", [B, M, L, P]);
  let dumpFile = path.join(__dirname, "dump_w3_piva_pre.json");
  if (fs.existsSync(dumpFile)) dumpFile = dumpFile.replace(/\.json$/, `_${Date.now()}.json`);
  fs.writeFileSync(dumpFile, JSON.stringify(pre, null, 1));
  console.log(`Dump (${pre.length} righe):`, path.basename(dumpFile));

  try {
    await client.query("begin");
    const { rows: gia } = await client.query(
      "select nome from pay_righe where brand=$1 and month=$2 and lato=$3 and pista=$4", [B, M, L, P]);
    const nomi = new Set(gia.map(r => r.nome));
    const { rows: [o] } = await client.query(
      "select coalesce(max(ordine),200)+1 ord from pay_righe where brand=$1 and month=$2 and lato=$3 and pista=$4", [B, M, L, P]);
    let ord = Number(o.ord), ins = 0;
    for (const [nome, comp, tipo, cat, prod, off, punti, nota] of RIGHE) {
      if (nomi.has(nome)) continue;
      await client.query(
        `insert into pay_righe (brand, month, lato, pista, nome, componente, tipo_cliente, categoria, prodotto, offerta,
           punti, pay_base, pay_tiers, gettone, attivo, ordine, note, moltiplicatore)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,null,$12,false,true,$13,$14,false)`,
        [B, M, L, P, nome, comp, tipo, cat, prod, off, punti, comp ? [] : TIERS, ord++, nota]);
      ins++;
    }
    await client.query("commit");
    console.log(`righe inserite: ${ins}/${RIGHE.length}`);
  } catch (e) {
    await client.query("rollback");
    console.error("ROLLBACK:", e.message);
    process.exitCode = 1; await client.end(); return;
  }

  const { rows } = await client.query(
    "select nome, componente, offerta, punti from pay_righe where brand=$1 and month=$2 and lato=$3 and pista=$4 and attivo order by ordine", [B, M, L, P]);
  console.log("\nEXTRA GARA P.IVA — punteggi a DB:");
  for (const r of rows) console.log(`  ${r.componente ? "＋" : "·"} ${r.nome.padEnd(38)} ${r.punti} pt${r.componente ? `  (componente ${r.componente})` : ""}`);
  await client.end();
})();
