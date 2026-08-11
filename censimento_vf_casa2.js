const fs = require("fs"); const path = require("path");
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("pg");
const c = new Client({ host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
const VECCHIE = ["Casa Start Conv","Casa Start Lock In","Casa Start Mass Market",
  "Casa Pro Conv","Casa Pro Lock In","Casa Pro Mass Market",
  "Casa Ultra Conv","Casa Ultra Lock In","Casa Ultra Mass Market"];
(async () => {
  await c.connect();
  console.log("── A. contratti con le 9 varianti: brand di appartenenza ──");
  const rA = await c.query(`select brand, offerta, count(*) n from contracts where offerta = any($1) group by brand, offerta order by brand, offerta`, [VECCHIE]);
  rA.rows.forEach(r => console.log(`  ${String(r.brand).padEnd(12)} ${String(r.offerta).padEnd(24)} ${r.n}`));
  const rA2 = await c.query(`select count(*) n from contracts where dettagli->>'Offerta' = any($1)`, [VECCHIE]);
  console.log(`  dettagli.Offerta con varianti: ${rA2.rows[0].n} righe`);
  const rA3 = await c.query(`select brand, count(*) n from contracts where dettagli->>'Offerta' = any($1) group by brand`, [VECCHIE]);
  rA3.rows.forEach(r => console.log(`    → brand ${r.brand}: ${r.n}`));
  console.log("── B. colonne di catalog_campi_regole ──");
  const rB = await c.query(`select column_name from information_schema.columns where table_name='catalog_campi_regole' order by ordinal_position`);
  console.log("  " + rB.rows.map(r => r.column_name).join(", "));
  console.log("── C. opzioni per le 12 offerte Casa* del fisso VODAFONE ──");
  const rC = await c.query(`
    select o.nome, count(z.offerta_id) opz
    from catalog_offerte o join catalog_prodotti p on p.id=o.prodotto_id
    left join catalog_opzioni z on z.offerta_id = o.id
    where p.brand_id='vodafone' and p.nome='Fisso' and o.nome ilike 'casa%'
    group by o.nome order by o.nome`);
  rC.rows.forEach(r => console.log(`  ${String(r.nome).padEnd(26)} opzioni=${r.opz}`));
  console.log("── D. FK verso catalog_offerte ──");
  const rD = await c.query(`
    select tc.table_name, kcu.column_name, rc.delete_rule
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_name = tc.table_name
    join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type='FOREIGN KEY' and ccu.table_name='catalog_offerte'`);
  rD.rows.forEach(r => console.log(`  ${r.table_name}.${r.column_name} → on delete ${r.delete_rule}`));
  console.log("── E. pay_righe con offerte casa ──");
  const rE = await c.query(`select id, pista, nome, offerta from pay_righe where nome ilike '%casa%' order by nome`);
  rE.rows.forEach(r => console.log(`  [${r.pista}] ${String(r.nome).padEnd(16)} offerta=${JSON.stringify(r.offerta)}`));
  console.log("── F. regole campi che citano le offerte vecchie (per id o nome) ──");
  const rF = await c.query(`select * from catalog_campi_regole limit 1`);
  console.log("  esempio riga:", JSON.stringify(rF.rows[0] || {}).slice(0, 300));
  await c.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
