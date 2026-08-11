// APPLICA la migrazione 20260810130000 (Kipoint Spedizioni Nazionali: prodotto,
// 8 fasce TBASE, 19 opzioni per fascia, prezzi in catalog_valori, regola campi
// destinatario). Idempotente: rilanciabile senza doppioni.
// Lancio (dalla cartella CRM):  node apply_mig_kipoint_sped.js
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

const FILE = "20260810130000_kipoint_spedizioni_nazionali.sql";

(async () => {
  await client.connect();
  const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", FILE), "utf8");
  await client.query("begin");
  try { await client.query(sql); await client.query("commit"); console.log("OK  ", FILE); }
  catch (e) { await client.query("rollback"); console.error("FAIL", FILE, "→", e.message); process.exit(1); }

  const q = async (s) => (await client.query(s)).rows[0];
  console.log("--- VERIFICHE ---");
  console.log("prodotto Nazionali:", (await q(
    `select count(*) n from catalog_prodotti p join catalog_categorie c on c.id=p.categoria_id
     where p.brand_id='kipoint' and c.nome='Spedizioni' and p.nome='Nazionali' and p.attivo`))?.n, "(attesa 1)");
  console.log("fasce TBASE attive:", (await q(
    `select count(*) n from catalog_offerte o join catalog_prodotti p on p.id=o.prodotto_id
     where p.brand_id='kipoint' and p.nome='Nazionali' and o.attivo`))?.n, "(attese 8)");
  console.log("opzioni totali (19×8):", (await q(
    `select count(*) n from catalog_opzioni k join catalog_offerte o on o.id=k.offerta_id
     join catalog_prodotti p on p.id=o.prodotto_id where p.brand_id='kipoint' and p.nome='Nazionali'`))?.n, "(attese 152)");
  console.log("prezzi fasce:", (await q(
    `select count(*) n from catalog_valori v join catalog_offerte o on o.id=v.offerta_id
     join catalog_prodotti p on p.id=o.prodotto_id where p.nome='Nazionali' and p.brand_id='kipoint'`))?.n, "(attesi 8)");
  console.log("prezzi opzioni:", (await q(
    `select count(*) n from catalog_valori v join catalog_opzioni k on k.id=v.opzione_id
     join catalog_offerte o on o.id=k.offerta_id join catalog_prodotti p on p.id=o.prodotto_id
     where p.nome='Nazionali' and p.brand_id='kipoint'`))?.n, "(attesi 152)");
  console.log("regola destinatario:", (await q(
    `select count(*) n from catalog_campi_regole
     where etichetta='🎯 Kipoint Spedizioni Nazionali — destinatario + peso (10/08)' and ordine<0 and attivo`))?.n, "(attesa 1)");
  const spot = await client.query(
    `select o.nome, v.prezzo from catalog_valori v join catalog_offerte o on o.id=v.offerta_id
     join catalog_prodotti p on p.id=o.prodotto_id where p.nome='Nazionali' and p.brand_id='kipoint' order by o.ordine`);
  console.log("--- listino fasce a DB ---");
  for (const r of spot.rows) console.log(`   ${r.nome} → ${Number(r.prezzo).toFixed(2)}€`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
