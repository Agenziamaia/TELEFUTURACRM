// Applica 20260826001000_wa_chiusa_server_time.sql (idempotente).
const fs = require("fs"); const path = require("path");
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("pg");
const c = new Client({ host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
(async () => {
  await c.connect();
  await c.query(fs.readFileSync(path.join(__dirname, "supabase/migrations/20260826001000_wa_chiusa_server_time.sql"), "utf8"));
  const { rows } = await c.query(`select count(*)::int n from pg_trigger where tgname='trg_wa_chiusa_server_time'`);
  console.log(rows[0].n >= 1 ? "trigger presente ✓" : "ERRORE: trigger assente");
  await c.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
