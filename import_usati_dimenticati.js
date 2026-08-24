// USATI — 11 modelli DIMENTICATI dall'import fase zero (Luca 24/08):
// sono già in vetrina in vendita a Magliana. Regole: grado D («serie D»),
// provenienza IMPORTATO (store_acquisto null → il gestionale mostra
// «📦 Importato»), status in_vendita, negozio canonico "Magliana Multi"
// (i gemelli W3/Multi condividono il magazzino). Guardia anti-doppio su IMEI.
// Lancio: node import_usati_dimenticati.js [--apply]   (senza flag: recap)
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
const NEGOZIO = "Magliana Multi";
const OPERATORE = "Import fase zero";
const GRADO = "D";

// marca · modello · taglio · prezzo vendita · IMEI (screenshot Luca 24/08)
const RIGHE = [
  ["Motorola", "MOTO G37", "128GB", 199, "352334371183010"],
  ["Motorola", "MOTO G37", "128GB", 199, "352334371172278"],
  ["Motorola", "MOTO G37", "128GB", 199, "352334371134674"],
  ["Samsung", "Z FLIP 7", "512GB", 1000, "352648381426626"],
  ["Zte", "BLADE A53", "32GB", 70, "866502069259081"],
  ["Motorola", "MOTO G35 5G", "128GB", 179, "354246517309218"],
  ["Motorola", "MOTO G35 5G", "128GB", 179, "354246517238847"],
  ["Motorola", "MOTO G35 5G", "128GB", 179, "354246517312485"],
  ["Motorola", "MOTO G35 5G", "128GB", 179, "354246517161395"],
  ["Google", "GOOGLE PIXEL 8", "128GB", 399, "359977831710021"],
  ["Oppo", "RENO 15 5G", "512GB", 400, "869149080369213"],
];

(async () => {
  await client.connect();
  const now = new Date().toISOString();
  console.log(`Da inserire: ${RIGHE.length} dispositivi → "${NEGOZIO}" · grado ${GRADO} · in_vendita · provenienza 📦 Importato\n`);
  let ins = 0, skip = 0;
  for (const [marca, modello, taglio, prezzo, imei] of RIGHE) {
    // niente doppia marca nel nome (caso "Google GOOGLE PIXEL 8")
    const base = new RegExp("^" + marca + "\\s", "i").test(modello) ? modello : `${marca} ${modello}`;
    const model = `${base} ${taglio}`;
    const { rows: dup } = await client.query("select id, store from usati where imei = $1 limit 1", [imei]);
    if (dup.length) { skip++; console.log(`  ⏭ ${model} · IMEI ${imei} GIÀ presente (${dup[0].store})`); continue; }
    console.log(`  ${APPLY ? "＋" : "·"} ${model} · ${prezzo} € · IMEI ${imei}`);
    if (!APPLY) continue;
    const nota = `📦 Import 24/08 — modello dimenticato dall'import iniziale, già in vetrina a Magliana: cliente e costo d'acquisto non disponibili`;
    await client.query(`insert into usati
      (client_id, venditore, model, imei, status, sale_price, purchase_price, store, target_store,
       purchase_date, listed_date, sold_date, ricambi, note_tecnico, status_history, provenienza_subito,
       extra_margine, pagamento, grado_usura, acquisto_per_ricambi)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`, [
      null, OPERATORE, model, imei, "in_vendita", prezzo, 0, NEGOZIO, null,
      now, now, null, JSON.stringify([]), nota,
      JSON.stringify({ acquistato: { date: now, operatore: OPERATORE }, in_vendita: { date: now, operatore: OPERATORE } }),
      false, null, JSON.stringify({ metodo: "contanti", iban: "", bonifico_effettuato: null, bonifico_operatore: null, bonifico_date: null, bonifico_tipo: null, bonifico_stato: null }),
      GRADO, false,
    ]);
    ins++;
  }
  if (APPLY) {
    const { rows: [tot] } = await client.query("select count(*)::int n from usati where store = $1 and status = 'in_vendita'", [NEGOZIO]);
    console.log(`\nInseriti: ${ins} · saltati: ${skip} · in vetrina ora a ${NEGOZIO}: ${tot.n}`);
  } else {
    console.log(`\n(recap — rilancia con --apply per inserire)`);
  }
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
