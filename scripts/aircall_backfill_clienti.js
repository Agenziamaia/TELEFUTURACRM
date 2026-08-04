/* AIR-01b — RETRO-MATCH una tantum dei clienti sulle chiamate INBOUND orfane
   (decisione Luca 04/08: lo storico si aggancia ai clienti GIÀ esistenti quando
   il numero matcha). Stessa priorità del webhook: cellulare > client_numeri >
   telefono_fisso, confronto sulla CODA di 9 cifre (tail esatto delle cifre).
   SOLO MATCH UNIVOCO: se la fonte a priorità più alta con candidati ne porta
   più di uno, la coda NON si tocca e si logga (mai indovinare su un massivo).
   GUARDIA ANTI-DOPPIO: si toccano solo righe con client_id NULL — rieseguirlo
   non sovrascrive mai un aggancio già fatto (manuale, webhook o run precedente).
   DUMP DI SICUREZZA scritto PRIMA di ogni scrittura. AnyTime Fitness esclusa.
   Runner pg+pooler come apply_mig157.js.
   Uso (dalla radice del repo):
     node scripts/aircall_backfill_clienti.js            -> DRY RUN (solo report)
     node scripts/aircall_backfill_clienti.js --apply    -> scrive davvero */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const env = fs.readFileSync(".env.local", "utf8");
const pw = env.match(/SUPABASE_DB_PASSWORD=(.+)/)[1].trim();
const APPLY = process.argv.includes("--apply");

// coda di 9 cifre del numero: come codaNumero in src/lib/aircall.ts
const coda9 = (s) => String(s || "").replace(/\D/g, "").slice(-9);

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

  // 1) mappe coda -> insieme di client_id per le tre fonti (una query a fonte).
  //    Code più corte di 9 cifre: fuori — troppo rischiose per un match massivo.
  const mappa = (rows, campoNumero, campoId) => {
    const m = new Map();
    rows.forEach((r) => {
      const k = coda9(r[campoNumero]);
      if (k.length !== 9) return;
      if (!m.has(k)) m.set(k, new Set());
      m.get(k).add(r[campoId]);
    });
    return m;
  };
  const mCell = mappa((await c.query("select id, cellulare from clients where cellulare is not null")).rows, "cellulare", "id");
  const mNum = mappa((await c.query("select client_id, numero from client_numeri")).rows, "numero", "client_id");
  const mFisso = mappa((await c.query("select id, telefono_fisso from clients where telefono_fisso is not null")).rows, "telefono_fisso", "id");
  console.log(`Fonti: ${mCell.size} code da cellulare, ${mNum.size} da client_numeri, ${mFisso.size} da telefono fisso`);

  // 2) inbound orfane (AnyTime Fitness esclusa: registro di un'altra azienda)
  const orfane = (await c.query(`
    select id, aircall_call_id, cliente_num
      from call_events
     where direction = 'inbound' and client_id is null
       and coalesce(aircall_user_id, 0) not between 1872001 and 1872004
       and coalesce(aircall_number_id, 0) not in (1214147, 1214152, 1214153)`)).rows;

  // 3) risoluzione per priorità: la PRIMA fonte con candidati decide; univoco
  //    = un solo client_id, altrimenti si scarta la coda intera (con log)
  const daAggiornare = [];
  const ambigue = new Map();
  let senzaMatch = 0, corte = 0;
  orfane.forEach((r) => {
    const k = coda9(r.cliente_num);
    if (k.length !== 9) { corte++; return; }
    const fonte = mCell.has(k) ? ["clients.cellulare", mCell.get(k)]
      : mNum.has(k) ? ["client_numeri", mNum.get(k)]
      : mFisso.has(k) ? ["clients.telefono_fisso", mFisso.get(k)]
      : null;
    if (!fonte) { senzaMatch++; return; }
    const ids = [...fonte[1]];
    if (ids.length !== 1) { ambigue.set(k, ids); return; }
    daAggiornare.push({ id: r.id, aircall_call_id: r.aircall_call_id, cliente_num: r.cliente_num, client_id: ids[0], fonte: fonte[0] });
  });

  console.log(`Inbound orfane: ${orfane.length} — match univoci: ${daAggiornare.length}, code ambigue: ${ambigue.size}, senza match: ${senzaMatch}, numeri corti: ${corte}`);
  ambigue.forEach((ids, k) => console.log(`  AMBIGUA coda ${k}: clienti ${ids.join(", ")} — NON toccata`));

  if (!daAggiornare.length) { console.log("Niente da aggiornare."); await c.end(); return; }

  // 4) dump di sicurezza PRIMA di scrivere (righe + client_id che riceveranno)
  const dumpFile = path.join(__dirname, `backfill_clienti_dump_${Date.now()}.json`);
  fs.writeFileSync(dumpFile, JSON.stringify(daAggiornare, null, 1));
  console.log(`Dump di sicurezza: ${dumpFile}`);

  if (!APPLY) { console.log("DRY RUN: nessuna scrittura. Rilanciare con --apply per applicare."); await c.end(); return; }

  // 5) update riga per riga, sempre con la guardia client_id IS NULL
  let n = 0;
  for (const r of daAggiornare) {
    const res = await c.query(
      "update call_events set client_id = $1 where id = $2 and client_id is null",
      [r.client_id, r.id],
    );
    n += res.rowCount;
  }
  console.log(`Aggiornate ${n} chiamate inbound su ${daAggiornare.length} candidate.`);
  await c.end();
})().catch((e) => { console.error("BACKFILL CLIENTI FAIL:", e.message); process.exit(1); });
