// APPLICA MIG. 129 (Ordine Merce: articoli ordinabili a DB)
// Lancio: node apply_mig129.js   (dalla cartella del CRM)
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
  const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations/20260801000024_ordine_merce_articoli.sql"), "utf8");
  await client.connect();
  await client.query("begin");
  try { await client.query(sql); await client.query("commit"); }
  catch (e) { await client.query("rollback"); throw e; }
  const { rows: [t] } = await client.query(
    "select count(*) n from ordine_merce_articoli");
  console.log("MIG. 129 APPLICATA");
  console.log(`  articoli seed in ordine_merce_articoli: ${Number(t.n) > 0 ? t.n + " OK" : "VUOTA!"}`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
