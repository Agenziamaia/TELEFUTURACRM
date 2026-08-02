// IMPORT LISTINI TERMINALI da riga di comando (Luca 02/08)
// Lancio: node import_listini.mjs <brand> <file> [margine_default]
// Usa la STESSA logica del pannello in Documentazione → brand → "Importa
// listino": parser a blocchi per i PDF operatore (Vodafone), tabellare per
// gli Excel/CSV (WindTre, colonna "SP Cash" + "Sconto"). Serve per il primo
// caricamento e per i test; l'uso normale resta il pannello.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import pg from "pg";

const KEYWORDS = {
  modello: ["prodotto", "modello terminale", "modello", "terminale", "descrizione", "device", "smartphone"],
  prezzo: ["sp cash", "prezzo listino", "prezzo di listino", "prezzo al pubblico", "listino", "prezzo", "cash", "costo"],
  rata: ["importo rata", "rata mensile", "rata", "canone"],
  mesi: ["n rate", "num rate", "numero rate", "mesi", "durata", "rate"],
  anticipo: ["anticipo", "contributo iniziale", "upfront"],
  margine: ["sconto", "margine", "provvigione"],
};
const parseEuro = (v) => {
  if (v == null) return null;
  if (typeof v === "number") return isFinite(v) ? Math.round(v * 100) / 100 : null;
  let s = String(v).replace(/[€\s]/g, "").trim();
  if (!s) return null;
  if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const indovina = (headers, chiavi) => {
  const low = headers.map(h => String(h || "").toLowerCase().trim());
  for (const k of chiavi) { const i = low.findIndex(h => h === k); if (i >= 0) return i; }
  for (const k of chiavi) { const i = low.findIndex(h => h.includes(k)); if (i >= 0) return i; }
  return -1;
};

async function righePdf(file) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const items = tc.items.filter(i => i.str && i.str.trim() && i.transform)
      .map(i => ({ x: i.transform[4], y: i.transform[5], s: i.str.trim() }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows = [];
    for (const it of items) { const r = rows.find(rr => Math.abs(rr[0].y - it.y) < 3.5); if (r) r.push(it); else rows.push([it]); }
    rows.forEach(r => r.sort((a, b) => a.x - b.x));
    rows.forEach(r => out.push(r));
  }
  return out;
}

function parseBlocchi(righe) {
  const num = (t) => {
    const m = String(t).replace(/[\s€]/g, "").match(/^(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/);
    return m ? parseFloat(m[1].replace(/\./g, "") + "." + (m[2] || "0")) : null;
  };
  const aperture = [];
  righe.forEach((r, i) => { if (r.some(c => /^PREZZO AL PUBBLICO$/i.test(c.s))) aperture.push(i); });
  if (aperture.length < 3) return [];
  const voci = [];
  for (let b = 0; b < aperture.length; b++) {
    const start = aperture[b], end = b + 1 < aperture.length ? aperture[b + 1] : righe.length;
    let stopModello = end, prezzo = null, rigaPrezzo = -1;
    for (let i = start; i < end; i++) if (/RISPARMIO SUL PREZZO/i.test(righe[i].map(c => c.s).join(" "))) { stopModello = i; break; }
    for (let i = start; i < Math.min(end, stopModello + 1) && prezzo === null; i++) {
      for (const c of righe[i]) if (c.x >= 125 && c.x <= 215 && c.s.includes("€")) { const v = num(c.s); if (v) { prezzo = v; rigaPrezzo = i; break; } }
    }
    const frammenti = [];
    const fine = Math.min(end, Math.max(stopModello, rigaPrezzo >= 0 ? rigaPrezzo : start + 3));
    for (let i = start; i < fine; i++) righe[i].filter(c => c.x < 110).forEach(c => frammenti.push(c.s));
    const modello = frammenti.join(" ").replace(/\s+/g, " ").trim();
    if (!modello || modello.length < 3) continue;
    const piani = new Map();
    for (let i = start; i < end; i++) {
      const rata = righe[i].find(x => x.x >= 340 && x.x <= 360);
      const tot = righe[i].find(x => x.x >= 370 && x.x <= 395);
      const ant = righe[i].find(x => x.x >= 308 && x.x <= 335);
      const vr = rata ? num(rata.s) : null, vt = tot ? num(tot.s) : null, va = ant ? num(ant.s) : null;
      if (!vr || !vt || vr <= 0) continue;
      const mesi = Math.round(vt / vr);
      if (mesi < 2 || mesi > 60) continue;
      piani.set(`${mesi}|${vr}|${va || 0}`, { mesi, rata: vr, ...(va ? { anticipo: va } : {}) });
    }
    voci.push({ modello, prezzo, rate: [...piani.values()], margine: null });
  }
  return voci.filter(v => v.prezzo != null);
}

function parseTabella(rows) {
  let hIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const hs = (rows[i] || []).map(c => String(c ?? "").toLowerCase());
    const p = Object.values(KEYWORDS).filter(ks => hs.some(h => ks.some(k => h.includes(k)))).length;
    if (p >= 2) { hIdx = i; break; }
  }
  const headers = (rows[hIdx] || []).map(c => String(c ?? ""));
  const col = Object.fromEntries(Object.entries(KEYWORDS).map(([k, ks]) => [k, indovina(headers, ks)]));
  console.log(`  intestazione riga ${hIdx} → modello="${headers[col.modello]}" prezzo="${headers[col.prezzo]}" margine="${headers[col.margine] || "—"}"`);
  const per = new Map();
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const modello = String(r[col.modello] ?? "").trim();
    if (!modello || modello.length < 2) continue;
    const prezzo = col.prezzo >= 0 ? parseEuro(r[col.prezzo]) : null;
    const rata = col.rata >= 0 ? parseEuro(r[col.rata]) : null;
    const mesi = col.mesi >= 0 ? Math.round(parseEuro(r[col.mesi]) || 0) : 0;
    const anticipo = col.anticipo >= 0 ? parseEuro(r[col.anticipo]) : null;
    let margine = col.margine >= 0 ? parseEuro(r[col.margine]) : null;
    if (margine != null && margine > 0 && margine <= 1) margine = Math.round(margine * 10000) / 100;
    const k = modello.toLowerCase();
    const v = per.get(k) || { modello, prezzo: null, rate: [], margine: null };
    if (prezzo != null && v.prezzo == null) v.prezzo = prezzo;
    if (margine != null && v.margine == null) v.margine = margine;
    if (rata != null && mesi > 0) v.rate.push({ mesi, rata, ...(anticipo ? { anticipo } : {}) });
    per.set(k, v);
  }
  return [...per.values()];
}

