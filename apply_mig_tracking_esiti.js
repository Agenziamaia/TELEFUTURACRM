// RIPRISTINO SEED tracking_esiti (esiti negozio del Tracking PDA).
// Serve SOLO a tabella vuota (e' il comando suggerito dal pannello
// Amministrazione → Tracking PDA in quel caso): risemina la fotografia
// storica delle liste, POI toglie le 4 categorie fuori dal perimetro del
// Tracking (mobile/digitale/multi_servizi/pos — riordino Luca 10/08).
// NB: le personalizzazioni fatte dal pannello (rinomine, liste per brand,
// "Attivo" al posto di "Completato" sul fisso) NON vengono ricreate.
// Lancio: node apply_mig_tracking_esiti.js
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
const FILE = "20260810210000_tracking_esiti.sql";
(async () => {
  await client.connect();
  const gia = (await client.query(`select count(*)::int n from tracking_esiti`)).rows[0].n;
  if (gia > 0) {
    console.log(`tracking_esiti ha gia' ${gia} righe: niente da fare (il seed serve solo a tabella VUOTA).`);
    await client.end(); return;
  }
  // Lo schema e' evoluto dopo questo seed (colonne lato/brand, indice unico
  // con COALESCE al posto di UNIQUE(categoria,chiave)): l'ON CONFLICT del
  // file non corrisponde piu' a nessun indice e farebbe FALLIRE l'insert.
  // Su tabella vuota non serve: lo si toglie al volo.
  const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", FILE), "utf8")
    .replace(/ON CONFLICT \(categoria, chiave\) DO NOTHING/g, "");
  await client.query("begin");
  try {
    await client.query(sql);
    const morte = await client.query(
      `delete from tracking_esiti where categoria in ('mobile','digitale','multi_servizi','pos')`);
    await client.query("commit");
    console.log("OK  ", FILE, `(+ ${morte.rowCount} righe di categorie fuori tracking rimosse)`);
  } catch (e) { await client.query("rollback"); console.error("FAIL", FILE, "→", e.message); process.exit(1); }
  console.log("--- VERIFICHE ---");
  const perCat = (await client.query(
    `select categoria, count(*) n, count(*) filter (where completata) compl
     from tracking_esiti group by categoria order by categoria`)).rows;
  perCat.forEach(r => console.log(`  ${r.categoria.padEnd(14)} → ${r.n} esiti, ${r.compl} completata`));
  const tot = (await client.query(`select count(*) n, count(*) filter (where completata) c from tracking_esiti`)).rows[0];
  console.log(`totale: ${tot.n} esiti (attesi 62 = 90 del seed meno le 4 categorie fuori tracking)`);
  console.log(`NB: gli esiti ADMIN (mig 20260811060000) hanno il loro runner; le personalizzazioni del pannello vanno rifatte a mano.`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
