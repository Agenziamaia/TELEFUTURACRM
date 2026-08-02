// APPLICA MIG. 125 (Chiusura Linea: tabella richieste_disdette + incarico)
// Lancio: node apply_mig125.js   (dalla cartella del CRM)
const fs = require("fs");
const path = require("path");

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));

const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("pg");
const client = new Client({
  host: `db.${ref}.supabase.co`, port: 5432, database: "postgres",
  user: "postgres", password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations/20260801000019_chiusura_linea.sql"), "utf8");
  await client.connect();
  await client.query("begin");
  try {
    await client.query(sql);
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  }
  const { rows: [t] } = await client.query(
    "select count(*) n from information_schema.tables where table_name='richieste_disdette'");
  const { rows: [rls] } = await client.query(
    "select relrowsecurity from pg_class where relname='richieste_disdette'");
  const { rows: [inc] } = await client.query(
    "select count(*) n from incarichi where chiave='chiusura_linea'");
  console.log("MIG. 125 APPLICATA");
  console.log(`  tabella richieste_disdette: ${Number(t.n) === 1 ? "OK" : "MANCANTE!"}`);
  console.log(`  RLS: ${rls.relrowsecurity ? "ANCORA ATTIVA (PROBLEMA!)" : "spenta OK"}`);
  console.log(`  incarico chiusura_linea: ${Number(inc.n) === 1 ? "OK" : "MANCANTE!"}`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
