// USATI FASE ZERO — import MULTI-NEGOZIO (03/08, "Disponibilità Usati
// Luglio 2026.xlsx"): un foglio per negozio, intestazione alla riga 2
// (Modello, Capacità, Grado, Colore, IMEI, Prezzo; eventuali colonne extra
// ignorate). NON azzera nulla (il magazzino e' gia' stato azzerato oggi):
// aggiunge con guardia anti-doppio su IMEI. Mappa foglio→negozio esplicita;
// i fogli senza mappa vengono SALTATI e segnalati (caso "Ostiense").
// Lancio: node import_usati_multi.js "/percorso/file.xlsx"
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const FILE = process.argv[2] || "/Users/macbookl/My Drive/Downloads D/Disponibilità Usati Luglio 2026.xlsx";
const OPERATORE = "Import fase zero";
// foglio Excel → nome ESATTO del negozio a DB (sede fisica: i gemelli
// W3/Multi condividono il magazzino, si usa il Multi come canonico)
const MAPPA_NEGOZI = {
  "Magliana": "Magliana Multi",
  "Collatina": "Collatina Multi",
  "Acilia": "Acilia Multi",
  "Promontori": "Promontori",
  "Donna": "Donna",
  "Baleniere": "Baleniere",
  // "Ostiense": ???  ← DA CONFERMARE con Luca (San Paolo o Garbatella?)
};

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("pg");
const client = new Client({
  host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

const normGrado = (g) => {
  const x = String(g || "").trim().toUpperCase().replace(/\s+/g, "");
  if (["KM0", "KMO", "KM-0"].includes(x)) return "Km0";
  if (["A", "A+", "A++"].includes(x)) return "A";
  if (x === "B") return "B";
  if (x === "C") return "C";
  if (x === "D") return "D";
  return "A";
};

// trova la riga di intestazione (quella che inizia con "Modello")
const righeDati = (ws) => {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const iHead = rows.findIndex(r => String(r[0] || "").trim().toLowerCase() === "modello");
  if (iHead < 0) return [];
  return rows.slice(iHead + 1).filter(r => String(r[0] || "").trim());
};

(async () => {
  const wb = XLSX.readFile(FILE);
  await client.connect();
  const now = new Date().toISOString();
  let totIns = 0, totSkip = 0;
  const saltati = [];
  for (const foglio of wb.SheetNames) {
    const negozio = MAPPA_NEGOZI[foglio.trim()];
    const righe = righeDati(wb.Sheets[foglio]);
    if (!negozio) { saltati.push(`${foglio} (${righe.length} righe) — NEGOZIO NON MAPPATO`); continue; }
    let ins = 0, skip = 0;
    for (const r of righe) {
      const [modello, capacita, grado, colore, imeiRaw, prezzo] = r;
      const imei = String(imeiRaw || "").trim();
      const model = [String(modello).trim(), String(capacita || "").trim()].filter(Boolean).join(" ");
      const gradoCrm = normGrado(grado);
      const gradoOrig = String(grado || "").trim();
      const notaGrado = gradoCrm.toUpperCase() !== gradoOrig.toUpperCase().replace(/\s+/g, "") ? ` · grado dichiarato: "${gradoOrig}"` : "";
      const nota = `📦 Import FASE ZERO ${now.slice(0, 10)} (inventario reale ${negozio}): cliente e costo d'acquisto non disponibili` +
        (colore ? ` · Colore: ${String(colore).trim()}` : "") + notaGrado;
      if (imei) {
        const { rows: dup } = await client.query("select id from usati where imei = $1 limit 1", [imei]);
        if (dup.length) { skip++; continue; }
      }
      await client.query(`insert into usati
        (client_id, venditore, model, imei, status, sale_price, purchase_price, store, target_store,
         purchase_date, listed_date, sold_date, ricambi, note_tecnico, status_history, provenienza_subito,
         extra_margine, pagamento, grado_usura, acquisto_per_ricambi)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`, [
        null, OPERATORE, model, imei, "in_vendita", Number(prezzo) || 0, 0, negozio, null,
        now, now, null, JSON.stringify([]), nota,
        JSON.stringify({ acquistato: { date: now, operatore: OPERATORE }, in_vendita: { date: now, operatore: OPERATORE } }),
        false, null, JSON.stringify({ metodo: "contanti", iban: "", bonifico_effettuato: null, bonifico_operatore: null, bonifico_date: null, bonifico_tipo: null, bonifico_stato: null }),
        gradoCrm, false,
      ]);
      ins++;
    }
    totIns += ins; totSkip += skip;
    console.log(`${foglio} → "${negozio}": ${ins} inseriti${skip ? `, ${skip} saltati (IMEI già presente)` : ""}`);
  }
  if (saltati.length) console.log("⚠️ FOGLI SALTATI (mappa mancante):", saltati.join(" · "));
  const { rows: [tot] } = await client.query("select count(*)::int n from usati where status='in_vendita'");
  const { rows: perStore } = await client.query("select store, count(*)::int n from usati group by store order by store");
  console.log(`TOTALE: +${totIns} inseriti, ${totSkip} saltati · in vetrina ora: ${tot.n}`);
  perStore.forEach(r => console.log(`  ${r.store}: ${r.n}`));
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
