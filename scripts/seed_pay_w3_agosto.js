// SEED del tabellare WIND3 AGOSTO 2026 (fonte: Book233.xlsx di Luca, 10/08 —
// "vecchio tabellare" del mese precedente, selezioni adattate al catalogo).
// DENTRO solo le associazioni CERTE; le ambigue restano scoperture con
// domanda in Verifiche. Regole recepite:
//  - fisso CB: NON considerato dal tabellare (ordine di Luca);
//  - CB cluster e Add-On: seguono la soglia della pista MOBILE ma non
//    portano punti (punti=0) — DA CONFERMARE ("gettone unico"?);
//  - telefoni a rate: gettone unico a prescindere (flat);
//  - punti v1: 1 per attivazione mobile/fisso (la pesatura per opzioni
//    tipo azienda arriva col motore v2) — DA CONFERMARE;
//  - SOGLIE mobile/fisso: ultimi valori noti (deck Maggio) — DA CONFERMARE
//    per agosto: Mobile 560/810/940 · Fisso 255/330/400.
// Idempotente: cancella e ricrea SOLO windtre/2026-08-01.
// Lancio: node scripts/seed_pay_w3_agosto.js
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

const BRAND = "windtre";
const MONTH = "2026-08-01";

const PISTE = [
  { chiave: "mobile", nome: "Mobile", ordine: 1 },
  { chiave: "fisso", nome: "Fisso", ordine: 2 },
];
const SOGLIE = {
  mobile: [[560, 809], [810, 939], [940, null]],   // DA CONFERMARE per agosto
  fisso: [[255, 329], [330, 399], [400, null]],    // DA CONFERMARE per agosto
};

// [pista, nome, tipo_cliente, categoria, prodotto, offerta, punti, base(gettone), tiers, gettone]
const R = [];
const riga = (pista, nome, tc, cat, prod, off, punti, tiers, note) =>
  R.push([pista, nome, tc, cat, prod, off, punti, null, tiers, false, note || null]);
const gett = (nome, tc, cat, prod, off, importo, note) =>
  R.push([null, nome, tc, cat, prod, off, 0, importo, [], true, note || null]);

// ── MOBILE CONSUMER — Easy Pay (Ric. Auto) con nome certo a catalogo
const EP = [
  ["E.P Voce", "Voce 5G", [30, 33.5, 36]],
  ["E.P Giga Special", "Giga Special", [15, 15, 15]],
  ["E.P CYC Full", "CYC Unlimited Full 5G", [56.25, 63.75, 67.5]],
  ["E.P Family S.S.F 7,99", "Family Con Super Fibra 7.99", [30, 33.5, 36]],
  ["E.P Family S.S.F 9,99", "Family Con Super Fibra 9.99", [37.5, 42.5, 45]],
];
for (const [nome, off, tiers] of EP)
  for (const prod of ["Mobile GA", "Mobile MNP"])
    riga("mobile", nome, "Consumer", "Mobile Ric. Auto", prod, off, 1, tiers);

// ── MOBILE WALLET — Underground per fascia canone (nome col prezzo; a
//    catalogo esistono grafie con virgola E con punto: le copro entrambe)
const UG = [
  [["4,99", "4.99", "5,99", "5.99", "6,99", "6.99", "7,99", "7.99"], [10.5, 14, 15.75], "Ricaricabile < 8"],
  [["8,99", "8.99", "9,99", "9.99"], [15, 20, 22.5], "Ricaricabile 8-10"],
  [["10,99", "10.99"], [16.5, 22, 24.75], "Ricaricabile 10-12"],
];
for (const [prezzi, tiers, nome] of UG)
  for (const p of [...new Set(prezzi)])
    riga("mobile", `${nome} · Underground`, "Consumer", null, "Mobile MNP", `Underground ${p}`, 1, tiers);

