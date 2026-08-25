// SEED TABELLARE GARE S4 (cantiere S4 Energia, 25/08/2026 — terminal S4).
// Fonte: «Provvigioni S4 2026 LUCA PERROTTA (2).pdf» (Piano Luca Perrotta) +
// direttiva Luca 25/08: per il residenziale si attiva SOLO la CTE Smart
// («Domestici Smart» a catalogo) — Green Cap e CTE Amici non si registrano.
//   · gettone 100 € a PDP (bollettino o RID: identico)
//   · canvass mese produzione PDP NON cumulabile: ≥75 PDP → +30 €, ≥150 → +40 €
//     (modello tier del motore: 100/130/140 retroattivi sul mese)
//   · ricorrente 4 €/PDP/mese dal 6° mese di fornitura (≈ 8° dal contratto)
//   · storno 100 % se il cliente non supera 3 fatture di fornitura
// Mesi seminati: 2026-07 e 2026-08 (produzione S4 partita a fine luglio).
// Idempotente: un mese con pay_piste s4 già presenti viene SALTATO.
// Lancio: node seed_s4_tabellare.js
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

const BRAND = "s4";
const MESI = ["2026-07-01", "2026-08-01"];
const PISTA = { chiave: "energia", nome: "Energia", um: "pezzi", ordine: 1 };   // 1 pezzo = 1 PDP (POD o PDR)
const SOGLIE = [
  { tier: 1, soglia_da: 0, soglia_a: 74 },
  { tier: 2, soglia_da: 75, soglia_a: 149 },
  { tier: 3, soglia_da: 150, soglia_a: null },
];
const RIGA = {
  pista: "energia", nome: "CTE Smart · Domestici (Luce/Gas)",
  tipo_cliente: "Consumer", categoria: null, prodotto: null, offerta: "Domestici Smart",
  punti: 1, pay_base: 100, pay_tiers: [100, 130, 140], gettone: false, attivo: true, ordine: 1,
  note: "Gettone CTE Smart residenziale, 1 PDP = 1 punto (bollettino o RID: identico). " +
    "Canvass mese non cumulabile: ≥75 PDP del mese → 130 €, ≥150 → 140 €, retroattivo su tutti i PDP. " +
    "In più ricorrente 4 €/PDP/mese dal 6° mese di fornitura (≈ 8° mese dal contratto — il POD entra in fornitura dopo ~2 mesi). " +
    "Storno 100 % se il cliente non supera 3 fatture. Fonte: Piano Luca Perrotta 2026.",
};

(async () => {
  await client.connect();

  // dump di sicurezza dello stato pay S4 PRIMA del seed (prassi runner)
  const dump = {};
  for (const t of ["pay_piste", "pay_soglie", "pay_righe"]) {
    const { rows } = await client.query(`select * from ${t} where brand=$1`, [BRAND]);
    dump[t] = rows;
  }
  fs.writeFileSync(path.join(__dirname, "dump_s4_pay_pre_seed.json"), JSON.stringify(dump, null, 2));
  console.log("Dump pre-seed:", Object.entries(dump).map(([t, r]) => `${t}=${r.length}`).join(" · "));

  for (const month of MESI) {
    const { rows: [{ n }] } = await client.query(
      "select count(*)::int n from pay_piste where brand=$1 and month=$2 and lato='azienda'", [BRAND, month]);
    if (n > 0) { console.log(`— ${month}: tabellare azienda già presente (${n} piste), salto`); continue; }

    await client.query(
      `insert into pay_piste (brand, month, lato, chiave, nome, um, ordine) values ($1,$2,'azienda',$3,$4,$5,$6)`,
      [BRAND, month, PISTA.chiave, PISTA.nome, PISTA.um, PISTA.ordine]);
    for (const s of SOGLIE)
      await client.query(
        `insert into pay_soglie (brand, month, lato, pista, tier, soglia_da, soglia_a) values ($1,$2,'azienda',$3,$4,$5,$6)`,
        [BRAND, month, PISTA.chiave, s.tier, s.soglia_da, s.soglia_a]);
    await client.query(
      `insert into pay_righe (brand, month, lato, pista, nome, tipo_cliente, categoria, prodotto, offerta,
         punti, pay_base, pay_tiers, gettone, attivo, note, ordine)
       values ($1,$2,'azienda',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [BRAND, month, RIGA.pista, RIGA.nome, RIGA.tipo_cliente, RIGA.categoria, RIGA.prodotto, RIGA.offerta,
        RIGA.punti, RIGA.pay_base, RIGA.pay_tiers, RIGA.gettone, RIGA.attivo, RIGA.note, RIGA.ordine]);
    console.log(`✓ ${month}: seminati pista Energia, 3 soglie (0-74 / 75-149 / 150+), riga CTE Smart 100/130/140`);
  }

  // COLLAUDO contro la produzione vera (perimetro del motore: CTR-, no demo,
  // no nascosta, stati annullati esclusi): copertura riga + tier del mese
  for (const month of MESI) {
    const fine = month.slice(0, 8) + "31";
    const { rows } = await client.query(
      `select prodotto, offerta, tipo_cliente, count(*)::int n from contracts
       where brand ilike 'S4%' and id like 'CTR-%'
         and coalesce(is_demo,false)=false and coalesce(nascosta_gestione,false)=false
         and stato not ilike '%annull%'
         and data >= $1 and data <= $2
       group by 1,2,3 order by n desc`, [month, fine]);
    const tot = rows.reduce((s, r) => s + r.n, 0);
    const coperti = rows.filter(r =>
      String(r.offerta || "").trim().toLowerCase() === "domestici smart" &&
      String(r.tipo_cliente || "").trim().toLowerCase() === "consumer").reduce((s, r) => s + r.n, 0);
    const tier = SOGLIE.filter(s => tot >= s.soglia_da).length ? SOGLIE.reduce((t, s) => tot >= s.soglia_da ? s.tier : t, 0) : 0;
    console.log(`Collaudo ${month.slice(0, 7)}: ${tot} PDP validi, coperti dalla riga ${coperti}, scoperture ${tot - coperti} → soglia S${tier} (pay ${RIGA.pay_tiers[tier - 1] ?? RIGA.pay_base} €/PDP)`);
    rows.forEach(r => console.log(`   ${r.n} × ${r.offerta} · ${r.prodotto} · ${r.tipo_cliente}`));
  }

  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
