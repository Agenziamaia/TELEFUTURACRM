// ALLINEA I NOMINATIVI CAMBIATI DOPO IL PRIMO LOGIN (03/08)
// Le righe generate col VECCHIO nome passano al nome NUOVO (direttiva:
// "va allineato il nuovo nominativo sulle vecchie operazioni" — non il
// filtro al nome vecchio). Match case-insensitive, dump di sicurezza
// in dump_nominativi_pre_fix.json prima di ogni update.
// Lancio: node fix_nominativi.js
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

// (vecchio nome -> nuovo nome) accertati dalla diagnosi del 03/08
const CASI = [
  { vecchio: "Eloisa Nucci", nuovo: "Eloisa Nucci Gonzalez" },
  { vecchio: "Gianluca Cutrupi", nuovo: "Antonino Gianluca Cutrupi" },
  { vecchio: "Luca Perotta", nuovo: "Luca Perrotta" },
];
const COL_NOMI = ["venditore", "caller", "tecnico", "employee_name", "created_by", "creato_da",
  "done_by", "decided_by", "saldato_da", "requested_by_name", "gestita_da", "agente",
  "compensato_da", "decisore", "operatore", "assegnato_a", "inviato_da", "modificato_da"];

(async () => {
  await client.connect();
  const { rows: cols } = await client.query(`
    select c.table_name, c.column_name,
           (select column_name from information_schema.columns k
             where k.table_schema='public' and k.table_name=c.table_name and k.column_name='id' limit 1) has_id
    from information_schema.columns c
    where c.table_schema='public' and c.data_type in ('text','character varying')
      and c.column_name = any($1) order by c.table_name, c.column_name`, [COL_NOMI]);

  const dump = [];
  const report = [];
  await client.query("begin");
  try {
    for (const { vecchio, nuovo } of CASI) {
      for (const { table_name, column_name, has_id } of cols) {
        const idCol = has_id ? "id" : null;
        try {
          if (idCol) {
            const { rows } = await client.query(
              `select ${idCol} as id from "${table_name}" where lower(btrim("${column_name}")) = lower($1)`, [vecchio]);
            if (!rows.length) continue;
            dump.push({ table: table_name, column: column_name, vecchio, nuovo, ids: rows.map(r => String(r.id)) });
          }
          const { rowCount } = await client.query(
            `update "${table_name}" set "${column_name}" = $2 where lower(btrim("${column_name}")) = lower($1)`, [vecchio, nuovo]);
          if (rowCount > 0) report.push(`${table_name}.${column_name}: ${rowCount} righe "${vecchio}" → "${nuovo}"`);
        } catch (e) { report.push(`⚠️ ${table_name}.${column_name} SALTATA (${e.message})`); }
      }
    }
    fs.writeFileSync(path.join(__dirname, "dump_nominativi_pre_fix.json"), JSON.stringify(dump, null, 1));
    await client.query("commit");
  } catch (e) { await client.query("rollback"); throw e; }

  console.log("ALLINEAMENTO COMPLETATO:");
  report.forEach(r => console.log("  " + r));
  // verifica finale: i vecchi nomi non devono piu' esistere da nessuna parte
  for (const { vecchio } of CASI) {
    let residui = 0;
    for (const { table_name, column_name } of cols) {
      try {
        const { rows: [r] } = await client.query(
          `select count(*)::int n from "${table_name}" where lower(btrim("${column_name}")) = lower($1)`, [vecchio]);
        residui += r.n;
      } catch { /* saltata */ }
    }
    console.log(`  verifica "${vecchio}": ${residui === 0 ? "0 residui ✓" : residui + " RESIDUI ⚠️"}`);
  }
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
