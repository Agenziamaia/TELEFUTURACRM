// APPLICA la migrazione 20260810230000 (pay_tabellare): tabelle del
// "pagamento a tabella" delle gare ragazzi (piste, soglie, righe pay
// ancorate al catalogo) + RPC pay_copy_month.
// Idempotente. Lancio: node apply_mig_pay_tabellare.js
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
const FILE = "20260810230000_pay_tabellare.sql";
(async () => {
  await client.connect();
  const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", FILE), "utf8");
  await client.query("begin");
  try { await client.query(sql); await client.query("commit"); console.log("OK  ", FILE); }
  catch (e) { await client.query("rollback"); console.error("FAIL", FILE, "→", e.message); process.exit(1); }
  console.log("--- VERIFICHE ---");
  for (const t of ["pay_piste", "pay_soglie", "pay_righe"]) {
    const n = (await client.query(`select count(*) n from ${t}`)).rows[0].n;
    console.log(`  ${t.padEnd(11)} → ${n} righe`);
  }
  const rpc = (await client.query(
    `select count(*) n from pg_proc where proname='pay_copy_month'`)).rows[0].n;
  console.log(`  RPC pay_copy_month: ${rpc === "1" || rpc === 1 ? "presente" : "MANCANTE"}`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
