// INCIDENTE MALUS SKY 25/08/2026 (~13:48-13:54): l'attivazione della regola
// malus sky (8 €/g, salvataggi pannello 13:48 e 13:54:05) ha fatto ricostruire
// al backfill deterministico TUTTO lo storico sky — 119 episodi per 1.170 €,
// compresi periodi già azzerati dall'amministrazione e pratiche chiuse.
// Direttiva Luca: le regole cambiate valgono solo in avanti, mai retroattive.
// RIMEDIO: TOMBSTONE (eliminato=true) sui 119 episodi — è l'unico attrezzo
// sicuro: una delete pura li farebbe RINASCERE alla prossima sync (il
// tombstone esiste esattamente per questo, mig. 150). Reversibile: basta
// rimettere eliminato=false. Dump completo prima. Idempotente.
// Lancio: node fix_malus_sky_retroattivi.js
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

const CRITERIO = `categoria='sky' and created_at >= '2026-08-25' and created_at < '2026-08-26' and coalesce(eliminato,false)=false`;

(async () => {
  await client.connect();

  const dumpPath = path.join(__dirname, "dump_malus_sky_retroattivi_20260825.json");
  if (!fs.existsSync(dumpPath)) {
    const { rows } = await client.query(
      `select (to_jsonb(m) || jsonb_build_object('created_at', m.created_at::text, 'updated_at', m.updated_at::text)) r
       from malus_storico m where ${CRITERIO}`);
    fs.writeFileSync(dumpPath, JSON.stringify(rows.map(x => x.r), null, 2));
    console.log(`Dump: ${rows.length} episodi fotografati in ${path.basename(dumpPath)}`);
  } else console.log("Dump già presente: non lo sovrascrivo");

  const { rows: prima } = await client.query(
    `select stato, count(*)::int n, round(sum(importo)::numeric,2) eur from malus_storico
     where coalesce(eliminato,false)=false group by stato order by stato`);
  console.log("PRIMA :", prima.map(r => `${r.stato} ${r.n} ep/${r.eur} €`).join(" · "));

  const up = await client.query(
    `update malus_storico set eliminato=true, eliminato_il=now(),
       eliminato_da='Sistema — annullati episodi retroattivi del cambio regola sky 25/08 (ordine Luca)'
     where ${CRITERIO}`);
  console.log(`TOMBSTONE su ${up.rowCount} episodi sky nati oggi (attesi 119)`);

  const { rows: dopo } = await client.query(
    `select stato, count(*)::int n, round(sum(importo)::numeric,2) eur from malus_storico
     where coalesce(eliminato,false)=false group by stato order by stato`);
  console.log("DOPO  :", dopo.map(r => `${r.stato} ${r.n} ep/${r.eur} €`).join(" · "));

  const { rows: sky } = await client.query(
    `select count(*)::int n from malus_storico where categoria='sky' and coalesce(eliminato,false)=false`);
  console.log(`Episodi sky ancora visibili: ${sky[0].n} (attesi 0 — prima di oggi non ne esistevano)`);

  console.log("\nSpaccato per negozio degli episodi annullati (per la comunicazione ai PV):");
  const { rows: pv } = await client.query(
    `select negozio, count(*)::int n, round(sum(importo)::numeric,2) eur from malus_storico
     where categoria='sky' and eliminato=true and eliminato_il >= '2026-08-25'
     group by negozio order by eur desc`);
  pv.forEach(r => console.log(`  ${r.negozio}: ${r.n} ep · ${r.eur} €`));
  await client.end();
  console.log("FATTO ✓ — reversibile con: update malus_storico set eliminato=false, eliminato_il=null, eliminato_da=null where eliminato_da like 'Sistema — annullati episodi retroattivi%'");
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
