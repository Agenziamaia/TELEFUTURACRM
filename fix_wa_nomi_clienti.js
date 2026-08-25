// BACKFILL NOMI CLIENTI sulle chat WhatsApp (Luca 25/08 notte: «Donna Olimpia
// ha scritto a un numero salvato tra i clienti e non è comparso come cliente»).
// Le conversazioni create da NOI nascevano senza lookup anagrafico (il webhook
// lo fa solo sugli arrivi). Qui si agganciano le esistenti: match per coda di
// 9 cifre su clients.cellulare (stessa semantica del webhook); il nome si
// scrive SOLO dove manca o è un numero nudo (mai sopra un nome già buono),
// il client_id sempre. Idempotente. Lancio: node fix_wa_nomi_clienti.js
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

  const dumpPath = path.join(__dirname, "dump_wa_nomi_pre.json");
  if (!fs.existsSync(dumpPath)) {
    const { rows } = await client.query(
      `select id, customer_number, customer_name, client_id from wa_conversations where coalesce(is_group,false)=false`);
    fs.writeFileSync(dumpPath, JSON.stringify(rows, null, 2));
    console.log(`Dump pre: ${rows.length} conversazioni fotografate`);
  } else console.log("Dump pre già presente: non lo sovrascrivo");

  const { rows: prima } = await client.query(
    `select count(*)::int senza from wa_conversations where coalesce(is_group,false)=false and client_id is null`);
  console.log(`Conversazioni 1-a-1 senza cliente agganciato: ${prima[0].senza}`);

  const res = await client.query(`
    update wa_conversations c
    set client_id = m.id,
        customer_name = case
          when c.customer_name is null or btrim(c.customer_name) = '' or c.customer_name ~ '^[+0-9 ]+$'
          then m.nomev else c.customer_name end
    from (
      select distinct on (coda) coda, id, nomev from (
        select right(regexp_replace(coalesce(k.cellulare,''), '\\D', '', 'g'), 9) coda,
               k.id,
               coalesce(nullif(k.ragione_sociale, ''), nullif(btrim(coalesce(k.nome,'') || ' ' || coalesce(k.cognome,'')), '')) nomev
        from clients k
        where length(regexp_replace(coalesce(k.cellulare,''), '\\D', '', 'g')) >= 9
      ) x where nomev is not null
    ) m
    where coalesce(c.is_group, false) = false
      and c.client_id is null
      and right(regexp_replace(c.customer_number, '\\D', '', 'g'), 9) = m.coda`);
  console.log(`Agganciate al cliente: ${res.rowCount} conversazioni`);

  const { rows: esempi } = await client.query(
    `select customer_number, customer_name from wa_conversations
     where client_id is not null and coalesce(is_group,false)=false
     order by last_message_at desc nulls last limit 6`);
  esempi.forEach(e => console.log(`  +${e.customer_number} → ${e.customer_name}`));
  const { rows: dopo } = await client.query(
    `select count(*)::int senza from wa_conversations where coalesce(is_group,false)=false and client_id is null`);
  console.log(`Rimaste senza cliente (numeri non in anagrafica): ${dopo[0].senza}`);
  await client.end();
  console.log("FATTO ✓");
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
