// GARE S4 — SOGLIA UNICA (25/08 sera, correzione Luca: «le soglie non dovevi
// cambiarle, solo il commissioning andava diviso»):
//   ① DDL pay_piste.soglie_di (migrazione 20260825170000)
//   ② energia_business si APPOGGIA a energia_consumer (soglie_di) e perde la
//      sua finta soglia «da 0»: il canvass 0-74/75-149/150+ torna UNICO e
//      conta TUTTI i pezzi (consumer + business); il commissioning e la % ai
//      ragazzi restano divisi per sezione.
// Idempotente. Lancio: node fix_s4_soglia_unica.js
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

  const ddl = fs.readFileSync(path.join(__dirname, "supabase/migrations/20260825170000_pay_piste_soglie_di.sql"), "utf8");
  await client.query(ddl);
  console.log("① DDL ok: pay_piste.soglie_di");

  const up = await client.query(
    `update pay_piste set soglie_di='energia_consumer'
     where brand='s4' and lato='azienda' and chiave='energia_business' and (soglie_di is null or soglie_di<>'energia_consumer')`);
  const del = await client.query(
    `delete from pay_soglie where brand='s4' and pista='energia_business'`);
  console.log(`② business appoggiato al consumer (${up.rowCount} piste aggiornate) · finta soglia «da 0» rimossa (${del.rowCount} righe)`);

  // COLLAUDO: struttura + conteggio unificato come lo farà il motore
  const { rows: piste } = await client.query(
    `select month, chiave, soglie_di, perc_ragazzi from pay_piste where brand='s4' and lato='azienda' order by month, ordine`);
  piste.forEach(p => console.log(`  ${String(p.month).slice(0, 7)} · ${p.chiave}${p.soglie_di ? ` → soglie di ${p.soglie_di}` : " (soglie proprie)"} · % ragazzi ${p.perc_ragazzi ?? "(=100)"}`));
  const { rows: sg } = await client.query(
    `select month, pista, count(*)::int n from pay_soglie where brand='s4' group by month, pista order by month`);
  sg.forEach(s => console.log(`  soglie ${String(s.month).slice(0, 7)} · ${s.pista}: ${s.n}`));
  const { rows: [ago] } = await client.query(
    `select count(*) filter (where tipo_cliente='Consumer')::int cons,
            count(*) filter (where tipo_cliente='Business')::int biz
     from contracts where brand ilike 'S4%' and id like 'CTR-%'
       and coalesce(is_demo,false)=false and coalesce(nascosta_gestione,false)=false
       and stato not ilike '%annull%' and data >= '2026-08-01' and data <= '2026-08-31'`);
  console.log(`  agosto: ${ago.cons} consumer + ${ago.biz} business = ${ago.cons + ago.biz} nel canvass unico → S1 (0-74)`);
  const { rows: manu } = await client.query(
    `select nome, pay_ragazzi_tiers from pay_righe where brand='s4' and month='2026-08-01' and pista='energia_consumer' and pay_ragazzi_tiers is not null`);
  manu.forEach(m => console.log(`  ✍️ commissioning manuale di Luca su «${m.nome}»: ${JSON.stringify(m.pay_ragazzi_tiers)}`));
  await client.end();
  console.log("FATTO ✓");
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
