// SEED del tabellare FASTWEB T2 — LATO AZIENDA, AGOSTO 2026 (fonte: lettera
// ufficiale "TELEFUTURA 2 - PIANO D'INCENTIVAZIONE (2026 08).pdf" in
// Telco/Operatori/Fastweb/Agosto 2026 — arrivata da Luca l'11/08).
// Il lato RAGAZZI per Fastweb NON esiste a DB: il motore lo DERIVA scalando
// con pay_piste.perc_ragazzi (direttiva Luca: mobile −40% → 60, fisso −30% →
// 70; % regolabili dal pannello Tabellari Gare). Energia/gas/TNP restano
// gettoni non scalati (pista null): valgono uguali sui due lati.
// REGOLE LETTERA recepite nel motore: MNP/OLO di provenienza VODAFONE = né
// target né compenso (esclusione in caricaContrattiContesto).
// IN NOTA (non modellate): gate mobile ≥2 pda fisse; opzioni Booster/Club/
// Protect/Power Control/IP pubblico; gettone agg.vo RES da soglie P.IVA;
// gettone NOMNP M3; extra business +50 con wireline / +25 MNP; Web Business
// (offerta non a catalogo); ricarica pura pagata dopo il check traffico M+2.
// Idempotente: cancella e ricrea TUTTO fastweb/2026-08-01 (entrambi i lati).
// Lancio: node scripts/seed_pay_fw_azienda_agosto.js
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
const LATO = "azienda";

// perc_ragazzi: quota che va ai ragazzi (Luca 11/08: mobile 60, fisso 70)
const PISTE = [
  { chiave: "fisso", nome: "Wireline Residenziale", ordine: 1, perc: 70 },
  { chiave: "business_fisso", nome: "Wireline Business", ordine: 2, perc: 70 },
  { chiave: "mobile", nome: "Mobile", ordine: 3, perc: 60 },
];
const SOGLIE = {
  fisso: [[2, 4], [5, 8], [9, 12], [13, 19], [20, 27], [28, 39], [40, null]],
  business_fisso: [[1, 1], [2, 2], [3, 4], [5, 6], [7, 8], [9, null]],
  mobile: [[2, 14], [15, 29], [30, 45], [46, 65], [66, 97], [98, 137], [138, 180], [181, null]],
};

// [pista, nome, tc, categoria, prodotto, offerta, punti, base, tiers, note]
const R = [
  // ── WIRELINE RESIDENZIALE (importi comprensivi di base; sotto la 1ª soglia = base)
  ["fisso", "Casa Start", "Consumer", "Fisso", "Fisso", "Casa Start", 1, 45, [45, 80, 110, 121, 125, 135, 145], "Booster/Club/Protect/Power Control +30 in nota lettera"],
  ["fisso", "Casa Pro", "Consumer", "Fisso", "Fisso", "Casa Pro", 1, 50, [50, 115, 145, 156, 160, 170, 180], null],
  ["fisso", "Casa Ultra", "Consumer", "Fisso", "Fisso", "Casa Ultra", 1, 50, [50, 175, 205, 216, 220, 230, 240], null],
  ["fisso", "Casa FWA (gettone Start)", "Consumer", "Fisso", "FWA", null, 1, 45, [45, 80, 110, 121, 125, 135, 145], "offerta FWA = gettone START; CASA FWA START = START + Booster (+30)"],
  // ── WIRELINE BUSINESS (target dedicato)
  ["business_fisso", "Business Light", "Business", "Fisso", "Fisso", "Fastweb Business Light", 1, 65, [65, 175, 205, 225, 245, 275], null],
  ["business_fisso", "Business", "Business", "Fisso", "Fisso", "Fastweb Business", 1, 90, [90, 200, 230, 250, 270, 300], null],
  ["business_fisso", "Business Plus", "Business", "Fisso", "Fisso", "Fastweb Business Plus", 1, 90, [90, 260, 290, 310, 330, 360], null],
  ["business_fisso", "Business Pro (Plus +15)", "Business", "Fisso", "Fisso", "Fastweb Business Pro", 1, 105, [105, 275, 305, 325, 345, 375], "lettera: BUSINESS PRO = BUSINESS PLUS +15€"],
  ["business_fisso", "Business Unlimited 2 linee", "Business", "Fisso", "Fisso", "Fastweb Business Unlimited SME", 1, 240, [240, 440, 440, 440, 440, 440], "+50€ dalla 3ª linea aggiuntiva (max 8); Web Business 200/400 non a catalogo"],
  // ── MOBILE RICARICA AUTOMATICA (soglia in SIM; gate ≥2 pda fisse NON modellato)
  //    MNP e GA pagano gli stessi importi di griglia ("di cui MNP 8€" già dentro)
  ...["Start", "Pro", "Power", "Ultra"].flatMap(off => {
    const T = {
      Start: [23, 29, 63, 82, 84, 86, 89, 92],
      Pro: [23, 45, 79, 98, 100, 102, 105, 108],
      Power: [23, 60, 95, 114, 117, 119, 123, 126],
      Ultra: [23, 75, 111, 130, 133, 136, 140, 143],
    }[off];
    return [
      ["mobile", `${off} · Ric.Auto MNP`, "Consumer", "Mobile Ric. Auto", "Mobile MNP", off, 1, 15, T, "MNP da Vodafone: né target né compenso (già esclusa dal motore)"],
      ["mobile", `${off} · Ric.Auto GA`, "Consumer", "Mobile Ric. Auto", "Mobile GA", off, 1, 15, T, "gettone 8€ ric.auto no-MNP alla 1ª soglia: già in griglia"],
    ];
  }),
  // ── MOBILE RICARICA PURA (Wallet) — quota gara erogata dopo il check traffico a M+2
  ...[
    ["Start", [6, 16, 52, 69, 70, 71, 73, 74], [1, 16, 22, 24, 25, 26, 26, 27]],
    ["Pro", [6, 16, 53, 88, 89, 90, 92, 94], [1, 16, 38, 40, 41, 42, 42, 43]],
    ["Power", [6, 16, 72, 90, 92, 93, 95, 97], [1, 16, 42, 44, 45, 46, 47, 48]],
    ["Ultra", [6, 16, 75, 92, 94, 96, 98, 99], [1, 16, 45, 47, 49, 50, 51, 52]],
  ].flatMap(([off, mnp, ga]) => [
    ["mobile", `${off} · Ric.Pura MNP`, "Consumer", "Mobile Wallet", "Mobile MNP", off, 1, 1, mnp, "ricarica pura: quota oltre la base erogata dopo il check traffico a M+2"],
    ["mobile", `${off} · Ric.Pura GA`, "Consumer", "Mobile Wallet", "Mobile GA", off, 1, 1, ga, "ricarica pura: quota oltre la base erogata dopo il check traffico a M+2"],
  ]),
  // ── MOBILE BUSINESS (paga sulla soglia residenziale raggiunta)
  ["mobile", "Mobile Business", "Business", null, null, "Fastweb Mobile Business", 1, 15, [23, 35, 72, 91, 95, 97, 99, 102], "+50€ se con wireline contestuale; +25€ se MNP no-Vodafone"],
  ["mobile", "Mobile Business Freedom", "Business", null, null, "Fastweb Mobile Freedom", 1, 15, [30, 55, 89, 108, 110, 112, 114, 117], "+50€ se con wireline contestuale; +25€ se MNP no-Vodafone"],
  ["mobile", "Mobile Business Unlimited", "Business", null, null, "Fastweb Mobile Business Unlimited", 1, 15, [23, 76, 113, 132, 135, 138, 142, 145], "+50€ se con wireline contestuale; +25€ se MNP no-Vodafone"],
];
// ── GETTONI uguali sui due lati (pista null → mai scalati): energia + TNP
const G = [
  ["Gas", "Consumer", "Energia", "Gas", "Gas", 90, null],
  ["Energy Flex", "Consumer", "Energia", "Luce", "Energy Flex", 70, null],
  ["Energy Fix", "Consumer", "Energia", "Luce", "Energy Fix", 70, "pay uguale alla Flex (Luca 11/08)"],
  ["Energy Core", "Consumer", "Energia", "Luce", "Energy Core", 150, null],
  ["TNP (Finanziamento)", "Consumer", null, "Finanziato", null, 0, "a 0€ sul tabellare ragazzi: non pagato, non è una scopertura"],
];

