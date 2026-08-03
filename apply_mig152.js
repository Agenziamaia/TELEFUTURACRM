// APPLICA MIG. 152 (fisso VB: seriale SIM + GNP)
// Lancio: node apply_mig152.js   (dalla cartella del CRM)
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
  await client.connect();
  for (const f of ["20260803000016_fisso_vfb_sim_gnp.sql"]) {
    const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", f), "utf8");
    await client.query("begin");
    try { await client.query(sql); await client.query("commit"); }
    catch (e) { await client.query("rollback"); throw e; }
    console.log("APPLICATA:", f);
  }
  const { rows } = await client.query("select etichetta, ordine from catalog_campi_regole where etichetta like 'Fisso Vodafone Business%'");
  console.log(rows.length ? `  OK regola "${rows[0].etichetta}" (ord ${rows[0].ordine})` : "  ⚠️ regola VB fisso MANCANTE");
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
