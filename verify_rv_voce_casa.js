// VERIFICA (sola lettura) della migrazione 20260808170000. Nessuna scrittura.
// Le query usano gli operatori jsonb (non LIKE su testo) per evitare il problema
// degli spazi dopo i due punti in jsonb::text.
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
  const q = async (s) => (await client.query(s)).rows[0];
  console.log("Voce Casa → IMEI attivo:", (await q(
    `select count(*) n from catalog_campi_regole
     where condizioni->'offerta' ? 'Voce Casa'
       and exists (select 1 from jsonb_array_elements(campi) c
                   where c->>'nome'='IMEI' and (c->>'attivo')::boolean is true)`))?.n, "(attesa 1)");
  console.log("Outdoor → ICCID nascosto (attivo=false):", (await q(
    `select count(*) n from catalog_campi_regole
     where etichetta like '%Outdoor%no ICCID%'
       and exists (select 1 from jsonb_array_elements(campi) c
                   where c->>'nome'='Seriale SIM (ICCID)' and (c->>'attivo')::boolean is false)`))?.n, "(attese 2)");
  console.log("regola generale FWA (16c3b3d6) ICCID ancora ATTIVO:", (await q(
    `select exists (select 1 from jsonb_array_elements(campi) c
                    where c->>'nome'='Seriale SIM (ICCID)' and (c->>'attivo')::boolean is true) ok
     from catalog_campi_regole where id='16c3b3d6-7a97-402e-8102-d73422457d04'`))?.ok, "(atteso true)");
  console.log("--- dettaglio 3 regole nuove ---");
  const r = await client.query(
    `select etichetta, condizioni->'offerta' offerta, campi, ordine
     from catalog_campi_regole where etichetta like '%(08/08)' and etichetta like '🎯 Offerta:%'
       and (etichetta like '%Voce Casa%' or etichetta like '%Outdoor%') order by ordine`);
  for (const row of r.rows) console.log(" •", row.ordine, JSON.stringify(row.offerta), "→", JSON.stringify(row.campi));
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
