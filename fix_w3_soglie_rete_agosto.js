// FIX SOGLIE DI RETE W3 AGOSTO (cantiere Gare da zero, 13/08/2026)
// Le tre piste di Ragione Sociale avevano valori NON coerenti col Target
// Wind3 Agosto.xlsx (fonte autoritativa dal 10 del mese):
//   - lucegas:       a DB c'erano i valori per-PDV VECCHI della lettera
//                    (10/25/40/55/100, pure barrati nella slide) → i target
//                    RS dell'Excel sono 39/78/135/175/330
//   - business_piva: a DB 85/118/163/205 → Excel 75/111/151, la 4ª soglia
//                    non esiste per noi (solo con BP Plus+, noi abbiamo BP)
//   - assicurazioni: a DB 50/75/100 con bonus 0/2500/3750 (×5 negozi) →
//                    Excel 30/45/60; il bonus torna per-PDV 0/500/750 come
//                    da semantica della colonna (mig pay_soglie_bonus)
// Lancio: node fix_w3_soglie_rete_agosto.js   (dalla cartella del CRM)
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

const WHERE = "brand='windtre' and month='2026-08-01' and lato='azienda'";

// [pista, tier, soglia_da, soglia_a, bonus]  — soglia_a null = ultima (>=)
const NUOVE = [
  ["lucegas", 1, 39, 77, null],
  ["lucegas", 2, 78, 134, null],
  ["lucegas", 3, 135, 174, null],
  ["lucegas", 4, 175, 329, null],
  ["lucegas", 5, 330, null, null],
  ["business_piva", 1, 75, 110, null],
  ["business_piva", 2, 111, 150, null],
  ["business_piva", 3, 151, null, null],
  ["assicurazioni", 1, 30, 44, 0],
  ["assicurazioni", 2, 45, 59, 500],
  ["assicurazioni", 3, 60, null, 750],
];

(async () => {
  await client.connect();
  const pre = await client.query(
    `select id, pista, tier, soglia_da, soglia_a, bonus from pay_soglie
     where ${WHERE} and pista in ('lucegas','business_piva','assicurazioni')
     order by pista, tier`);
  fs.writeFileSync(path.join(__dirname, "dump_w3_soglie_rete_pre_fix.json"), JSON.stringify(pre.rows, null, 2));
  console.log("Dump pre-fix:", pre.rows.length, "righe → dump_w3_soglie_rete_pre_fix.json");

  await client.query("begin");
  try {
    // la 4ª soglia business non esiste col nostro profilo BP
    const del = await client.query(
      `delete from pay_soglie where ${WHERE} and pista='business_piva' and tier=4`);
    console.log("business_piva T4 eliminata:", del.rowCount);
    for (const [pista, tier, da, a, bonus] of NUOVE) {
      const r = await client.query(
        `update pay_soglie set soglia_da=$1, soglia_a=$2, bonus=$3
         where ${WHERE} and pista=$4 and tier=$5`, [da, a, bonus, pista, tier]);
      if (r.rowCount !== 1) throw new Error(`update ${pista} T${tier}: ${r.rowCount} righe (attesa 1)`);
    }
    await client.query("commit");
  } catch (e) { await client.query("rollback"); throw e; }

  const post = await client.query(
    `select pista, tier, soglia_da, soglia_a, bonus from pay_soglie
     where ${WHERE} and pista in ('lucegas','business_piva','assicurazioni')
     order by pista, tier`);
  console.log("=== DOPO ===");
  post.rows.forEach(r => console.log(r.pista, "T" + r.tier, r.soglia_da + "→" + (r.soglia_a ?? "∞"), r.bonus != null ? "bonus " + r.bonus : ""));
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
