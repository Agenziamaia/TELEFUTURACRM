// APPLICA la migrazione 20260825140000 (Wireline → Fisso nei testi visibili).
// Lancio: node apply_mig_wireline_fisso.js
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
const FILE = "20260825140000_wireline_diventa_fisso.sql";
(async () => {
    await client.connect();
    const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", FILE), "utf8");
    await client.query("begin");
    try { await client.query(sql); await client.query("commit"); console.log("OK  ", FILE); }
    catch (e) { await client.query("rollback"); console.error("FAIL", FILE, "→", e.message); process.exit(1); }
    const v1 = await client.query(`select brand, chiave, nome from pay_piste where chiave in ('fisso','business_fisso') and brand in ('vodafone','fastweb') and month='2026-08-01' and lato='azienda'`);
    v1.rows.forEach(x => console.log("pista:", JSON.stringify(x)));
    const v2 = await client.query(`select count(*)::int n from pay_piste where nome ilike '%wireline%'
        union all select count(*)::int from pay_righe where nome ilike '%wireline%' or note ilike '%wireline%'`);
    console.log("residui wireline (piste, righe):", v2.rows.map(x => x.n).join(", "));
    await client.end();
})();
