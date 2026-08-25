// SPEGNI ONE SHOT — extra gara telefoni Fastweb (direttiva Luca 25/08 sera):
// «eliminiamolo come pay sia lato azienda che ragazzi, lasciamo solo il
// rateizzato». Si spengono le righe gettone «… · One Shot» (il derivato
// ragazzi le perde da solo) e l'opzione di catalogo «One Shot SIM+Device»
// (Registra Vendita smette di proporla; il gruppo modalità resta con
// Rateale Fastweb / Finanziato Findomestic). REGOLA PERMANENTE: nelle
// prossime lettere i pay one shot dei telefoni si IGNORANO.
// Rilanciabile senza danni (update su attivo=true).
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

const OFFERTA_FIN = "2ff10219-1690-406c-b396-9a39a945f495";

(async () => {
  await client.connect();
  const { rows: pre } = await client.query(
    "select nome, opzione, attivo from pay_righe where brand='fastweb' and month='2026-08-01' and lato='azienda' and opzione like '%One Shot SIM+Device'");
  let dumpFile = path.join(__dirname, "dump_fastweb_oneshot_pre.json");
  if (fs.existsSync(dumpFile)) dumpFile = dumpFile.replace(/\.json$/, `_${Date.now()}.json`);
  fs.writeFileSync(dumpFile, JSON.stringify(pre, null, 1));

  try {
    await client.query("begin");
    const r1 = await client.query(
      `update pay_righe set attivo=false,
         note='One shot escluso (Luca 25/08): si paga solo il rateale/finanziato — nelle prossime lettere i pay one shot si ignorano.'
       where brand='fastweb' and month='2026-08-01' and lato='azienda' and opzione like '%One Shot SIM+Device' and attivo=true`);
    const r2 = await client.query(
      "update catalog_opzioni set attivo=false where offerta_id=$1 and nome='One Shot SIM+Device'", [OFFERTA_FIN]);
    await client.query("commit");
    console.log(`righe one shot spente: ${r1.rowCount} · opzione catalogo spenta: ${r2.rowCount}`);
  } catch (e) {
    await client.query("rollback");
    console.error("ROLLBACK:", e.message);
    process.exitCode = 1; await client.end(); return;
  }
  const { rows: post } = await client.query(
    "select nome, attivo from pay_righe where brand='fastweb' and month='2026-08-01' and lato='azienda' and pista='telefoni' order by ordine");
  for (const r of post) console.log(` ${r.attivo ? "●" : "○"} ${r.nome}`);
  await client.end();
})();
