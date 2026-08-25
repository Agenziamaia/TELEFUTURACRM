// APPLICA la migrazione 20260825100000 (pay_piste.soglie_max=3 su lucegas
// azienda W3 — le soglie dei ragazzi vanno da 1 a 3). Idempotente.
// Lancio: node apply_mig_w3_lucegas_soglie_max.js
const fs = require("fs");
const path = require("path");
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
    .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
// pg non è più in node_modules del repo: si usa l'installazione del job tmp
const { Client } = require("/Users/macbookl/.claude/jobs/c89a338c/tmp/pgmod/node_modules/pg");
const client = new Client({
    host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
    user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
});
const FILE = "20260825100000_w3_lucegas_soglie_max.sql";
(async () => {
    await client.connect();
    const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", FILE), "utf8");
    await client.query("begin");
    try { await client.query(sql); await client.query("commit"); console.log("OK  ", FILE); }
    catch (e) { await client.query("rollback"); console.error("FAIL", FILE, "→", e.message); process.exit(1); }
    const r = await client.query("select month, chiave, soglie_max from pay_piste where brand='windtre' and lato='azienda' and chiave in ('mobile','fisso','lucegas') order by month, chiave");
    r.rows.forEach(x => console.log("verifica:", JSON.stringify(x)));
    await client.end();
})();
