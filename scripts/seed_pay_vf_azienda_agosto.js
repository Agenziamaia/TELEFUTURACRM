// SEED del tabellare VODAFONE STORE — LATO AZIENDA, AGOSTO 2026 (fonte:
// "LetteraFranchisingIncentivazione_27649_01082026.doc" in Telco/Operatori/
// Store/Agosto 2026 — la LETTERA A: piano CONGIUNTO Fastweb+Vodafone dei
// Vodafone Store; stesse tabelle per entrambi i brand, quindi molte righe
// hanno brand_vendita='fastweb').
// Il lato RAGAZZI di vodafone resta il suo (deck agosto, GIÀ ufficiale):
// NIENTE derivazione a % qui — perc_ragazzi non serve finché esiste il
// tabellare ragazzi dedicato.
// REGOLE LETTERA nel motore: MNP da Vodafone/Fastweb/Ho. = né soglie né
// compenso (esclusione in caricaContrattiContesto); MNP da operatori fuori
// lista (TIM/W3/Kena/Very/Iliad/Poste Full/Coop/Digi) pagate come No-MNP —
// NON automatizzato, in nota. IN NOTA anche: franchigia 5%, KPI convergenza
// 10%, boost convergenza +20€, cap smartphone 35%, cap Dolce Vita 30/POS,
// bonus completezza (tab 4.1-4.4), storni M+6, fasce VAS A-D da assegnare.
// Idempotente: cancella e ricrea SOLO vodafone/2026-08-01 lato AZIENDA.
// Lancio: node scripts/seed_pay_vf_azienda_agosto.js
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

const BRAND = "vodafone";
const MONTH = "2026-08-01";
const LATO = "azienda";

// ordine ALLINEATO al lato ragazzi (segnalazione Luca 11/08: stessi ordini sui due lati)
const PISTE = [
  { chiave: "mobile", nome: "Mobile Consumer", ordine: 1 },
  { chiave: "fisso", nome: "Wireline Consumer", ordine: 2 },
  { chiave: "business_mobile", nome: "Mobile Business", ordine: 3 },
  { chiave: "business_fisso", nome: "Wireline Business", ordine: 4 },
  { chiave: "vas", nome: "VAS Business", ordine: 5 },
  { chiave: "luce", nome: "Energia Luce", ordine: 6 },
  { chiave: "gas", nome: "Energia Gas", ordine: 7 },
];
const SOGLIE = {
  fisso: [[91, 117], [118, 153], [154, 194], [195, 234], [235, 268], [269, null]],
  mobile: [[177, 231], [232, 306], [307, 369], [370, 436], [437, 533], [534, null]],
  luce: [[20, 25], [26, 31], [32, 37], [38, 44], [45, 53], [54, null]],
  gas: [[1, null]],
  business_fisso: [[16, 21], [22, 31], [32, 45], [46, 62], [63, 80], [81, null]],
  business_mobile: [[44, 67], [68, 103], [104, 137], [138, 174], [175, 293], [294, null]],
  vas: [[19, 23], [24, 34], [35, null]],
};

// [pista, nome, tc, categoria, prodotto, offerta, brand_vendita, punti, base, tiers, note]
const R = [];
const riga = (...a) => R.push(a);

// ── TAB 1.1 WIRELINE CONSUMER (vale VF e FW: i nomi Casa coincidono nei due cataloghi)
for (const bv of ["vodafone", "fastweb"]) {
  riga("fisso", `Casa Start (${bv})`, "Consumer", "Fisso", "Fisso", "Casa Start", bv, 1, 50, [65, 75, 90, 115, 140, 175], null);
  riga("fisso", `Casa Pro (${bv})`, "Consumer", "Fisso", "Fisso", "Casa Pro", bv, 2, 50, [85, 100, 120, 150, 180, 215], null);
  riga("fisso", `Casa Ultra (${bv})`, "Consumer", "Fisso", "Fisso", "Casa Ultra", bv, 3, 50, [100, 120, 145, 180, 215, 255], null);
  riga("fisso", `Casa FWA Light (${bv})`, "Consumer", "Fisso", "FWA", "Casa FWA Light", bv, 1, 25, [55, 65, 80, 105, 130, 165], null);
}
riga("fisso", "Casa FWA Start", "Consumer", "Fisso", "FWA", "Casa FWA Start", "vodafone", 1, 25, [65, 75, 90, 115, 140, 175], null);
riga("fisso", "Casa FWA Pro", "Consumer", "Fisso", "FWA", "Casa FWA Pro", "vodafone", 2, 25, [85, 100, 120, 150, 180, 215], "pagamento con Bollettino Postale: soglia sì, gettone gara no (nota lettera)");

