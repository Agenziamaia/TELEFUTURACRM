// APPLICA 20260811090000 (tracking_esiti.brand): esiti per operatore sul fisso.
// Idempotente. Lancio: node apply_mig_esiti_brand.js
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
const FILE = "20260811090000_tracking_esiti_brand.sql";
(async () => {
  await client.connect();
  const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", FILE), "utf8");
  await client.query("begin");
  try { await client.query(sql); await client.query("commit"); console.log("OK  ", FILE); }
  catch (e) { await client.query("rollback"); console.error("FAIL", FILE, "→", e.message); process.exit(1); }
  const cols = (await client.query(`select column_name from information_schema.columns where table_name='tracking_esiti' and column_name='brand'`)).rows;
  const idx = (await client.query(`select indexname from pg_indexes where tablename='tracking_esiti'`)).rows.map(r=>r.indexname);
  console.log("colonna brand:", cols.length ? "OK" : "MANCA", "| indici:", idx.join(", "));
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
