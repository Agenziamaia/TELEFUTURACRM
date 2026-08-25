// GARE FASTWEB — ENERGIA a norma della lettera «TELEFUTURA 2 - GARA FASTWEB
// ENERGY (2026 08).pdf» (Fastweb, 4/08/2026, arrivata in cartella il 25/08).
// Cantiere gare Fastweb (terminal FW, 25/08/2026).
//
// Prima (seed 11/08, gettoni flat fuori pista): Gas 90 · Energy Core 150 ·
// Energy Flex 70 · Energy Fix 70. La lettera invece paga:
//   · LUCE RESIDENZIALE a scaglioni sul totale pda luce del mese
//     (2-4 / 5-12 / 13-20 / 21-35 / 36-61 / 62+), importo per pda
//     «comprensivo di base e gara»: Core 130→190, Flex 100→160, Fix 90→150,
//     «di cui base» 70 (= sotto la 1ª soglia resta la base) — più 30 € a pda
//     a M+6 (solo nota: cantiere analisi/ricorrenti)
//   · LUCE BUSINESS: ≥2 pda → 150 a pda (base 80), M+6 40 (nota)
//   · GAS RESIDENZIALE: ≥1 pda → 100 (di cui base 60) = con una pda la soglia
//     è già presa: resta un gettone, importo 90 → 100; M+6 10 (nota)
//   · GAS BUSINESS: ≥1 → 140 — OGGI NON REGISTRABILE (il prodotto Gas
//     Business non ha offerte a catalogo): niente riga, segnalato a Luca
// Conteggio gara: pda «Check OK» (luce) / attivate (gas) a M+1; Placet
// escluse (non a catalogo). Compensi M+6 mai nel tabellare: solo note.
//
// Idempotente: se la pista fastweb 'luce' di agosto esiste già, esce.
// Dump di sicurezza mai sovrascritto (suffisso orario se il file esiste).
// Lancio: NODE_PATH=<dir con pg> node seed_fastweb_energia.js
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

const BRAND = "fastweb";
const MONTH = "2026-08-01";
const LATO = "azienda";

const PISTE = [
  // ordine: fisso 1 · business_fisso 2 · mobile 3 (esistenti)
  { chiave: "luce", nome: "Energy Luce", um: "pezzi", ordine: 4 },
  { chiave: "luce_business", nome: "Energy Luce Business", um: "pezzi", ordine: 5 },
];
const SOGLIE = [
  { pista: "luce", tier: 1, soglia_da: 2, soglia_a: 4 },
  { pista: "luce", tier: 2, soglia_da: 5, soglia_a: 12 },
  { pista: "luce", tier: 3, soglia_da: 13, soglia_a: 20 },
  { pista: "luce", tier: 4, soglia_da: 21, soglia_a: 35 },
  { pista: "luce", tier: 5, soglia_da: 36, soglia_a: 61 },
  { pista: "luce", tier: 6, soglia_da: 62, soglia_a: null },
  { pista: "luce_business", tier: 1, soglia_da: 2, soglia_a: null },
];

const NOTA_LUCE = "Lettera Energy agosto: importo comprensivo di base e gara, «di cui base» 70 sotto la 1ª soglia. " +
  "Contano le pda in «Check OK» a M+1; escluse le Luce Placet (non a catalogo). " +
  "In più 30 €/pda a M+6 (solo nota: cantiere analisi). " +
  "La lettera fa concorrere res+soho allo scaglione: qui la scala conta la pista luce residenziale (business a parte) — se serve il conteggio unico lo dice Luca.";
// UPDATE delle righe residenziali esistenti (erano gettoni flat)
const LUCE_RES = [
  { offerta: "Energy Core", base: 70, tiers: [130, 150, 160, 170, 180, 190] },
  { offerta: "Energy Flex", base: 70, tiers: [100, 120, 130, 140, 150, 160] },
  { offerta: "Energy Fix", base: 70, tiers: [90, 110, 120, 130, 140, 150] },
];
const RIGA_LUCE_BIZ = {
  pista: "luce_business", nome: "Energy Luce · Business",
  tipo_cliente: "Business", categoria: "Energia", prodotto: "Luce", offerta: null,
  punti: 1, pay_base: 80, pay_tiers: [150], gettone: false, attivo: true, ordine: 10,
  note: "Lettera Energy agosto, Tabella 2: ≥2 pda business luce → 150 a pda (di cui base 80 sotto). " +
    "Vale per tutte le offerte business luce a catalogo (oggi Energy Flex/Fix). M+6: 40 €/pda (solo nota).",
};
const NOTA_GAS = "Lettera Energy agosto, Tabella 3: gas residenziale ≥1 pda → 100 € (di cui base 60) — " +
  "con una pda la soglia è già presa, quindi resta un gettone pieno. Contano le pda attivate a M+1; Gas Placet escluse. " +
  "M+6: 10 €/pda (solo nota). Gas business (140 €, Tabella 4) oggi non registrabile: il prodotto a catalogo non ha offerte.";

