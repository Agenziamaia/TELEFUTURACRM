// APPLICA la migrazione 20260825120000 (FTTH Extra nel gruppo tecnologia).
// Lancio: node apply_mig_w3_ftth_extra.js
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
const FILE = "20260825120000_w3_ftth_extra_gruppo.sql";
(async () => {
    await client.connect();
    const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", FILE), "utf8");
    await client.query("begin");
    try { await client.query(sql); await client.query("commit"); console.log("OK  ", FILE); }
    catch (e) { await client.query("rollback"); console.error("FAIL", FILE, "→", e.message); process.exit(1); }
    const v = await client.query(`select o.nome, o.gruppo_singolo g, o.obbligatoria obb, count(*)::int n
        from catalog_opzioni o join catalog_offerte off on off.id=o.offerta_id join catalog_prodotti p on p.id=off.prodotto_id
        where p.brand_id='windtre' and o.nome in ('FTTH','FTTH Extra','FTTC') and o.attivo=true group by 1,2,3 order by 1`);
    v.rows.forEach(x => console.log("verifica:", JSON.stringify(x)));
    await client.end();
})();
