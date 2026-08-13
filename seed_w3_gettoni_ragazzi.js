// GETTONI W3 + LATO RAGAZZI A % (cantiere Gare da zero, 13/08/2026 notte)
// ① Compenso contrattuale (lettera): componenti flat additive —
//    mobile Untied 1€ / Tied 5€ · fisso 23€ / convergenti 19€ / Voce Casa 17€
// ② Pista 'cb' (Customer Base) coi gettoni € per evento dalla lettera,
//    agganciati alle offerte CL* del catalogo; Caring = 0€ (esclusa dalla
//    remunerazione per lettera). CL3/CL3 EP consumer, Special SOS e Add-On
//    NON seminati: importi non deducibili → restano scoperture visibili.
// ③ Pista 'protetti' (W3 Protetti): solo la pista per la % ai ragazzi —
//    gli importi kit (110-380 €) dipendono da kit+finanziamento, righe dopo.
// ④ soglie_max=3 su mobile/fisso azienda → il derivato ragazzi vede S1-S3.
// ⑤ Pulizia residui ragazzi W3 (soglie 550/810/940 e 210/330/400 + 36 righe
//    orfane del vecchio schema): sono LORO a coprire le soglie derivate —
//    dump prima di cancellare.
// Lancio: node seed_w3_gettoni_ragazzi.js   (dalla cartella del CRM)
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

const MONTH = "2026-08-01";

// componenti flat: [pista, componente, nome, pay_base, ordine, note]
const CONTRATTUALI = [
  ["mobile", "contrattuale_untied", "+ Compenso contrattuale Untied", 1, 5, null],
  ["mobile", "contrattuale_tied", "+ Compenso contrattuale Tied", 5, 6, null],
  ["fisso", "contrattuale", "+ Compenso contrattuale fisso", 23, 17, "23€ incl. FWA Indoor 2P & Outdoor 1ª linea; la 2ª linea Professional vale 10€ (regola in analisi)."],
  ["fisso", "contrattuale_conv", "+ Compenso contrattuale convergenti", 19, 18, null],
  ["fisso", "contrattuale_voce", "+ Compenso contrattuale Voce Casa", 17, 19, "Vale anche per FWA 2ª casa (regola in analisi)."],
];

// gettoni Customer Base: [tipo_cliente, prodotto, offerta, €, nome, note]
const CB = [
  ["Consumer", "Cambio Offerta", "CL0", 3, "Cambio offerta CL0", "Lettera: MIA Untied cluster 0 → 3€ (con OTP 4€ easy pay)."],
  ["Consumer", "Cambio Offerta", "CL1", 8, "Cambio offerta CL1", null],
  ["Consumer", "Cambio Offerta", "CL2", 16, "Cambio offerta CL2", null],
  ["Consumer", "Cambio Offerta", "CL1 EP", 12, "Cambio offerta CL1 Easy Pay", null],
  ["Consumer", "Cambio Offerta", "CL2 EP", 21, "Cambio offerta CL2 Easy Pay", null],
  ["Consumer", "Cambio Offerta", "Migrazione FTTH", 40, "Migrazione CB verso fibra FTTH", null],
  ["Consumer", "Cambio Offerta", "Caring", 0, "Offerta Caring", "Esclusa dalla remunerazione per lettera (0€), conta 1 punto Partnership."],
  ["Business", "Cambio Offerta", "CL0", 20, "Cambio offerta Microbusiness CL0", "Lettera: cambio offerta microbusiness con OTP → 20€ flat."],
  ["Business", "Cambio Offerta", "CL1", 20, "Cambio offerta Microbusiness CL1", null],
  ["Business", "Cambio Offerta", "CL2", 20, "Cambio offerta Microbusiness CL2", null],
  ["Business", "Cambio Offerta", "CL3", 20, "Cambio offerta Microbusiness CL3", null],
  ["Business", "Cambio Offerta", "Caring", 0, "Offerta Caring business", "Esclusa dalla remunerazione per lettera (0€)."],
];