// ── TAB 1.2 MOBILE CONSUMER — Smart Pay = Ric. Auto · Wallet Pay = Ric. Pura;
//    vale VF e FW (nomi offerta VF; per FW le offerte sono Start/Pro/Power/Ultra secche)
const MOB = [
  // gruppo, offerte VF ric.auto, offerte VF wallet, offerta FW, {saMnp,saNo,wpMnp,wpNo}, {pSa,pWp}
  ["Mobile Start", ["Start", "Start Under 18", "Call Power"], ["Start Wallet", "Start Under 18", "Call Power Wallet"], "Start",
    [[45, 48, 51, 55, 60, 65], [25, 28, 31, 35, 40, 45], [27, 29, 32, 36, 40, 45], [7, 9, 12, 16, 20, 25]], [1, 0.5]],
  ["Mobile Pro", ["Pro", "Call Max"], ["Pro Wallet", "Call Max Wallet"], "Pro",
    [[55, 59, 64, 70, 77, 85], [35, 39, 44, 50, 57, 65], [32, 34, 37, 41, 45, 50], [12, 14, 17, 21, 25, 30]], [2, 1]],
  ["Mobile Power", ["Mobile Power"], ["Power Wallet"], "Power",
    [[70, 76, 83, 91, 100, 110], [50, 56, 63, 71, 80, 90], [38, 41, 44, 48, 52, 58], [18, 21, 24, 28, 32, 38]], [2.5, 1.25]],
  ["Mobile Ultra", ["Ultra"], ["Ultra Wallet"], "Ultra",
    [[90, 98, 108, 120, 132, 145], [70, 78, 88, 100, 112, 125], [50, 53, 56, 60, 65, 70], [30, 33, 36, 40, 45, 50]], [3, 1.5]],
];
const NOTA_MNP = "MNP valida solo da TIM/W3/Kena/Very/Iliad/Poste Full/Coop/Digi; da ALTRI operatori paga come No MNP; da VF/FW/Ho. esclusa (motore); boost convergenza +20€ in nota";
for (const [g, ra, wa, fwOff, [saMnp, saNo, wpMnp, wpNo], [pSa, pWp]] of MOB) {
  for (const off of ra) {
    riga("mobile", `${g} · Ric.Auto MNP`, "Consumer", null, "Mobile MNP", off, "vodafone", pSa, 15, saMnp, NOTA_MNP);
    riga("mobile", `${g} · Ric.Auto GA`, "Consumer", null, "Mobile GA", off, "vodafone", pSa, 15, saNo, null);
  }
  for (const off of wa) {
    riga("mobile", `${g} · Wallet MNP`, "Consumer", null, "Mobile MNP", off, "vodafone", pWp, 1, wpMnp, null);
    riga("mobile", `${g} · Wallet GA`, "Consumer", null, "Mobile GA", off, "vodafone", pWp, 1, wpNo, null);
  }
  // Fastweb: stessa griglia, categoria del catalogo FW distingue Ric.Auto/Wallet
  riga("mobile", `${g} FW · Ric.Auto MNP`, "Consumer", "Mobile Ric. Auto", "Mobile MNP", fwOff, "fastweb", pSa, 15, saMnp, NOTA_MNP);
  riga("mobile", `${g} FW · Ric.Auto GA`, "Consumer", "Mobile Ric. Auto", "Mobile GA", fwOff, "fastweb", pSa, 15, saNo, null);
  riga("mobile", `${g} FW · Wallet MNP`, "Consumer", "Mobile Wallet", "Mobile MNP", fwOff, "fastweb", pWp, 1, wpMnp, null);
  riga("mobile", `${g} FW · Wallet GA`, "Consumer", "Mobile Wallet", "Mobile GA", fwOff, "fastweb", pWp, 1, wpNo, null);
}
// Dolce Vita: punti in soglia (cap 30/POS), NESSUN pay (lettera)
for (const [off, p] of [["Dolce Vita Start 14.95", 0.2], ["Dolce Vita Pro 19.95", 0.4], ["Dolce Vita Ultra 24.95", 0.5], ["Dolce Vita Plus 24.95", 0.5]])
  riga("mobile", `Dolce Vita (${p} pt, no pay)`, "Consumer", null, null, off, "vodafone", p, 0, [0, 0, 0, 0, 0, 0], "conta in soglia fino a cap 30 per POS, non riceve compenso (lettera 1.2); Plus assimilata a Ultra");

