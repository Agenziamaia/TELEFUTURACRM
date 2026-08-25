// GARE FASTWEB — risposte di Luca del 25/08 notte, in un giro solo:
// ① PROTECT pagata (l'unica opzione «che conta»): righe COMBINAZIONE nel
//    pick-one (base+Protect con importi sommati — il pick-one prende UNA
//    riga, quindi la combo più specifica vince sulla base quando l'opzione
//    c'è): fisso res +30 su Casa Start/Pro (base +5), fisso business +40 su
//    Light/Business (base +10), mobile consumer +30 su Start/Pro/Power in
//    tutte le griglie (base +5), mobile business +40 (base +10). Ultra
//    esclusa dalla lettera (Protect a catalogo ma non pagata); FWA fuori.
// ② Gettone agg.vo res (0-15 € × pda res alla soglia business): riga
//    DOCUMENTALE SPENTA in business_fisso (pattern W3: nota che inizia per
//    «Documentale», il conteggio è cross-pista e vive nel cantiere analisi).
//    Mai ai ragazzi (indicazione Luca).
// ③ Boost sim business (+50 wireline contestuale, +25 mnp): pista
//    boost_business a % ragazzi ZERO con righe documentali spente (il
//    pick-one non può sommare una riga parallela alla griglia: si
//    conteggiano in analisi col tracciamento) + opzione facoltativa
//    «Wireline contestuale» a catalogo sulle 6 offerte mobile business
//    (il dato si traccia da subito).
// ⑤ Gas business: offerta a catalogo (vendibile) + gettone 140 € in pista
//    gas — % ragazzi della pista (70) → va anche ai ragazzi, come chiesto.
// ⑥ Ricorrenze energia (compensi M+6 della lettera): nel campo `ricorrente`
//    del tabellare (informativo, colonna 🔁) — luce res 30, luce business
//    40, gas res 10, gas business 20. Si monitoreranno col cantiere
//    compensi/fatture.
// Idempotente per nome. Lancio: NODE_PATH=<dir pg> node seed_fastweb_risposte.js
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
const PROD_GAS_BIZ = "710c8acf-5df8-415e-8d52-4bc57cf5e452";
const OFF_MOB_BIZ = ["46865a8c-4e27-4e68-8d5e-cb68dbcaddd3", "77d6a929-7678-414d-b63d-c94109f321e0",
  "bfe699be-ffc8-4346-a78a-f5afce7663fd", "83e21b98-dde1-4bdc-b94b-2f1129801a69",
  "26659f3e-d46f-441f-b20e-b42769768950", "3a96c5f4-07fd-4291-8cf5-d610fdd1db01"];

const NP_RES = "Lettera fisso res: Protect +30 € su Start/Pro (25 gara + 5 base — sotto la 1ª soglia paga solo la base). Importi = griglia offerta + 30, base offerta + 5.";
const NP_BIZ_F = "Lettera fisso business: Protect +40 € (30 gara + 10 base). Importi = griglia offerta + 40, base + 10.";
const NP_MOB = "Lettera mobile: Protect res +30 € su Start/Pro/Power (25 gara + 5 base); Ultra esclusa dalla lettera. Importi = griglia + 30, base + 5.";
const NP_MOB_B = "Lettera mobile: Protect shp +40 € (30 gara + 10 base) — la lettera scrive «su START/PRO/POWER» ma a catalogo business c'è su tutte e tre le offerte: pagata su tutte, correggere se serve.";
// [nome, tipo, categoria, prodotto, offerta, pista, base, tiers, nota]
const PROTECT = [
  ["Casa Start + Protect", "Consumer", "Fisso", "Fisso", "Casa Start", "fisso", 50, [75,110,140,151,155,165,175], NP_RES],
  ["Casa Pro + Protect", "Consumer", "Fisso", "Fisso", "Casa Pro", "fisso", 55, [80,145,175,186,190,200,210], NP_RES],
  ["Business Light + Protect", "Business", "Fisso", "Fisso", "Fastweb Business Light", "business_fisso", 75, [105,215,245,265,285,315], NP_BIZ_F],
  ["Business + Protect", "Business", "Fisso", "Fisso", "Fastweb Business", "business_fisso", 100, [130,240,270,290,310,340], NP_BIZ_F],
  // mobile consumer — ric. automatica (GA e MNP: stesse cifre)
  ["Start · Ric.Auto MNP + Protect", "Consumer", "Mobile Ric. Auto", "Mobile MNP", "Start", "mobile", 20, [53,59,93,112,114,116,119,122], NP_MOB],
  ["Start · Ric.Auto GA + Protect", "Consumer", "Mobile Ric. Auto", "Mobile GA", "Start", "mobile", 20, [53,59,93,112,114,116,119,122], NP_MOB],
  ["Pro · Ric.Auto MNP + Protect", "Consumer", "Mobile Ric. Auto", "Mobile MNP", "Pro", "mobile", 20, [53,75,109,128,130,132,135,138], NP_MOB],
  ["Pro · Ric.Auto GA + Protect", "Consumer", "Mobile Ric. Auto", "Mobile GA", "Pro", "mobile", 20, [53,75,109,128,130,132,135,138], NP_MOB],
  ["Power · Ric.Auto MNP + Protect", "Consumer", "Mobile Ric. Auto", "Mobile MNP", "Power", "mobile", 20, [53,90,125,144,147,149,153,156], NP_MOB],
  ["Power · Ric.Auto GA + Protect", "Consumer", "Mobile Ric. Auto", "Mobile GA", "Power", "mobile", 20, [53,90,125,144,147,149,153,156], NP_MOB],
  // mobile consumer — ric. pura (MNP e GA: cifre diverse)
  ["Start · Ric.Pura MNP + Protect", "Consumer", "Mobile Wallet", "Mobile MNP", "Start", "mobile", 6, [36,46,82,99,100,101,103,104], NP_MOB],
  ["Start · Ric.Pura GA + Protect", "Consumer", "Mobile Wallet", "Mobile GA", "Start", "mobile", 6, [31,46,52,54,55,56,56,57], NP_MOB],
  ["Pro · Ric.Pura MNP + Protect", "Consumer", "Mobile Wallet", "Mobile MNP", "Pro", "mobile", 6, [36,46,83,118,119,120,122,124], NP_MOB],
  ["Pro · Ric.Pura GA + Protect", "Consumer", "Mobile Wallet", "Mobile GA", "Pro", "mobile", 6, [31,46,68,70,71,72,72,73], NP_MOB],
  ["Power · Ric.Pura MNP + Protect", "Consumer", "Mobile Wallet", "Mobile MNP", "Power", "mobile", 6, [36,46,102,120,122,123,125,127], NP_MOB],
  ["Power · Ric.Pura GA + Protect", "Consumer", "Mobile Wallet", "Mobile GA", "Power", "mobile", 6, [31,46,72,74,75,76,77,78], NP_MOB],
  // mobile business
  ["Mobile Business + Protect", "Business", null, null, "Fastweb Mobile Business", "mobile", 25, [63,75,112,131,135,137,139,142], NP_MOB_B],
  ["Mobile Business Freedom + Protect", "Business", null, null, "Fastweb Mobile Freedom", "mobile", 25, [70,95,129,148,150,152,154,157], NP_MOB_B],
  ["Mobile Business Unlimited + Protect", "Business", null, null, "Fastweb Mobile Business Unlimited", "mobile", 25, [63,116,153,172,175,178,182,185], NP_MOB_B],
];

