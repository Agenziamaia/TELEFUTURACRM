// APPLICA MIG. 142 (alias utente) + ALIAS "Alex Rahneva" (03/08, direttiva
// Luca). Dump di sicurezza delle occorrenze del vecchio nome PRIMA dello
// swap, poi applica_alias(), poi verifica: il vecchio nome deve restare
// SOLO in app_users.nome_riservato. Lancio: node apply_alias_alex.js
const fs = require("fs");
const path = require("path");

const VECCHIO = "Paola Ivanova Rahneva";
const ALIAS = "Alex Rahneva";

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("pg");
const client = new Client({
  host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

const scan = async (nome) => {
  const { rows: cols } = await client.query(`
    select c.table_name, c.column_name, c.data_type from information_schema.columns c
    join information_schema.tables t on t.table_schema='public' and t.table_name=c.table_name and t.table_type='BASE TABLE'
    where c.table_schema='public' and c.data_type in ('text','character varying','jsonb')`);
  const hit = [];
  for (const { table_name, column_name, data_type } of cols) {
    try {
      const cast = data_type === "jsonb" ? "::text" : "";
      const { rows: [r] } = await client.query(
        `select count(*)::int n from "${table_name}" where "${column_name}"${cast} like $1`, ["%" + nome + "%"]);
      if (r.n > 0) hit.push({ tabella: `${table_name}.${column_name}`, righe: r.n });
    } catch { /* colonna non interrogabile */ }
  }
  return hit;
};

(async () => {
  await client.connect();

  // 1) migrazione 142
  const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations/20260803000006_alias_utente.sql"), "utf8");
  await client.query("begin");
  try { await client.query(sql); await client.query("commit"); }
  catch (e) { await client.query("rollback"); throw e; }
  console.log("MIG. 142 APPLICATA (nome_riservato + funzione applica_alias)");

  // 2) utente e dump pre-swap
  const { rows: [u] } = await client.query("select id, full_name, nome_riservato from app_users where full_name = $1", [VECCHIO]);
  if (!u) {
    const { rows: [gia] } = await client.query("select id, full_name, nome_riservato from app_users where full_name = $1", [ALIAS]);
    if (gia) { console.log(`Alias gia' applicato: "${ALIAS}" (nome riservato conservato).`); await client.end(); return; }
    throw new Error(`utente "${VECCHIO}" non trovato`);
  }
  const prima = await scan(VECCHIO);
  fs.writeFileSync(path.join(__dirname, "dump_alias_pre_swap.json"),
    JSON.stringify({ quando: new Date().toISOString(), vecchio: VECCHIO, alias: ALIAS, occorrenze_prima: prima }, null, 1));
  console.log("Occorrenze del vecchio nome PRIMA dello swap:");
  prima.forEach(h => console.log(`  ${h.tabella}: ${h.righe}`));

  // 3) swap totale
  const { rows: [rep] } = await client.query("select applica_alias($1, $2) as report", [u.id, ALIAS]);
  console.log("SWAP ESEGUITO. Report colonne toccate:", JSON.stringify(rep.report));

  // 4) verifica residui: il vecchio nome deve vivere SOLO in nome_riservato
  const dopo = await scan(VECCHIO);
  const residui = dopo.filter(h => h.tabella !== "app_users.nome_riservato");
  console.log(residui.length === 0
    ? `VERIFICA OK: "${VECCHIO}" esiste ormai solo in app_users.nome_riservato ✓`
    : `⚠️ RESIDUI DA GUARDARE: ${JSON.stringify(residui)}`);
  // forma invertita legacy (vecchio match_name): non deve esistere da nessuna parte
  const inverso = await scan("RAHNEVA PAOLA IVANOVA");
  console.log(inverso.length === 0 ? 'Forma invertita "RAHNEVA PAOLA IVANOVA": nessun residuo ✓' : `⚠️ residui forma invertita: ${JSON.stringify(inverso)}`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
