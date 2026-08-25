// FORENSE MALUS (read-only): cosa è successo OGGI in malus_storico e nelle regole
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
(async () => {
  await client.connect();
  console.log("=== COLONNE malus_storico ===");
  const { rows: cols } = await client.query(
    "select column_name from information_schema.columns where table_name='malus_storico' order by ordinal_position");
  console.log(cols.map(c => c.column_name).join(" · "));

  console.log("\n=== FOTOGRAFIA TOTALI per stato (non eliminati) ===");
  const { rows: tot } = await client.query(`
    select stato, count(*)::int n, round(sum(importo)::numeric,2) eur
    from malus_storico where coalesce(eliminato,false)=false group by stato order by stato`);
  tot.forEach(r => console.log(`  ${r.stato}: ${r.n} episodi · ${r.eur} €`));

  console.log("\n=== CREATI OGGI (25/08) ===");
  const { rows: nuovi } = await client.query(`
    select categoria, brand, stato, count(*)::int n, round(sum(importo)::numeric,2) eur,
           min(created_at)::text primo, max(created_at)::text ultimo
    from malus_storico where created_at >= '2026-08-25' and coalesce(eliminato,false)=false
    group by 1,2,3 order by eur desc nulls last`);
  if (!nuovi.length) console.log("  nessuno");
  nuovi.forEach(r => console.log(`  ${r.categoria} · ${r.brand} · ${r.stato}: ${r.n} ep · ${r.eur} € · ${String(r.primo).slice(11, 19)}→${String(r.ultimo).slice(11, 19)}`));

  console.log("\n=== MODIFICATI OGGI ma creati PRIMA (updated_at oggi) ===");
  const { rows: mod } = await client.query(`
    select stato, categoria, brand, count(*)::int n, round(sum(importo)::numeric,2) eur
    from malus_storico
    where updated_at >= '2026-08-25' and created_at < '2026-08-25' and coalesce(eliminato,false)=false
    group by 1,2,3 order by eur desc nulls last limit 15`);
  if (!mod.length) console.log("  nessuno");
  mod.forEach(r => console.log(`  ${r.stato} · ${r.categoria} · ${r.brand}: ${r.n} ep · ${r.eur} €`));

  console.log("\n=== SPACCATO creati oggi per ora (onda unica o gocciolamento?) ===");
  const { rows: ore } = await client.query(`
    select to_char(created_at, 'HH24:MI') minuto, count(*)::int n, round(sum(importo)::numeric,2) eur
    from malus_storico where created_at >= '2026-08-25' and coalesce(eliminato,false)=false
    group by 1 order by 1 limit 30`);
  ore.forEach(r => console.log(`  ${r.minuto} → ${r.n} ep · ${r.eur} €`));

  console.log("\n=== CAMPIONE 6 episodi creati oggi (i più pesanti) ===");
  const { rows: campione } = await client.query(`
    select id, contract_id, categoria, brand, venditore, negozio, data_inizio, data_fine, giorni, importo, stato, created_at::text
    from malus_storico where created_at >= '2026-08-25' and coalesce(eliminato,false)=false
    order by importo desc limit 6`);
  for (const e of campione) {
    console.log(`\n  ▸ ${e.importo} € · ${e.categoria}/${e.brand} · ${e.venditore} @ ${e.negozio} · ${e.data_inizio}→${e.data_fine ?? "in corso"} (${e.giorni} gg) · stato ${e.stato} · creato ${String(e.created_at).slice(11, 19)} · pratica ${e.contract_id}`);
    const { rows: [c] } = await client.query(
      "select stato, categoria, brand, data from contracts where id=$1", [e.contract_id]);
    if (c) console.log(`    pratica: stato «${c.stato}» · del ${c.data}`);
    const { rows: [st] } = await client.query(
      "select storia from contracts where id=$1", [e.contract_id]);
    const eventi = (st?.storia || []).slice(-3);
    eventi.forEach(ev => console.log(`    storia: [${ev.data}] ${ev.tipo} — ${String(ev.testo).slice(0, 90)}`));
  }

  console.log("\n=== TABELLE regole/stati tracking e modifiche recenti ===");
  const { rows: tabs } = await client.query(`
    select table_name from information_schema.tables where table_schema='public'
    and (table_name ilike '%track%' or table_name ilike '%stati%' or table_name ilike '%regole%' or table_name ilike '%esiti%')
    order by table_name`);
  console.log("  tabelle:", tabs.map(t => t.table_name).join(" · "));
  for (const t of tabs.map(x => x.table_name)) {
    const { rows: c2 } = await client.query(
      "select column_name from information_schema.columns where table_name=$1 and column_name in ('updated_at','created_at')", [t]);
    for (const cc of c2.map(x => x.column_name)) {
      const { rows: [r] } = await client.query(
        `select count(*)::int n from ${t} where ${cc} >= '2026-08-25'`);
      if (r.n > 0) console.log(`  ⚠️ ${t}.${cc} oggi: ${r.n} righe`);
    }
  }

  console.log("\n=== REGOLE TRACKING: la riga SKY com'è ora (e quando è stata toccata) ===");
  for (const t of tabs.map(x => x.table_name)) {
    const { rows: c3 } = await client.query(
      "select column_name from information_schema.columns where table_name=$1", [t]);
    const nomi = c3.map(x => x.column_name);
    if (!nomi.some(n => /malus/i.test(n))) continue;
    console.log(`  tabella con colonne malus: ${t} → ${nomi.join(", ")}`);
    const { rows: righe } = await client.query(`select * from ${t} order by 1 limit 20`);
    righe.forEach(r => console.log("   ", JSON.stringify(r)));
  }

  console.log("\n=== STATI/ESITI sky modificati o creati oggi (vocabolario) ===");
  for (const t of tabs.map(x => x.table_name)) {
    const { rows: c4 } = await client.query(
      "select column_name from information_schema.columns where table_name=$1", [t]);
    const nomi = c4.map(x => x.column_name);
    if (!nomi.includes("created_at") && !nomi.includes("updated_at")) continue;
    const tcol = nomi.includes("updated_at") ? "updated_at" : "created_at";
    const catCol = nomi.find(n => ["categoria", "cat", "gruppo"].includes(n));
    try {
      const { rows: sky } = await client.query(
        `select * from ${t} where ${tcol} >= '2026-08-25 10:00' order by ${tcol} limit 15`);
      if (sky.length) { console.log(`  ${t} (${tcol} da stamattina):`); sky.forEach(r => console.log("   ", JSON.stringify(r).slice(0, 240))); }
    } catch { /* skip */ }
  }
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
