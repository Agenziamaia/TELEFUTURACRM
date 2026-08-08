// APPLICA la migrazione 20260808170000 (Registra Vendita: Voce Casa IMEI +
// Outdoor senza ICCID). Idempotente: rilanciabile senza effetti doppi.
// Lancio (dalla cartella CRM):  node apply_mig_rv_voce_casa.js
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

const FILE = "20260808170000_rv_voce_casa_imei_outdoor_no_iccid.sql";

(async () => {
  await client.connect();
  const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", FILE), "utf8");
  await client.query("begin");
  try { await client.query(sql); await client.query("commit"); console.log("OK  ", FILE); }
  catch (e) { await client.query("rollback"); console.error("FAIL", FILE, "→", e.message); process.exit(1); }

  const q = async (s) => (await client.query(s)).rows[0];
  console.log("--- VERIFICHE ---");
  console.log("3 nuove regole per-offerta:", (await q(
    "select count(*) n from catalog_campi_regole where etichetta like '%(08/08)' and etichetta like '🎯 Offerta:%' and (etichetta like '%Voce Casa%' or etichetta like '%Outdoor%')"))?.n, "(attese 3)");
  console.log("Voce Casa → campo IMEI attivo:", (await q(
    "select count(*) n from catalog_campi_regole where condizioni->'offerta' ? 'Voce Casa' and campi::text like '%\"nome\":\"IMEI\"%' and campi::text like '%\"attivo\":true%'"))?.n, "(attesa 1)");
  console.log("Outdoor → ICCID nascosto (attivo=false):", (await q(
    "select count(*) n from catalog_campi_regole where etichetta like '%Outdoor%no ICCID%' and campi::text like '%Seriale SIM (ICCID)%' and campi::text like '%\"attivo\":false%'"))?.n, "(attese 2)");
  console.log("regola generale FWA (16c3b3d6) ancora con ICCID attivo:", (await q(
    "select (campi::text like '%Seriale SIM (ICCID)%' and campi::text like '%\"attivo\":true%') ok from catalog_campi_regole where id='16c3b3d6-7a97-402e-8102-d73422457d04'"))?.ok, "(atteso true — invariata)");
  console.log("nuove regole tutte con ordine < 0:", (await q(
    "select bool_and(ordine < 0) ok from catalog_campi_regole where etichetta like '%(08/08)' and etichetta like '🎯 Offerta:%'"))?.ok, "(atteso true)");
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
