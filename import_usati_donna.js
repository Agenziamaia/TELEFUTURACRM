// USATI — FASE ZERO (03/08, direttiva Luca): si azzera TUTTO il magazzino
// usati attuale (era di prova) e si importano le VERE disponibilità dei
// negozi, a partire da Donna (file Donna.xlsx: Modello, Capacità, Grado,
// Colore, IMEI, Prezzo di VENDITA). Cliente d'acquisto e costo NON esistono
// per questi telefoni: ogni riga porta la nota "fase zero".
// Dump di sicurezza in dump_usati_pre_azzeramento.json prima del delete.
// Rilanciabile: guardia anti-doppio su IMEI gia' presente.
// Lancio: node import_usati_donna.js "/percorso/Donna.xlsx" [Negozio]
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const FILE = process.argv[2] || "/Users/macbookl/My Drive/Downloads D/Donna.xlsx";
const NEGOZIO = process.argv[3] || "Donna";
const OPERATORE = "Import fase zero";

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("pg");
const client = new Client({
  host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

// grado del file → gradi del CRM (Km0/A/B/C/D); l'originale resta in nota se cambia
const normGrado = (g) => {
  const x = String(g || "").trim().toUpperCase().replace(/\s+/g, "");
  if (["KM0", "KMO", "KM-0"].includes(x)) return "Km0";
  if (["A", "A+", "A++"].includes(x)) return "A";
  if (x === "B") return "B";
  if (x === "C") return "C";
  if (x === "D") return "D";
  return "A";
};

(async () => {
  const wb = XLSX.readFile(FILE);
  const righe = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" })
    .slice(1).filter(r => String(r[0] || "").trim());
  console.log(`File: ${righe.length} righe · negozio "${NEGOZIO}"`);

  await client.connect();

  // 1) DUMP di sicurezza e AZZERAMENTO (solo alla prima esecuzione)
  const { rows: attuali } = await client.query("select * from usati order by id");
  const giaImportati = attuali.some(r => r.venditore === OPERATORE);
  if (!giaImportati) {
    fs.writeFileSync(path.join(__dirname, "dump_usati_pre_azzeramento.json"), JSON.stringify(attuali, null, 1));
    await client.query("begin");
    try {
      const del = await client.query("delete from usati");
      await client.query("commit");
      console.log(`AZZERATO il magazzino usati: ${del.rowCount} righe eliminate (dump salvato, erano dati di prova).`);
    } catch (e) { await client.query("rollback"); throw e; }
  } else {
    console.log("Magazzino gia' azzerato in una corsa precedente: si aggiungono solo le righe nuove.");
  }

  // 2) IMPORT
  const now = new Date().toISOString();
  let inseriti = 0, saltati = 0;
  for (const r of righe) {
    const [modello, capacita, grado, colore, imeiRaw, prezzo] = r;
    const imei = String(imeiRaw || "").trim();
    const model = [String(modello).trim(), String(capacita || "").trim()].filter(Boolean).join(" ");
    const gradoCrm = normGrado(grado);
    const gradoOrig = String(grado || "").trim();
    const notaGrado = gradoCrm.toUpperCase() !== gradoOrig.toUpperCase().replace(/\s+/g, "") ? ` · grado dichiarato: "${gradoOrig}"` : "";
    const nota = `📦 Import FASE ZERO ${now.slice(0, 10)} (inventario reale ${NEGOZIO}): cliente e costo d'acquisto non disponibili` +
      (colore ? ` · Colore: ${String(colore).trim()}` : "") + notaGrado;
    if (imei) {
      const { rows: dup } = await client.query("select id from usati where imei = $1 limit 1", [imei]);
      if (dup.length) { saltati++; continue; }
    }
    await client.query(`insert into usati
      (client_id, venditore, model, imei, status, sale_price, purchase_price, store, target_store,
       purchase_date, listed_date, sold_date, ricambi, note_tecnico, status_history, provenienza_subito,
       extra_margine, pagamento, grado_usura, acquisto_per_ricambi)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`, [
      null, OPERATORE, model, imei, "in_vendita", Number(prezzo) || 0, 0, NEGOZIO, null,
      now, now, null, JSON.stringify([]), nota,
      JSON.stringify({ acquistato: { date: now, operatore: OPERATORE }, in_vendita: { date: now, operatore: OPERATORE } }),
      false, null, JSON.stringify({ metodo: "contanti", iban: "", bonifico_effettuato: null, bonifico_operatore: null, bonifico_date: null, bonifico_tipo: null, bonifico_stato: null }),
      gradoCrm, false,
    ]);
    inseriti++;
  }
  const { rows: [tot] } = await client.query("select count(*)::int n, count(*) filter (where store=$1)::int donna from usati", [NEGOZIO]);
  console.log(`IMPORT COMPLETATO: ${inseriti} inseriti, ${saltati} saltati (IMEI gia' presente).`);
  console.log(`  a magazzino ora: ${tot.n} totali, ${tot.donna} in "${NEGOZIO}" (tutti in Vetrina/in vendita)`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
