// APPLICA la migrazione 20260821200000 (CHECK di caller_malus.stato allargato
// ad 'archiviato' — quarto spazio malus, Luca 21/08 sera). Idempotente.
// Lancio: node apply_mig_caller_malus_archiviato.js
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
const FILE = "20260821200000_caller_malus_archiviato.sql";
(async () => {
    await client.connect();
    const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", FILE), "utf8");
    await client.query("begin");
    try { await client.query(sql); await client.query("commit"); console.log("OK  ", FILE); }
    catch (e) { await client.query("rollback"); console.error("FAIL", FILE, "→", e.message); process.exit(1); }
    const chk = (await client.query(
        "select pg_get_constraintdef(oid) def from pg_constraint where conname='caller_malus_stato_check'"
    )).rows[0];
    console.log("CHECK attuale:", chk?.def || "ASSENTE ❌");
    console.log(chk?.def?.includes("archiviato") ? "archiviato ammesso ✅" : "archiviato NON ammesso ❌");
    await client.end();
})();
