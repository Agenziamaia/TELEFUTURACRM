// PAGAMENTO DELLA CHIUSURA LINEA (Luca 27/08): ogni disdetta nuova deve dire
// se è stata PAGATA, se è gratis ma GIUSTIFICATA da una vendita collegata, o
// se è gratis e basta — e quest'ultimo caso deve saltare all'occhio.
//
// Le vecchie restano vuote per scelta: nessuno può ricostruire a posteriori se
// una disdetta di luglio fu pagata, e inventarlo sarebbe peggio del vuoto.
//
// Idempotente. Lancio: NODE_PATH=<dir pg> node crea_disdetta_pagamento.js
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
    // 'pagata' | 'gratis_giustificata' | 'gratis' — NULL = pratica vecchia
    await client.query(`alter table richieste_disdette add column if not exists pagamento text`);
    await client.query(`alter table richieste_disdette add column if not exists pagamento_contract_id text`);
    await client.query(`alter table richieste_disdette drop constraint if exists richieste_disdette_pagamento_chk`);
    await client.query(`alter table richieste_disdette add constraint richieste_disdette_pagamento_chk
                        check (pagamento is null or pagamento in ('pagata','gratis_giustificata','gratis'))`);
    // la vendita collegata deve esserci per 'pagata' e 'gratis_giustificata',
    // e NON deve esserci per 'gratis': la regola sta a database, non solo nel form
    await client.query(`alter table richieste_disdette drop constraint if exists richieste_disdette_pagamento_vendita_chk`);
    await client.query(`alter table richieste_disdette add constraint richieste_disdette_pagamento_vendita_chk
                        check (
                          pagamento is null
                          or (pagamento in ('pagata','gratis_giustificata') and pagamento_contract_id is not null)
                          or (pagamento = 'gratis' and pagamento_contract_id is null)
                        )`);
    await client.query("commit");

    const { rows } = await client.query(`
      select coalesce(pagamento, '(vecchie, campo vuoto)') as pagamento, count(*)
        from richieste_disdette group by 1 order by 2 desc`);
    console.log("Come sono messe le disdette oggi:");
    console.table(rows);
  } catch (e) {
    await client.query("rollback").catch(() => { });
    console.error("ERRORE (rollback fatto):", e.message);
    process.exitCode = 1;
  }
  await client.end();
})();
