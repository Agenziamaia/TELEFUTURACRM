// SEED del tabellare Vodafone AGOSTO 2026 (fonte: deck Riunione_Agosto_2026
// "la nuova tabella" — pagamento a tabella dal canvass di Agosto; più i
// GETTONI delle Tabelle 2.1/3.1 mandate da Luca in chat il 10/08 sera:
// CB, opzioni e telefoni a rate, stessi importi ragazzi e azienda).
// Piste seedate: mobile, fisso, business_mobile, business_fisso.
// NON seedate (in attesa di Luca): soluzioni_digitali (mapping fasce A-D),
// luce&gas (offerte Fastweb Energia), colonne senza offerta a catalogo
// (Zero Red Bus. XS, OneNet Ufficio, OneNet Azienda, Extra Qualità/Servizi)
// e le voci delle Tabelle 2.1/3.1 senza aggancio (vedi commento sezione G).
// Idempotente: cancella e ricrea SOLO vodafone/2026-08-01.
// Lancio: node scripts/seed_pay_vf_agosto.js
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

const PISTE = [
  { chiave: "mobile", nome: "Mobile", ordine: 1 },
  { chiave: "fisso", nome: "Fisso", ordine: 2 },
  { chiave: "business_mobile", nome: "Business Mobile", ordine: 3 },
  { chiave: "business_fisso", nome: "Business Fisso", ordine: 4 },
  // Soluzioni Digitali: pista+soglie qui (prima nel seed energia FW, che il
  // rilancio di QUESTO seed cancellava); righe in attesa del mapping fasce A-D.
  { chiave: "soluzioni_digitali", nome: "Soluzioni Digitali", ordine: 5 },
  // ENERGIA T1 (task Luca 11/08): il tabellare del deck — l'energia Fastweb
  // venduta coi codici VS paga QUI (contestoVfFw la alloca alla lettera A).
  { chiave: "luce", nome: "Energia Luce", ordine: 6 },
  { chiave: "gas", nome: "Energia Gas", ordine: 7 },
];

const SOGLIE = {
  mobile: [[239, 312], [313, 413], [414, 499], [500, 589], [590, 720], [721, null]],
  fisso: [[155, 200], [201, 261], [262, 331], [332, 399], [400, 456], [457, null]],
  business_mobile: [[53, 81], [82, 124], [125, 165], [166, 209], [210, 352], [353, null]],
  business_fisso: [[19, 25], [26, 37], [38, 54], [55, 75], [76, 96], [97, null]],
  soluzioni_digitali: [[19, 23], [24, 34], [35, null]],
  luce: [[24, 30], [31, 37], [38, 45], [46, 53], [54, 64], [65, null]],
  gas: [[1, null]],
};