// ── TAB 1.3 ENERGIA (brand di vendita FASTWEB: le offerte Energy sono a catalogo FW)
riga("luce", "Luce Fix", "Consumer", "Energia", "Luce", "Energy Fix", "fastweb", 1, 70, [70, 80, 90, 100, 110, 120], "+50€ extra a M+6 se attivo (lettera 1.3.1)");
riga("luce", "Luce Flex", "Consumer", "Energia", "Luce", "Energy Flex", "fastweb", 1, 70, [80, 90, 100, 110, 120, 130], "+50€ extra a M+6");
riga("luce", "Luce Core", "Consumer", "Energia", "Luce", "Energy Core", "fastweb", 1, 70, [95, 110, 125, 140, 155, 175], "+50€ extra a M+6");
riga("luce", "Luce Fix Business", "Business", "Energia", "Luce", "Energy Fix", "fastweb", 1, 80, [115, 125, 135, 145, 155, 165], "+50€ extra a M+6");
riga("luce", "Luce Flex Business", "Business", "Energia", "Luce", "Energy Flex", "fastweb", 1, 80, [115, 125, 135, 145, 155, 165], "+50€ extra a M+6");
riga("gas", "Gas Flex RES", "Consumer", "Energia", "Gas", "Gas", "fastweb", 1, 60, [90], "+50€ extra a M+6; Placet/Vulnerabili escluse");
riga("gas", "Gas Flex BUS", "Business", "Energia", "Gas", null, "fastweb", 1, 70, [120], "+60€ extra a M+6");

// ── TAB 5.1 WIRELINE BUSINESS (pesi 1/2/3/4)
const BF = [
  ["Onpi TW Plus", "vodafone", 1, [100, 115, 135, 165, 200, 235]],
  ["Fastweb Business", "fastweb", 1, [100, 115, 135, 165, 200, 235]],
  ["Fissa Smart", "vodafone", 1, [110, 125, 150, 180, 215, 240]],
  ["One Business Smart", "vodafone", 1, [115, 130, 155, 185, 220, 245]],
  ["Fissa Wireless 5G", "vodafone", 2, [145, 170, 215, 245, 290, 315]],
  ["Fissa Comfort", "vodafone", 2, [145, 170, 215, 245, 290, 315]],
  ["Fissa Extra", "vodafone", 2, [145, 170, 215, 245, 290, 315]],
  ["Fastweb Business Plus", "fastweb", 2, [145, 170, 215, 245, 290, 315]],
  ["Fastweb Business Pro", "fastweb", 2, [145, 170, 215, 245, 290, 315]],
  ["One Business Comfort", "vodafone", 2, [155, 180, 225, 255, 300, 325]],
  ["Onpi Premium", "vodafone", 2, [165, 190, 235, 265, 310, 335]],
  ["Fastweb Business Unlimited SME", "fastweb", 3, [270, 275, 280, 285, 290, 310]],
];
for (const [off, bv, p, tiers] of BF)
  riga("business_fisso", off, "Business", "Fisso", null, off, bv, p, bv === "fastweb" && p === 3 ? 200 : 65, tiers, "OneNet Ufficio/Azienda e FW Web Business non a catalogo (270-660€, peso 3-4)");

// ── TAB 5.2 MOBILE BUSINESS (MNP dalla lista operatori; da VF/FW/Ho esclusa)
const BM = [
  ["Mobile Smart", "vodafone", [2, 1], [[67, 71, 81, 88, 98, 108], [47, 51, 61, 68, 78, 88]]],
  ["Fastweb Mobile Business", "fastweb", [2, 1], [[67, 71, 81, 88, 98, 108], [47, 51, 61, 68, 78, 88]]],
  ["Fastweb Mobile Freedom", "fastweb", [2, 1], [[67, 71, 81, 88, 98, 108], [47, 51, 61, 68, 78, 88]]],
  ["One Business Smart Mobile", "vodafone", [3, 2], [[72, 76, 86, 93, 103, 113], [52, 56, 66, 73, 83, 93]]],
  ["Mobile Comfort", "vodafone", [3, 2], [[83, 91, 105, 115, 125, 145], [63, 71, 85, 95, 105, 125]]],
  ["Fastweb Mobile Business Unlimited", "fastweb", [3, 2], [[83, 91, 105, 115, 125, 145], [63, 71, 85, 95, 105, 125]]],
  ["One Business Comfort Mobile", "vodafone", [4, 3], [[88, 96, 110, 120, 130, 150], [68, 76, 90, 100, 110, 130]]],
  ["Mobile Extra", "vodafone", [4, 3], [[108, 120, 132, 150, 166, 186], [88, 100, 112, 130, 146, 166]]],
];
for (const [off, bv, [pM, pN], [tM, tN]] of BM) {
  riga("business_mobile", `${off} · MNP`, "Business", null, "Mobile MNP", off, bv, pM, 25, tM, "MNP valida solo dalla lista operatori (lettera 5.2)");
  riga("business_mobile", `${off} · No MNP`, "Business", null, "Mobile GA", off, bv, pN, 25, tN, null);
}
riga("business_mobile", "Dati Smart", "Business", null, null, "Dati Smart", "vodafone", 1, 15, [20, 25, 30, 35, 40, 45], null);
riga("business_mobile", "Dati Comfort", "Business", null, null, "Dati Comfort", "vodafone", 1, 15, [25, 30, 35, 40, 45, 50], null);

