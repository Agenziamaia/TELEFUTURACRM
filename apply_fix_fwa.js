// FIX FWA (Luca 02/08): ICCID NON obbligatorio per FWA WindTre BUSINESS.
// La regola unica "Fisso — FWA" (ICCID per tutti) si divide in tre:
//   1. Consumer, tutti i brand  -> ICCID obbligatorio (com'era)
//   2. Business, brand NON W3   -> ICCID obbligatorio (com'era)
//   3. Business, WindTre        -> ICCID FACOLTATIVO (flag nel campo)
const fs = require("fs");
const path = require("path");
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("pg");
// pooler IPv4 (l'host diretto db.<ref> e' solo IPv6 e questa rete non ce l'ha)
const client = new Client({ host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });

(async () => {
  await client.connect();
  const { rows } = await client.query(
    `select id, etichetta, condizioni, campi, ordine from catalog_campi_regole
     where condizioni @> '{"prodotto":["FWA"]}' and condizioni @> '{"categoria":["Fisso"]}'`);
  if (rows.length !== 1) { console.log("ATTENZIONE: attese 1 regola FWA, trovate", rows.length, "— nessuna modifica."); process.exit(1); }
  const r = rows[0];
  const campoIccid = (r.campi || []).find(c => /iccid/i.test(c.nome));
  if (!campoIccid) { console.log("Campo ICCID non trovato nella regola — nessuna modifica."); process.exit(1); }

  await client.query("begin");
  try {
    // 1) la regola esistente diventa SOLO Consumer
    await client.query(
      `update catalog_campi_regole
          set etichetta = 'Fisso — FWA (Consumer)',
              condizioni = jsonb_set(condizioni, '{tipo}', '["Consumer"]')
        where id = $1`, [r.id]);
    // 2) Business, brand diversi da WindTre: come prima
    await client.query(
      `insert into catalog_campi_regole (etichetta, condizioni, campi, ordine, attivo) values
       ('Fisso — FWA (Business, non W3)',
        $1::jsonb, $2::jsonb, $3, true)`,
      [JSON.stringify({ prodotto: ["FWA"], categoria: ["Fisso"], tipo: ["Business"], brand: ["vodafone", "fastweb", "iliad", "tim", "sky", "s4", "dojo", "very", "ho", "kena"] }),
       JSON.stringify(r.campi), (r.ordine || 0) + 1]);
    // 3) Business WindTre: ICCID facoltativo
    const campiW3 = (r.campi || []).map(c => /iccid/i.test(c.nome) ? { ...c, facoltativo: true, nota: (c.nota ? c.nota + " — " : "") + "facoltativo per FWA Business" } : c);
    await client.query(
      `insert into catalog_campi_regole (etichetta, condizioni, campi, ordine, attivo) values
       ('Fisso — FWA (Business WindTre: ICCID facoltativo)',
        $1::jsonb, $2::jsonb, $3, true)`,
      [JSON.stringify({ prodotto: ["FWA"], categoria: ["Fisso"], tipo: ["Business"], brand: ["windtre"] }),
       JSON.stringify(campiW3), (r.ordine || 0) + 2]);
    await client.query("commit");
  } catch (e) { await client.query("rollback"); throw e; }

  const { rows: dopo } = await client.query(
    `select etichetta, condizioni->'tipo' tipo, condizioni->'brand' brand from catalog_campi_regole
     where condizioni @> '{"prodotto":["FWA"]}' order by ordine`);
  console.log("FIX FWA COMPLETATO — regole ora:");
  dopo.forEach(x => console.log(`  ${x.etichetta} | tipo=${JSON.stringify(x.tipo)} | brand=${JSON.stringify(x.brand) || "tutti"}`));
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
