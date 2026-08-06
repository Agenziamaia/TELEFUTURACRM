// APPLICA MIG. 186 (disdette: ciclo di verifica + backfill allegati cliente)
// Lancio: node apply_mig186.js   (dalla cartella del CRM)
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
  for (const f of ["20260806030000_disdette_verifica.sql"]) {
    const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", f), "utf8");
    await client.query("begin");
    try { await client.query(sql); await client.query("commit"); }
    catch (e) { await client.query("rollback"); throw e; }
    console.log("APPLICATA:", f);
  }
  const { rows } = await client.query(`select column_name from information_schema.columns where table_name='richieste_disdette' and column_name in ('gestita_il','verifica_dal','verificata_il')`);
  console.log(rows.length === 3 ? "  OK colonne ciclo verifica" : "  ⚠️ colonne mancanti: " + rows.map(r => r.column_name).join(","));
  const bf = await client.query(`select count(*)::int as n from contract_attachments where file_type='disdetta'`);
  console.log(`  allegati disdetta in contract_attachments: ${bf.rows[0].n}`);
  const st = await client.query(`select status, count(*)::int as n from richieste_disdette group by status order by status`);
  console.log("  stati disdette:", st.rows.map(r => `${r.status}=${r.n}`).join(" · "));
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
