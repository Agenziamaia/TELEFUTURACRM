// RIFINITURE dal revisore notturno (25/08, gare Fastweb — consegna «risposte»):
// ① note anti-accensione sulle 3 righe documentali SPENTE: se accese per
//    sbaglio entrerebbero nel pick-one (la boost «wireline» pareggia 3-3 con
//    la base Mobile Business e vincerebbe per ordine; il gettone agg.vo a
//    condizioni vuote farebbe da catch-all a 0 €) — la nota ora lo dice, e
//    le due boost passano a ordine 900/901 così un'accensione per sbaglio
//    perde comunque i pareggi.
// ② brand_vendita='fastweb' sulle 20 righe nuove (19 combo Protect + Gas
//    Business) per uniformità con le basi (nessun effetto sul match).
// Rilanciabile senza danni. Lancio: NODE_PATH=<dir pg> node fix_fastweb_notturno.js
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

const B = "fastweb", M = "2026-08-01", L = "azienda";
const AVVISO = " ⚠️ Non accendere questa riga: entrerebbe nel pick-one e ruberebbe il match alla griglia (o farebbe da catch-all). Il conteggio resta al cantiere analisi.";

(async () => {
  await client.connect();
  try {
    await client.query("begin");
    const r1 = await client.query(
      `update pay_righe set note = note || $1, ordine = case nome
         when 'Sim business · wireline contestuale (+50)' then 900
         when 'Sim business · mnp no Vodafone (+25)' then 901
         else ordine end
       where brand=$2 and month=$3 and lato=$4 and attivo=false
         and nome in ('Sim business · wireline contestuale (+50)','Sim business · mnp no Vodafone (+25)','Gettone agg.vo res (soglie business)')
         and note not like '%Non accendere%'`, [AVVISO, B, M, L]);
    const r2 = await client.query(
      `update pay_righe set brand_vendita='fastweb'
       where brand=$1 and month=$2 and lato=$3 and brand_vendita is null
         and (opzione='Protect' or nome='Gas · Business')`, [B, M, L]);
    await client.query("commit");
    console.log(`note anti-accensione: ${r1.rowCount} · brand_vendita uniformato: ${r2.rowCount}`);
  } catch (e) {
    await client.query("rollback");
    console.error("ROLLBACK:", e.message);
    process.exitCode = 1;
  }
  await client.end();
})();