// ── BUSINESS MOBILE — Professional (stesso pay GA e MNP sul tabellare)
const PROF = [
  ["Professional Full", ["Professional Full"], [65, 80, 95]],
  ["Professional Staff", ["Professional Staff"], [47.5, 52.5, 55]],
  ["Professional Special", ["Professional Special"], [47.5, 52.5, 55]],
  ["Professional World", ["Professional World"], [85, 105, 125]],
  ["Professional Flexy/Sim Dati", ["Professional Flex", "Professional Flexy", "Professional Data 60 Gb 5.99", "Professional Data 60 Gb 8.99", "Professional Data 10 Gb 4.99", "Professional Data 100 Gb 9.99", "Professional Data 100 Gb 13.99"], [40, 40, 40]],
];
for (const [nome, offs, tiers] of PROF)
  for (const off of offs)
    riga("mobile", nome, "Business", "Mobile Ric. Auto", null, off, 1, tiers);

// ── CUSTOMER BASE (cluster) — nomi ESATTI a catalogo; seguono la soglia
//    MOBILE senza portare punti (DA CONFERMARE: "gettone unico"?)
const CB = [
  ["Caring", [2.5, 3, 3.5]],
  ["CL1", [4, 8, 10]], ["CL1 EP", [6, 12, 14]],
  ["CL2", [17.5, 26, 30]], ["CL2 EP", [20, 31, 34]],
  ["CL3", [22.5, 36, 43]], ["CL3 EP", [25, 41, 50]],
  ["Migrazione FTTH", [40, 40, 40]],
];
for (const [off, tiers] of CB)
  riga("mobile", `CB · ${off}`, "Consumer", "Customer Base", "Cambio Offerta", off, 0, tiers, "segue la soglia mobile, non porta punti");
// CB business: stessi cluster (Caring/CL1-3 esistono anche lato Business)
for (const [off, tiers] of CB.filter(([o]) => o !== "Migrazione FTTH"))
  if (!off.endsWith("EP"))
    riga("mobile", `CB Business · ${off}`, "Business", "Customer Base", "Cambio Offerta", off, 0, tiers, "segue la soglia mobile, non porta punti");

// ── TELEFONI A RATE — gettone unico a prescindere (flat sul tabellare)
gett("Rata (tel. a rate GA)", "Consumer", null, "Tel. Rate", "Rata 0", 5);
gett("Rata (tel. a rate GA)", "Consumer", null, "Tel. Rate", "Rata > 0", 5);
gett("Rata 5G (tel. a rate GA)", "Consumer", null, "Tel. Rate", "Rata 0 5G", 15);
gett("Rata 5G (tel. a rate GA)", "Consumer", null, "Tel. Rate", "Rata > 0 5G", 15);
gett("Rata 0 · CB", "Consumer", null, "Tel. Rate CB", "Rata 0", 10);
gett("Rata >0 · CB", "Consumer", null, "Tel. Rate CB", "Rata >0", 15);
gett("Finanziato 0 · CB", "Consumer", null, "Finanziato CB", "Findomestic 0", 10);
gett("Finanziato 0 · CB", "Consumer", null, "Finanziato CB", "Compass 0", 10);
gett("Finanziato 0 · CB", "Consumer", null, "Finanziato CB", "Findomestic 0 Rata Smart", 10);
gett("Finanziato 0 · CB", "Consumer", null, "Finanziato CB", "Compass 0 Rata Smart", 10);
gett("Findomestic >0 · CB", "Consumer", null, "Finanziato CB", "Findomestic > 600€", 20);
gett("Findomestic >0 · CB", "Consumer", null, "Finanziato CB", "Findomestic < 600€", 20);
gett("Findomestic >0 · CB", "Consumer", null, "Finanziato CB", "Findomestic > 600€ Rata Smart", 20);
gett("Findomestic >0 · CB", "Consumer", null, "Finanziato CB", "Findomestic < 600€ Rata Smart", 20);
gett("Rata PI 4G", "Business", null, null, "Rata", 5);
gett("Rata PI 5G", "Business", null, null, "Rata 5G", 15);

