// CENSIMENTO offerte Casa Start/Pro/Ultra (varianti Conv/Lock In/Mass Market)
// prima della migrazione ai 3 nomi semplici. SOLO LETTURA.
const fs = require("fs"); const path = require("path");
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("pg");
const c = new Client({ host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
(async () => {
  await c.connect();
  console.log("── 1. contracts.offerta (distinct casa*) ──");
  const r1 = await c.query(`select offerta, count(*) n from contracts where offerta ilike '%casa%' group by offerta order by offerta`);
  r1.rows.forEach(r => console.log(`  ${String(r.offerta).padEnd(28)} ${r.n}`));
  console.log("── 2. chiavi di dettagli con valori casa* ──");
  const r2 = await c.query(`
    select j.key, j.value, count(*) n
    from contracts, lateral jsonb_each_text(dettagli) j
    where j.value ilike '%casa start%' or j.value ilike '%casa pro%' or j.value ilike '%casa ultra%'
    group by j.key, j.value order by j.key, j.value`);
  r2.rows.forEach(r => console.log(`  [${r.key}] "${String(r.value).slice(0,50)}" × ${r.n}`));
  console.log("── 3. catalogo offerte casa* (brand, prodotto, id) ──");
  const r3 = await c.query(`
    select o.id, o.nome, o.attivo, p.nome prodotto, p.brand_id
    from catalog_offerte o join catalog_prodotti p on p.id = o.prodotto_id
    where o.nome ilike '%casa%' order by p.brand_id, o.nome`);
  r3.rows.forEach(r => console.log(`  ${String(r.brand_id).padEnd(10)} ${String(r.prodotto).padEnd(14)} ${String(r.nome).padEnd(26)} attivo=${r.attivo} ${r.id}`));
  console.log("── 4. opzioni/regole per offerta casa* ──");
  const r4 = await c.query(`
    select o.nome, o.id, (select count(*) from catalog_opzioni z where z.offerta_id = o.id) opz,
           (select count(*) from catalog_campi_regole cr where cr.offerta_id = o.id) regole
    from catalog_offerte o where o.nome ilike '%casa%' order by o.nome`);
  r4.rows.forEach(r => console.log(`  ${String(r.nome).padEnd(26)} opzioni=${r.opz} regole=${r.regole}`));
  console.log("── 5. pay_righe con offerta casa* (cantiere parallelo) ──");
  try {
    const r5 = await c.query(`select id, pista, nome, offerta from pay_righe where cast(offerta as text) ilike '%casa%' or nome ilike '%casa%'`);
    r5.rows.forEach(r => console.log(`  [${r.pista}] ${r.nome} → offerta=${JSON.stringify(r.offerta)}`));
    if (!r5.rows.length) console.log("  nessuna riga pay con 'casa'");
  } catch (e) { console.log("  (pay_righe non leggibile: " + e.message + ")"); }
  console.log("── 6. FK che puntano a catalog_offerte ──");
  const r6 = await c.query(`
    select tc.table_name, kcu.column_name, rc.delete_rule
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
    join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type='FOREIGN KEY' and ccu.table_name='catalog_offerte'`);
  r6.rows.forEach(r => console.log(`  ${r.table_name}.${r.column_name} → on delete ${r.delete_rule}`));
  await c.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