(async () => {
  await client.connect();

  // dump di sicurezza PRIMA di toccare (mai sovrascritto)
  const dump = {};
  for (const t of ["pay_piste", "pay_soglie", "pay_righe"]) {
    const { rows } = await client.query(`select * from ${t} where brand=$1`, [BRAND]);
    dump[t] = rows;
  }
  let dumpFile = path.join(__dirname, "dump_fastweb_pay_pre_energia.json");
  if (fs.existsSync(dumpFile)) dumpFile = dumpFile.replace(/\.json$/, `_${Date.now()}.json`);
  fs.writeFileSync(dumpFile, JSON.stringify(dump, null, 2));
  console.log("Dump pre-modifica:", path.basename(dumpFile),
    Object.entries(dump).map(([t, r]) => `${t}=${r.length}`).join(" · "));

  const { rows: [{ n }] } = await client.query(
    "select count(*)::int n from pay_piste where brand=$1 and month=$2 and lato=$3 and chiave='luce'",
    [BRAND, MONTH, LATO]);
  if (n > 0) { console.log("Pista luce già presente: niente da fare."); await client.end(); return; }

  try {
    await client.query("begin");

    for (const p of PISTE) {
      await client.query(
        "insert into pay_piste (brand, month, chiave, nome, um, ordine, lato) values ($1,$2,$3,$4,$5,$6,$7)",
        [BRAND, MONTH, p.chiave, p.nome, p.um, p.ordine, LATO]);
    }
    for (const s of SOGLIE) {
      await client.query(
        "insert into pay_soglie (brand, month, pista, tier, soglia_da, soglia_a, lato) values ($1,$2,$3,$4,$5,$6,$7)",
        [BRAND, MONTH, s.pista, s.tier, s.soglia_da, s.soglia_a, LATO]);
    }
    // le tre residenziali: da gettone flat a righe di pista con scala
    for (const r of LUCE_RES) {
      const res = await client.query(
        `update pay_righe set pista='luce', gettone=false, pay_base=$1, pay_tiers=$2, punti=1, note=$3
         where brand=$4 and month=$5 and lato=$6 and offerta=$7 and categoria='Energia' and tipo_cliente='Consumer'`,
        [r.base, r.tiers, NOTA_LUCE, BRAND, MONTH, LATO, r.offerta]);
      if (res.rowCount !== 1) throw new Error(`update ${r.offerta}: attese 1 riga, toccate ${res.rowCount}`);
    }
    const biz = RIGA_LUCE_BIZ;
    await client.query(
      `insert into pay_righe (brand, month, lato, pista, nome, tipo_cliente, categoria, prodotto, offerta,
        punti, pay_base, pay_tiers, gettone, attivo, ordine, note)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [BRAND, MONTH, LATO, biz.pista, biz.nome, biz.tipo_cliente, biz.categoria, biz.prodotto, biz.offerta,
        biz.punti, biz.pay_base, biz.pay_tiers, biz.gettone, biz.attivo, biz.ordine, biz.note]);
    const gas = await client.query(
      `update pay_righe set pay_base=100, note=$1
       where brand=$2 and month=$3 and lato=$4 and offerta='Gas' and categoria='Energia' and tipo_cliente='Consumer'`,
      [NOTA_GAS, BRAND, MONTH, LATO]);
    if (gas.rowCount !== 1) throw new Error(`update Gas: attese 1 riga, toccate ${gas.rowCount}`);

    await client.query("commit");
    console.log("Commit ok.");
  } catch (e) {
    await client.query("rollback");
    console.error("ROLLBACK:", e.message);
    process.exitCode = 1;
    await client.end();
    return;
  }

  // riletture di controllo
  const { rows: piste } = await client.query(
    "select chiave, nome, um, ordine from pay_piste where brand=$1 and month=$2 and lato=$3 order by ordine", [BRAND, MONTH, LATO]);
  console.log("Piste:", piste.map(p => `${p.chiave}(${p.um})`).join(" · "));
  const { rows: righe } = await client.query(
    `select pista, nome, pay_base, pay_tiers, gettone from pay_righe
     where brand=$1 and month=$2 and lato=$3 and (pista in ('luce','luce_business') or categoria='Energia') order by pista nulls last, ordine, nome`,
    [BRAND, MONTH, LATO]);
  for (const r of righe) console.log(` ${r.pista || "(gettone)"} | ${r.nome} | base=${r.pay_base} tiers=[${r.pay_tiers}]${r.gettone ? " GETTONE" : ""}`);
  await client.end();
})();
