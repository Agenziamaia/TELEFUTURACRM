// APPLICA la migrazione 20260824260000 (colonna caller_anomalie.contract_ids —
// anomalie con piu vendite collegate). Idempotente.
// Lancio: node apply_mig_caller_anomalie_multi.js
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
const FILE = "20260824270000_caller_anomalie_multi.sql";
(async () => {
    await client.connect();
    const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", FILE), "utf8");
    await client.query("begin");
    try { await client.query(sql); await client.query("commit"); console.log("OK  ", FILE); }
    catch (e) { await client.query("rollback"); console.error("FAIL", FILE, "→", e.message); process.exit(1); }
    const n = (await client.query("select count(*)::int n from information_schema.columns where table_name='caller_anomalie' and column_name='contract_ids'")).rows[0];
    console.log("colonna contract_ids:", n?.n === 1 || n?.n === "1" ? "presente ✅" : "ASSENTE ❌");
    await client.end();
})();