// righe: [pista, nome, tipo_cliente, categoria, prodotto, offerte[], punti, base, tiers]
const R = [];
// ---------- MOBILE CONSUMER — SP = Mobile Ric. Auto · WP = Mobile Wallet;
// ---------- MNP = prodotto "Mobile MNP" · No MNP = prodotto "Mobile GA"
const MOB = [
  // gruppo, offerte Ric.Auto, offerte Wallet, {spMnp, spNo, wpMnp, wpNo} = [punti, tiers]
  {
    g: "Mobile Start", ra: ["Start", "Start Under 18", "Call Power"], wa: ["Start Wallet", "Start Under 18", "Call Power Wallet"],
    spMnp: [1, [45, 48, 51, 55, 60, 65]], spNo: [0.5, [25, 28, 31, 35, 40, 45]],
    wpMnp: [1, [27, 29, 32, 36, 40, 45]], wpNo: [0.5, [7, 9, 12, 16, 20, 25]],
  },
  {
    g: "Mobile Pro", ra: ["Pro", "Call Max"], wa: ["Pro Wallet", "Call Max Wallet"],
    spMnp: [2, [55, 59, 64, 70, 77, 85]], spNo: [1, [35, 39, 44, 50, 57, 65]],
    wpMnp: [2, [32, 34, 37, 41, 45, 50]], wpNo: [1, [12, 14, 17, 21, 25, 30]],
  },
  {
    g: "Mobile Power", ra: ["Mobile Power"], wa: ["Power Wallet"],
    spMnp: [2.5, [70, 76, 83, 91, 100, 110]], spNo: [1.25, [50, 56, 63, 71, 80, 90]],
    wpMnp: [2.5, [38, 41, 44, 48, 52, 58]], wpNo: [1.25, [18, 21, 24, 28, 32, 38]],
  },
  {
    g: "Mobile Ultra", ra: ["Ultra"], wa: ["Ultra Wallet"],
    spMnp: [3, [90, 98, 108, 120, 132, 145]], spNo: [1.5, [70, 78, 88, 100, 112, 125]],
    wpMnp: [3, [50, 53, 56, 60, 65, 70]], wpNo: [1.5, [30, 33, 36, 40, 45, 50]],
  },
];
// NB CATEGORIA A NULL: i contracts scrivono categoria macro "Mobile" mentre il
// catalogo usa "Mobile Ric. Auto"/"Mobile Wallet" — il match vive su tipo
// cliente + prodotto (Mobile GA/MNP) + NOME offerta (che distingue già le
// varianti Wallet: "Start" vs "Start Wallet"). Ambigue solo Start Under 18 /
// Young (stesso nome nei due mondi): vince la riga Ric.Auto (ordine più basso).
for (const m of MOB) {
  const varianti = [
    ["Mobile MNP", m.ra, m.spMnp, 15, "Ric.Auto MNP"],
    ["Mobile GA", m.ra, m.spNo, 15, "Ric.Auto GA"],
    ["Mobile MNP", m.wa, m.wpMnp, 1, "Wallet MNP"],
    ["Mobile GA", m.wa, m.wpNo, 1, "Wallet GA"],
  ];
  for (const [prod, offs, [punti, tiers], base, lbl] of varianti)
    for (const off of offs)
      R.push(["mobile", `${m.g} · ${lbl}`, "Consumer", null, prod, off, punti, base, tiers]);
}
// ---------- FISSO CONSUMER — BroadBand (prodotto "Fisso", 3 varianti per taglia) + FWA
const FIX = [
  // 10/08: VF ha semplificato il commissioning — le varianti Conv/Lock In/
  // Mass Market NON esistono più (migrazione migra_vf_casa.js: storico e
  // catalogo riportati ai 3 nomi semplici). Un rilancio del seed deve
  // produrre SOLO questi.
  { g: "Casa Start", offs: ["Casa Start"], punti: 1, base: 50, tiers: [65, 75, 90, 115, 140, 175], prod: "Fisso" },
  { g: "Casa Pro", offs: ["Casa Pro"], punti: 2, base: 50, tiers: [85, 100, 120, 150, 180, 215], prod: "Fisso" },
  { g: "Casa Ultra", offs: ["Casa Ultra"], punti: 3, base: 50, tiers: [100, 120, 145, 180, 215, 255], prod: "Fisso" },
  { g: "Casa FWA Light", offs: ["Casa FWA Light"], punti: 1, base: 25, tiers: [55, 65, 80, 105, 130, 165], prod: "FWA" },
  { g: "Casa FWA Start", offs: ["Casa FWA Start"], punti: 1, base: 25, tiers: [65, 75, 90, 115, 140, 175], prod: "FWA" },
  { g: "Casa FWA Pro", offs: ["Casa FWA Pro"], punti: 2, base: 25, tiers: [85, 100, 120, 150, 180, 215], prod: "FWA" },
];
for (const f of FIX)
  for (const off of f.offs)
    R.push(["fisso", f.g, "Consumer", "Fisso", f.prod, off, f.punti, f.base, f.tiers]);