(async () => {
  await client.connect();
  const dump = {};
  for (const t of ["pay_piste", "pay_righe"]) {
    const { rows } = await client.query(`select * from ${t} where brand=$1`, [B]);
    dump[t] = rows;
  }
  let dumpFile = path.join(__dirname, "dump_fastweb_pre_risposte.json");
  if (fs.existsSync(dumpFile)) dumpFile = dumpFile.replace(/\.json$/, `_${Date.now()}.json`);
  fs.writeFileSync(dumpFile, JSON.stringify(dump, null, 1));
  console.log("Dump:", path.basename(dumpFile), Object.entries(dump).map(([t, r]) => `${t}=${r.length}`).join(" · "));
  // idempotenza a QUERY (rilievo revisore notturno: il filtro JS sul dump
  // confrontava String(Date) e non matchava mai — un rilancio duplicava)
  const { rows: nomiEs } = await client.query(
    "select nome from pay_righe where brand=$1 and month=$2 and lato=$3", [B, M, L]);
  const giaNomi = new Set(nomiEs.map(r => r.nome));

  try {
    await client.query("begin");

    // ① Protect: 19 combo (punti 1 come le basi, opzione Protect richiesta)
    let o = 60, nuoveP = 0;
    for (const [nome, tipo, cat, prod, off, pista, base, tiers, nota] of PROTECT) {
      o++;
      if (giaNomi.has(nome)) continue;
      await client.query(
        `insert into pay_righe (brand, month, lato, pista, nome, tipo_cliente, categoria, prodotto, offerta, opzione,
           punti, pay_base, pay_tiers, gettone, attivo, ordine, note)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Protect',1,$10,$11,false,true,$12,$13)`,
        [B, M, L, pista, nome, tipo, cat, prod, off, base, tiers, o, nota]);
      nuoveP++;
    }

    // ② gettone agg.vo res — documentale spenta (mai ai ragazzi)
    if (!giaNomi.has("Gettone agg.vo res (soglie business)")) await client.query(
      `insert into pay_righe (brand, month, lato, pista, nome, tipo_cliente, categoria, punti, pay_base, pay_tiers, gettone, attivo, ordine, note)
       values ($1,$2,$3,'business_fisso','Gettone agg.vo res (soglie business)',null,null,0,0,$4,false,false,90,$5)`,
      [B, M, L, [0,5,7,9,10,15],
       "Documentale — alla soglia business raggiunta, € per OGNI pda res fisso valida (0/5/7/9/10/15). Conteggio cross-pista: si calcola nel cantiere analisi. Mai ai ragazzi (Luca 25/08)."]);

    // ③ pista boost a % ragazzi zero + righe documentali + opzione tracciamento
    const { rows: [{ n: nb }] } = await client.query(
      "select count(*)::int n from pay_piste where brand=$1 and month=$2 and lato=$3 and chiave='boost_business'", [B, M, L]);
    if (!nb) await client.query(
      "insert into pay_piste (brand, month, chiave, nome, um, ordine, lato, perc_ragazzi) values ($1,$2,'boost_business','Boost Sim Business','pezzi',8,$3,0)",
      [B, M, L]);
    if (!giaNomi.has("Sim business · wireline contestuale (+50)")) await client.query(
      `insert into pay_righe (brand, month, lato, pista, nome, tipo_cliente, opzione, punti, pay_base, pay_tiers, gettone, attivo, ordine, note)
       values ($1,$2,$3,'boost_business','Sim business · wireline contestuale (+50)','Business','Wireline contestuale',0,50,'{}',true,false,1,$4)`,
      [B, M, L, "Documentale — extra gettone 50 € per sim business venduta con un fisso contestuale (lettera mobile, regola 10). Si traccia con l'opzione «Wireline contestuale» sulla sim; il conteggio è del cantiere analisi. Solo azienda (% ragazzi 0)."]);
    if (!giaNomi.has("Sim business · mnp no Vodafone (+25)")) await client.query(
      `insert into pay_righe (brand, month, lato, pista, nome, tipo_cliente, prodotto, punti, pay_base, pay_tiers, gettone, attivo, ordine, note)
       values ($1,$2,$3,'boost_business','Sim business · mnp no Vodafone (+25)','Business','Mobile MNP',0,25,'{}',true,false,2,$4)`,
      [B, M, L, "Documentale — extra gettone 25 € per sim business in mnp non Vodafone (lettera mobile, regola 11; le provenienze Vodafone sono già escluse a monte). Conteggio del cantiere analisi. Solo azienda (% ragazzi 0)."]);
    const { rows: esOpz } = await client.query(
      "select offerta_id from catalog_opzioni where nome='Wireline contestuale' and offerta_id = any($1)", [OFF_MOB_BIZ]);
    const conOpz = new Set(esOpz.map(x => x.offerta_id));
    for (const oid of OFF_MOB_BIZ) {
      if (!conOpz.has(oid)) await client.query(
        "insert into catalog_opzioni (offerta_id, nome, tipo, gruppo_singolo, ordine, attivo, obbligatoria) values ($1,'Wireline contestuale',null,null,50,true,false)", [oid]);
    }

    // ⑤ gas business vendibile + gettone 140 (pista gas → 70% ai ragazzi)
    const { rows: gOff } = await client.query(
      "select id from catalog_offerte where prodotto_id=$1 and nome='Gas'", [PROD_GAS_BIZ]);
    if (!gOff.length) await client.query(
      "insert into catalog_offerte (prodotto_id, nome, ordine, attivo) values ($1,'Gas',1,true)", [PROD_GAS_BIZ]);
    if (!giaNomi.has("Gas · Business")) await client.query(
      `insert into pay_righe (brand, month, lato, pista, nome, tipo_cliente, categoria, prodotto, offerta, punti, pay_base, pay_tiers, gettone, attivo, ordine, note, ricorrente)
       values ($1,$2,$3,'gas','Gas · Business','Business','Energia','Gas','Gas',0,140,'{}',true,true,2,$4,20)`,
      [B, M, L, "Lettera Energy, Tabella 4: gas business ≥1 pda → 140 € (di cui base 70) — soglia già presa con una pda: gettone pieno. Pda attivate a M+1; Placet escluse. Colonna 🔁: compenso M+6 (20 €/pda, una tantum), si monitora col cantiere compensi/fatture."]);

    // ⑥ ricorrenze M+6 in colonna 🔁 (una tantum a M+6, informativa)
    for (const [off2, ric] of [["Energy Core", 30], ["Energy Flex", 30], ["Energy Fix", 30]]) {
      await client.query(
        "update pay_righe set ricorrente=$1 where brand=$2 and month=$3 and lato=$4 and offerta=$5 and tipo_cliente='Consumer' and categoria='Energia'",
        [ric, B, M, L, off2]);
    }
    await client.query(
      "update pay_righe set ricorrente=40 where brand=$1 and month=$2 and lato=$3 and pista='luce_business'", [B, M, L]);
    await client.query(
      "update pay_righe set ricorrente=10 where brand=$1 and month=$2 and lato=$3 and offerta='Gas' and tipo_cliente='Consumer'", [B, M, L]);

    await client.query("commit");
    console.log(`Commit ok. Protect nuove: ${nuoveP}/19`);
  } catch (e) {
    await client.query("rollback");
    console.error("ROLLBACK:", e.message);
    process.exitCode = 1; await client.end(); return;
  }

  const { rows: chk } = await client.query(
    `select pista, count(*) filter (where attivo) attive, count(*) filter (where not attivo) spente
     from pay_righe where brand=$1 and month=$2 and lato=$3 group by pista order by pista nulls last`, [B, M, L]);
  for (const c of chk) console.log(` ${c.pista || "(fuori pista)"}: ${c.attive} attive · ${c.spente} spente`);
  await client.end();
})();
