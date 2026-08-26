// REGOLE «NON UTILE» DEI NEGOZI — recupero dello storico (Luca 27/08).
//
// Fino a ieri la segnalazione del negozio entrava nel prompt dell'AI come
// indicazione forte, e l'AI poteva graziare: su gedmail@vnd.it (Magliana
// Multi) ne aveva cestinate 10 su 14 e lasciate 4 in inbox perché «fatture».
// Da oggi la regola del negozio è un ordine: questo script applica la stessa
// cosa a quello che era già rimasto indietro, per TUTTE le regole attive.
//
// Guardie (le sole due, e sono giudizi umani diversi):
//   · conversazione STELLATA  → non si tocca
//   · triage RIPRISTINATO da un admin → non si tocca
// Idempotente: le già cestinate non rientrano.
//
// Lancio: NODE_PATH=<dir pg> node cestina_regole_negozio.js
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
  try {
    // ── DUMP prima di scrivere
    const { rows: prima } = await client.query(`
      select c.id, c.account_id, c.customer_email, c.subject, c.trashed, c.spam, c.starred
      from email_conversations c
      join email_regole_utente r
        on r.account_id = c.account_id and lower(c.customer_email) = lower(r.mittente)
      where r.annullata_il is null and c.trashed = false`);
    const file = path.join(__dirname, `dump_regole_negozio_${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(prima, null, 2));
    console.log(`Dump di ${prima.length} conversazioni ancora fuori dal cestino → ${path.basename(file)}`);

    if (!prima.length) { console.log("Niente da fare: lo storico è già a posto."); await client.end(); return; }

    await client.query("begin");
    const { rows: agite } = await client.query(`
      update email_conversations c
         set trashed = true, spam = false
        from email_regole_utente r
       where r.account_id = c.account_id
         and lower(c.customer_email) = lower(r.mittente)
         and r.annullata_il is null
         and c.trashed = false
         and coalesce(c.starred, false) = false
         and not exists (
            select 1 from email_triage t
             where t.conversation_id = c.id and t.ripristinata_il is not null)
      returning c.id, c.customer_email`);

    // il registro deve dire PERCHÉ, come lo dice il motore
    for (const a of agite) {
      await client.query(`
        insert into email_triage (conversation_id, stato, azione, azione_auto, azione_auto_il,
                                  ultimo_msg_ts, versione, modello, classificato_il)
        select $1, 'spazzatura',
               '[regola negozio · ' || $2 || '] segnalato non utile dal punto vendita: recupero storico 27/08',
               'cestinata', now(),
               least(now(), coalesce(c.last_message_at, now())), 1, 'regola', now()
          from email_conversations c where c.id = $1
        on conflict (conversation_id) do update
           set stato = 'spazzatura', azione = excluded.azione,
               azione_auto = 'cestinata', azione_auto_il = now(), classificato_il = now()`,
        [a.id, a.customer_email]);
    }
    await client.query("commit");

    const perMittente = {};
    for (const a of agite) perMittente[a.customer_email] = (perMittente[a.customer_email] || 0) + 1;
    console.log(`\nCestinate ${agite.length} conversazioni:`);
    for (const [m, n] of Object.entries(perMittente)) console.log(`  ${m} → ${n}`);
    const saltate = prima.length - agite.length;
    if (saltate > 0) console.log(`\n${saltate} non toccate: stellate o ripristinate a mano.`);
  } catch (e) {
    await client.query("rollback").catch(() => { });
    console.error("ERRORE (rollback fatto):", e.message);
    process.exitCode = 1;
  }
  await client.end();
})();
