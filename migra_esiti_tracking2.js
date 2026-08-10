// MIGRAZIONE ESITI TRACKING — parte 2 (10/08/2026, risposte di Luca in chat
// al sospeso "42 pratiche su esiti eliminati"):
//   ① FISSO Sky: 25 pratiche 'in_corso' (esito eliminato dalla lista Sky)
//      → 'attesa_matricola' ("Attesa Matricola"). SOLO brand Sky: WindTre/
//      Vodafone/Fastweb hanno 'in_corso' ("In Lavorazione") nelle loro liste.
//   ② SKY TV: 14 pratiche 'in_attivazione_sky' (eliminato) → 'attesa_matricola'.
//   ③ SKY TV: 3 pratiche 'wm_confermata' (eliminato) → 'incompleto'.
//   ④ ENERGIA: doppione "Ko Reinserito" — si elimina la voce SENZA pratiche
//      (chiave ko_reinserito_en, 0 usi verificati su stati_categoria e
//      stato_negozio); sopravvive la chiave 'ko' rinominata da Luca (1 pratica).
// Pattern: censimento → backup → transazione → scan. Lancio:
//   node migra_esiti_tracking2.js          (prova)
//   node migra_esiti_tracking2.js --apply
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
const APPLY = process.argv.includes("--apply");

(async () => {
  await client.connect();

  // ── censimento pre ──
  const pre = (await client.query(
    `select id, brand, stati_categoria from contracts
     where (stati_categoria->>'fisso'='in_corso' and lower(brand) like '%sky%')
        or stati_categoria->>'sky' in ('in_attivazione_sky','wm_confermata')`)).rows;
  const dopp = (await client.query(
    `select * from tracking_esiti where categoria='energia' and lato='negozio' and chiave='ko_reinserito_en'`)).rows;
  const usiDopp = (await client.query(
    `select count(*)::int n from contracts
     where stati_categoria->>'energia'='ko_reinserito_en' or stato_negozio='ko_reinserito_en'`)).rows[0].n;
  console.log(`contracts coinvolti: ${pre.length} (attesi 42) · doppione energia: ${dopp.length} riga, ${usiDopp} usi (attesi 0)`);
  if (usiDopp !== 0) { console.error("STOP: il doppione energia ha pratiche associate!"); process.exit(1); }

  // ── backup ──
  const dest = process.env.BACKUP_DEST || "/tmp/backup_migra_esiti_tracking2.json";
  fs.writeFileSync(dest, JSON.stringify({ quando: new Date().toISOString(), pre, dopp }, null, 1));
  console.log("backup →", dest);

  if (!APPLY) { console.log("\nPROVA: nessuna scrittura (rilancia con --apply)"); await client.end(); return; }

  // ── transazione ──
  await client.query("begin");
  try {
    const a = await client.query(
      `update contracts set stati_categoria = jsonb_set(stati_categoria,'{fisso}','"attesa_matricola"')
       where stati_categoria->>'fisso'='in_corso' and lower(brand) like '%sky%'`);
    const b = await client.query(
      `update contracts set stati_categoria = jsonb_set(stati_categoria,'{sky}','"attesa_matricola"')
       where stati_categoria->>'sky'='in_attivazione_sky'`);
    const c = await client.query(
      `update contracts set stati_categoria = jsonb_set(stati_categoria,'{sky}','"incompleto"')
       where stati_categoria->>'sky'='wm_confermata'`);
    const d = await client.query(
      `delete from tracking_esiti where categoria='energia' and lato='negozio' and chiave='ko_reinserito_en'`);
    console.log(`① fisso Sky in_corso→attesa_matricola: ${a.rowCount} (attese 25)`);
    console.log(`② sky in_attivazione_sky→attesa_matricola: ${b.rowCount} (attese 14)`);
    console.log(`③ sky wm_confermata→incompleto: ${c.rowCount} (attese 3)`);
    console.log(`④ doppione energia eliminato: ${d.rowCount} (attesa 1)`);
    if (a.rowCount !== 25 || b.rowCount !== 14 || c.rowCount !== 3 || d.rowCount !== 1) throw new Error("conteggi inattesi: rollback");
    await client.query("commit");
    console.log("COMMIT ok");
  } catch (err) { await client.query("rollback"); console.error("ROLLBACK:", err.message); process.exit(1); }

  // ── scan post ──
  const residui = (await client.query(
    `select count(*)::int n from contracts
     where (stati_categoria->>'fisso'='in_corso' and lower(brand) like '%sky%')
        or stati_categoria->>'sky' in ('in_attivazione_sky','wm_confermata')
        or stati_categoria->>'energia'='ko_reinserito_en'`)).rows[0].n;
  const dist = (await client.query(
    `select stati_categoria->>'sky' k, count(*) n from contracts
     where stati_categoria ? 'sky' group by 1 order by 2 desc`)).rows;
  console.log(`\nSCAN: residui orfani ${residui} (attesi 0)`);
  console.log("distribuzione sky TV:", dist.map(r => `${r.k}×${r.n}`).join("  "));
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
