/* Applica la migrazione 157 (cestino tracking) sul pooler Supabase. */
const fs = require("fs");
const { Client } = require("pg");
const env = fs.readFileSync(".env.local", "utf8");
const pw = env.match(/SUPABASE_DB_PASSWORD=(.+)/)[1].trim();
const sql = fs.readFileSync("supabase/migrations/20260803000021_tracking_cestino.sql", "utf8");
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
  const r = await c.query("select column_name from information_schema.columns where table_name='contracts' and column_name='tracking_nascosto'");
  console.log("MIG 157 OK — colonna:", r.rows);
  await c.end();
})().catch((e) => { console.error("MIG 157 FAIL:", e.message); process.exit(1); });
