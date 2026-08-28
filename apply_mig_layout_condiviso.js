const fs = require("fs"), path = require("path");
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
    .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("/Users/macbookl/.claude/jobs/c89a338c/tmp/pgmod/node_modules/pg");
const client = new Client({ host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
    user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
const FILE = "20260828234500_layout_condiviso.sql";
(async () => {
    await client.connect();
    const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", FILE), "utf8");
    await client.query("begin");
    try { await client.query(sql); await client.query("commit"); console.log("OK  ", FILE); }
    catch (e) { await client.query("rollback"); console.error("FAIL", FILE, "→", e.message); process.exit(1); }
    // si parte dalla disposizione dell'admin, così nessuno perde quello che vede
    const r = await client.query(`select analisi_layout->'rete' as rete from app_users where role='admin' and analisi_layout->'rete' is not null order by updated_at desc nulls last limit 1`);
    if (r.rows[0]?.rete) {
        await client.query(`insert into layout_condiviso (chiave, valore, updated_by) values ('analisi_rete', $1, 'migrazione') on conflict (chiave) do nothing`, [JSON.stringify(r.rows[0].rete)]);
        console.log("seminato da admin:", JSON.stringify(r.rows[0].rete));
    }
    await client.end();
})();