// ---------- BUSINESS MOBILE — categoria "Mobile Ric. Auto" Business,
// prodotti "Mobile MNP"/"Mobile GA" (No MNP). Dati senza distinzione MNP.
const BM = [
  { g: "Zero Mob. Smart", off: "Mobile Smart", mnp: [2, [67, 71, 81, 88, 98, 108]], no: [1, [47, 51, 61, 68, 78, 88]] },
  { g: "OneBusiness Smart", off: "One Business Smart Mobile", mnp: [3, [72, 76, 86, 93, 103, 113]], no: [2, [52, 56, 66, 73, 83, 93]] },
  { g: "Zero Mob. Comfort", off: "Mobile Comfort", mnp: [3, [83, 91, 105, 115, 125, 145]], no: [2, [63, 71, 85, 95, 105, 125]] },
  { g: "OneBus. Comfort", off: "One Business Comfort Mobile", mnp: [4, [88, 96, 110, 120, 130, 150]], no: [3, [68, 76, 90, 100, 110, 130]] },
  { g: "Mobile Extra", off: "Mobile Extra", mnp: [4, [108, 120, 132, 150, 166, 186]], no: [3, [88, 100, 112, 130, 146, 166]] },
];
for (const b of BM) {
  R.push(["business_mobile", `${b.g} · MNP`, "Business", null, "Mobile MNP", b.off, b.mnp[0], 25, b.mnp[1]]);
  R.push(["business_mobile", `${b.g} · No MNP`, "Business", null, "Mobile GA", b.off, b.no[0], 25, b.no[1]]);
}
R.push(["business_mobile", "Dati Smart", "Business", null, null, "Dati Smart", 1, 15, [20, 25, 30, 35, 40, 45]]);
R.push(["business_mobile", "Dati Comfort", "Business", null, null, "Dati Comfort", 1, 15, [25, 30, 35, 40, 45, 50]]);
// ---------- BUSINESS FISSO — categoria "Fisso" Business, prodotti "Fisso"/"FWA"
const BF = [
  { g: "OneNet P.IVA TW Plus", off: "Onpi TW Plus", prod: "Fisso", punti: 1, tiers: [100, 115, 135, 165, 200, 235] },
  { g: "Fissa Smart", off: "Fissa Smart", prod: "Fisso", punti: 1, tiers: [110, 125, 150, 180, 215, 240] },
  { g: "OneBusiness Smart", off: "One Business Smart", prod: "Fisso", punti: 1, tiers: [115, 130, 155, 185, 220, 245] },
  { g: "Fissa Wireless 5G", off: "Fissa Wireless 5G", prod: "FWA", punti: 2, tiers: [145, 170, 215, 245, 290, 315] },
  { g: "Fissa Comfort", off: "Fissa Comfort", prod: "Fisso", punti: 2, tiers: [145, 170, 215, 245, 290, 315] },
  { g: "Fissa Extra", off: "Fissa Extra", prod: "Fisso", punti: 2, tiers: [145, 170, 215, 245, 290, 315] },
  { g: "OneBusiness Comfort", off: "One Business Comfort", prod: "Fisso", punti: 2, tiers: [155, 180, 225, 255, 300, 325] },
  { g: "OneNet P.IVA Premium", off: "Onpi Premium", prod: "Fisso", punti: 2, tiers: [165, 190, 235, 265, 310, 335] },
];
for (const b of BF)
  R.push(["business_fisso", b.g, "Business", "Fisso", b.prod, b.off, b.punti, 65, b.tiers]);
// ---------- DOLCE VITA (lettera A, tab 1.2): contano in soglia mobile
// (0,2 / 0,4 / 0,5 con cap 30 per POS — cap non modellato) e NON pagano.
for (const [off, pDV] of [["Dolce Vita Start 14.95", 0.2], ["Dolce Vita Pro 19.95", 0.4], ["Dolce Vita Ultra 24.95", 0.5], ["Dolce Vita Plus 24.95", 0.5]])
  R.push(["mobile", "Dolce Vita (" + pDV + " pt, no pay)", "Consumer", null, null, off, pDV, 0, [0, 0, 0, 0, 0, 0]]);
