// IMPORT ANAGRAFICA ARTICOLI Magazzino (task Luca 13/08) — dall'export
// giacenze del gestionale (foglio "Giacenze") si prendono SOLO i riferimenti
// degli articoli: Codice, Barcode, Descrizione, IVA, Gruppo, Sottogruppo,
// Marca, più costo ultimo e prezzo (attributi dell'articolo, uguali su tutti
// i blocchi negozio). Le DISPONIBILITÀ per negozio si ignorano di proposito.
// Idempotente: upsert per codice (rilanciabile con export più freschi).
// Lancio: node scripts/import_mag_articoli.js <file.xlsx>
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const ROOT = path.join(__dirname, "..");
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const file = process.argv[2];
if (!file) { console.error("Uso: node scripts/import_mag_articoli.js <file.xlsx>"); process.exit(1); }

const wb = XLSX.readFile(file);
const foglio = wb.SheetNames.includes("Giacenze") ? "Giacenze" : wb.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[foglio], { header: 1, defval: "" });

const num = (v) => { const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) && n !== 0 ? n : null; };
const txt = (v) => { const s = String(v ?? "").trim(); return s || null; };

// Colonne fisse dell'export: 0 Codice · 1 Barcode · 2 Descrizione · 3 Iva A.
// · 4 Iva V. · 6 Gruppo · 7 Sottogruppo · 8 Marca. Il primo blocco negozio
// parte alla colonna 9: Costo Ult. = 14, Prezzo = 15 (ripetuti identici per
// ogni negozio — si legge il primo valorizzato).
const articoli = [];
for (const r of rows.slice(1)) {
  const codice = txt(r[0]);
  const descrizione = txt(r[2]);
  if (!codice || !descrizione) continue;
  let costo = null, prezzo = null;
  for (let b = 9; b + 6 < r.length && (costo == null || prezzo == null); b += 7) {
    if (costo == null) costo = num(r[b + 5]);
    if (prezzo == null) prezzo = num(r[b + 6]);
  }
  articoli.push({
    codice,
    barcode: txt(r[1]),
    descrizione,
    iva_acquisto: txt(r[3]),
    iva_vendita: txt(r[4]),
    gruppo: txt(r[6]),
    sottogruppo: txt(r[7]),
    // marca normalizzata (nell'export convivono "Xiaomi" e "XIAOMI")
    marca: txt(r[8]) ? String(r[8]).trim().toUpperCase() : null,
    costo_ultimo: costo,
    prezzo,
    fonte: path.basename(file),
  });
}
console.log(`Foglio «${foglio}»: ${articoli.length} articoli da importare`);

(async () => {
  let fatti = 0;
  for (let i = 0; i < articoli.length; i += 500) {
    const batch = articoli.slice(i, i + 500);
    const res = await fetch(`${URL_}/rest/v1/mag_articoli?on_conflict=codice`, {
      method: "POST",
      headers: {
        apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) { console.error("Batch", i, "fallito:", res.status, (await res.text()).slice(0, 300)); process.exit(1); }
    fatti += batch.length;
    console.log(`  upsert ${fatti}/${articoli.length}`);
  }
  const conta = await fetch(`${URL_}/rest/v1/mag_articoli?select=id`, {
    method: "HEAD", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: "count=exact" },
  }).catch(() => null);
  console.log("Fatto. A DB:", conta ? conta.headers.get("content-range") : "?");
})();
