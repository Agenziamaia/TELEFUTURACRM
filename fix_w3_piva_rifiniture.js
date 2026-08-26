// EXTRA GARA P.IVA — rifiniture dati dopo il giro del revisore (26/08 sera):
//   · la riga «Fisso/FWA Business (per linea)» porta ancora la nota vecchia
//     («FRITZ!Box 1,5 e 2ª linea Professional 1,5 (v2)»), mentre a DB la 2ª
//     linea vale 1,0 — la nota diceva un numero che il motore non usa.
//   · le 5 righe create oggi hanno brand_vendita NULL mentre le altre 18
//     hanno 'windtre': matchRigaGaraParallela oggi non guarda quel campo, ma
//     lasciarlo disallineato è una mina per il giorno in cui lo guarderà.
// Idempotente. Lancio: NODE_PATH=<dir pg> node fix_w3_piva_rifiniture.js
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
const NOTA_LINEA = "Slide 6, Punti Soglia · Fisso: «Fisso/FWA 1 PER LINEA». Le voci che si sommano sono righe a sé in questa stessa pista: FRITZ!Box 1,5 · 2ª linea (inclusa nel Box o venduta come opzione) 1,0. Un Professional Box porta quindi 1 + 1 + 1,5 = 3,5.";

(async () => {
  await client.connect();
  try {
    await client.query("begin");
    const n1 = await client.query(
      `update pay_righe set note = $1
       where brand=$2 and month=$3 and lato=$4 and pista=$5
         and nome = 'Fisso/FWA Business (per linea)' and note <> $1`,
      [NOTA_LINEA, B, M, L, P]);
    const n2 = await client.query(
      `update pay_righe set brand_vendita = $1
       where brand=$1 and month=$2 and lato=$3 and pista=$4 and brand_vendita is null`,
      [B, M, L, P]);
    await client.query("commit");
    console.log(`nota linea aggiornata: ${n1.rowCount} · brand_vendita allineato: ${n2.rowCount} righe`);
  } catch (e) {
    await client.query("rollback");
    console.error("ROLLBACK:", e.message);
    process.exitCode = 1; await client.end(); return;
  }
  const { rows } = await client.query(
    `select count(*)::int tot, count(*) filter (where brand_vendita is null)::int senza
     from pay_righe where brand=$1 and month=$2 and lato=$3 and pista=$4`, [B, M, L, P]);
  console.log(`  righe pista: ${rows[0].tot} · ancora senza brand_vendita: ${rows[0].senza}`);
  await client.end();
})();
