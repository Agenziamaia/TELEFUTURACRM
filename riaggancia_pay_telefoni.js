// Dopo la migrazione del catalogo: le righe di pay si riagganciano ai NOMI VERI
// delle opzioni (prima usavano token sintetici ricavati dal nome offerta, che
// ora non esiste più). Più le altre decisioni di Luca del 26/08 sera:
//   · gettone device ai ragazzi al 100%
//   · add-on tutti a 2 €, nessun punto
//   · il campo «Importo Rata» acceso e ribattezzato «Rata mensile» (il CRM
//     diventerà cassa e leggerà la PDA: l'importo serve averlo)
// Idempotente. Lancio: NODE_PATH=<dir pg> node riaggancia_pay_telefoni.js
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

const B = "windtre", M = "2026-08-01", L = "azienda";
const RATA0 = "Rata mensile 0 €", RATAX = "Rata mensile oltre 0 €";

// vecchio token → nuovo nome di opzione
const RIMPIAZZI = [
  ["Imp.agg. 0", RATA0], ["Imp.agg. >0", RATAX],
  ["Fin. Findomestic", "Findomestic"], ["Fin. Compass", "Compass"],
];

(async () => {
  await client.connect();
  try {
    await client.query("begin");

    // ① righe di pay: i token spariscono, restano i nomi delle opzioni vere
    let n = 0;
    for (const [vecchio, nuovo] of RIMPIAZZI) {
      const r = await client.query(
        `update pay_righe set opzione = replace(opzione, $4, $5)
         where brand=$1 and month=$2 and lato=$3 and opzione like '%' || $4 || '%'`,
        [B, M, L, vecchio, nuovo]);
      n += r.rowCount;
    }
    // l'offerta non serve più come ancora: la finanziaria ora è un'opzione
    await client.query(
      `update pay_righe set offerta=null where brand=$1 and month=$2 and lato=$3
         and categoria='Telefono a Rate' and offerta is not null`, [B, M, L]);

    // ② gettone device ai ragazzi al 100% (Luca 26/08: «deve essere al 100%»)
    const dev = await client.query(
      "update pay_piste set perc_ragazzi=100 where brand=$1 and month=$2 and lato=$3 and chiave='device'", [B, M, L]);

    // ③ add-on: tutti 2 €, nessun punto (Luca 26/08)
    const { rows: [o] } = await client.query(
      "select coalesce(max(ordine),900)+1 ord from pay_righe where brand=$1 and month=$2 and lato=$3 and pista='cb'", [B, M, L]);
    let ord = Number(o.ord), addOn = 0;
    for (const [nome, tipo, off] of [
      ["Add-On CB · Fissi", "Consumer", "Fissi"],
      ["Add-On CB · business", "Business", "Add-On"],
    ]) {
      const { rows: [{ c }] } = await client.query(
        "select count(*)::int c from pay_righe where brand=$1 and month=$2 and lato=$3 and nome=$4", [B, M, L, nome]);
      if (c) continue;
      await client.query(
        `insert into pay_righe (brand, month, lato, pista, nome, tipo_cliente, categoria, prodotto, offerta,
           punti, pay_base, pay_tiers, gettone, moltiplicatore, attivo, ordine, note, brand_vendita)
         values ($1,$2,$3,'cb',$4,$5,'Customer Base','Add-On',$6,0,2,'{}',true,false,true,$7,$8,$1)`,
        [B, M, L, nome, tipo, off, ord++, "Luca 26/08: «gli add-on considerali tutti a 2 € e non generano punti di nessun tipo». In lettera gli add-on ricorrenti a pagamento valgono 2 € sotto i 9,99 € di canone e 5 € sopra, ma il canone dell'add-on non lo registriamo: 2 € è la scelta di Luca."]);
      addOn++;
    }

    // ④ il campo dell'importo: acceso e ribattezzato per i ragazzi
    const { rows: regole } = await client.query(
      "select id, campi from catalog_campi_regole where condizioni->'categoria' ? 'Telefono a Rate'");
    let campi = 0;
    for (const r of regole) {
      const arr = r.campi || [];
      let tocco = false;
      for (const c of arr) {
        if (c.nome === "Importo Rata" || c.nome === "Rata mensile") {
          if (c.nome !== "Rata mensile" || c.attivo !== true) tocco = true;
          c.nome = "Rata mensile"; c.attivo = true;
          c.nota = c.nota || "quanto paga il cliente ogni mese per il telefono (0 se incluso)";
        }
      }
      if (tocco) {
        await client.query("update catalog_campi_regole set campi=$2 where id=$1", [r.id, JSON.stringify(arr)]);
        campi++;
      }
    }
    // lo storico del campo segue il nuovo nome
    const stor = await client.query(
      `update contracts set dettagli = (dettagli - 'Importo Rata') || jsonb_build_object('Rata mensile', dettagli->'Importo Rata')
       where brand='WindTre' and dettagli ? 'Importo Rata'`);
    // le due regole per-offerta puntavano a nomi che non esistono più
    const via = await client.query(
      "delete from catalog_campi_regole where etichetta like '%Rata Smart — Finanziato%'");

    await client.query("commit");
    console.log(`ancore aggiornate: ${n} righe · pista device ai ragazzi: ${dev.rowCount} · add-on creati: ${addOn}`);
    console.log(`regole campo aggiornate: ${campi} · storico «Importo Rata»→«Rata mensile»: ${stor.rowCount} · regole obsolete rimosse: ${via.rowCount}`);
  } catch (e) {
    await client.query("rollback");
    console.error("ROLLBACK:", e.message);
    process.exitCode = 1; await client.end(); return;
  }

  const { rows } = await client.query(
    `select pista, nome, prodotto, opzione, pay_base, punti from pay_righe
     where brand=$1 and month=$2 and lato=$3 and attivo and categoria='Telefono a Rate'
     order by pista, ordine`, [B, M, L]);
  console.log("\nRIGHE TELEFONO:");
  for (const r of rows)
    console.log(`  [${String(r.pista).padEnd(13)}] ${r.nome.padEnd(46)} ${String(r.prodotto).padEnd(14)} ${String(r.opzione).padEnd(38)} ${r.pay_base != null ? r.pay_base + " €" : r.punti + " pz"}`);
  await client.end();
})();
