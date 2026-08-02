// APPLICA MIG. 132 (Chat: conversazioni fissate (pinned_at))
// Lancio: node apply_mig132.js   (dalla cartella del CRM)
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
  const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations/20260801000027_chat_pinned.sql"), "utf8");
  await client.connect();
  await client.query("begin");
  try { await client.query(sql); await client.query("commit"); }
  catch (e) { await client.query("rollback"); throw e; }
  const { rows: [t] } = await client.query(
    "select count(*) n from information_schema.columns where table_name='chat_participants' and column_name='pinned_at'");
  console.log("MIG. 132 APPLICATA");
  console.log(`  colonna chat_participants.pinned_at: ${Number(t.n) === 1 ? "OK" : "MANCANTE!"}`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
