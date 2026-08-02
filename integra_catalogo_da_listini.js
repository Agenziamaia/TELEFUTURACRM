// INTEGRA IL CATALOGO UNIVERSALE COI MODELLI DEI LISTINI (Luca 02/08)
// Lancio: node integra_catalogo_da_listini.js
// I listini ufficiali degli operatori contengono i modelli NUOVI, che le
// fonti pubbliche (Apple/Google) a volte non hanno ancora. Qui li si porta
// dentro dispositivi_catalogo — il "catalogo open" che alimenta tutte le
// altre tendine del CRM — normalizzando marca e nome commerciale (via i
// tagli di memoria, il 5G/4G e i bundle dopo il "+"), senza duplicare cio'
// che c'e' gia' (confronto su chiave compatta senza spazi/punteggiatura).
// Le categorie ammesse a DB sono 4: gli accessori che non rientrano
// (router, telecamere, lampadine) restano fuori e vengono elencati.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const client = new Client({
  host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

const comp = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
// marche riconosciute a inizio nome (due parole prima di una sola)
const MARCHE = [
  "RAY-BAN META", "OAKLEY META", "TP-LINK", "GREEN PACKET", "GREENPACKET",
  "SAMSUNG", "APPLE", "XIAOMI", "REDMI", "HONOR", "HUAWEI", "MOTOROLA", "MOTO", "TCL",
  "ZTE", "NUBIA", "OPPO", "VIVO", "REALME", "NOKIA", "ONEPLUS", "GOOGLE", "META",
  "EZVIZ", "ZYXEL", "TELSEY", "NOTHING", "ALCATEL", "ASUS", "SONY", "LG", "CROSSCALL",
];
const NOME_MARCA = { MOTO: "Motorola", NUBIA: "ZTE", REDMI: "Xiaomi", "GREEN PACKET": "GreenPacket",
  "RAY-BAN META": "Ray-Ban Meta", "OAKLEY META": "Oakley Meta", "TP-LINK": "TP-Link" };
const bello = t => t.split(" ").map(w => w.length <= 3 && /^[A-Z0-9]+$/.test(w) ? w : w[0] + w.slice(1).toLowerCase()).join(" ");

/** Nome commerciale: via bundle, tagli, 5G/4G e diciture di colore/lente. */
function pulisci(modello) {
  // NB: niente tagli "dall'ultimo +", che spezzerebbero la RAM ("Honor 600
  // 8+256GB" → "Honor 600 8"). I bundle si riconoscono dal " + " spaziato.
  let s = String(modello).split(" + ")[0];
  s = s.replace(/,.*$/, "");                                   // "..., Lenti marroni"
  s = s.replace(/\b\d+\s*\+\s*\d+\s*(GB|TB|G)?\b/gi, " ");     // 8+256GB
  s = s.replace(/\b\d+\s*(GB|TB)\b/gi, " ");
  s = s.replace(/\b(5G|4G|EE|DUAL|SIM|NEW)\b/gi, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}
function categoriaDi(nome) {
  const n = nome.toUpperCase();
  // accessori audio/indossabili non-terminali: fuori dal catalogo telefoni
  if (/AIRPODS|BUDS|CUFFI|AURICOLAR|CARICA|COVER|CUSTODIA|POWERBANK|\bTAG\b/.test(n)) return null;
  if (/WATCH|\bBAND\b/.test(n)) return "watch";
  if (/IPAD|\bTAB\b|\bPAD\b|TABLET/.test(n)) return "tablet";
  if (/WEBPOCKET|FWA|ROUTER|INTERNET|ZYXEL|TP-LINK|GREEN\s?PACKET|TELSEY|LAMPADINA|EZVIZ|\bCAM\b|\bC6N\b|\bLB1\b/.test(n)) return null;
  return "smartphone";     // occhiali smart inclusi: si vendono come terminali
}

(async () => {
  await client.connect();
  const { rows: li } = await client.query("select distinct modello from listini_terminali");
  const { rows: cat } = await client.query("select brand, modello from dispositivi_catalogo where attivo");
  const idx = new Set();
  cat.forEach(r => { idx.add(comp(r.brand + r.modello)); idx.add(comp(r.modello)); });

  const nuovi = new Map(); const scartati = [];
  for (const r of li) {
    const pulito = pulisci(r.modello);
    if (!pulito || pulito.length < 3) continue;
    const su = pulito.toUpperCase();
    const marca = MARCHE.find(m => su.startsWith(m));
    if (!marca) { scartati.push(`${r.modello} → marca non riconosciuta`); continue; }
    const brand = NOME_MARCA[marca] || bello(marca);
    const nome = bello(pulito.slice(marca.length).trim()) || bello(pulito);
    const categoria = categoriaDi(pulito);
    if (!categoria) { scartati.push(`${r.modello} → accessorio, fuori dal catalogo telefoni`); continue; }
    // gia' presente? confronto compatto su "marca+modello" e su solo modello
    if (idx.has(comp(brand + nome)) || idx.has(comp(nome)) || idx.has(comp(pulito))) continue;
    const k = categoria + "|" + comp(brand + nome);
    if (!nuovi.has(k)) nuovi.set(k, { categoria, brand, modello: nome, fonte: "listino" });
  }

  console.log(`listini: ${li.length} nomi · gia' nel catalogo o duplicati: ${li.length - nuovi.size - scartati.length}`);
  console.log(`DA INSERIRE: ${nuovi.size} · esclusi (accessori/non riconosciuti): ${scartati.length}`);
  [...nuovi.values()].slice(0, 20).forEach(n => console.log(`   + [${n.categoria}] ${n.brand} — ${n.modello}`));
  if (nuovi.size > 20) console.log(`   …e altri ${nuovi.size - 20}`);
  if (scartati.length) { console.log("── esclusi ──"); scartati.forEach(s => console.log("   - " + s)); }

  await client.query("begin");
  try {
    for (const n of nuovi.values()) {
      await client.query(
        `insert into dispositivi_catalogo (categoria, brand, modello, fonte)
         values ($1,$2,$3,$4) on conflict (categoria, brand, modello) do nothing`,
        [n.categoria, n.brand, n.modello, n.fonte]);
    }
    await client.query("commit");
  } catch (e) { await client.query("rollback"); throw e; }
  const { rows: [t] } = await client.query("select count(*) n from dispositivi_catalogo");
  console.log(`catalogo ora: ${t.n} dispositivi`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
