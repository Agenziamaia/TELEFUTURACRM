// RICOGNIZIONE soglie/piste W3 agosto (cantiere scheda ragazzi 25/08):
// pay_piste (perc_ragazzi, soglie_pct, soglie_max), pay_soglie (entrambi i
// lati), righe assicurazioni e mappa % per soglia. Sola lettura.
// Lancio: node check_soglie_ragazzi_w3.js
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
const M = "2026-08-01";
(async () => {
    await client.connect();
    const q = async (label, sql) => {
        const r = await client.query(sql);
        console.log(`\n== ${label} (${r.rows.length}) ==`);
        r.rows.forEach(x => console.log(JSON.stringify(x)));
    };
    await q("pay_piste W3", `select lato, chiave, nome, um, perc_ragazzi, soglie_pct, soglie_max, ordine
        from pay_piste where brand='windtre' and month='${M}' order by lato, ordine`);
    await q("pay_soglie W3", `select lato, pista, tier, soglia_da, soglia_a
        from pay_soglie where brand='windtre' and month='${M}' order by lato, pista, tier`);
    await q("pay_mappa_soglie W3", `select pista, tier_nostro, tier_loro, perc
        from pay_mappa_soglie where brand='windtre' and month='${M}' order by pista, tier_nostro`);
    await q("righe assicurazioni W3", `select nome, lato, moltiplicatore, componente, punti, pay_base, pay_tiers, gettone, attivo
        from pay_righe where brand='windtre' and month='${M}' and pista='assicurazioni' order by ordine`);
    await q("righe con 'attribu' nel nome", `select brand, lato, pista, nome, pay_base, pay_tiers
        from pay_righe where nome ilike '%attribu%' limit 20`);
    await client.end();
})();
