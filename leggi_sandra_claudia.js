// SOLA LETTURA — chi sono Sandra e Claudia e che numeri WhatsApp vedono.
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

  await q("Utenti attivi con Sandra o Claudia nel nome", `
    select id, full_name, role, primary_store, active
      from app_users
     where full_name ilike '%sandra%' or full_name ilike '%claudia%'
     order by active desc, full_name`);

  await q("Numeri WhatsApp di cui sono titolari", `
    select i.id, i.display_name, i.negozio, i.status, u.full_name as titolare
      from wa_instances i left join app_users u on u.id = i.owner_user_id
     where u.full_name ilike '%sandra%' or u.full_name ilike '%claudia%'`);

  await q("C'è già una tabella per PIN/codici?", `
    select table_name from information_schema.tables
     where table_schema = 'public'
       and (table_name ilike '%pin%' or table_name ilike '%codic%' or table_name ilike '%lock%')`);

  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