// ---------- SOLUZIONI DIGITALI (fasce dallo schema di Luca 11/08; deck =
// valori lettera): a catalogo solo 5 offerte — C = p1 b10 30/40/50 · D = p0,5 b5 15/20/25.
for (const [offSD, fasciaSD, pSD, bSD, tSD] of [
  ["Backup Facile", "C", 1, 10, [30, 40, 50]],
  ["Secure Drive", "C", 1, 10, [30, 40, 50]],
  ["AI Essential", "C", 1, 10, [30, 40, 50]],
  ["AI Standard", "C", 1, 10, [30, 40, 50]],
  ["Worry Free", "D", 0.5, 5, [15, 20, 25]],
])
  R.push(["soluzioni_digitali", "Sol. Digitale " + offSD + " · Fascia " + fasciaSD, "Business", "Multi-Servizi", "Soluzioni Digitali", offSD, pSD, bSD, tSD]);
// ---------- ENERGIA T1 (deck; brand di vendita FASTWEB → insert dedicato)
const ENERGIA_T1 = [
  ["luce", "Luce Fix", "Consumer", "Energia", "Luce", "Energy Fix", 1, 70, [70, 80, 90, 100, 110, 120]],
  ["luce", "Luce Flex", "Consumer", "Energia", "Luce", "Energy Flex", 1, 70, [80, 90, 100, 110, 120, 130]],
  ["luce", "Luce Core", "Consumer", "Energia", "Luce", "Energy Core", 1, 70, [95, 110, 125, 140, 155, 175]],
  ["luce", "Luce Fix Business", "Business", "Energia", "Luce", "Energy Fix", 1, 80, [115, 125, 135, 145, 155, 165]],
  ["luce", "Luce Flex Business", "Business", "Energia", "Luce", "Energy Flex", 1, 80, [115, 125, 135, 145, 155, 165]],
  ["gas", "Gas Flex RES", "Consumer", "Energia", "Gas", "Gas", 1, 60, [90]],
  ["gas", "Gas Flex BUS", "Business", "Energia", "Gas", null, 1, 70, [120]],
];

