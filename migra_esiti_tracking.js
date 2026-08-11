// MIGRAZIONE ESITI TRACKING (10/08/2026, ordine esplicito di Luca):
// Luca ha riorganizzato gli esiti dal pannello Amministrazione → Tracking PDA
// eliminando/ricreando alcune voci invece di rinominarle: le pratiche storiche
// restavano con chiavi orfane. Riparazione filologica:
//
//  A. FISSO "Attivo": Luca ha eliminato la chiave storica `attivato`
//     ("Completato") e ricreato "Attivo" con chiave nuova `attivo`. Ma
//     `attivato` e' una chiave di SISTEMA (Registra Vendita la scrive per le
//     pratiche gia' attive, la guardia 3P Sky e statoContrattoDa la leggono).
//     → si riporta la riga nuova sulla chiave storica: UPDATE chiave
//     'attivo'→'attivato' (etichetta "Attivo" e flag definitivo restano);
//     le 38 pratiche orfane tornano valide senza toccarle; l'unica pratica
//     gia' esitata con la chiave nuova viene riallineata.
//  B. FISSO § TIM: chiave `in_lavorazione` uniformata a `in_corso` come le
//     altre liste brand (stessa etichetta "In Lavorazione"; 0 pratiche).
//  C. FISSO 'ko_ripensamento' (doppione storico di 'ko', stessa etichetta,
//     eliminato dal pannello) → le 2 pratiche passano a 'ko'.
//  D. Categorie MAI tracciate (mobile, digitale, multi_servizi, pos: 0 righe
//     nel Tracking — il mobile business viaggia come "piva", MNP e
//     finanziamento hanno righe proprie): via le liste dal DB, il pannello
//     smette di mostrarle.
//
// RESTANO IN ATTESA DI LUCA (nessuna mappatura filologica certa):
//   fisso§sky 'in_corso' ×25 · sky 'in_attivazione_sky' ×14 · sky
//   'wm_confermata' ×3 — vedi sospeso in dev_updates.
//
// Pattern: censimento → backup → transazione → scan. Lancio:
//   node migra_esiti_tracking.js          (prova, nessuna scrittura)
//   node migra_esiti_tracking.js --apply
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
  const preEsiti = (await client.query(
    `select * from tracking_esiti
     where (lato='negozio' and categoria='fisso' and chiave in ('attivo','in_lavorazione'))
        or categoria in ('mobile','digitale','multi_servizi','pos')
     order by categoria, coalesce(brand,''), lato, ordine`)).rows;
  const preContracts = (await client.query(
    `select id, brand, stati_categoria from contracts
     where stati_categoria->>'fisso' in ('attivo','ko_ripensamento')`)).rows;
  console.log(`tracking_esiti coinvolte: ${preEsiti.length} (attese 61 = 8 fisso + 53 categorie morte)`);
  console.log(`contracts coinvolti: ${preContracts.length} (attesi 3: 1 attivo + 2 ko_ripensamento)`);
  preContracts.forEach(c => console.log(`  ${c.id}  ${c.brand}  fisso=${c.stati_categoria?.fisso}`));

  // ── backup ──
  const backup = { quando: new Date().toISOString(), preEsiti, preContracts };
  const dest = process.env.BACKUP_DEST || "/tmp/backup_migra_esiti_tracking.json";
  fs.writeFileSync(dest, JSON.stringify(backup, null, 1));
  console.log("backup →", dest);

  if (!APPLY) { console.log("\nPROVA: nessuna scrittura (rilancia con --apply)"); await client.end(); return; }

  // ── transazione ──
  await client.query("begin");
  try {
    const a = await client.query(
      `update tracking_esiti set chiave='attivato'
       where lato='negozio' and categoria='fisso' and chiave='attivo'`);
    const b = await client.query(
      `update tracking_esiti set chiave='in_corso'
       where lato='negozio' and categoria='fisso' and lower(coalesce(brand,''))='tim' and chiave='in_lavorazione'`);
    const c = await client.query(
      `update contracts set stati_categoria = jsonb_set(stati_categoria,'{fisso}','"attivato"')
       where stati_categoria->>'fisso'='attivo'`);
    const d = await client.query(
      `update contracts set stati_categoria = jsonb_set(stati_categoria,'{fisso}','"ko"')
       where stati_categoria->>'fisso'='ko_ripensamento'`);
    const e = await client.query(
      `delete from tracking_esiti where categoria in ('mobile','digitale','multi_servizi','pos')`);
    console.log(`A chiave attivo→attivato: ${a.rowCount} liste fisso (attese 7)`);
    console.log(`B TIM in_lavorazione→in_corso: ${b.rowCount} (attesa 1)`);
    console.log(`C contracts fisso attivo→attivato: ${c.rowCount} (attesa 1)`);
    console.log(`D contracts fisso ko_ripensamento→ko: ${d.rowCount} (attese 2)`);
    console.log(`E liste categorie morte eliminate: ${e.rowCount} (attese 53)`);
    if (a.rowCount !== 7 || b.rowCount !== 1 || c.rowCount !== 1 || d.rowCount !== 2) throw new Error("conteggi inattesi: rollback");
    await client.query("commit");
    console.log("COMMIT ok");
  } catch (err) { await client.query("rollback"); console.error("ROLLBACK:", err.message); process.exit(1); }

  // ── scan post ──
  const orfaneAttese = new Set(["fisso|sky|in_corso", "sky|sky|in_attivazione_sky", "sky|sky|wm_confermata"]);
  const post = (await client.query(`select categoria, chiave, lato, coalesce(brand,'') b, attiva from tracking_esiti`)).rows;
  const morte = post.filter(r => ["mobile", "digitale", "multi_servizi", "pos"].includes(r.categoria));
  const attivoResiduo = post.filter(r => r.categoria === "fisso" && r.chiave === "attivo");
  console.log(`\nSCAN: categorie morte residue ${morte.length} (attese 0) · chiave 'attivo' residua ${attivoResiduo.length} (attesa 0)`);
  const contrOrf = (await client.query(
    `select coalesce(lower(brand),'') b, stati_categoria->>'fisso' k, count(*) n from contracts
     where stati_categoria->>'fisso' in ('attivo','ko_ripensamento','attivato','in_corso') group by 1,2 order by 3 desc`)).rows;
  console.log("contracts per chiave fisso:", contrOrf.map(r => `${r.b}:${r.k}×${r.n}`).join("  "));
  const liste = (await client.query(
    `select coalesce(brand,'—') b, string_agg(chiave, ',' order by ordine) c from tracking_esiti
     where lato='negozio' and categoria='fisso' group by 1 order by 1`)).rows;
  liste.forEach(r => console.log(`fisso § ${r.b}: ${r.c}`));
  console.log(`(orfane che RESTANO in attesa di Luca: ${[...orfaneAttese].join(" · ")})`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