// ── TAB 5.3 VAS BUSINESS — fasce A-D dei pacchetti Soluzioni Digitali: il
//    mapping alle offerte a catalogo (Backup Facile, Worry Free, Secure
//    Drive, AI Essential/Standard) è sul portale rivenditori → righe NON
//    ancorate (offerta jolly), da assegnare dal pannello quando Luca decide.
// Fasce dallo schema di Luca (11/08, foto WhatsApp): a lettera ci sono ~100
// piani, a catalogo teniamo SOLO i 5 caricati. C = p1 b10 30/40/50 · D =
// p0,5 b5 15/20/25. Restano in nota lettera: fasce A/B senza offerte a
// catalogo, Easy Rent PLAT-BRONZE, M2M, Sol.Tel., Samsung extra 50-100€.
for (const [off, fascia, punti, base, tiers] of [
  ["Backup Facile", "C", 1, 10, [30, 40, 50]],
  ["Secure Drive", "C", 1, 10, [30, 40, 50]],
  ["AI Essential", "C", 1, 10, [30, 40, 50]],
  ["AI Standard", "C", 1, 10, [30, 40, 50]],
  ["Worry Free", "D", 0.5, 5, [15, 20, 25]],
])
  riga("vas", `Sol. Digitale ${off} · Fascia ${fascia}`, "Business", "Multi-Servizi", "Soluzioni Digitali", off, "vodafone", punti, base, tiers, `fascia ${fascia} dallo schema di Luca 11/08`);

(async () => {
  await client.connect();
  await client.query("begin");
  try {
    for (const t of ["pay_righe", "pay_soglie", "pay_piste"])
      await client.query(`delete from ${t} where brand=$1 and month=$2 and lato=$3`, [BRAND, MONTH, LATO]);
    for (const p of PISTE)
      await client.query(
        `insert into pay_piste (brand, month, chiave, nome, um, ordine, lato) values ($1,$2,$3,$4,'punti',$5,$6)`,
        [BRAND, MONTH, p.chiave, p.nome, p.ordine, LATO]);
    for (const [pista, scala] of Object.entries(SOGLIE))
      for (let i = 0; i < scala.length; i++)
        await client.query(
          `insert into pay_soglie (brand, month, pista, tier, soglia_da, soglia_a, lato) values ($1,$2,$3,$4,$5,$6,$7)`,
          [BRAND, MONTH, pista, i + 1, scala[i][0], scala[i][1], LATO]);
    let ord = 0;
    for (const [pista, nome, tc, cat, prod, off, bv, punti, base, tiers, note] of R)
      await client.query(
        `insert into pay_righe (brand, month, pista, nome, tipo_cliente, categoria, prodotto, offerta,
                                punti, pay_base, pay_tiers, gettone, note, ordine, brand_vendita, lato)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,$12,$13,$14,$15)`,
        [BRAND, MONTH, pista, nome, tc, cat, prod, off, punti, base, tiers, note, ord++, bv, LATO]);
    await client.query("commit");
  } catch (e) { await client.query("rollback"); console.error("FAIL:", e.message); process.exit(1); }
  const n = async (t) => (await client.query(`select count(*) n from ${t} where brand=$1 and month=$2 and lato=$3`, [BRAND, MONTH, LATO])).rows[0].n;
  console.log(`OK — lato azienda: piste ${await n("pay_piste")} (attese 7) · soglie ${await n("pay_soglie")} (attese 34) · righe ${await n("pay_righe")} (attese ${R.length})`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
