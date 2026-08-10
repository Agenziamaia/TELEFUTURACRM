// SEED del tabellare SKY AGOSTO 2026 (fonte: screenshot del tabellare RAGAZZI
// mandato da Luca in chat il 10/08 sera — risponde al sospeso Verifiche
// "Tabellare Sky ragazzi: dove lo trovo?").
// STRUTTURA soglie/punti dal piano ufficiale Sky GOLD Partner di agosto
// (Telco/Operatori/Sky/Agosto 2026/GOLD AGOSTO 26.pdf): soglie A PUNTI —
// S1 <200 · S2 da 200 · S3 da 300 · S4 da 400 (Sky ne ha 8, il tabellare
// ragazzi si ferma a S4) — con pesi punti: TV Only/Glass 2 · Only Sky Wifi 1
// · Triple Play 3 · Prova Sky 0,5 · Reconnection 1,5 · Sky Mobile 0,5 · Bar 4.
// DA CONFERMARE con Luca (sospeso in Verifiche): che le S1-S4 dei ragazzi
// seguano proprio le soglie punti Sky 1-4 (alternativa: la soglia AZIENDALE
// raggiunta — ad aprile la gara pagava i pezzi Sky a S4); il "cancelletto"
// Sky (6 SIM mobile per sbloccare le soglie >1) NON è modellato.
// NON seedati (restano scoperture): TV Ricaduta e Sky TV Black (nessuna
// offerta a catalogo), Prova Sky, business (Bar/Hotel/Uffici/Fibra Business),
// Sostituzione SIM. Il MOBILE conta in soglia (0,5) ma il pay ragazzi non è
// sul tabellare: righe a punti SENZA importo.
// Idempotente: cancella e ricrea SOLO sky/2026-08-01.
// Lancio: node scripts/seed_pay_sky_agosto.js
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

const BRAND = "sky";
const MONTH = "2026-08-01";

const PISTE = [
  { chiave: "sky", nome: "Punti Sky", ordine: 1 },
];
// Soglie punti del piano GOLD (S1 parte da zero: si paga dal 1° pezzo).
const SOGLIE = {
  sky: [[0, 199], [200, 299], [300, 399], [400, null]],
};

// [pista, nome, tipo_cliente, categoria, prodotto, offerta, punti, base, tiers, note]
// I € S1-S4 vengono dallo screenshot di Luca; i punti dal piano GOLD.
const R = [
  // ── TV (categoria TV): la riga prodotto copre Smart / +Cinema / +Sport
  //    (e la storica "TV" disattivata); la 14,99 promozionata ha riga propria.
  ["sky", "Sky TV", "Consumer", "TV", "TV", null, 2, [180, 180, 200, 290], "copre Smart / +Cinema / +Sport; la 14,99 ha la sua riga"],
  ["sky", "Sky TV 14,90", "Consumer", "TV", "TV", "Sky TV a 14,99€", 2, [120, 140, 160, 195], "TV Only con offerta promozionata"],
  ["sky", "Sky Glass 43\"", "Consumer", "TV", "Sky Glass e Prova Sky", "Sky Glass 43\"", 2, [110, 135, 155, 225], null],
  ["sky", "Sky Glass 55\"", "Consumer", "TV", "Sky Glass e Prova Sky", "Sky Glass 55\"", 2, [110, 135, 155, 225], null],
  ["sky", "Sky Glass 65\"", "Consumer", "TV", "Sky Glass e Prova Sky", "Sky Glass 65\"", 2, [110, 135, 155, 225], null],
  // ── FISSO
  ["sky", "Sky Fibra", "Consumer", "Fisso", "Sky Fibra", null, 1, [135, 135, 190, 200], null],
  ["sky", "Sky Fibra (legacy pre-catalogo)", "Consumer", "Fisso", "Fisso", "Sky Fibra", 1, [135, 135, 190, 200], "vecchie pratiche con prodotto 'Fisso'"],
  ["sky", "3P", "Consumer", "Fisso", "3P", null, 3, [270, 300, 310, 320], "27,90 / 29,90; le 35,90 hanno riga propria"],
  ["sky", "3P 35,90 (Cinema)", "Consumer", "Fisso", "3P", "Sky TV + Sky Cinema + Sky Fibra a 35,90€", 3, [270, 300, 310, 400], null],
  ["sky", "3P 35,90 (Sport)", "Consumer", "Fisso", "3P", "Sky TV + Sky Sport + Sky Fibra a 35,90€", 3, [270, 300, 310, 400], null],
  ["sky", "3P 35,90 (legacy 35,80)", "Consumer", "Fisso", "3P 35,80", null, 3, [270, 300, 310, 400], "prodotto legacy"],
  // ── MOBILE: conta in soglia (piano Sky: MNP e no-MNP Ric.Auto 0,5; ricarica
  //    pura 0 — nei contracts non distinguibile), pay ragazzi DA DEFINIRE.
  ["sky", "Sky Mobile MNP", "Consumer", null, "Mobile MNP", null, 0.5, [], "conta 0,5 punti in soglia (piano Sky); pay ragazzi da definire"],
  ["sky", "Sky Mobile GA", "Consumer", null, "Mobile GA", null, 0.5, [], "conta 0,5 punti in soglia (piano Sky); pay ragazzi da definire — la ricarica pura varrebbe 0"],
];

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
    for (const [pista, nome, tc, cat, prod, off, punti, tiers, note] of R)
      await client.query(
        `insert into pay_righe (brand, month, pista, nome, tipo_cliente, categoria, prodotto, offerta,
                                punti, pay_base, pay_tiers, gettone, note, ordine)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,null,$10,false,$11,$12)`,
        [BRAND, MONTH, pista, nome, tc, cat, prod, off, punti, tiers, note, ord++]);
    await client.query("commit");
  } catch (e) { await client.query("rollback"); console.error("FAIL:", e.message); process.exit(1); }
  const n = async (t) => (await client.query(`select count(*) n from ${t} where brand=$1 and month=$2`, [BRAND, MONTH])).rows[0].n;
  console.log(`OK — piste ${await n("pay_piste")} (attesa 1) · soglie ${await n("pay_soglie")} (attese 4) · righe ${await n("pay_righe")} (attese ${R.length})`);
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
  // attesa 1 orfana: "Sky Fibra (legacy pre-catalogo)" ancora su prodotto 'Fisso' che a catalogo non esiste
  if (orfane.length) { console.log("⚠️ RIGHE SENZA OFFERTA A CATALOGO (attesa la sola legacy):"); orfane.forEach(r => console.log("  -", r.nome, "→", r.offerta)); }
  else console.log("✅ tutte le righe agganciano un'offerta esistente a catalogo");
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
