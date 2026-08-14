// SCORPORO LUCE&GAS (correzione Luca 14/08: il delta 35 della slide =
// 25 di convergenza col fisso + 10 di pronto assistenza):
// via le 8 righe pre-sommate → 4 BASI per offerta (componente 'base', la
// convergenza +25 è già dentro le offerte Multiservice come da lettera) +
// 2 MODIFICATORI additivi: lg_pronto +10 € e lg_bollettino −15 € (no SDD),
// accesi dalle opzioni. Il motore additivo ora copre anche la pista lucegas.
// Lancio: node fix_w3_lucegas_scorporo.js   (dalla cartella del CRM)
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

const MONTH = "2026-08-01";

(async () => {
  await client.connect();
  await client.query("begin");
  try {
    // via le 8 righe pre-sommate (varianti Bollettino/Pronto)
    const del = await client.query(
      `delete from pay_righe where brand='windtre' and month=$1 and pista='lucegas' and opzione is not null`, [MONTH]);
    // le 4 basi diventano componenti 'base' con le note di scomposizione
    await client.query(
      `update pay_righe set componente='base' where brand='windtre' and month=$1 and pista='lucegas'`, [MONTH]);
    await client.query(
      `update pay_righe set note='95-140 = base 70-115 + 25 € di convergenza col fisso (Gettone Convergenza della lettera, già dentro le offerte Multiservice).'
       where brand='windtre' and month=$1 and pista='lucegas' and offerta like '%Multiservice%'`, [MONTH]);
    // modificatori additivi
    await client.query(
      `insert into pay_righe (brand, month, lato, pista, componente, nome, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, opzione, ordine, note)
       values ('windtre', $1, 'azienda', 'lucegas', 'lg_pronto', '+ Pronto assistenza Luce&Gas', false, 0, 10, '{}', true, true, 'Pronto Intervento', 60,
               'Scorporo della slide: il pronto vale +10 € sul gettone (105-95). Si accende dall''opzione Pronto Intervento.'),
              ('windtre', $1, 'azienda', 'lucegas', 'lg_bollettino', '− Bollettino (attivato senza SDD)', false, 0, -15, '{}', true, true, 'Bollettino', 61,
               'Lettera: attivato senza SDD −15 €. Si accende dall''opzione Bollettino (il RID paga pieno).')`, [MONTH]);
    await client.query("commit");
    console.log("pre-sommate eliminate:", del.rowCount, "· basi marcate + 2 modificatori");
  } catch (e) { await client.query("rollback"); throw e; }
  const post = await client.query(
    `select componente, nome, pay_base, pay_tiers from pay_righe where brand='windtre' and month=$1 and pista='lucegas' order by ordine`, [MONTH]);
  post.rows.forEach(r => console.log(" ", (r.componente || "·").padEnd(14), r.nome.padEnd(46), r.pay_base != null ? ("€ " + r.pay_base) : JSON.stringify(r.pay_tiers.map(Number))));
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
