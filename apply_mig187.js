// APPLICA MIG. 187 (brand × negozio + Kipoint)
// Lancio: node apply_mig187.js   (dalla cartella del CRM)
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
  for (const f of ["20260806040000_brand_negozio_kipoint.sql"]) {
    const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", f), "utf8");
    await client.query("begin");
    try { await client.query(sql); await client.query("commit"); }
    catch (e) { await client.query("rollback"); throw e; }
    console.log("APPLICATA:", f);
  }
  const { rows } = await client.query(`select store, brand, vede, registra from store_brand_rules order by store`);
  console.log("  regole:", rows.map(r => `${r.store}:${r.brand}(${r.vede ? "V" : ""}${r.registra ? "R" : ""})`).join(" · ") || "(nessuna)");
  const b = await client.query(`select id, default_abilitato from catalog_brands where id='kipoint'`);
  console.log("  kipoint:", JSON.stringify(b.rows));
  const p2 = await client.query(`select nome, tipo_cliente from catalog_prodotti where brand_id='kipoint'`);
  console.log("  prodotti kipoint:", p2.rows.map(r => r.nome).join(" · "));
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
