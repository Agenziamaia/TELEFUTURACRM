// PRATICA NON VALIDA (Luca 27/08): un pulsante in Ricerca Vendite per
// dichiarare che una pratica NON conta ai fini del commissioning e delle gare,
// con una nota obbligatoria che resta nello storico e si legge dall'occhiolino.
//
// Non è un'eliminazione e non è un nascondiglio: la pratica resta dov'è, con
// scritto perché non vale e chi l'ha deciso. È l'unico modo per non perdere il
// motivo — che è la cosa che serve fra sei mesi.
//
// Idempotente. Lancio: NODE_PATH=<dir pg> node crea_pratica_non_valida.js
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

const CHIAVE = "cap:/ricerca-vendite:non_valida";

(async () => {
  await client.connect();
  try {
    await client.query("begin");
    await client.query(`alter table contracts add column if not exists non_valida boolean not null default false`);
    await client.query(`alter table contracts add column if not exists non_valida_nota text`);
    await client.query(`alter table contracts add column if not exists non_valida_da text`);
    await client.query(`alter table contracts add column if not exists non_valida_il timestamptz`);
    // le dashboard contano «quante non valide» per mese e negozio
    await client.query(`create index if not exists contracts_non_valida on contracts (non_valida) where non_valida`);

    // il permesso: per ora SOLO l'amministrativo (richiesta di Luca), e da
    // domani si sposta dalla rotellina senza toccare il codice
    await client.query(
      `insert into role_permissions (role, perm_key, allowed, updated_by)
       values ('amministrativo', $1, true, 'richiesta Luca 27/08')
       on conflict (role, perm_key) do update set allowed = true, updated_at = now()`, [CHIAVE]);
    await client.query("commit");

    const { rows } = await client.query(`
      select count(*) filter (where non_valida) as gia_non_valide, count(*) as pratiche
        from contracts where id like 'CTR-%'`);
    console.log("Colonne pronte.");
    console.table(rows);
    const { rows: perm } = await client.query(
      `select role, allowed from role_permissions where perm_key = $1`, [CHIAVE]);
    console.log("Chi può dichiarare una pratica non valida:");
    console.table(perm);
  } catch (e) {
    await client.query("rollback").catch(() => { });
    console.error("ERRORE (rollback fatto):", e.message);
    process.exitCode = 1;
  }
  await client.end();
})();
