// APPLICA la migrazione 20260810150000 (tipo 'sprint' + calderone sprint_frasi
// + comunicazioni.sprint_frase). Idempotente. Lancio: node apply_mig_sprint.js
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
const FILE = "20260810150000_comunicazioni_sprint.sql";
(async () => {
  await client.connect();
  const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", FILE), "utf8");
  await client.query("begin");
  try { await client.query(sql); await client.query("commit"); console.log("OK  ", FILE); }
  catch (e) { await client.query("rollback"); console.error("FAIL", FILE, "→", e.message); process.exit(1); }
  const q = async (s) => (await client.query(s)).rows[0];
  console.log("--- VERIFICHE ---");
  console.log("tipo sprint nel CHECK:", (await q(
    "select count(*) n from information_schema.check_constraints where constraint_name='comunicazioni_type_check' and check_clause like '%sprint%'"))?.n, "(attesa 1)");
  console.log("colonna sprint_frase:", (await q(
    "select count(*) n from information_schema.columns where table_name='comunicazioni' and column_name='sprint_frase'"))?.n, "(attesa 1)");
  console.log("frasi nel calderone:", (await q("select count(*) n from sprint_frasi where attivo"))?.n, "(attese 200)");
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
