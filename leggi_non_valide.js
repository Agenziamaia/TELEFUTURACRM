// SOLA LETTURA — le pratiche dichiarate non valide: il salvataggio ha preso?
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

  await q("pratiche non valide", `
    select id, data, brand, categoria, negozio, venditore, stato,
           non_valida, non_valida_da, non_valida_nota, non_valida_il
      from contracts where non_valida order by non_valida_il desc limit 20`);

  await q("le sostituzioni SIM di oggi (che stato hanno)", `
    select c.id, c.brand, c.categoria, c.stato, c.non_valida,
           coalesce(cl.ragione_sociale, concat(cl.nome,' ',cl.cognome)) as cliente
      from contracts c left join clients cl on cl.id = c.client_id
     where c.categoria ilike '%sostituzione%' and c.data >= current_date - 2
     order by c.data desc limit 10`);

  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
