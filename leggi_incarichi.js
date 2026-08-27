// SOLA LETTURA — gli incarichi: chiavi, designati e numero WhatsApp.
// Luca 27/08: «ricontrolla bene tutti i collegamenti e che il database è
// veramente allineato».
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

  await q("colonne di incarichi", `
    select column_name, data_type from information_schema.columns
     where table_name = 'incarichi' order by ordinal_position`);

  await q("gli incarichi come sono messi", `
    select chiave, coalesce(array_length(assegnatari,1),0) as persone,
           coalesce(array_length(ruoli,1),0) as ruoli, fulmine, whatsapp
      from incarichi order by chiave`);

  await q("messaggi automatici usciti finora (notify)", `
    select date_trunc('day', m.wa_timestamp)::date as giorno, count(*)
      from wa_messages m
     where m.direction = 'out' and (m.body ilike '%BONIFICO ISTANTANEO%' or m.body ilike '%CRM%')
       and m.wa_timestamp > now() - interval '30 days'
     group by 1 order by 1 desc limit 10`);

  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
