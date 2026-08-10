// SEED del tabellare FASTWEB T2 (multibrand) — valori RAGAZZI di LUGLIO
// (screenshot Luca 10/08 sera; agosto si ritocca dal pannello Amministrazione
// → Tabellari Gare). Sostituisce il vecchio seed_pay_fw_energia_agosto.js
// (la pista Soluzioni Digitali VF ora vive nel seed_pay_vf_agosto.js).
// UNICA scala soglie: "Fastweb Mobile" in PEZZI — S1 da 1 · S2 da 45 ·
// S3 da 125 · S4 da 320; le righe FISSO (Casa Start/Pro) seguono la soglia
// mobile SENZA portare pezzi; Energia e TNP sono gettoni flat.
// Mobile: "Tied" mappato su Mobile Ric. Auto e il liscio su Mobile Wallet
// (DA CONFERMARE: Tied = autoricarica o = convergenza col fisso FW?); il
// motore legge la categoria vera da dettagli.categoria_catalogo.
// NON seedati (scoperture, domanda in Verifiche): Casa Ultra, Casa FWA Light,
// mobile Power, Energy Fix consumer, tutto il BUSINESS (fisso/mobile/energia).
// TNP = 0€ ESPLICITO sul tabellare (pagato zero, non scopertura).
// Idempotente: cancella e ricrea SOLO fastweb/2026-08-01.
// Lancio: node scripts/seed_pay_fw_t2_agosto.js
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("pg");
const client = new Client({
  host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

const BRAND = "fastweb";
const MONTH = "2026-08-01";

const PISTE = [
  { chiave: "mobile", nome: "Fastweb Mobile", ordine: 1 },
];
const SOGLIE = {
  mobile: [[1, 44], [45, 124], [125, 319], [320, null]],
};

// [pista, nome, tc, categoria, prodotto, offerta, punti, tiers, note]
const R = [
  // ── FISSO: segue la soglia Fastweb Mobile, non porta pezzi
  ["mobile", "Casa Start", "Consumer", "Fisso", "Fisso", "Casa Start", 0, [45, 80, 110, 121], "segue la soglia Fastweb Mobile, non porta pezzi"],
  ["mobile", "Casa Pro", "Consumer", "Fisso", "Fisso", "Casa Pro", 0, [50, 145, 175, 170], "segue la soglia mobile; S4 170 < S3 175 COME DA TABELLARE — confermare"],
];
// ── MOBILE (1 pezzo in soglia): liscio = Wallet · Tied = Ric. Auto
const MOBI = [
  // gruppo, [W GA, W MNP, RA GA (Tied), RA MNP (Tied)]
  ["Start", [[8, 13, 14, 15], [16, 23, 25, 26], [15, 25, 29, 31], [23, 34, 38, 40]]],
  ["Pro", [[8, 18, 18, 18], [16, 33, 35, 36], [15, 25, 29, 31], [23, 44, 48, 50]]],
  ["Ultra", [[8, 20, 20, 20], [45, 47, 49, 70], [15, 70, 74, 76], [23, 78, 82, 104]]],
];
for (const [off, [wga, wmnp, raga, ramnp]] of MOBI) {
  R.push(["mobile", `${off} · Wallet GA`, "Consumer", "Mobile Wallet", "Mobile GA", off, 1, wga, null]);
  R.push(["mobile", `${off} · Wallet MNP`, "Consumer", "Mobile Wallet", "Mobile MNP", off, 1, wmnp, null]);
  R.push(["mobile", `${off} Tied · Ric.Auto GA`, "Consumer", "Mobile Ric. Auto", "Mobile GA", off, 1, raga, "Tied = Ric. Auto (da confermare)"]);
  R.push(["mobile", `${off} Tied · Ric.Auto MNP`, "Consumer", "Mobile Ric. Auto", "Mobile MNP", off, 1, ramnp, "Tied = Ric. Auto (da confermare)"]);
}
// ── GETTONI flat: [nome, tc, categoria, prodotto, offerta, importo, note]
const G = [
  ["Gas", "Consumer", "Energia", "Gas", "Gas", 90, null],
  ["Energy Flex", "Consumer", "Energia", "Luce", "Energy Flex", 70, null],
  ["Energy Core", "Consumer", "Energia", "Luce", "Energy Core", 150, null],
  ["TNP (Finanziamento)", "Consumer", null, "Finanziato", null, 0, "a 0€ sul tabellare: non pagato, non è una scopertura"],
];

(async () => {
  await client.connect();
  await client.query("begin");
  try {
    for (const t of ["pay_righe", "pay_soglie", "pay_piste"])
      await client.query(`delete from ${t} where brand=$1 and month=$2`, [BRAND, MONTH]);
    for (const p of PISTE)
      await client.query(
        `insert into pay_piste (brand, month, chiave, nome, um, ordine) values ($1,$2,$3,$4,'pezzi',$5)`,
        [BRAND, MONTH, p.chiave, p.nome, p.ordine]);
    for (const [pista, scala] of Object.entries(SOGLIE))
      for (let i = 0; i < scala.length; i++)
        await client.query(
          `insert into pay_soglie (brand, month, pista, tier, soglia_da, soglia_a) values ($1,$2,$3,$4,$5,$6)`,
          [BRAND, MONTH, pista, i + 1, scala[i][0], scala[i][1]]);
    let ord = 0;
    for (const [pista, nome, tc, cat, prod, off, punti, tiers, note] of R)
      await client.query(
        `insert into pay_righe (brand, month, pista, nome, tipo_cliente, categoria, prodotto, offerta,
                                punti, pay_base, pay_tiers, gettone, note, ordine, brand_vendita)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,null,$10,false,$11,$12,'fastweb')`,
        [BRAND, MONTH, pista, nome, tc, cat, prod, off, punti, tiers, note, ord++]);
    for (const [nome, tc, cat, prod, off, importo, note] of G)
      await client.query(
        `insert into pay_righe (brand, month, pista, nome, tipo_cliente, categoria, prodotto, offerta,
                                punti, pay_base, pay_tiers, gettone, note, ordine, brand_vendita)
         values ($1,$2,null,$3,$4,$5,$6,$7,0,$8,'{}',true,$9,$10,'fastweb')`,
        [BRAND, MONTH, nome, tc, cat, prod, off, importo, note, ord++]);
    await client.query("commit");
  } catch (e) { await client.query("rollback"); console.error("FAIL:", e.message); process.exit(1); }
  const n = async (t) => (await client.query(`select count(*) n from ${t} where brand=$1 and month=$2`, [BRAND, MONTH])).rows[0].n;
  console.log(`OK — piste ${await n("pay_piste")} (attesa 1) · soglie ${await n("pay_soglie")} (attese 4) · righe ${await n("pay_righe")} (attese ${R.length + G.length})`);
  const orfane = (await client.query(`
    select r.nome, r.offerta from pay_righe r where r.brand=$1 and r.month=$2 and r.offerta is not null
    and not exists (
      select 1 from catalog_offerte o
      join catalog_prodotti p on p.id = o.prodotto_id
      join catalog_categorie c on c.id = p.categoria_id
      where p.brand_id = r.brand
        and lower(o.nome) = lower(r.offerta)
        and (r.categoria is null or lower(c.nome) = lower(r.categoria))
        and (r.prodotto is null or lower(p.nome) = lower(r.prodotto))
        and (r.tipo_cliente is null or lower(p.tipo_cliente) = lower(r.tipo_cliente))
    )`, [BRAND, MONTH])).rows;
  if (orfane.length) { console.log("⚠️ RIGHE SENZA OFFERTA A CATALOGO:"); orfane.forEach(r => console.log("  -", r.nome, "→", r.offerta)); }
  else console.log("✅ tutte le righe agganciano un'offerta esistente a catalogo");
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
