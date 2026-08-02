// BONIFICA is_demo (01/08): i clienti VERI marcati "demo" per sbaglio.
// Caller, Registra Usato e "Nuovo Cliente" non impostavano is_demo e il
// default della colonna e' TRUE: ~301 anagrafiche reali risultavano demo.
// I dati finti del seed (id CLIENT_*/CTR_*) non esistono piu' a DB (reset
// del 30/07), ma il WHERE li esclude comunque per sicurezza.
// Lancio: node apply_bonifica_isdemo.js   (dalla cartella del CRM)
const fs = require("fs");
const path = require("path");

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));

const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("pg");
const client = new Client({
  host: `db.${ref}.supabase.co`, port: 5432, database: "postgres",
  user: "postgres", password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

(async () => {
  await client.connect();

  // dump di sicurezza PRIMA (lezione 30/07: sempre, prima di toccare in massa)
  const { rows: before } = await client.query("select id, is_demo from clients order by id");
  fs.writeFileSync(path.join(__dirname, "dump_isdemo_pre_bonifica.json"), JSON.stringify(before, null, 2));
  console.log(`Dump di sicurezza: ${before.length} clienti in dump_isdemo_pre_bonifica.json`);

  await client.query("begin");
  let n;
  try {
    const res = await client.query(`
      update clients
         set is_demo = false
       where is_demo is distinct from false
         and id not like 'CLIENT\\_%'`);
    n = res.rowCount;
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  }

  const { rows: [chk] } = await client.query(`
    select count(*) filter (where is_demo = false) as veri,
           count(*) filter (where is_demo is distinct from false) as ancora_demo,
           count(*) as tot
    from clients`);
  console.log("BONIFICA COMPLETATA");
  console.log(`  righe corrette: ${n}`);
  console.log(`  clienti: ${chk.tot} totali, ${chk.veri} veri (is_demo=false), ${chk.ancora_demo} ancora demo (attesi: 0)`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