// ---------- GETTONI dalle Tabelle 2.1 + 3.1 (screenshot Luca 10/08 sera):
// CB, opzioni e telefoni a rate — importi FLAT (gettone=true, fuori pista),
// valgono sia ragazzi sia lato azienda. SOLO le voci ancorabili al catalogo;
// le altre (One Number, Vodafone Club +, Trade In / Trade in Digitale, Smart
// Home, Giga Speed Pack Start/Ultra, 5G Priority Access anche Family, Giga
// Family/Family Plan CB, Assistenza tecnica, Power Control, Add on generico,
// Accessori in TNP, Wireline proximity lista VDL, Migrazioni no-FTTH, e il
// lato Fastweb Protect/Up Plus/Change order/Seven Booster) sono in domanda
// su Verifiche.
// [nome, tipo_cliente, categoria, prodotto, offerta, importo, note]
const G = [
  // ── Tabella 2.1 — RINNOVO A M+1
  ["Rete Sicura (GA)", "Consumer", "Customer Base", "Rete Sicura", null, 5, "T2.1 · rinnovo a M+1 (Mobile 2.0 GA)"],
  ["Rete Sicura CB", "Consumer", "Customer Base", "Cambio Offerta", "Rete Sicura CB", 5, "T2.1 · rinnovo a M+1"],
  ["Rete Sicura Family/150GB", "Consumer", "Customer Base", "Cambio Offerta", "Rete Sicura Family/150GB", 5, "T2.1 · rinnovo a M+1"],
  ["Vodafone Club", "Consumer", "Customer Base", "Cambio Offerta", "Vodafone Club", 5, "T2.1 · rinnovo a M+1; abbinata a TNP in attivazione = stesso importo"],
  ["MM4M Start", "Consumer", "Customer Base", "Cambio Offerta", "MM4M Start", 5, "T2.1 · rinnovo a M+1 (Mobile Start Special)"],
  ["MM4M Pro", "Consumer", "Customer Base", "Cambio Offerta", "MM4M Pro", 10, "T2.1 · rinnovo a M+1 (Pro/Power Special)"],
  ["MM4M Ultra", "Consumer", "Customer Base", "Cambio Offerta", "MM4M Ultra", 10, "T2.1 · rinnovo a M+1 (Ultra Special / Ultra Plus)"],
  // ── Tabella 2.1 — ATTIVAZIONE
  ["Kasko Facile", null, "Multi-Servizi", "Kasko Facile", null, 5, "T2.1 · Kasko GA e CB (Consumer e Business, ogni taglio)"],
  ["Extender / Seven Booster", "Consumer", "Customer Base", "Cambio Offerta", "Extender", 20, "T2.1 · Super Wi-Fi Extender 6 / Seven Booster Wi-Fi 7"],
  // ── Tabella 3.1 — MOBILE (dati): Wallet Pay = Mobile Wallet, Smart Pay = Ric. Auto
  ["Ric Dati (Wallet Pay)", "Consumer", null, null, "Ric Dati", 10, "T3.1 · Dati Consumer in Wallet Pay"],
  ["Abbonamento Dati (Smart Pay)", "Consumer", null, null, "Abbonamento Dati", 25, "T3.1 · Dati Consumer in Smart Pay"],
  // ── Tabella 3.1 — FISSA (equivalenza Add on Flat DA CONFERMARE)
  ["Add on Flat (Chiamate Nazionali)", "Consumer", "Customer Base", "Cambio Offerta", "Chiamate Nazionali", 5, "T3.1 · opzione Flat — equivalenza da confermare"],
  ["Add on Flat Internazionali", "Consumer", "Customer Base", "Cambio Offerta", "Chiamate Internazionali", 5, "T3.1 · opzione Flat Internazionali — equivalenza da confermare"],
  // ── Tabella 3.1 — CB & DEVICE: telefoni a rate per fascia (bassa=XS-M, alta=L-XL)
  ["Rateale fascia bassa (TNP XS-M)", "Consumer", null, "Tel. Rate", "TNP XS-M", 8, "T3.1 · Smartphone GA rateale fascia bassa"],
  ["Rateale fascia bassa · CB", "Consumer", null, "Tel. Rate CB", "TNP XS-M", 8, "T3.1 · Smartphone CB rateale fascia bassa"],
  ["Rateale fascia alta (TNP L-XL)", "Consumer", null, "Tel. Rate", "TNP L-XL", 20, "T3.1 · Smartphone GA rateale fascia alta"],
  ["Rateale fascia alta · CB", "Consumer", null, "Tel. Rate CB", "TNP L-XL", 20, "T3.1 · Smartphone CB rateale fascia alta"],
  ["Finanziamento S-M (Compass)", "Consumer", null, "Finanziato", "Compass Flexypay S-M", 20, "T3.1 · finanziamento fascia S e M"],
  ["Finanziamento S-M (Smartphone Easy)", "Consumer", null, "Finanziato", "Smartphone Easy S-M", 20, "T3.1 · finanziamento fascia S e M"],
  ["Finanziamento S-M · CB (Compass)", "Consumer", null, "Finanziato CB", "Compass Flexypay S-M CB", 20, "T3.1 · finanziamento fascia S e M"],
  ["Finanziamento S-M · CB (Smartphone Easy)", "Consumer", null, "Finanziato CB", "Smartphone Easy S-M CB", 20, "T3.1 · finanziamento fascia S e M"],
  ["Finanziamento L (Compass)", "Consumer", null, "Finanziato", "Compass Flexypay L-XL", 40, "T3.1 · finanziamento fascia L"],
  ["Finanziamento L (Smartphone Easy)", "Consumer", null, "Finanziato", "Smartphone Easy L-XL", 40, "T3.1 · finanziamento fascia L"],
  ["Finanziamento L · CB (Compass)", "Consumer", null, "Finanziato CB", "Compass Flexypay L-XL CB", 40, "T3.1 · finanziamento fascia L"],
  ["Finanziamento L · CB (Smartphone Easy)", "Consumer", null, "Finanziato CB", "Smartphone Easy L-XL CB", 40, "T3.1 · finanziamento fascia L"],
  // ── Tabella 3.1 — CB & DEVICE: wireline
  ["Trasloco", "Consumer", "Customer Base", "Traslochi", "Trasloco", 40, "T3.1 · Traslochi Rete Fissa su già clienti — in promo"],
  ["Migrazione FTTH", "Consumer", "Customer Base", "Cambio Offerta", "Migrazione FTTH", 50, "T3.1 · Migrazioni Wireline FTTH-FWA — in promo"],
];

