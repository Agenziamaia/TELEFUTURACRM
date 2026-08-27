// RUBRICA DEL NUMERO (Luca 27/08: «dargli la possibilità di caricare la
// rubrica»). Il QR non c'entra — non esporta rubriche, e quel passaggio è già
// stato fatto: WhatsApp tiene sincronizzata la rubrica del telefono dentro la
// sessione collegata, e noi ce la facciamo dare dal ponte.
//
// I contatti restano LEGATI AL NUMERO che li ha caricati (scelta di Luca): non
// diventano clienti, non toccano l'anagrafica. Servono a due cose: far vedere
// «Mario Rossi» invece di +39333…, e trovare la persona per nome quando si
// apre una chat nuova.
//
// Idempotente. Lancio: NODE_PATH=<dir pg> node crea_wa_contatti.js
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
    await client.query("begin");
    await client.query(`
      create table if not exists wa_contatti (
        instance_id   uuid not null references wa_instances(id) on delete cascade,
        jid           text not null,
        numero        text,
        nome          text,
        aggiornato_il timestamptz not null default now(),
        primary key (instance_id, jid)
      )`);
    await client.query(`create index if not exists wa_contatti_numero on wa_contatti (numero)`);
    // la ricerca per nome dentro la rubrica del proprio numero
    await client.query(`create index if not exists wa_contatti_nome on wa_contatti using gin (lower(nome) gin_trgm_ops)`);
    await client.query("commit");
    const { rows } = await client.query(`
      select count(*) as contatti, count(distinct instance_id) as numeri from wa_contatti`);
    console.log("Tabella pronta.");
    console.table(rows);
  } catch (e) {
    await client.query("rollback").catch(() => { });
    console.error("ERRORE (rollback fatto):", e.message);
    process.exitCode = 1;
  }
  await client.end();
})();
