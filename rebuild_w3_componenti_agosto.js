// RICOSTRUZIONE RIGHE W3 A COMPONENTI ADDITIVE (cantiere Gare da zero, 13/08/2026)
// Le 27 righe-combinazione mobile/fisso (MNP = base+1 già sommato, 12 righe
// Underground ridondanti, Tied ASSENTE) diventano le componenti della lettera:
//   mobile: GA base [1/1,5/2/2,25] · base Underground [0,5/1/1,5/1,75] ·
//           +MNP [1] · +Tied Ric.Auto [2/2/2,25/2,25] · +P.IVA [1]
//   fisso:  base [2/3/3,5/4/5] · +Convergenza [2] · +Linea agg. [1] ·
//           +P.IVA [1] · +FTTH [1] · +FWA [1,5] · +Opzioni [0,25/0,5/0,5/1/1,5]
// Tutte le vecchie combinazioni si riproducono per somma (verificato: Fisso
// P.IVA Conv 2+2+1=5 ✓, FWA Indoor Conv 2+2+1,5=5,5 ✓, MNP 1+1=2 ✓ ecc.);
// il Tied prima NON era pagato. Il compenso contrattuale (Untied 1€/Tied 5€)
// arriva con la fase gettoni.
// Lancio: node rebuild_w3_componenti_agosto.js   (dalla cartella del CRM)
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

// [pista, componente, nome, tiers, punti, ordine, note]
const COMPONENTI = [
  ["mobile", "base", "GA base ×canone", [1, 1.5, 2, 2.25], 1, 0,
    "Conteggio: 1,0 con Più Sicuri Mobile/Pro, 0,75 senza; +0,5 Professional Staff XL e Phase IN Tied (regole in analisi)."],
  ["mobile", "base_underground", "GA base Underground ×canone", [0.5, 1, 1.5, 1.75], 1, 1, null],
  ["mobile", "mnp", "+ MNP ×canone", [1, 1, 1, 1], 0, 2,
    "Conteggio: +1,0 se provenienza Iliad/Coop/Poste/Tiscali (campo vendita Operatore di Provenienza)."],
  ["mobile", "tied", "+ Tied (Ric. Automatica) ×canone", [2, 2, 2.25, 2.25], 0, 3,
    "Conteggio: +1,25 se Tied con telefono incluso finanziato o Rata Smart 1° device (regola in analisi)."],
  ["mobile", "piva", "+ P.IVA ×canone", [1, 1, 1, 1], 0, 4, null],
  ["fisso", "base", "Attivazione base ×canone", [2, 3, 3.5, 4, 5], 1, 10, null],
  ["fisso", "conv", "+ Convergenza ×canone", [2, 2, 2, 2, 2], 0, 11, null],
  ["fisso", "la", "+ Linea aggiuntiva ×canone", [1, 1, 1, 1, 1], 0, 12,
    "Componente da vendita: la applica l'analisi (non deducibile dall'offerta)."],
  ["fisso", "piva", "+ P.IVA ×canone", [1, 1, 1, 1, 1], 0.5, 13,
    "Il conteggio P.IVA fisso vale 1,5: base 1 + questa 0,5."],
  ["fisso", "ftth", "+ Fibra FTTH ×canone", [1, 1, 1, 1, 1], 0, 14,
    "Componente da vendita: la applica l'analisi quando la linea è FTTH."],
  ["fisso", "fwa", "+ FWA Indoor 2P & Outdoor 1ª linea ×canone", [1.5, 1.5, 1.5, 1.5, 1.5], 0, 15, null],
  ["fisso", "opzioni", "+ Opzioni aggiuntive (Illimitate/Internazionali) ×canone", [0.25, 0.5, 0.5, 1, 1.5], 0, 16,
    "Componente da vendita: la applica l'analisi quando l'opzione è nel carrello."],
];

(async () => {
  await client.connect();
  const pre = await client.query(
    `select * from pay_righe where brand='windtre' and month=$1 and lato='azienda'
     and pista in ('mobile','fisso') and moltiplicatore = true order by pista, ordine`, [MONTH]);
  fs.writeFileSync(path.join(__dirname, "dump_w3_righe_molt_pre_componenti.json"), JSON.stringify(pre.rows, null, 2));
  console.log("Dump pre-ricostruzione:", pre.rows.length, "righe → dump_w3_righe_molt_pre_componenti.json");

  const gia = await client.query(
    `select count(*)::int as n from pay_righe where brand='windtre' and month=$1 and componente is not null`, [MONTH]);
  if (gia.rows[0].n > 0) { console.log(`componenti già presenti (${gia.rows[0].n}) — stop`); await client.end(); return; }

  await client.query("begin");
  try {
    const del = await client.query(
      `delete from pay_righe where brand='windtre' and month=$1 and lato='azienda'
       and pista in ('mobile','fisso') and moltiplicatore = true`, [MONTH]);
    console.log("combinazioni eliminate:", del.rowCount);
    for (const [pista, comp, nome, tiers, punti, ordine, note] of COMPONENTI) {
      await client.query(
        `insert into pay_righe (brand, month, lato, pista, componente, nome, moltiplicatore, punti, pay_tiers, gettone, attivo, ordine, note)
         values ('windtre', $1, 'azienda', $2, $3, $4, true, $5, $6, false, true, $7, $8)`,
        [MONTH, pista, comp, nome, punti, tiers, ordine, note]);
    }
    await client.query("commit");
  } catch (e) { await client.query("rollback"); throw e; }

  const post = await client.query(
    `select pista, componente, nome, punti, pay_tiers from pay_righe
     where brand='windtre' and month=$1 and lato='azienda' and componente is not null order by ordine`, [MONTH]);
  console.log("=== COMPONENTI ===");
  post.rows.forEach(r => console.log(r.pista.padEnd(6), (r.componente || "").padEnd(16), "tiers", JSON.stringify(r.pay_tiers.map(Number)), "punti", r.punti));
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