(async () => {
  await client.connect();
  await client.query("begin");
  try {
    for (const t of ["pay_righe", "pay_soglie", "pay_piste"])
      await client.query(`delete from ${t} where brand=$1 and month=$2 and lato='ragazzi'`, [BRAND, MONTH]);
    for (const p of PISTE)
      await client.query(
        `insert into pay_piste (brand, month, chiave, nome, um, ordine) values ($1,$2,$3,$4,'punti',$5)`,
        [BRAND, MONTH, p.chiave, p.nome, p.ordine]);
    for (const [pista, scala] of Object.entries(SOGLIE))
      for (let i = 0; i < scala.length; i++)
        await client.query(
          `insert into pay_soglie (brand, month, pista, tier, soglia_da, soglia_a) values ($1,$2,$3,$4,$5,$6)`,
          [BRAND, MONTH, pista, i + 1, scala[i][0], scala[i][1]]);
    let ord = 0;
    for (const [pista, nome, tc, cat, prod, off, punti, base, tiers] of R)
      await client.query(
        `insert into pay_righe (brand, month, pista, nome, tipo_cliente, categoria, prodotto, offerta,
                                punti, pay_base, pay_tiers, gettone, ordine)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,$12)`,
        [BRAND, MONTH, pista, nome, tc, cat, prod, off, punti, base, tiers, ord++]);
    for (const [nome, tc, cat, prod, off, importo, note] of G)
      await client.query(
        `insert into pay_righe (brand, month, pista, nome, tipo_cliente, categoria, prodotto, offerta,
                                punti, pay_base, pay_tiers, gettone, note, ordine)
         values ($1,$2,null,$3,$4,$5,$6,$7,0,$8,'{}',true,$9,$10)`,
        [BRAND, MONTH, nome, tc, cat, prod, off, importo, note, ord++]);
    for (const [pista, nome, tc, cat, prod, off, punti, base, tiers] of ENERGIA_T1)
      await client.query(
        `insert into pay_righe (brand, month, pista, nome, tipo_cliente, categoria, prodotto, offerta,
                                punti, pay_base, pay_tiers, gettone, note, ordine, brand_vendita)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,'energia T1 — tabellare deck (Luca 11/08)',$12,'fastweb')`,
        [BRAND, MONTH, pista, nome, tc, cat, prod, off, punti, base, tiers, ord++]);
    // contesti VF/FW (mig 20260811110000): niente righe con brand_vendita NULL
    await client.query("update pay_righe set brand_vendita = brand where brand=$1 and month=$2 and brand_vendita is null", [BRAND, MONTH]);
    await client.query("commit");
  } catch (e) { await client.query("rollback"); console.error("FAIL:", e.message); process.exit(1); }
  const n = async (t) => (await client.query(`select count(*) n from ${t} where brand=$1 and month=$2`, [BRAND, MONTH])).rows[0].n;
  console.log(`OK — piste ${await n("pay_piste")} (attese 5) · soglie ${await n("pay_soglie")} (attese 27) · righe ${await n("pay_righe")} (attese ${R.length + G.length})`);
  // verifica aggancio catalogo: ogni riga con offerta deve esistere nell'albero
  const orfane = (await client.query(`
    select r.nome, r.offerta from pay_righe r where r.brand=$1 and r.month=$2 and r.lato='ragazzi' and r.offerta is not null
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
