// CORREZIONI LUCA 14/08 sera-2:
// ① Conteggio mobile INVERTITO (e ora combacia con la slide W3):
//    GA base 0,75 · Security venduta insieme +0,25 → 1 con Security.
// ② Bonus assicurazioni nella tabella target = GLOBALE di rete
//    (0 / 2500 / 3750 = 500/750 € × 5 negozi), non più per negozio.
// Lancio: node fix_w3_conteggio_e_bonus.js   (dalla cartella del CRM)
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

const MONTH = "2026-08-01";

(async () => {
  await client.connect();
  await client.query("begin");
  try {
    const a = await client.query(
      `update pay_righe set punti = 0.75,
         note = 'Conteggio base 0,75 senza Security; con Security/Security Pro si somma la riga +0,25 (=1). Come da slide W3 agosto.'
       where brand='windtre' and month=$1 and lato='azienda' and pista='mobile'
         and componente in ('base','base_underground')`, [MONTH]);
    const b = await client.query(
      `update pay_righe set punti = 0.25,
         note = 'Con Security o Security Pro nel carrello la GA torna a valere 1 in soglia (0,75 + 0,25). L''opzione è nel campo Opzioni della vendita: si applica da sola.'
       where brand='windtre' and month=$1 and componente = 'punti_security'`, [MONTH]);
    const c1 = await client.query(
      `update pay_soglie set bonus = 2500 where brand='windtre' and month=$1 and lato='azienda' and pista='assicurazioni' and tier=2`, [MONTH]);
    const c2 = await client.query(
      `update pay_soglie set bonus = 3750 where brand='windtre' and month=$1 and lato='azienda' and pista='assicurazioni' and tier=3`, [MONTH]);
    console.log("basi 0,75:", a.rowCount, "· security 0,25:", b.rowCount, "· bonus globali:", c1.rowCount + c2.rowCount);
    await client.query("commit");
  } catch (e) { await client.query("rollback"); throw e; }

  const post = await client.query(
    `select componente, punti from pay_righe where brand='windtre' and month=$1 and pista='mobile' and componente in ('base','base_underground','punti_security') order by ordine`, [MONTH]);
  post.rows.forEach(r => console.log(" ", r.componente, "punti", r.punti));
  const bn = await client.query(
    `select tier, soglia_da, bonus from pay_soglie where brand='windtre' and month=$1 and lato='azienda' and pista='assicurazioni' order by tier`, [MONTH]);
  bn.rows.forEach(r => console.log("  assicurazioni T" + r.tier, "da", r.soglia_da, "bonus", r.bonus));
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
