// SOLA LETTURA — perché le mail di gedmail@vnd.it sono ancora in inbox su
// Magliana Multi dopo la segnalazione «non utile» (Luca 27/08).
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

  await q("colonne di email_triage", `
    select column_name from information_schema.columns
    where table_name = 'email_triage' order by ordinal_position`);

  await q("Triage delle conversazioni gedmail (in inbox e non)", `
    select c.id, c.trashed, c.spam, t.stato, t.azione_auto, t.ripristinata_il, t.versione,
           left(coalesce(t.azione,''),70) as perche
    from email_conversations c left join email_triage t on t.conversation_id = c.id
    where c.customer_email ilike '%gedmail@vnd.it%'
    order by c.trashed, c.spam limit 25`);

  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
