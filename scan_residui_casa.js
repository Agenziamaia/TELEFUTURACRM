// SCANSIONE GLOBALE: nessuna tabella deve più contenere i 9 nomi vecchi
const fs = require("fs"); const path = require("path");
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("pg");
const c = new Client({ host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
const NOMI = ["Casa Start Conv","Casa Start Lock In","Casa Start Mass Market","Casa Pro Conv","Casa Pro Lock In","Casa Pro Mass Market","Casa Ultra Conv","Casa Ultra Lock In","Casa Ultra Mass Market"];
(async () => {
  await c.connect();
  const cols = (await c.query(`
    select table_name, column_name, data_type from information_schema.columns
    where table_schema='public' and data_type in ('text','character varying','jsonb','json')
    order by table_name`)).rows;
  let trovati = 0;
  for (const col of cols) {
    try {
      const q = `select count(*) n from "${col.table_name}" where cast("${col.column_name}" as text) ilike any($1)`;
      const n = +(await c.query(q, [NOMI.map(x => "%" + x + "%")])).rows[0].n;
      if (n > 0) { trovati += n; console.log(`  ⚠️ ${col.table_name}.${col.column_name}: ${n} righe`); }
    } catch { /* viste o tipi non castabili */ }
  }
  console.log(trovati === 0 ? "✅ ZERO residui in tutto il database" : `⛔ ${trovati} residui totali`);
  await c.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
