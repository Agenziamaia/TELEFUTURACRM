// APPLICA MIG. 136 (Margine % sui listini)
// Lancio: node apply_mig135.js   (dalla cartella del CRM)
const fs = require("fs");
const path = require("path");

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));

const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("pg");
const client = new Client({
  // pooler IPv4 (l'host diretto db.<ref> e' solo IPv6 e questa rete non ce l'ha)
  host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations/20260802000003_listini_margine.sql"), "utf8");
  await client.connect();
  await client.query("begin");
  try { await client.query(sql); await client.query("commit"); }
  catch (e) { await client.query("rollback"); throw e; }
  const { rows: [t] } = await client.query(
    "select count(*) n from information_schema.columns where table_name='listini_terminali' and column_name='margine_pct'");
  console.log("MIG. 136 APPLICATA");
  console.log(`  colonna margine_pct: ${Number(t.n) === 1 ? "OK" : "MANCANTE!"}`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
