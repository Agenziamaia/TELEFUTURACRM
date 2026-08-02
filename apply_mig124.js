// APPLICA MIG. 124 (telefono fisso business + riallineamento referente)
// Lancio: node apply_mig124.js   (dalla cartella del CRM)
// Connessione Postgres diretta come per le mig. 107-123; sola questa migrazione.
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
  const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations/20260801000018_business_fisso_referente.sql"), "utf8");
  await client.connect();

  // dump di sicurezza delle righe business PRIMA del backfill (lezione 30/07)
  const { rows: before } = await client.query(
    "select id, nome, cognome, nome_ref, cognome_ref from clients where tipo='business'");
  fs.writeFileSync(path.join(__dirname, "dump_business_pre_mig124.json"), JSON.stringify(before, null, 2));
  console.log(`Dump di sicurezza: ${before.length} business in dump_business_pre_mig124.json`);

  await client.query("begin");
  try {
    await client.query(sql);
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  }

  const { rows: [chk] } = await client.query(`
    select
      count(*) filter (where coalesce(trim(nome_ref),'')<>'' and coalesce(trim(nome),'')<>'') as allineate,
      count(*) filter (where coalesce(trim(nome_ref),'')='') as senza_ref,
      count(*) as tot
    from clients where tipo='business'`);
  const { rows: [col] } = await client.query(
    "select count(*) n from information_schema.columns where table_name='clients' and column_name='telefono_fisso'");
  console.log("MIG. 124 APPLICATA");
  console.log(`  colonna telefono_fisso: ${col.n === "1" || col.n === 1 ? "OK" : "MANCANTE!"}`);
  console.log(`  business: ${chk.tot} totali, ${chk.allineate} con referente allineato in entrambe le coppie, ${chk.senza_ref} ancora senza nome_ref`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