(async () => {
  await client.connect();
  await client.query("begin");
  try {
    // via TUTTO il fastweb del mese (anche il vecchio ragazzi di luglio: ora si deriva)
    for (const t of ["pay_righe", "pay_soglie", "pay_piste"])
      await client.query(`delete from ${t} where brand=$1 and month=$2`, [BRAND, MONTH]);
    for (const p of PISTE)
      await client.query(
        `insert into pay_piste (brand, month, chiave, nome, um, ordine, lato, perc_ragazzi) values ($1,$2,$3,$4,'pezzi',$5,$6,$7)`,
        [BRAND, MONTH, p.chiave, p.nome, p.ordine, LATO, p.perc]);
    for (const [pista, scala] of Object.entries(SOGLIE))
      for (let i = 0; i < scala.length; i++)
        await client.query(
          `insert into pay_soglie (brand, month, pista, tier, soglia_da, soglia_a, lato) values ($1,$2,$3,$4,$5,$6,$7)`,
          [BRAND, MONTH, pista, i + 1, scala[i][0], scala[i][1], LATO]);
    let ord = 0;
    for (const [pista, nome, tc, cat, prod, off, punti, base, tiers, note] of R)
      await client.query(
        `insert into pay_righe (brand, month, pista, nome, tipo_cliente, categoria, prodotto, offerta,
                                punti, pay_base, pay_tiers, gettone, note, ordine, brand_vendita, lato)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,$12,$13,'fastweb',$14)`,
        [BRAND, MONTH, pista, nome, tc, cat, prod, off, punti, base, tiers, note, ord++, LATO]);
    for (const [nome, tc, cat, prod, off, importo, note] of G)
      await client.query(
        `insert into pay_righe (brand, month, pista, nome, tipo_cliente, categoria, prodotto, offerta,
                                punti, pay_base, pay_tiers, gettone, note, ordine, brand_vendita, lato)
         values ($1,$2,null,$3,$4,$5,$6,$7,0,$8,'{}',true,$9,$10,'fastweb',$11)`,
        [BRAND, MONTH, nome, tc, cat, prod, off, importo, note, ord++, LATO]);
    await client.query("commit");
  } catch (e) { await client.query("rollback"); console.error("FAIL:", e.message); process.exit(1); }
  const n = async (t) => (await client.query(`select count(*) n from ${t} where brand=$1 and month=$2`, [BRAND, MONTH])).rows[0].n;
  console.log(`OK — piste ${await n("pay_piste")} (attese 3) · soglie ${await n("pay_soglie")} (attese 21) · righe ${await n("pay_righe")} (attese ${R.length + G.length}) — tutto lato azienda, ragazzi derivato 70/70/60`);
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
  else console.log("✅ tutte le righe agganciano il catalogo");
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
