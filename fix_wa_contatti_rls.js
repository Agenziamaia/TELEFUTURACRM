// La rubrica non salvava NIENTE e diceva di aver salvato: `wa_contatti` è
// nata con RLS accesa e zero policy, quindi ogni insert veniva rifiutato —
// e l'errore era ingoiato (`if (!error) salvati += …`), così la route
// rispondeva «ok, 0 contatti» e sembrava un problema del telefono.
//
// Qui si allinea la tabella alle sorelle (wa_conversations, wa_messages):
// lettura e scrittura con la chiave pubblica, come tutto il resto del CRM.
// ⚠️ NON è una scelta di sicurezza: è la fotografia di com'è oggi il
// database. Il perimetro vero resta il cantiere aperto.
//
// Idempotente. Lancio: NODE_PATH=<dir pg> node fix_wa_contatti_rls.js
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
    await client.query(`drop policy if exists wa_contatti_all on wa_contatti`);
    await client.query(`create policy wa_contatti_all on wa_contatti for all to public using (true) with check (true)`);
    await client.query("commit");

    const { rows } = await client.query(`
      select c.relrowsecurity as rls_accesa,
             (select count(*) from pg_policies where tablename = 'wa_contatti') as policy
        from pg_class c where c.relname = 'wa_contatti'`);
    console.table(rows);

    // prova vera come ruolo anon: è quello che usa il CRM
    await client.query("begin");
    await client.query("set local role anon");
    const inst = (await client.query("select id from wa_instances limit 1")).rows[0];
    await client.query(
      `insert into wa_contatti (instance_id, jid, numero, nome) values ($1,'prova@s.whatsapp.net','390000000000','PROVA')`,
      [inst.id]);
    const n = (await client.query("select count(*) from wa_contatti")).rows[0].count;
    await client.query("rollback");   // la prova non resta
    console.log(`Scrittura come anon: RIUSCITA (${n} riga in transazione, poi annullata).`);
  } catch (e) {
    await client.query("rollback").catch(() => { });
    console.error("ERRORE (rollback fatto):", e.message);
    process.exitCode = 1;
  }
  await client.end();
})();
