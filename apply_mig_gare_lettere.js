// APPLICA la migrazione 20260819200000 (tabella gare_lettere — archivio
// lettere di gara mensili). Idempotente. Lancio: node apply_mig_gare_lettere.js
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
const FILE = "20260819200000_gare_lettere.sql";
(async () => {
    await client.connect();
    const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", FILE), "utf8");
    await client.query("begin");
    try { await client.query(sql); await client.query("commit"); console.log("OK  ", FILE); }
    catch (e) { await client.query("rollback"); console.error("FAIL", FILE, "→", e.message); process.exit(1); }
    const n = (await client.query("select count(*) n from information_schema.tables where table_name='gare_lettere'")).rows[0];
    console.log("tabella gare_lettere:", n?.n === "1" || n?.n === 1 ? "presente ✅" : "ASSENTE ❌");
    await client.end();
})();
