// APPLICA MIG. 150 (malus_storico: tombstone eliminato)
// Lancio: node apply_mig150.js   (dalla cartella del CRM)
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
  for (const f of ["20260803000014_malus_storico_eliminato.sql"]) {
    const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", f), "utf8");
    await client.query("begin");
    try { await client.query(sql); await client.query("commit"); }
    catch (e) { await client.query("rollback"); throw e; }
    console.log("APPLICATA:", f);
  }
  const { rows } = await client.query(`
    select column_name from information_schema.columns
    where table_name='malus_storico' and column_name in ('eliminato','eliminato_il','eliminato_da')`);
  console.log(rows.length === 3 ? "  OK malus_storico.eliminato/_il/_da" : `  ⚠️ colonne trovate: ${rows.length}/3`);
  await client.query("NOTIFY pgrst, 'reload schema'");
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
