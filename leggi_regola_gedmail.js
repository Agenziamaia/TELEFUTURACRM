// SOLA LETTURA — verifica dopo il recupero storico (Luca 27/08).
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
  const { rows } = await client.query(`
    select a.display_name as casella, r.mittente,
           count(*) filter (where c.trashed) as nel_cestino,
           count(*) filter (where not c.trashed) as ancora_fuori
      from email_regole_utente r
      join email_accounts a on a.id = r.account_id
      left join email_conversations c
        on c.account_id = r.account_id and lower(c.customer_email) = lower(r.mittente)
     where r.annullata_il is null
     group by 1,2 order by 1,2`);
  console.log("\n── Regole «non utile» attive: dove sono finite le mail");
  console.table(rows);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
