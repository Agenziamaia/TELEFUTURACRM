// APPLICA la migrazione 20260811001000 (sospensione + licenziamento con data).
// Idempotente. Lancio: node apply_mig_sospensione.js
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
const FILE = "20260811001000_sospensione_licenziamento.sql";
(async () => {
  await client.connect();
  const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", FILE), "utf8");
  await client.query("begin");
  try { await client.query(sql); await client.query("commit"); console.log("OK  ", FILE); }
  catch (e) { await client.query("rollback"); console.error("FAIL", FILE, "→", e.message); process.exit(1); }
  console.log("--- VERIFICHE ---");
  const cols = (await client.query(`select column_name from information_schema.columns
    where table_name='app_users' and column_name in ('data_licenziamento','sospeso_dal') order by 1`)).rows;
  console.log("colonne presenti:", cols.map(c => c.column_name).join(", "), "(attese 2)");
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
