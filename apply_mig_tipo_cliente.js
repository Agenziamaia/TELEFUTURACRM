// APPLICA la migrazione 20260810223000 (backfill contracts.tipo_cliente dal
// cliente collegato) — serve al filtro "Tipo cliente" di Ricerca Vendite.
// Idempotente. Lancio: node apply_mig_tipo_cliente.js
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
const FILE = "20260810223000_backfill_tipo_cliente.sql";
(async () => {
  await client.connect();
  const q = async (s) => (await client.query(s)).rows[0];
  const prima = await q(`select count(*) filter (where tipo_cliente is null or tipo_cliente='') nulli, count(*) tot from contracts`);
  const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", FILE), "utf8");
  await client.query("begin");
  try { await client.query(sql); await client.query("commit"); console.log("OK  ", FILE); }
  catch (e) { await client.query("rollback"); console.error("FAIL", FILE, "→", e.message); process.exit(1); }
  console.log("--- VERIFICHE ---");
  console.log("senza tipo PRIMA:", prima.nulli, "su", prima.tot);
  const dopo = await q(`select count(*) filter (where tipo_cliente is null or tipo_cliente='') nulli,
    count(*) filter (where tipo_cliente='Consumer') cons, count(*) filter (where tipo_cliente='Business') bus from contracts`);
  console.log(`DOPO: Consumer ${dopo.cons} · Business ${dopo.bus} · senza tipo ${dopo.nulli} (righe senza cliente collegato — compaiono solo col filtro spento)`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
