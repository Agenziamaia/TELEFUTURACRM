// APPLICA la migrazione 20260810180000 (esiti allineati calendario↔caller):
// censisce le opzioni stato mancanti e riconcilia le pratiche il cui
// appuntamento è già attivato. Idempotente. Lancio: node apply_mig_esiti.js
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
const FILE = "20260810180000_esiti_allineati.sql";
(async () => {
  await client.connect();
  const prima = (await client.query(`select count(*) n from calls c join appointments a on a.id=c.appointment_id
    where a.status in ('attivato','attivato_diverso_negozio') and coalesce(c.stato,'') not in ('Attivato','Attivato Altro Negozio')`)).rows[0].n;
  const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", FILE), "utf8");
  await client.query("begin");
  try { await client.query(sql); await client.query("commit"); console.log("OK  ", FILE); }
  catch (e) { await client.query("rollback"); console.error("FAIL", FILE, "→", e.message); process.exit(1); }
  const q = async (s) => (await client.query(s)).rows[0];
  console.log("--- VERIFICHE ---");
  console.log("pratiche da riconciliare PRIMA:", prima);
  console.log("residue disallineate DOPO:", (await q(`select count(*) n from calls c join appointments a on a.id=c.appointment_id
    where a.status in ('attivato','attivato_diverso_negozio') and coalesce(c.stato,'') not in ('Attivato','Attivato Altro Negozio')`))?.n, "(attese 0)");
  console.log("opzioni stato censite:", (await q(`select count(*) n from caller_opzioni where categoria='stato' and voce in ('Attivato','Attivato Altro Negozio','Attivato Anomalia')`))?.n, "(attese 3)");
  console.log("pratiche 'Attivato Anomalia' rimaste (appuntamento NON attivato — da verificare a mano):",
    (await q(`select count(*) n from calls where stato='Attivato Anomalia'`))?.n);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
