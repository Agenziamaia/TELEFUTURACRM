// FIX CASELLE EMAIL (02/08): riassegna il NEGOZIO giusto alle caselle dei
// punti vendita ricollegate sotto "Garbatella" (chi le ha ricollegate aveva
// quel negozio). Idempotente; stampa prima/dopo. Le caselle personali
// (negozio NULL) non si toccano.
const fs = require("fs");
const path = require("path");
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("pg");
const client = new Client({ host: `db.${ref}.supabase.co`, port: 5432, database: "postgres",
  user: "postgres", password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });

const MAPPA = {
  "baleniere@telefuturasrl.com": "Baleniere",
  "magliana@telefuturasrl.com": "Magliana Multi",
  "maglianaw3@telefuturasrl.com": "Magliana W3",
  "collatina@telefuturasrl.com": "Collatina Multi",
  "collatinaw3@telefuturasrl.com": "Collatina W3",
  "donnaolimpia@telefuturasrl.com": "Donna",
  "inserimenti@telefuturasrl.com": "Ufficio",
};

(async () => {
  await client.connect();
  const { rows: prima } = await client.query("select email_address, negozio from email_accounts order by email_address");
  console.log("PRIMA:"); prima.forEach(r => console.log(`  ${r.email_address} → ${r.negozio || "—"}`));
  await client.query("begin");
  try {
    for (const [email, negozio] of Object.entries(MAPPA)) {
      await client.query("update email_accounts set negozio = $1 where email_address = $2", [negozio, email]);
    }
    await client.query("commit");
  } catch (e) { await client.query("rollback"); throw e; }
  const { rows: dopo } = await client.query("select email_address, negozio from email_accounts order by email_address");
  console.log("DOPO:"); dopo.forEach(r => console.log(`  ${r.email_address} → ${r.negozio || "—"}`));
  console.log("FIX CASELLE COMPLETATO");
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
