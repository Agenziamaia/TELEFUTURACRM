// BONIFICA NOMI UNDERGROUND (14/08, trovata da Luca nella scheda Commissioning):
// le 6 Underground esistono DOPPIE a catalogo — versione Wallet con la
// VIRGOLA («Underground 7,99»), versione Ric. Auto col PUNTO («Underground
// 7.99»): caricate in momenti diversi con grafie diverse. Il raggruppamento
// per offerta le vedeva come offerte distinte. Qui si rinominano le versioni
// col punto in virgola (grafia italiana, come le Wallet), dopo il controllo
// che nessuna regola campi/riga pay punti ai nomi col punto.
// Lancio: node fix_catalogo_underground.js   (dalla cartella del CRM)
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

(async () => {
  await client.connect();

  // le voci col punto (solo Underground, solo windtre)
  const punto = await client.query(
    `select o.id, o.nome, o.prodotto_id from catalog_offerte o
     join catalog_prodotti p on p.id = o.prodotto_id
     where p.brand_id='windtre' and o.nome ~ '^Underground [0-9]+\\.[0-9]+$' order by o.nome`);
  if (!punto.rows.length) { console.log("niente da rinominare"); await client.end(); return; }
  fs.writeFileSync(path.join(__dirname, "dump_underground_pre_rinomina.json"), JSON.stringify(punto.rows, null, 2));
  console.log("da rinominare:", punto.rows.map(r => r.nome).join(", "));

  // guardie: regole campi (condizioni jsonb → scan testuale) o righe pay
  // agganciate ai nomi col punto?
  const g1 = await client.query(
    `select count(*)::int as n from catalog_campi_regole where catalog_campi_regole::text ~ 'Underground [0-9]+\\.[0-9]+'`);
  const g2 = await client.query(
    `select count(*)::int as n from pay_righe where offerta ~ '^Underground [0-9]+\\.[0-9]+$'`);
  console.log("riferimenti in catalog_campi_regole:", g1.rows[0].n, "· in pay_righe:", g2.rows[0].n);
  if (g1.rows[0].n > 0 || g2.rows[0].n > 0) { console.log("⚠️ ci sono riferimenti: aggiornare anche quelli — stop"); await client.end(); process.exit(1); }

  await client.query("begin");
  try {
    const upd = await client.query(
      `update catalog_offerte o set nome = replace(o.nome, '.', ',')
       from catalog_prodotti p
       where p.id = o.prodotto_id and p.brand_id='windtre'
         and o.nome ~ '^Underground [0-9]+\\.[0-9]+$'`);
    await client.query("commit");
    console.log("rinominate:", upd.rowCount);
  } catch (e) { await client.query("rollback"); throw e; }

  const post = await client.query(
    `select o.nome, count(*)::int as n from catalog_offerte o
     join catalog_prodotti p on p.id = o.prodotto_id
     where p.brand_id='windtre' and o.nome ilike 'Underground %' and o.attivo
     group by o.nome order by o.nome`);
  console.log("=== Underground a catalogo dopo la bonifica ===");
  post.rows.forEach(r => console.log(" ", r.nome, "(voci:", r.n + ")"));
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
