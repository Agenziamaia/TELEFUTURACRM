// FIX MALUS ARTEFATTI DEL RIORDINO — coda (11/08/2026, segnalazioni Francesco
// via Verifiche: casi Di Giovanni e Gorelishvili). Audit manuale dei 7 episodi
// vivi creati il 10/08: 6 sono artefatti del riordino esiti — nati mentre le
// pratiche fisso completate erano orfane della chiave `attivato` (finestra
// 15:31-16:30, prima della fusione di migra_esiti_tracking.js) o per la
// maturazione retroattiva post-cambio flag (Re-Inserita MNP, Completo Sky).
// Uno solo e' genuino e resta: CTR-EE8CF17C piva 5€ (In Lavorazione ferma 4
// giorni lavorativi = succ_malus della tabella regole).
// Tombstone (mai DELETE: la ricostruzione deterministica li reinserirebbe).
// Lancio: node fix_malus_artefatti_riordino.js --apply   (senza = prova)
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
const FIRMA = "Artefatti riordino esiti 10/08 (Claude, audit 11/08)";

// (contract, categoria, data_inizio) degli artefatti — chiave univoca a DB
const ARTEFATTI = [
  ["CTR-BBAB7F85", "fisso", "2026-08-07"],  // Gorelishvili, completata 28/07, orfana attivato
  ["CTR-BBAB7F85", "sky",   "2026-08-04"],  // Gorelishvili TV, Completo→flag tolto
  ["CTR-90245242", "fisso", "2026-08-10"],  // Pacella, completata 30/07
  ["CTR-9885E000", "fisso", "2026-08-10"],  // Fumagalli, completata 30/07
  ["CTR-9021EE02", "fisso", "2026-08-08"],  // Efrati, completata 29/07
  ["CTR-C7E4FC5B", "mnp",   "2026-08-04"],  // Di Giovanni, Re-Inserita 30/07 (def. allora), Completata 05/08
];

(async () => {
  await client.connect();
  const righe = [];
  for (const [ctr, cat, inizio] of ARTEFATTI) {
    const r = (await client.query(
      `select * from malus_storico where contract_id=$1 and categoria=$2 and data_inizio=$3 and eliminato is not true`,
      [ctr, cat, inizio])).rows;
    if (r.length !== 1) { console.error(`STOP: attesa 1 riga viva per ${ctr}#${cat}#${inizio}, trovate ${r.length}`); process.exit(1); }
    righe.push(r[0]);
  }
  console.log(`artefatti trovati: ${righe.length}/6 — totale ${righe.reduce((s, r) => s + Number(r.importo), 0)}€`);
  const dest = process.env.BACKUP_DEST || "/tmp/backup_malus_artefatti_riordino.json";
  fs.writeFileSync(dest, JSON.stringify({ quando: new Date().toISOString(), righe }, null, 1));
  console.log("backup →", dest);
  if (!APPLY) { console.log("\nPROVA: nessuna scrittura (rilancia con --apply)"); await client.end(); return; }
  await client.query("begin");
  try {
    for (const r of righe)
      await client.query(
        `update malus_storico set eliminato=true, eliminato_il=now(), eliminato_da=$2,
                data_fine=coalesce(data_fine, current_date) where id=$1`, [r.id, FIRMA]);
    await client.query("commit");
    console.log("COMMIT ok — 6 episodi tombstonati");
  } catch (e) { await client.query("rollback"); console.error("ROLLBACK:", e.message); process.exit(1); }
  const vivi = (await client.query(
    `select contract_id, categoria, importo::float from malus_storico where eliminato is not true and created_at >= '2026-08-10'`)).rows;
  console.log("SCAN — episodi vivi creati dal 10/08 (atteso SOLO il genuino piva 5€):", JSON.stringify(vivi));
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