const [, , brand, file, margDefault] = process.argv;
if (!brand || !file) { console.error("uso: node import_listini.mjs <brand> <file> [margine]"); process.exit(1); }

const env = Object.fromEntries(fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const client = new pg.Client({
  host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

let voci;
if (file.toLowerCase().endsWith(".pdf")) {
  const rp = await righePdf(file);
  voci = parseBlocchi(rp);
  console.log(`  formato: PDF a blocchi → ${voci.length} modelli`);
} else {
  const wb = XLSX.readFile(file);
  voci = parseTabella(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null }));
  console.log(`  formato: tabellare → ${voci.length} modelli`);
}
const mrg = parseFloat(String(margDefault || "4").replace(",", ".")) || 4;
const senzaPrezzo = voci.filter(v => v.prezzo == null).length;

await client.connect();
await client.query("begin");
try {
  for (const v of voci) {
    await client.query(
      `insert into listini_terminali (brand, modello, prezzo, rate, margine_pct, fonte, aggiornato_da, aggiornato_il)
       values ($1,$2,$3,$4,$5,$6,$7,now())
       on conflict (brand, modello) do update set prezzo=excluded.prezzo, rate=excluded.rate,
         margine_pct=excluded.margine_pct, fonte=excluded.fonte, aggiornato_da=excluded.aggiornato_da, aggiornato_il=now()`,
      [brand, v.modello, v.prezzo, JSON.stringify(v.rate || []), v.margine != null && v.margine > 0 ? v.margine : mrg, path.basename(file), "Import iniziale"]);
  }
  await client.query("commit");
} catch (e) { await client.query("rollback"); throw e; }
const { rows: [t] } = await client.query("select count(*) n, count(*) filter (where prezzo is null) senza from listini_terminali where brand=$1", [brand]);
console.log(`  IMPORTATI in "${brand}": ${t.n} modelli a DB (senza prezzo: ${t.senza}; scartati in lettura: ${senzaPrezzo})`);
await client.end();
