// APPLICA LE 12 MIGRAZIONI DELLA WAVE 1 (backlog 04/08) in ordine di filename,
// una transazione per file. Rilanciabile: sono tutte idempotenti.
// Lancio: node apply_wave1_migs.js   (dalla cartella del CRM)
const fs = require("fs");
const path = require("path");

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));

const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("pg");
const client = new Client({
  // pooler IPv4 (l'host diretto db.<ref> e' solo IPv6 e questa rete non ce l'ha)
  host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

const FILES = fs.readdirSync(path.join(__dirname, "supabase/migrations"))
  .filter(f => f.startsWith("20260804") && f.endsWith(".sql")).sort();

(async () => {
  await client.connect();
  for (const f of FILES) {
    const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", f), "utf8");
    await client.query("begin");
    try { await client.query(sql); await client.query("commit"); console.log("OK  ", f); }
    catch (e) { await client.query("rollback"); console.error("FAIL", f, "→", e.message); process.exit(1); }
  }
  // verifiche a campione
  const q = async (s) => (await client.query(s)).rows[0];
  console.log("--- VERIFICHE ---");
  console.log("size default:", (await q("select column_default from information_schema.columns where table_name='comunicazioni' and column_name='size'"))?.column_default);
  console.log("type check novita:", (await q("select count(*) n from information_schema.check_constraints where constraint_name='comunicazioni_type_check' and check_clause like '%novita%'"))?.n);
  console.log("regole GNP nuove:", (await q("select count(*) n from catalog_campi_regole where etichetta like 'GNP — %(04/08)'"))?.n, "/4");
  console.log("ordini duplicati residui (>=0):", (await q("select count(*) n from (select ordine from catalog_campi_regole where ordine >= 0 group by ordine having count(*)>1) d"))?.n);
  console.log("opzioni GNP business W3+VF:", (await q("select count(*) n from catalog_opzioni k join catalog_offerte o on o.id=k.offerta_id join catalog_prodotti p on p.id=o.prodotto_id where k.nome='GNP' and p.tipo_cliente='Business' and p.brand_id in ('windtre','vodafone')"))?.n);
  console.log("offerte sost SIM nuove:", (await q("select count(*) n from catalog_offerte o join catalog_prodotti p on p.id=o.prodotto_id join catalog_categorie c on c.id=p.categoria_id where c.nome='Sostituzione SIM' and o.nome in ('Furto/Smarrimento','Danneggiata','Esim','Volontaria') and o.attivo"))?.n, "(attese 52 = 13 prodotti × 4)");
  console.log("bollettino/rid gruppo pagamento:", (await q("select count(*) n from catalog_opzioni where gruppo_singolo='pagamento'"))?.n, "(attese 32)");
  console.log("rpc brands_dispositivi:", (await q("select count(*) n from pg_proc where proname='brands_dispositivi'"))?.n);
  console.log("stores is_ufficio true:", (await q("select count(*) n from stores where is_ufficio"))?.n, "(attesi 3: Ufficio, Ufficio Commerciale, Agenzia)");
  console.log("stores Agenzia:", (await q("select count(*) n from stores where name='Agenzia' and active"))?.n);
  console.log("brand_negozio popolati:", (await q("select count(*) n from stores where brand_negozio is not null"))?.n, "(attesi 15)");
  console.log("task chiusura_linea aperte residue:", (await q("select count(*) n from admin_tasks where tipo='chiusura_linea' and done=false"))?.n, "(attese 0)");
  console.log("marg_items.icon:", (await q("select count(*) n from information_schema.columns where table_name='marg_items' and column_name='icon'"))?.n);
  console.log("marg icone backfillate:", (await q("select count(*) n from marg_items where icon is not null"))?.n);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
