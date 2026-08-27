// NUMERO MITTENTE DELLE NOTIFICHE (Luca 27/08: «ora che abbiamo configurato
// tutti i numeri di whatsapp possiamo definirne uno che si occupa di mandare
// questi messaggi interni rispetto agli incarichi che lo prevedono»).
//
// Finora la route sceglieva «una connessa qualsiasi, la più recente»: il
// messaggio poteva partire dal numero personale di un collega o da quello di
// un negozio, a caso. Con questa spia si decide una volta e non si pensa più.
//
// Idempotente. Lancio: NODE_PATH=<dir pg> node crea_wa_mittente.js
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
    await client.query(`alter table wa_instances add column if not exists mittente_notifiche boolean not null default false`);
    // UNO SOLO: l'indice impedisce di accenderne due per sbaglio
    await client.query(`create unique index if not exists wa_instances_un_solo_mittente
                        on wa_instances (mittente_notifiche) where mittente_notifiche`);
    await client.query("commit");
    const { rows } = await client.query(`
      select display_name, instance_name, status, mittente_notifiche
        from wa_instances where mittente_notifiche`);
    console.log("Colonna pronta. Mittente attualmente scelto:");
    console.table(rows.length ? rows : [{ nota: "nessuno — da scegliere dal pannello WhatsApp" }]);
  } catch (e) {
    await client.query("rollback").catch(() => { });
    console.error("ERRORE (rollback fatto):", e.message);
    process.exitCode = 1;
  }
  await client.end();
})();
