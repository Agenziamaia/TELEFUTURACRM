/* Applica la migrazione agent_status + agent_reports (bacheca supporto) sul pooler.
   Uso:  ! node scripts/apply_agent_tables.js                                        */
const fs = require("fs");
const { Client } = require("pg");
const env = fs.readFileSync(".env.local", "utf8");
const pw = env.match(/SUPABASE_DB_PASSWORD=(.+)/)[1].trim();
const sql = fs.readFileSync("supabase/migrations/20260903000000_agent_status_report.sql", "utf8");
(async () => {
  const c = new Client({
    host: "aws-1-eu-central-2.pooler.supabase.com",
    port: 5432,
    user: "postgres.akawmrqvdtufqkaaiivv",
    password: pw,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  await c.query(sql);
  const r = await c.query("select table_name from information_schema.tables where table_name in ('agent_status','agent_reports') order by table_name");
  console.log("MIGRAZIONE OK — tabelle create:", r.rows.map((x) => x.table_name).join(", "));
  await c.end();
})().catch((e) => { console.error("MIGRAZIONE FAIL:", e.message); process.exit(1); });