// ── FISSO — pista fisso, punti 1 (fisso CB ESCLUSO dal tabellare per ordine di Luca)
riga("fisso", "Fisso", "Consumer", "Fisso", "Fisso", "Fisso", 1, [66, 88, 110]);
riga("fisso", "Fisso Conv", "Consumer", "Fisso", "Fisso", "Fisso Conv", 1, [125, 149, 170]);
riga("fisso", "FWA Outdoor", "Consumer", "Fisso", "FWA", "Super Internet Casa Outdoor 5G", 1, [125, 140, 145]);
riga("fisso", "FWA Outdoor Conv", "Consumer", "Fisso", "FWA", "Super Internet Casa Outdoor 5G Conv", 1, [125, 140, 145], "Conv non distinta sul tabellare: stesso pay — da confermare");
riga("fisso", "FWA Indoor", "Consumer", "Fisso", "FWA", "Super Internet Casa Indoor 5G", 1, [75, 90, 95]);
riga("fisso", "FWA Indoor Conv", "Consumer", "Fisso", "FWA", "Super Internet Casa Indoor 5G Conv", 1, [75, 90, 95], "Conv non distinta sul tabellare: stesso pay — da confermare");
riga("fisso", "Fisso PI", "Business", "Fisso", "Fisso", "Super Fibra", 1, [88, 110, 132]);
riga("fisso", "Fisso PI Conv", "Business", "Fisso", "Fisso", "Super Fibra Conv", 1, [147, 169, 191]);

// ── ASSICURAZIONI — gettoni flat, nomi certi a catalogo
const ASS = [
  ["Casa Start", 40], ["Casa Plus", 70], ["Casa Full", 100],
  ["Sport", 25], ["Sport Famiglia", 50], ["Elettrodomestici", 15],
  ["Micio e Fido", 45], ["Viaggi", 30],
];
for (const [off, importo] of ASS)
  gett(`Assicurazione ${off}`, "Consumer", "Multi-Servizi", "Assicurazioni", off, importo);

(async () => {
  await client.connect();
  await client.query("begin");
  try {
    for (const t of ["pay_righe", "pay_soglie", "pay_piste"])
      await client.query(`delete from ${t} where brand=$1 and month=$2`, [BRAND, MONTH]);
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
    for (const [pista, nome, tc, cat, prod, off, punti, base, tiers, gettone, note] of R)
      await client.query(
        `insert into pay_righe (brand, month, pista, nome, tipo_cliente, categoria, prodotto, offerta,
                                punti, pay_base, pay_tiers, gettone, note, ordine)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [BRAND, MONTH, pista, nome, tc, cat, prod, off, punti, base, tiers, gettone, note, ord++]);
    await client.query("commit");
  } catch (e) { await client.query("rollback"); console.error("FAIL:", e.message); process.exit(1); }
  const n = async (t) => (await client.query(`select count(*) n from ${t} where brand=$1 and month=$2`, [BRAND, MONTH])).rows[0].n;
  console.log(`OK — piste ${await n("pay_piste")} (attese 2) · soglie ${await n("pay_soglie")} (attese 6) · righe ${await n("pay_righe")} (attese ${R.length})`);
  const orfane = (await client.query(`
    select distinct r.nome, r.offerta from pay_righe r where r.brand=$1 and r.month=$2 and r.offerta is not null
    and not exists (
      select 1 from catalog_offerte o
      join catalog_prodotti p on p.id = o.prodotto_id
      join catalog_categorie c on c.id = p.categoria_id
      where p.brand_id = r.brand
        and lower(o.nome) = lower(r.offerta)
        and (r.categoria is null or lower(c.nome) = lower(r.categoria))
        and (r.prodotto is null or lower(p.nome) = lower(r.prodotto))
        and (r.tipo_cliente is null or lower(p.tipo_cliente) = lower(r.tipo_cliente))
    ) order by r.nome`, [BRAND, MONTH])).rows;
  if (orfane.length) { console.log("⚠️ RIGHE SENZA OFFERTA A CATALOGO:"); orfane.forEach(r => console.log("  -", r.nome, "→", r.offerta)); }
  else console.log("✅ tutte le righe agganciano un'offerta esistente a catalogo");
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
