// APPLICA la migrazione 20260810233000 (allegato contratto amministrabile dal
// catalogo: colonna contratto_richiesto a 4 livelli + seed iliad/sky/assicurazioni).
// Idempotente. Lancio: node apply_mig_contratto.js
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
const FILE = "20260810233000_contratto_richiesto.sql";
(async () => {
  await client.connect();
  const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", FILE), "utf8");
  await client.query("begin");
  try { await client.query(sql); await client.query("commit"); console.log("OK  ", FILE); }
  catch (e) { await client.query("rollback"); console.error("FAIL", FILE, "→", e.message); process.exit(1); }
  console.log("--- VERIFICHE ---");
  const seed = (await client.query(`select id, contratto_richiesto from catalog_brands where contratto_richiesto is not null order by id`)).rows;
  console.log("brand con regola:", seed.map(r => `${r.id}=${r.contratto_richiesto}`).join(" · ") || "nessuno");
  const cat = (await client.query(`select nome, contratto_richiesto from catalog_categorie where contratto_richiesto is not null order by nome`)).rows;
  console.log("categorie con regola:", cat.map(r => `${r.nome}=${r.contratto_richiesto}`).join(" · ") || "nessuna");
  console.log("(attesi: iliad=assente · sky=facoltativo · Assicurazioni=assente)");
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
