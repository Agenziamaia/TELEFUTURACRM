// SOLA LETTURA — come il CRM verifica le password: voglio imitare quel
// pattern per il codice WhatsApp invece di inventarne un altro.
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

  await q("estensioni disponibili (pgcrypto?)", `
    select extname from pg_extension order by extname`);

  await q("funzioni di password/2FA già in casa", `
    select p.proname, pg_get_function_identity_arguments(p.oid) as argomenti,
           p.prosecdef as security_definer
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname ilike '%password%' or p.proname ilike '%2fa%' or p.proname ilike '%totp%' or p.proname ilike '%login%')
     order by p.proname`);

  const { rows } = await client.query(`select prosrc from pg_proc where proname = 'change_password' limit 1`);
  if (rows[0]) console.log("\n── corpo di change_password:\n" + String(rows[0].prosrc).slice(0, 1200));
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
