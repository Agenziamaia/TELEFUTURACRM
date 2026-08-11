// SEED del tabellare WIND3 RAGAZZI — SOLO GETTONI (riscritto 11/08 sera).
// Il vecchio tabellare mobile/fisso (nomi vecchi, Book233) è stato ABBANDONATO
// (Luca 11/08): mobile e fisso ragazzi si DERIVANO dal lato azienda a
// moltiplicatori (seed_pay_w3_azienda_agosto.js) via derivazione parziale del
// motore — la % ai ragazzi la imposta Luca dal pannello (100 finché non c'è).
// Qui restano i GETTONI: CB al valore S1 (senza soglia, regola Luca), telefoni
// a rate, assicurazioni. Idempotente: solo windtre/2026-08-01 lato ragazzi.
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

const PISTE = [];   // niente piste ragazzi: mobile/fisso derivano dall'azienda
const SOGLIE = {};

// [pista, nome, tipo_cliente, categoria, prodotto, offerta, punti, base(gettone), tiers, gettone]
const R = [];
const riga = (pista, nome, tc, cat, prod, off, punti, tiers, note) =>
  R.push([pista, nome, tc, cat, prod, off, punti, null, tiers, false, note || null]);
const gett = (nome, tc, cat, prod, off, importo, note) =>
  R.push([null, nome, tc, cat, prod, off, 0, importo, [], true, note || null]);

// ── CUSTOMER BASE — SENZA soglia: paga sempre il valore S1 (Luca 11/08)
const CB = [
  ["Caring", 2.5], ["CL1", 4], ["CL1 EP", 6], ["CL2", 17.5], ["CL2 EP", 20],
  ["CL3", 22.5], ["CL3 EP", 25], ["Migrazione FTTH", 40],
];
for (const [off, s1] of CB)
  gett(`CB · ${off}`, "Consumer", "Customer Base", "Cambio Offerta", off, s1, "senza soglia: paga sempre il valore S1");
for (const [off, s1] of CB.filter(([o]) => o !== "Migrazione FTTH" && !o.endsWith("EP")))
  gett(`CB Business · ${off}`, "Business", "Customer Base", "Cambio Offerta", off, s1, "senza soglia: paga sempre il valore S1");

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
    for (const [pista, nome, tc, cat, prod, off, punti, base, tiers, gettone, note] of R)
      await client.query(
        `insert into pay_righe (brand, month, pista, nome, tipo_cliente, categoria, prodotto, offerta,
                                punti, pay_base, pay_tiers, gettone, note, ordine)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [BRAND, MONTH, pista, nome, tc, cat, prod, off, punti, base, tiers, gettone, note, ord++]);
    // contesti VF/FW (mig 20260811110000): niente righe con brand_vendita NULL
    await client.query("update pay_righe set brand_vendita = brand where brand=$1 and month=$2 and brand_vendita is null", [BRAND, MONTH]);
    await client.query("commit");
  } catch (e) { await client.query("rollback"); console.error("FAIL:", e.message); process.exit(1); }
  const n = async (t) => (await client.query(`select count(*) n from ${t} where brand=$1 and month=$2`, [BRAND, MONTH])).rows[0].n;
  console.log(`OK ragazzi W3 — solo gettoni: ${R.length} righe (piste/soglie: nessuna, si deriva dall azienda)`);
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
