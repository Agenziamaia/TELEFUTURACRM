// APPLICA la migrazione 20260825160000 (Sky ragazzi → derivato) con
// COLLAUDO pre/post: i pay ragazzi visti dal motore devono restare identici
// per ogni combinazione consumer. Lancio: node apply_mig_sky_derivato.js
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
const FILE = "20260825160000_sky_ragazzi_derivato.sql";
(async () => {
    await client.connect();
    // SNAPSHOT PRIMA: le righe ragazzi statiche (nome→tiers)
    const prima = (await client.query(`select nome, tipo_cliente, categoria, prodotto, offerta, punti, pay_tiers
        from pay_righe where brand='sky' and month='2026-08-01' and lato='ragazzi' and not gettone and attivo=true`)).rows;
    const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", FILE), "utf8");
    await client.query("begin");
    try { await client.query(sql); await client.query("commit"); console.log("OK  ", FILE); }
    catch (e) { await client.query("rollback"); console.error("FAIL", FILE, "→", e.message); process.exit(1); }
    // DOPO: per ogni riga di prima con pay, trova la gemella azienda per
    // condizioni e confronta pay_ragazzi_tiers coi tiers ragazzi vecchi
    const azienda = (await client.query(`select nome, tipo_cliente, categoria, prodotto, offerta, punti, pay_ragazzi_tiers
        from pay_righe where brand='sky' and month='2026-08-01' and lato='azienda' and attivo=true`)).rows;
    const eq = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
    let ok = 0, ko = 0;
    for (const r of prima) {
        if (!r.pay_tiers || !r.pay_tiers.length) continue;   // le business seminate (pay vuoto): superate dalla derivazione
        // gemella = stessa ancora (condizioni), la più specifica
        const cand = azienda.filter(a => eq(a.tipo_cliente, r.tipo_cliente) && eq(a.categoria, r.categoria)
            && eq(a.prodotto, r.prodotto) && (r.offerta == null ? a.offerta == null : eq(a.offerta, r.offerta)));
        const g = cand[0];
        const attesi = (r.pay_tiers || []).map(Number).join(",");
        const trovati = g && g.pay_ragazzi_tiers ? g.pay_ragazzi_tiers.map(Number).join(",") : "—";
        const pari = g && trovati === attesi && Number(g.punti) === Number(r.punti);
        if (pari) ok++; else { ko++; console.log(`KO  ${r.nome}: attesi [${attesi}] punti ${r.punti} → gemella ${g ? g.nome + " [" + trovati + "] punti " + g.punti : "NON TROVATA"}`); }
    }
    console.log(`collaudo gemelle: ${ok} identiche, ${ko} KO`);
    const resid = await client.query(`select count(*)::int n from pay_righe where brand='sky' and month='2026-08-01' and lato='ragazzi'
        union all select count(*)::int from pay_piste where brand='sky' and month='2026-08-01' and lato='ragazzi'
        union all select count(*)::int from pay_soglie where brand='sky' and month='2026-08-01' and lato='ragazzi'`);
    console.log("residui (righe rag, piste rag, SOGLIE rag che devono restare=4):", resid.rows.map(x => x.n).join(", "));
    await client.end();
})();