(async () => {
  await client.connect();

  // ⑤ dump + pulizia residui ragazzi
  const dumpS = await client.query(`select * from pay_soglie where brand='windtre' and month=$1 and lato='ragazzi'`, [MONTH]);
  const dumpR = await client.query(`select * from pay_righe where brand='windtre' and month=$1 and lato='ragazzi'`, [MONTH]);
  fs.writeFileSync(path.join(__dirname, "dump_w3_ragazzi_pre_pulizia.json"),
    JSON.stringify({ soglie: dumpS.rows, righe: dumpR.rows }, null, 2));
  console.log(`Dump ragazzi: ${dumpS.rows.length} soglie + ${dumpR.rows.length} righe → dump_w3_ragazzi_pre_pulizia.json`);

  await client.query("begin");
  try {
    const delS = await client.query(`delete from pay_soglie where brand='windtre' and month=$1 and lato='ragazzi'`, [MONTH]);
    const delR = await client.query(`delete from pay_righe where brand='windtre' and month=$1 and lato='ragazzi'`, [MONTH]);
    console.log(`puliti residui ragazzi: ${delS.rowCount} soglie, ${delR.rowCount} righe`);

    // ④ soglie ragazzi = prime 3 della scala azienda
    const up = await client.query(
      `update pay_piste set soglie_max=3 where brand='windtre' and month=$1 and lato='azienda' and chiave in ('mobile','fisso')`, [MONTH]);
    console.log("soglie_max=3 su:", up.rowCount, "piste");

    // ① contrattuali (guardia anti-doppio)
    const giaC = await client.query(
      `select count(*)::int as n from pay_righe where brand='windtre' and month=$1 and componente like 'contrattuale%'`, [MONTH]);
    if (giaC.rows[0].n > 0) console.log(`contrattuali già presenti (${giaC.rows[0].n}) — skip`);
    else {
      for (const [pista, comp, nome, eur, ordine, note] of CONTRATTUALI) {
        await client.query(
          `insert into pay_righe (brand, month, lato, pista, componente, nome, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, ordine, note)
           values ('windtre', $1, 'azienda', $2, $3, $4, false, 0, $5, '{}', true, true, $6, $7)`,
          [MONTH, pista, comp, nome, eur, ordine, note]);
      }
      console.log("componenti contrattuali inserite:", CONTRATTUALI.length);
    }

    // ② + ③ piste cb e protetti (se mancano)
    for (const [chiave, nome, ordine] of [["cb", "Customer Base", 6], ["protetti", "W3 Protetti", 7]]) {
      const c = await client.query(
        `select count(*)::int as n from pay_piste where brand='windtre' and month=$1 and lato='azienda' and chiave=$2`, [MONTH, chiave]);
      if (c.rows[0].n === 0) {
        await client.query(
          `insert into pay_piste (brand, month, lato, chiave, nome, um, ordine) values ('windtre', $1, 'azienda', $2, $3, 'pezzi', $4)`,
          [MONTH, chiave, nome, ordine]);
        console.log("pista creata:", chiave);
      } else console.log("pista già presente:", chiave);
    }
    const giaCB = await client.query(
      `select count(*)::int as n from pay_righe where brand='windtre' and month=$1 and pista='cb'`, [MONTH]);
    if (giaCB.rows[0].n > 0) console.log(`righe cb già presenti (${giaCB.rows[0].n}) — skip`);
    else {
      let i = 0;
      for (const [tc, prod, off, eur, nome, note] of CB) {
        await client.query(
          `insert into pay_righe (brand, month, lato, pista, nome, tipo_cliente, prodotto, offerta, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, ordine, note)
           values ('windtre', $1, 'azienda', 'cb', $2, $3, $4, $5, false, 0, $6, '{}', true, true, $7, $8)`,
          [MONTH, nome, tc, prod, off, eur, ++i, note]);
      }
      console.log("gettoni Customer Base inseriti:", CB.length);
    }
    await client.query("commit");
  } catch (e) { await client.query("rollback"); throw e; }

  const post = await client.query(
    `select pista, count(*)::int as n from pay_righe where brand='windtre' and month=$1 and lato='azienda' group by pista order by pista`, [MONTH]);
  console.log("=== righe azienda per pista ===");
  post.rows.forEach(r => console.log(" ", r.pista || "(fuori pista)", r.n));
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
