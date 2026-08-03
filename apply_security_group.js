const fs = require("fs");
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const { Client } = require("pg");
const client = new Client({ host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres", user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
(async () => {
  await client.connect();
  const { rows: prima } = await client.query(`
    select cat.nome categoria, p.nome prodotto, o.nome offerta, k.id, k.nome opzione, k.gruppo_singolo
      from catalog_opzioni k
      join catalog_offerte o on o.id = k.offerta_id
      join catalog_prodotti p on p.id = o.prodotto_id
      join catalog_categorie cat on cat.id = p.categoria_id
     where p.brand_id = 'windtre' and cat.nome ilike 'mobile%' and k.nome ilike '%security%'
     order by cat.nome, p.nome, o.nome, k.nome`);
  console.log("opzioni Security nelle categorie mobili W3:", prima.length);
  const perProdotto = {};
  prima.forEach(r => { perProdotto[`${r.categoria} · ${r.prodotto}`] = (perProdotto[`${r.categoria} · ${r.prodotto}`] || 0) + 1; });
  Object.entries(perProdotto).forEach(([k, n]) => console.log(`  ${k}: ${n} opzioni`));
  const daFare = prima.filter(r => r.gruppo_singolo !== "security");
  for (const r of daFare) await client.query("update catalog_opzioni set gruppo_singolo = 'security' where id = $1", [r.id]);
  console.log(`AGGIORNATE ${daFare.length} → gruppo "security" (già a posto: ${prima.length - daFare.length}).`);
  const { rows: [v] } = await client.query(`
    select count(*)::int n from catalog_opzioni k
      join catalog_offerte o on o.id = k.offerta_id
      join catalog_prodotti p on p.id = o.prodotto_id
      join catalog_categorie cat on cat.id = p.categoria_id
     where p.brand_id = 'windtre' and cat.nome ilike 'mobile%' and k.nome ilike '%security%'
       and coalesce(k.gruppo_singolo, '') <> 'security'`);
  console.log("residui senza gruppo security:", v.n);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
