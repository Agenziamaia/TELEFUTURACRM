// SOLA LETTURA — cosa c'è davvero dentro il calendario: colonne, stati usati,
// volumi. Serve a ridisegnarlo senza inventarsi campi che non esistono.
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
  const q = async (t, sql, p = []) => { const { rows } = await client.query(sql, p); console.log(`\n── ${t}`); console.table(rows); return rows; };

  await q("colonne calendar_tasks", `
    select column_name, data_type from information_schema.columns
     where table_name = 'calendar_tasks' order by ordinal_position`);

  await q("stati delle task", `
    select status, count(*) from calendar_tasks group by 1 order by 2 desc`);

  await q("task assegnate ad ALTRI (non a se stessi)", `
    select count(*) filter (where coalesce(assigned_to,'') <> coalesce(created_by,'')) as ad_altri,
           count(*) filter (where coalesce(assigned_to,'') = coalesce(created_by,'')) as a_se_stessi,
           count(*) filter (where assigned_to_store is not null) as a_un_negozio,
           count(*) as totali
      from calendar_tasks`);

  await q("colonne appointments (per il filtro operatore)", `
    select column_name, data_type from information_schema.columns
     where table_name = 'appointments' order by ordinal_position`);

  await q("appuntamenti: che brand/operatore hanno", `
    select coalesce(brand,'(vuoto)') as brand, count(*) from appointments group by 1 order by 2 desc limit 12`);

  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
