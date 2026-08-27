// SOLA LETTURA — chi ha il layout IDENTICO a quello di Luca: è la traccia di
// quando entrare in un profilo ci scriveva sopra il menù di chi guardava
// (difetto chiuso il 27/08).
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

const LUCA = "0355d28b-968f-4089-93b7-b8b5eeeda40c";

(async () => {
  await client.connect();
  const q = async (t, sql, p = []) => { const { rows } = await client.query(sql, p); console.log(`\n── ${t}`); console.table(rows); return rows; };

  await q("Home: chi ha il layout identico a quello di Luca", `
    with luca as (select dashboard_layout d from app_users where id = $1)
    select u.full_name, u.role, u.active
      from app_users u, luca
     where u.id <> $1 and u.dashboard_layout is not null
       and u.dashboard_layout::text = luca.d::text
     order by u.full_name`, [LUCA]);

  await q("Analisi: stessa verifica", `
    with luca as (select analisi_layout d from app_users where id = $1)
    select u.full_name, u.role, u.active
      from app_users u, luca
     where u.id <> $1 and u.analisi_layout is not null
       and u.analisi_layout::text = luca.d::text
     order by u.full_name`, [LUCA]);

  await q("Quanti hanno un layout salvato, per ruolo", `
    select role,
           count(*) filter (where dashboard_layout is not null) as home,
           count(*) filter (where analisi_layout is not null) as analisi,
           count(*) as utenti
      from app_users where active group by role order by 2 desc nulls last`);

  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
