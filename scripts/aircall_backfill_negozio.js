/* AIR-01a — BACKFILL una tantum di call_events.negozio dallo storico (04/08/2026).
   Le ~4000 righe storiche hanno negozio NULL perché stores non era mappato: qui
   il negozio si deriva dall'UTENZA Aircall che ha gestito la chiamata (colonna
   aircall_user_id, con ripiego sul raw jsonb) e, in fallback, dal number_id
   (numeri diretti Collatina/Merulana). SOLO ARRICCHIMENTO: le righe con negozio
   già valorizzato NON si toccano mai (WHERE negozio IS NULL = rieseguibile).
   Le righe AnyTime Fitness restano NULL da sole: le loro utenze/numeri non
   compaiono in stores. Prima di scrivere si salva un dump di sicurezza.
   PREREQUISITO: migrazione 20260804140000_aircall_negozi.sql applicata
   (seed di stores.aircall_user_id). Runner pg+pooler come apply_mig157.js.
   Uso (dalla radice del repo): node scripts/aircall_backfill_negozio.js */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const env = fs.readFileSync(".env.local", "utf8");
const pw = env.match(/SUPABASE_DB_PASSWORD=(.+)/)[1].trim();

(async () => {
  const c = new Client({
    host: "aws-1-eu-central-2.pooler.supabase.com",
    port: 5432,
    user: "postgres.akawmrqvdtufqkaaiivv",
    password: pw,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // guardia: senza il seed delle utenze il backfill non ha basi
  const seed = await c.query("select count(*)::int as n from stores where aircall_user_id is not null");
  if (!seed.rows[0].n) throw new Error("stores.aircall_user_id non seminato: applicare prima la migrazione 20260804140000_aircall_negozi.sql");

  // DUMP DI SICUREZZA: fotografia delle righe candidabili (negozio NULL) prima
  // di scrivere — per un eventuale ripristino mirato per id.
  const dumpRows = (await c.query(
    "select id, aircall_call_id, aircall_user_id, aircall_number_id, negozio from call_events where negozio is null"
  )).rows;
  const dumpFile = path.join(__dirname, `backfill_negozio_dump_${Date.now()}.json`);
  fs.writeFileSync(dumpFile, JSON.stringify(dumpRows, null, 1));
  console.log(`Dump di sicurezza: ${dumpFile} (${dumpRows.length} righe con negozio NULL)`);

  // PASSO 1 — dall'UTENZA che ha gestito la chiamata (colonna, ripiego sul raw:
  // qualche evento vecchio potrebbe avere la colonna vuota ma il jsonb pieno)
  const r1 = await c.query(`
    update call_events ce
       set negozio = s.name
      from stores s
     where ce.negozio is null
       and s.aircall_user_id is not null
       and s.aircall_user_id = coalesce(ce.aircall_user_id, nullif(ce.raw->'data'->'user'->>'id','')::bigint)`);
  console.log(`Passo 1 (utenza -> negozio): ${r1.rowCount} righe aggiornate`);

  // PASSO 2 — fallback sul numero diretto (Ext Collatina/Merulana)
  const r2 = await c.query(`
    update call_events ce
       set negozio = s.name
      from stores s
     where ce.negozio is null
       and s.aircall_number_id is not null
       and s.aircall_number_id = coalesce(ce.aircall_number_id, nullif(ce.raw->'data'->'number'->>'id','')::bigint)`);
  console.log(`Passo 2 (number_id -> negozio): ${r2.rowCount} righe aggiornate`);

  const rest = await c.query("select count(*)::int as n from call_events where negozio is null");
  console.log(`Restano ${rest.rows[0].n} righe senza negozio (caller/sede, AnyTime Fitness, utenze non mappate: è atteso).`);
  await c.end();
})().catch((e) => { console.error("BACKFILL NEGOZIO FAIL:", e.message); process.exit(1); });
