// DIAGNOSI NOMINATIVI CAMBIATI DOPO IL PRIMO LOGIN (03/08)
// Trova gli utenti col nome "allungato" in un secondo momento (es. Eloisa
// Nucci -> Eloisa Nucci Gonzalez) e conta le righe rimaste col VECCHIO nome
// su tutte le colonne testuali che portano nomi di operatori.
// SOLO LETTURA: nessun update. Lancio: node diagnosi_nominativi.js
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

// colonne candidate a contenere NOMI di operatori/collaboratori
const COL_NOMI = ["venditore", "caller", "tecnico", "employee_name", "created_by", "creato_da",
  "done_by", "decided_by", "saldato_da", "requested_by_name", "gestita_da", "agente",
  "compensato_da", "decisore", "operatore", "assegnato_a", "inviato_da", "modificato_da"];

(async () => {
  await client.connect();
  const { rows: users } = await client.query(
    "select id, full_name, coalesce(match_name,'') match_name, active from app_users order by full_name");

  // candidati: match_name valorizzato e diverso dal full_name, OPPURE full_name
  // a 3+ parole il cui prefisso a 2 parole non appartiene a nessun altro utente
  const nomi = new Set(users.map(u => (u.full_name || "").trim()));
  const candidati = [];
  for (const u of users) {
    const full = (u.full_name || "").trim();
    const short = full.split(/\s+/).slice(0, 2).join(" ");
    const vecchi = new Set();
    if (u.match_name && u.match_name.trim() && u.match_name.trim() !== full) vecchi.add(u.match_name.trim());
    if (full.split(/\s+/).length >= 3 && short !== full && !nomi.has(short)) vecchi.add(short);
    if (vecchi.size) candidati.push({ ...u, full, vecchi: [...vecchi] });
  }

  // tutte le colonne testuali "da nomi" davvero esistenti a DB
  const { rows: cols } = await client.query(`
    select table_name, column_name from information_schema.columns
    where table_schema='public' and data_type in ('text','character varying')
      and column_name = any($1) order by table_name, column_name`, [COL_NOMI]);

  console.log(`Utenti: ${users.length} — candidati cambio nome: ${candidati.length}`);
  for (const c of candidati) {
    console.log(`\n═══ ${c.full}  (active=${c.active}, match_name="${c.match_name}")`);
    for (const vecchio of c.vecchi) {
      let tot = 0; const dettagli = [];
      for (const { table_name, column_name } of cols) {
        const q = `select count(*)::int n from "${table_name}" where btrim("${column_name}") = $1`;
        try {
          const { rows: [r] } = await client.query(q, [vecchio]);
          if (r.n > 0) { tot += r.n; dettagli.push(`${table_name}.${column_name}: ${r.n}`); }
        } catch { /* tabella non interrogabile: si salta */ }
      }
      console.log(`  vecchio nome "${vecchio}" → ${tot} righe` + (tot ? `\n    ${dettagli.join("\n    ")}` : " (pulito)"));
    }
  }
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
