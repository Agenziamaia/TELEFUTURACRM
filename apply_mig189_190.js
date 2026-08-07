// APPLICA MIG. 189 (listino compensi brand) + 190 (catalog_valori: tariffe Kipoint & co.)
// Lancio: node apply_mig189_190.js   (dalla cartella del CRM)
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

(async () => {
  await client.connect();
  for (const f of ["20260807210000_ce_compensi_brand.sql", "20260807220000_catalog_valori.sql"]) {
    const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", f), "utf8");
    await client.query("begin");
    try { await client.query(sql); await client.query("commit"); }
    catch (e) { await client.query("rollback"); throw e; }
    console.log("APPLICATA:", f);
  }
  for (const t of ["ce_compensi_brand", "catalog_valori"]) {
    const { rows } = await client.query(`select count(*)::int as n from ${t}`);
    console.log(`  ${t}: ${rows[0].n} righe`);
  }
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
