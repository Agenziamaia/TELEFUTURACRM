// BOOST SIM BUSINESS che PAGANO davvero (revisore 26/08 + direttiva Luca
// 25/08: «implementali lato azienda, la % ai ragazzi a zero»).
// Erano righe documentali spente perché il pick-one non sapeva sommare: ora
// esiste `componente='extra_opzione'` e si accendono per davvero.
//   · +50 € sim business con fisso contestuale → si attiva dall'opzione
//     «Wireline contestuale» (quella che il pop-up spunta sulla sim)
//   · +25 € sim business in MNP → per CONDIZIONI (prodotto Mobile MNP): le
//     provenienze Vodafone sono già escluse dal perimetro a monte
// Entrambe in pista `boost_business` con perc_ragazzi = 0 → restano
// solo-azienda: il derivato ragazzi non le vede (come chiesto).
// Inoltre, dai rilievi del revisore:
//   · «Protect · Mobile business» perde il vincolo di categoria (le vendite
//     senza categoria_catalogo perdevano i 40 €)
//   · eccezione «Casa Ultra = 0» (la lettera paga Protect solo su Start/Pro:
//     l'eccezione mobile era ancorata a «Ultra», il fisso si chiama diverso)
// Rilanciabile. Lancio: NODE_PATH=<dir pg> node fix_fastweb_boost_extra.js
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

(async () => {
  await client.connect();
  const { rows: pre } = await client.query(
    "select nome, attivo, componente, opzione, categoria, pay_base from pay_righe where brand=$1 and month=$2 and lato=$3 and (pista='boost_business' or componente='extra_opzione')", [B, M, L]);
  let dumpFile = path.join(__dirname, "dump_fastweb_boost_pre.json");
  if (fs.existsSync(dumpFile)) dumpFile = dumpFile.replace(/\.json$/, `_${Date.now()}.json`);
  fs.writeFileSync(dumpFile, JSON.stringify(pre, null, 1));
  console.log("Dump:", path.basename(dumpFile), `(${pre.length} righe)`);

  try {
    await client.query("begin");

    // ① boost +50: si accende dall'opzione «Wireline contestuale»
    const r1 = await client.query(
      `update pay_righe set componente='extra_opzione', attivo=true, gettone=true, pay_base=50, ordine=10,
         note='Lettera mobile, regola 10: +50 € per la sim business venduta contestualmente a un fisso. Si accende dall''opzione «Wireline contestuale» sulla sim (il pop-up di Registra Vendita la spunta da solo). Pista solo-azienda: % ai ragazzi 0.'
       where brand=$1 and month=$2 and lato=$3 and nome='Sim business · wireline contestuale (+50)'`, [B, M, L]);

    // ② boost +25: per condizioni (prodotto Mobile MNP business)
    const r2 = await client.query(
      `update pay_righe set componente='extra_opzione', attivo=true, gettone=true, pay_base=25, opzione=null, ordine=11,
         note='Lettera mobile, regola 11: +25 € per la sim business in MNP (le provenienze Vodafone sono già fuori dal perimetro di gara). Si somma al pay dell''offerta. Pista solo-azienda: % ai ragazzi 0.'
       where brand=$1 and month=$2 and lato=$3 and nome='Sim business · mnp no Vodafone (+25)'`, [B, M, L]);

    // ③ Protect business senza vincolo di categoria (rilievo revisore: le
    //    vendite prive di categoria_catalogo perdevano i 40 €)
    const r3 = await client.query(
      `update pay_righe set categoria=null where brand=$1 and month=$2 and lato=$3 and nome='🛡 Protect · Mobile business'`, [B, M, L]);

    // ④ eccezione Casa Ultra (fisso): la lettera paga solo Start/Pro
    const { rows: [{ n }] } = await client.query(
      "select count(*)::int n from pay_righe where brand=$1 and month=$2 and lato=$3 and nome=$4", [B, M, L, "🛡 Protect · Casa Ultra = 0 (esclusa dalla lettera)"]);
    if (!n) await client.query(
      `insert into pay_righe (brand, month, lato, pista, nome, tipo_cliente, categoria, prodotto, offerta, opzione,
         componente, brand_vendita, punti, pay_base, pay_tiers, gettone, attivo, ordine, note)
       values ($1,$2,$3,'fisso','🛡 Protect · Casa Ultra = 0 (esclusa dalla lettera)','Consumer','Fisso','Fisso','Casa Ultra','Protect','extra_opzione','fastweb',0,0,'{0,0,0,0,0,0,0,0}',false,true,76,
         'Eccezione come per la Ultra mobile: la lettera paga Protect sul fisso solo su Casa Start e Casa Pro. Oggi l''opzione non è a catalogo su Casa Ultra — la riga è la rete di sicurezza se venisse aggiunta.')`,
      [B, M, L]);

    await client.query("commit");
    console.log(`boost +50: ${r1.rowCount} · boost +25: ${r2.rowCount} · Protect business senza categoria: ${r3.rowCount} · eccezione Casa Ultra: ${n ? "già c'era" : "creata"}`);
  } catch (e) {
    await client.query("rollback");
    console.error("ROLLBACK:", e.message);
    process.exitCode = 1; await client.end(); return;
  }

  const { rows: post } = await client.query(
    `select nome, pista, attivo, componente, opzione, tipo_cliente, categoria, prodotto, offerta, pay_base
     from pay_righe where brand=$1 and month=$2 and lato=$3 and componente='extra_opzione' order by ordine`, [B, M, L]);
  for (const r of post) console.log(` ${r.attivo ? "●" : "○"} ${r.nome} [${r.pista}] ${r.tipo_cliente || "-"}/${r.categoria || "-"}/${r.prodotto || "-"}/${r.offerta || "-"} opz=${r.opzione || "—"} base=${r.pay_base}`);
  await client.end();
})();
