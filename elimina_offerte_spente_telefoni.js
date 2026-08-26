// Le 34 offerte vecchie del telefono a rate W3, spente dalla migrazione, non
// hanno più NIENTE agganciato: si eliminano (Luca 26/08: «se le hai migrate
// correttamente e nessuna ha più vendite, toglile dal catalogo, per linearità
// e per evitare confusione»).
//
// Prima di cancellare si ricontrolla riga per riga, dentro la stessa
// transazione: nessuna vendita con quel nome offerta, nessuna riga di pay che
// la usa come ancora, nessuna regola dei campi che la nomina. Se anche una
// sola non è libera, ROLLBACK di tutto.
//
// Idempotente. Lancio: NODE_PATH=<dir pg> node elimina_offerte_spente_telefoni.js
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

const CAT = "Telefono a Rate";

(async () => {
  await client.connect();
  const { rows: cand } = await client.query(
    `select o.id, o.nome, p.nome prodotto, p.tipo_cliente,
            (select count(*) from catalog_opzioni z where z.offerta_id = o.id) opzioni
     from catalog_offerte o
     join catalog_prodotti p on p.id = o.prodotto_id
     join catalog_categorie c on c.id = p.categoria_id
     where p.brand_id='windtre' and c.nome=$1 and o.attivo = false
     order by p.nome, o.nome`, [CAT]);
  if (!cand.length) { console.log("niente da eliminare: già pulito"); await client.end(); return; }

  const stamp = Date.now();
  const { rows: opzPre } = await client.query(
    "select * from catalog_opzioni where offerta_id = any($1::uuid[])", [cand.map(r => r.id)]);
  fs.writeFileSync(path.join(__dirname, `dump_offerte_spente_${stamp}.json`),
    JSON.stringify({ offerte: cand, opzioni: opzPre }, null, 1));
  console.log(`Dump: ${cand.length} offerte + ${opzPre.length} opzioni → dump_offerte_spente_${stamp}.json\n`);

  try {
    await client.query("begin");
    let via = 0;
    for (const o of cand) {
      // ricontrollo dentro la transazione, così nessuno può infilare una
      // vendita fra il controllo e la cancellazione
      const { rows: [{ n: vendite }] } = await client.query(
        `select count(*)::int n from contracts
         where brand='WindTre' and prodotto=$1 and offerta=$2 and dettagli->>'categoria_catalogo'=$3`,
        [o.prodotto, o.nome, CAT]);
      const { rows: [{ n: pay }] } = await client.query(
        "select count(*)::int n from pay_righe where brand='windtre' and offerta=$1 and categoria=$2", [o.nome, CAT]);
      const { rows: [{ n: reg }] } = await client.query(
        "select count(*)::int n from catalog_campi_regole where condizioni->'offerta' ? $1", [o.nome]);
      if (vendite || pay || reg) {
        throw new Error(`«${o.prodotto} / ${o.nome}» non è libera: ${vendite} vendite, ${pay} righe pay, ${reg} regole — non elimino niente`);
      }
      await client.query("delete from catalog_opzioni where offerta_id=$1", [o.id]);
      await client.query("delete from catalog_offerte where id=$1", [o.id]);
      via++;
      console.log(`  🗑️  ${o.prodotto.padEnd(15)} «${o.nome}»  (${o.opzioni} opzioni)`);
    }
    await client.query("commit");
    console.log(`\neliminate: ${via}`);
  } catch (e) {
    await client.query("rollback");
    console.error("ROLLBACK:", e.message);
    process.exitCode = 1; await client.end(); return;
  }

  const { rows } = await client.query(
    `select p.nome prodotto, p.tipo_cliente, o.nome offerta, o.attivo,
            (select count(*) from catalog_opzioni z where z.offerta_id=o.id and z.obbligatoria) obb
     from catalog_offerte o join catalog_prodotti p on p.id=o.prodotto_id
     join catalog_categorie c on c.id=p.categoria_id
     where p.brand_id='windtre' and c.nome=$1 order by p.nome, p.tipo_cliente`, [CAT]);
  console.log("\nCATALOGO «Telefono a Rate» ORA:");
  for (const r of rows)
    console.log(`  ${r.prodotto.padEnd(15)} [${r.tipo_cliente}]  «${r.offerta}»  ${r.obb} scelte obbligatorie  ${r.attivo ? "" : "SPENTA"}`);
  await client.end();
})();
