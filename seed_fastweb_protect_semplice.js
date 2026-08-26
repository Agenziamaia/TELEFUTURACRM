// PROTECT — da 19 combo a 6 righe (Luca 26/08: «bastava dire che la Protect
// vale 30 € sul mobile e 40 sul business, non 19 voci»).
// Ora il motore sa SOMMARE gli extra da opzione (componente 'extra_opzione'
// in commissioning.ts): la riga non sostituisce più la griglia, ci si somma.
//   · Protect · Mobile Wallet consumer      +30 (base 5)
//   · Protect · Mobile Ric. Auto consumer   +30 (base 5)
//   · Protect · Fisso residenziale          +30 (base 5)   [prodotto Fisso: FWA fuori]
//   · Protect · Mobile business             +40 (base 10)
//   · Protect · Fisso business              +40 (base 10)
//   · Protect · Ultra = 0 (eccezione della lettera, vince per specificità —
//     serve allo STORICO: l'opzione viene tolta dalle Ultra a catalogo, ma
//     una vendita di agosto ce l'ha già dentro)
// Le 19 combo «offerta + Protect» vengono CANCELLATE (dump prima).
// A catalogo: opzione Protect spenta sulle 4 offerte Ultra (Wallet/Ric.Auto
// × GA/MNP) — «così non ci possono essere errori» (Luca).
// Idempotente (check a query). Lancio: NODE_PATH=<dir pg> node seed_fastweb_protect_semplice.js
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

const B = "fastweb", M = "2026-08-01", L = "azienda";
const OPZ_ULTRA = [   // catalog_opzioni Protect sulle 4 offerte Ultra
  "2cb507c2-e61d-4291-a4ce-a8e792ab2e8e", "79456c70-8659-4287-a7e3-744964543d06",
  "9444fa79-e9bf-4e07-b4d3-d8da4be1049f", "89aa9ccf-996a-405d-8033-72241563882e",
];
const N30 = "Lettera: Protect +30 € (25 gara + 5 base — sotto la 1ª soglia paga la sola base). Si SOMMA al pay dell'offerta: una riga per tutte le offerte del contesto.";
const N40 = "Lettera: Protect shp +40 € (30 gara + 10 base). Si somma al pay dell'offerta.";
const T8 = (v) => Array.from({ length: 8 }, () => v);

// [nome, pista, tipo, categoria, prodotto, offerta, base, tiers, nota, ordine]
const EXTRA = [
  ["🛡 Protect · Mobile Wallet (consumer)", "mobile", "Consumer", "Mobile Wallet", null, null, 5, T8(30), N30, 70],
  ["🛡 Protect · Mobile Ric. Auto (consumer)", "mobile", "Consumer", "Mobile Ric. Auto", null, null, 5, T8(30), N30, 71],
  ["🛡 Protect · Fisso residenziale", "fisso", "Consumer", "Fisso", "Fisso", null, 5, T8(30), N30 + " Solo prodotto Fisso: la FWA non è tra le pagate dalla lettera.", 72],
  ["🛡 Protect · Mobile business", "mobile", "Business", "Mobile Ric. Auto", null, null, 10, T8(40), N40, 73],
  ["🛡 Protect · Fisso business", "business_fisso", "Business", "Fisso", "Fisso", null, 10, T8(40), N40, 74],
  ["🛡 Protect · Ultra = 0 (esclusa dalla lettera)", "mobile", "Consumer", null, null, "Ultra", 0, T8(0), "Eccezione: la lettera paga Protect solo su Start/Pro/Power. Vince sulla riga generale per specificità (offerta). L'opzione è stata tolta dalle Ultra a catalogo il 26/08: questa riga serve allo storico (una vendita di agosto ce l'ha).", 75],
];

(async () => {
  await client.connect();
  const { rows: pre } = await client.query(
    "select * from pay_righe where brand=$1 and month=$2 and lato=$3 and opzione='Protect'", [B, M, L]);
  let dumpFile = path.join(__dirname, "dump_fastweb_protect_combo.json");
  if (fs.existsSync(dumpFile)) dumpFile = dumpFile.replace(/\.json$/, `_${Date.now()}.json`);
  fs.writeFileSync(dumpFile, JSON.stringify(pre, null, 1));
  console.log(`Dump delle righe Protect attuali (${pre.length}):`, path.basename(dumpFile));

  try {
    await client.query("begin");
    // via le 19 combo (sono quelle con opzione Protect e SENZA componente)
    const del = await client.query(
      "delete from pay_righe where brand=$1 and month=$2 and lato=$3 and opzione='Protect' and componente is null", [B, M, L]);
    const { rows: gia } = await client.query(
      "select nome from pay_righe where brand=$1 and month=$2 and lato=$3 and componente='extra_opzione'", [B, M, L]);
    const giaNomi = new Set(gia.map(r => r.nome));
    let ins = 0;
    for (const [nome, pista, tipo, cat, prod, off, base, tiers, nota, ord] of EXTRA) {
      if (giaNomi.has(nome)) continue;
      await client.query(
        `insert into pay_righe (brand, month, lato, pista, nome, tipo_cliente, categoria, prodotto, offerta, opzione,
           componente, brand_vendita, punti, pay_base, pay_tiers, gettone, attivo, ordine, note)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Protect','extra_opzione','fastweb',0,$10,$11,false,true,$12,$13)`,
        [B, M, L, pista, nome, tipo, cat, prod, off, base, tiers, ord, nota]);
      ins++;
    }
    const opzOff = await client.query(
      "update catalog_opzioni set attivo=false where id = any($1) and attivo=true", [OPZ_ULTRA]);
    await client.query("commit");
    console.log(`combo cancellate: ${del.rowCount} · extra inserite: ${ins}/6 · Protect spenta sulle Ultra: ${opzOff.rowCount}/4`);
  } catch (e) {
    await client.query("rollback");
    console.error("ROLLBACK:", e.message);
    process.exitCode = 1; await client.end(); return;
  }

  const { rows: post } = await client.query(
    "select nome, pista, tipo_cliente, categoria, prodotto, offerta, pay_base, pay_tiers[1] t1 from pay_righe where brand=$1 and month=$2 and lato=$3 and componente='extra_opzione' order by ordine", [B, M, L]);
  for (const r of post) console.log(` ${r.nome} [${r.pista}] ${r.tipo_cliente || "-"}/${r.categoria || "-"}/${r.prodotto || "-"}/${r.offerta || "-"} → base ${r.pay_base} · +${r.t1}`);
  await client.end();
})();
