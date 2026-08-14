// EXTRA FISSO W3 (Luca 14/08 sera: «non vedo Netflix, casa protetti ecc.»):
// i gettoni ad hoc della slide Fisso diventano COMPONENTI flat (€ + punti
// nella stessa riga) accese automaticamente dalle opzioni del catalogo —
// Netflix 10 € (+0,5 punti), Più Sicuri Ufficio 2 € (+0,25), Cloud 8 €
// (0 punti), Professional Box/FRITZ +40 € (+1), 2ª linea conteggio 1,5;
// bollettino postale come documentale (non è un'attivazione a catalogo).
// Lancio: node seed_w3_extra_fisso.js   (dalla cartella del CRM)
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

// [componente, nome, gettone, pay_base, punti, opzione (documentazione), ordine, note]
const RIGHE = [
  ["netflix", "Netflix (opzione sul fisso)", true, 10, 0.5, "Netflix", 20,
    "Slide: senza pubblicità 10 € · con pubblicità 5 € — l'opzione a catalogo non distingue: se serve la sdoppiamo. Conta anche +0,5 in soglia."],
  ["pscu", "Più Sicuri Ufficio (opzione)", true, 2, 0.25, "Più Sicuri Ufficio", 21,
    "Slide: 2 € e +0,25 in soglia."],
  ["cloud", "Cloud / Professional Cloud (opzione)", true, 8, 0, "Cloud", 22,
    "Slide: 8 € — non conta in soglia di gara."],
  ["fritz", "Super Fibra Professional Box — FRITZ!Box", true, 40, 1, null, 23,
    "Slide: +40 € e punteggio extra +1 quando l'offerta è il Professional Box."],
  ["punti_2linea", "+ Seconda linea Professional (conteggio)", false, null, 1.5, "2°Linea", 24,
    "Slide: la 2ª linea Professional conta 1,5 in soglia (opzione 2°Linea)."],
];

(async () => {
  await client.connect();
  const gia = await client.query(
    `select count(*)::int as n from pay_righe where brand='windtre' and month=$1 and pista='fisso'
     and componente in ('netflix','pscu','cloud','fritz','punti_2linea')`, [MONTH]);
  if (gia.rows[0].n > 0) { console.log(`già presenti (${gia.rows[0].n}) — skip`); await client.end(); return; }
  await client.query("begin");
  try {
    for (const [comp, nome, gett, base, punti, opz, ord, note] of RIGHE) {
      await client.query(
        `insert into pay_righe (brand, month, lato, pista, componente, nome, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, opzione, ordine, note)
         values ('windtre', $1, 'azienda', 'fisso', $2, $3, false, $4, $5, '{}', $6, true, $7, $8, $9)`,
        [MONTH, comp, nome, punti, base, gett, opz, ord, note]);
    }
    await client.query(
      `insert into pay_righe (brand, month, lato, pista, nome, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, ordine, note)
       values ('windtre', $1, 'azienda', 'fisso', 'Bollettino postale (per soglia fisso)', false, 0, null, '{38,43,45,48,53}', true, false, 25,
               'Documentale (spenta): 38/43/45/48/53 € alla soglia fisso — escluso contrattuale, escluse Voce Casa e 2ª linea; evento non registrabile a catalogo oggi.')`, [MONTH]);
    await client.query("commit");
    console.log("inserite:", RIGHE.length + 1);
  } catch (e) { await client.query("rollback"); throw e; }
  const post = await client.query(
    `select componente, nome, punti, pay_base, attivo from pay_righe
     where brand='windtre' and month=$1 and pista='fisso' and (gettone or componente like 'punti_%') order by ordine`, [MONTH]);
  post.rows.forEach(r => console.log(" ", (r.componente || "·").padEnd(14), r.nome.slice(0, 52).padEnd(54), "punti", r.punti, r.pay_base != null ? ("€ " + r.pay_base) : "", r.attivo ? "" : "(spenta)"));
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
