// La capability del codice WhatsApp vive sotto la sezione /chat (WhatsApp non
// è una voce di menu a sé: si apre dalla Chat, e l'interruttore deve comparire
// dove lo si cerca). Qui si spostano le due righe già scritte.
// Idempotente.
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
      insert into role_permissions (role, perm_key, allowed, updated_by)
      select role, 'cap:/chat:codice', allowed, 'spostamento chiave 27/08'
        from role_permissions where perm_key = 'cap:/whatsapp:codice'
      on conflict (role, perm_key) do update set allowed = excluded.allowed`);
    await client.query(`delete from role_permissions where perm_key = 'cap:/whatsapp:codice'`);
    await client.query("commit");

    const { rows } = await client.query(`
      select u.full_name, rp.perm_key, rp.allowed,
             (select count(*) from wa_codice_accesso c where c.user_id = u.id) as codice_scelto
        from role_permissions rp join app_users u on ('user:' || u.id::text) = rp.role
       where rp.perm_key like 'cap:%:codice' order by u.full_name`);
    console.log("Chi deve inserire il codice per aprire WhatsApp:");
    console.table(rows);
  } catch (e) {
    await client.query("rollback").catch(() => { });
    console.error("ERRORE (rollback fatto):", e.message);
    process.exitCode = 1;
  }
  await client.end();
})();
