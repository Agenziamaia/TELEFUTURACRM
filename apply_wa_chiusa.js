// Applica 20260825233000_wa_chiusa.sql (idempotente).
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
  await c.query(fs.readFileSync(path.join(__dirname, "supabase/migrations/20260825233000_wa_chiusa.sql"), "utf8"));
  const { rows } = await c.query(`select count(*)::int n from information_schema.columns where table_name='wa_conversations' and column_name='chiusa_il'`);
  console.log(rows[0].n === 1 ? "colonna chiusa_il presente ✓" : "ERRORE: colonna assente");
  await c.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
