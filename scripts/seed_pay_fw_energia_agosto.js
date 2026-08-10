// SEED tabellare ENERGIA FASTWEB + pista Soluzioni Digitali VF — AGOSTO 2026
// (fonte: deck Riunione_Agosto_2026, tabelle "Luce & Gas" e "Soluzioni
// Digitali" del nuovo pagamento a tabella Vodafone-side).
//  - brand FASTWEB: pista luce (6 soglie 24→65+) con Energy Fix/Flex/Core
//    Consumer e Fix/Flex Business; pista gas (soglia ≥1: paga dal 1° pezzo)
//    con Flex RES 90€ (Consumer) e Flex BUS 120€ (Business, offerta jolly:
//    il prodotto Gas business a catalogo non ha ancora offerte).
//  - brand VODAFONE: SOLO pista+soglie soluzioni_digitali (19-23/24-34/35+),
//    righe in attesa del mapping fasce A-D di Luca. ADDITIVO: non tocca il
//    seed vodafone esistente.
// Idempotente. Lancio: node scripts/seed_pay_fw_energia_agosto.js
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
const MONTH = "2026-08-01";

(async () => {
  await client.connect();
  await client.query("begin");
  try {
    // ── FASTWEB: rifai luce+gas da zero
    for (const t of ["pay_righe", "pay_soglie", "pay_piste"])
      await client.query(`delete from ${t} where brand='fastweb' and month=$1`, [MONTH]);
    await client.query(`insert into pay_piste (brand, month, chiave, nome, um, ordine) values
      ('fastweb',$1,'luce','Luce','pezzi',1), ('fastweb',$1,'gas','Gas','pezzi',2)`, [MONTH]);
    const LUCE = [[24, 30], [31, 37], [38, 45], [46, 53], [54, 64], [65, null]];
    for (let i = 0; i < LUCE.length; i++)
      await client.query(`insert into pay_soglie (brand, month, pista, tier, soglia_da, soglia_a) values ('fastweb',$1,'luce',$2,$3,$4)`,
        [MONTH, i + 1, LUCE[i][0], LUCE[i][1]]);
    await client.query(`insert into pay_soglie (brand, month, pista, tier, soglia_da, soglia_a) values ('fastweb',$1,'gas',1,1,null)`, [MONTH]);
    const R = [
      // pista, nome, tc, prodotto, offerta, punti, base, tiers
      ["luce", "Luce Fix", "Consumer", "Luce", "Energy Fix", 1, 70, [70, 80, 90, 100, 110, 120]],
      ["luce", "Luce Flex", "Consumer", "Luce", "Energy Flex", 1, 70, [80, 90, 100, 110, 120, 130]],
      ["luce", "Luce Core", "Consumer", "Luce", "Energy Core", 1, 70, [95, 110, 125, 140, 155, 175]],
      ["luce", "Luce Fix Business", "Business", "Luce", "Energy Fix", 1, 80, [115, 125, 135, 145, 155, 165]],
      ["luce", "Luce Flex Business", "Business", "Luce", "Energy Flex", 1, 80, [115, 125, 135, 145, 155, 165]],
      ["gas", "Gas Flex RES", "Consumer", "Gas", "Gas", 1, 60, [90]],
      ["gas", "Gas Flex BUS", "Business", "Gas", null, 1, 70, [120]],
    ];
    let ord = 0;
    for (const [pista, nome, tc, prod, off, punti, base, tiers] of R)
      await client.query(
        `insert into pay_righe (brand, month, pista, nome, tipo_cliente, categoria, prodotto, offerta, punti, pay_base, pay_tiers, gettone, ordine)
         values ('fastweb',$1,$2,$3,$4,'Energia',$5,$6,$7,$8,$9,false,$10)`,
        [MONTH, pista, nome, tc, prod, off, punti, base, tiers, ord++]);

    // ── VODAFONE: pista soluzioni_digitali (solo struttura, righe da mapping)
    await client.query(`delete from pay_soglie where brand='vodafone' and month=$1 and pista='soluzioni_digitali'`, [MONTH]);
    await client.query(`delete from pay_piste where brand='vodafone' and month=$1 and chiave='soluzioni_digitali'`, [MONTH]);
    await client.query(`insert into pay_piste (brand, month, chiave, nome, um, ordine) values ('vodafone',$1,'soluzioni_digitali','Soluzioni Digitali','punti',5)`, [MONTH]);
    const SD = [[19, 23], [24, 34], [35, null]];
    for (let i = 0; i < SD.length; i++)
      await client.query(`insert into pay_soglie (brand, month, pista, tier, soglia_da, soglia_a) values ('vodafone',$1,'soluzioni_digitali',$2,$3,$4)`,
        [MONTH, i + 1, SD[i][0], SD[i][1]]);
    await client.query("commit");
  } catch (e) { await client.query("rollback"); console.error("FAIL:", e.message); process.exit(1); }
  const q = async (sql, p) => (await client.query(sql, p)).rows[0].n;
  console.log(`OK — fastweb: piste ${await q("select count(*) n from pay_piste where brand='fastweb' and month=$1", [MONTH])} · soglie ${await q("select count(*) n from pay_soglie where brand='fastweb' and month=$1", [MONTH])} · righe ${await q("select count(*) n from pay_righe where brand='fastweb' and month=$1", [MONTH])}`);
  console.log(`     vodafone: piste ora ${await q("select count(*) n from pay_piste where brand='vodafone' and month=$1", [MONTH])} (attese 5)`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
