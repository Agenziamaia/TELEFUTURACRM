// APPLICA MIG. 148 (riordino Gare: chiavi permesso Operatori + trasloco Target/Obiettivi/Direzione)
// Lancio: node apply_mig148.js   (dalla cartella del CRM)
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

(async () => {
  await client.connect();
  for (const f of ["20260803000012_gare_riordino_permessi.sql"]) {
    const sql = fs.readFileSync(path.join(__dirname, "supabase/migrations", f), "utf8");
    await client.query("begin");
    try { await client.query(sql); await client.query("commit"); }
    catch (e) { await client.query("rollback"); throw e; }
    console.log("APPLICATA:", f);
  }
  const { rows } = await client.query(`
    select perm_key, count(*)::int n from public.role_permissions
    where perm_key like '/gare%' or perm_key like '/amministrazione?sez=target%'
       or perm_key like '/amministrazione?sez=obiettivi%' or perm_key like '/amministrazione?sez=direzione%'
    group by perm_key order by perm_key`);
  if (!rows.length) console.log("  (nessuna riga esplicita su Gare/Target: tutto sui default di codice — ok)");
  rows.forEach(r => console.log(`  ${r.perm_key}: ${r.n} righe`));
  const { rows: vecchie } = await client.query(`
    select count(*)::int n from public.role_permissions
    where perm_key in ('/gare?brand=w3','/gare?brand=vs','/gare?brand=vnd','/gare?brand=fastweb',
                       '/gare?brand=sky','/gare?brand=s4','/gare?brand=tim','/gare?brand=dojo',
                       '/amministrazione?sez=target','/amministrazione?sez=obiettivi','/amministrazione?sez=direzione')`);
  console.log(vecchie[0].n === 0 ? "  OK nessuna chiave vecchia residua" : `  ⚠️ ${vecchie[0].n} chiavi vecchie ancora presenti`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
