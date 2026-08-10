// APPLICA la migrazione 20260810210000 (tracking_esiti): tabella degli esiti
// negozio del Tracking PDA amministrabili per categoria + flag "completata".
// Idempotente. Lancio: node apply_mig_tracking_esiti.js
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
const FILE = "20260810210000_tracking_esiti.sql";
(async () => {
  await client.connect();
  const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", FILE), "utf8");
  await client.query("begin");
  try { await client.query(sql); await client.query("commit"); console.log("OK  ", FILE); }
  catch (e) { await client.query("rollback"); console.error("FAIL", FILE, "→", e.message); process.exit(1); }
  console.log("--- VERIFICHE ---");
  const perCat = (await client.query(
    `select categoria, count(*) n, count(*) filter (where completata) compl
     from tracking_esiti group by categoria order by categoria`)).rows;
  perCat.forEach(r => console.log(`  ${r.categoria.padEnd(14)} → ${r.n} esiti, ${r.compl} completata`));
  const tot = (await client.query(`select count(*) n, count(*) filter (where completata) c from tracking_esiti`)).rows[0];
  console.log(`totale: ${tot.n} esiti (attesi 90), completata: ${tot.c} (attese 12)`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
