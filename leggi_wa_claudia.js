// SOLA LETTURA — l'utenza WhatsApp di Claudia: stato, ultimi movimenti e se
// il lucchetto del codice c'entra qualcosa (spoiler: non tocca wa_instances).
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

  await q("colonne di wa_instances", `
    select column_name from information_schema.columns
     where table_name = 'wa_instances' order by ordinal_position`);

  await q("utenze e stato", `
    select i.id, i.instance_name, i.display_name, i.negozio, i.status, i.wa_number,
           u.full_name as titolare
      from wa_instances i left join app_users u on u.id = i.owner_user_id
     order by u.full_name nulls last`);

  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
