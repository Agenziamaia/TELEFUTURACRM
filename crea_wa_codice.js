// CODICE DI ACCESSO A WHATSAPP (Luca 27/08: «SOLO Sandra e Claudia devono
// avere un codice che quando aprono WhatsApp gli chiede, altrimenti non è
// possibile vederlo»).
//
// Il codice lo scelgono LORO al primo ingresso (decisione di Luca): qui si
// crea solo il posto dove finisce, e nessuno — Luca compreso — potrà mai
// rileggerlo. In tabella va l'IMPRONTA (sha256 di sale+codice), non il codice.
// Se lo dimenticano, l'admin lo AZZERA e loro ne scelgono uno nuovo.
//
// Idempotente. Lancio: NODE_PATH=<dir pg> node crea_wa_codice.js
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

const SANDRA = "dd5f5fda-ad1c-4871-859c-dcd2d110a0c3";   // Sandra Arduini
const CLAUDIA = "32ad58f8-20af-4f6e-abb5-af3cbf628e23";  // Claudia Ieva
const CHIAVE = "cap:/whatsapp:codice";

(async () => {
  await client.connect();
  try {
    await client.query("begin");
    await client.query(`
      create table if not exists wa_codice_accesso (
        user_id      uuid primary key,
        impronta     text not null,
        sale         text not null,
        creato_il    timestamptz not null default now(),
        aggiornato_il timestamptz,
        tentativi    int not null default 0,
        bloccato_fino timestamptz,
        ultimo_ok_il timestamptz
      )`);
    // la riga la scrive la route del server, mai il browser
    await client.query(`alter table wa_codice_accesso enable row level security`);
    await client.query(`drop policy if exists wa_codice_nessuno on wa_codice_accesso`);
    // NESSUN accesso con la chiave pubblica: l'impronta non deve poter essere
    // letta dal browser nemmeno da chi conosce la anon key
    await client.query(`create policy wa_codice_nessuno on wa_codice_accesso for all to public using (false) with check (false)`);

    // chi deve vedersi chiedere il codice: la rotellina dei permessi
    for (const [id, nome] of [[SANDRA, "Sandra Arduini"], [CLAUDIA, "Claudia Ieva"]]) {
      await client.query(`
        insert into role_permissions (role, perm_key, allowed, updated_by)
        values ($1, $2, true, $3)
        on conflict (role, perm_key) do update set allowed = true, updated_by = $3, updated_at = now()`,
        [`user:${id}`, CHIAVE, "richiesta Luca 27/08"]);
      console.log(`  codice richiesto a ${nome}`);
    }
    await client.query("commit");

    const { rows } = await client.query(`
      select u.full_name, rp.allowed,
             (select count(*) from wa_codice_accesso c where c.user_id = u.id) as codice_scelto
        from role_permissions rp join app_users u on ('user:' || u.id::text) = rp.role
       where rp.perm_key = $1 order by u.full_name`, [CHIAVE]);
    console.log("\nChi deve inserire il codice per aprire WhatsApp:");
    console.table(rows);
  } catch (e) {
    await client.query("rollback").catch(() => { });
    console.error("ERRORE (rollback fatto):", e.message);
    process.exitCode = 1;
  }
  await client.end();
})();
