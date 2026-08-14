// CONTEGGIO MOBILE W3 + TABELLA TELEFONI (Luca 14/08 sera)
// ① Il conteggio GA nella lettera interna: base 0,25 (valore dato da Luca —
//    la slide W3 dice 0,75 senza Security: segnalato, si cambia in un click
//    dall'editor) e riga «+ Security» +0,75 → 1 con Security/Security Pro
//    (l'opzione è tracciata nelle vendite, campo Opzioni). Extra punteggio
//    come righe vere: MNP da Iliad/Coop/Poste/Tiscali +1 (automatica dalla
//    provenienza), telefono in finanziamento +1,25 (regola in analisi),
//    Professional Staff +0,25 (valore di Luca; la slide dice +0,5 su Staff
//    XL: segnalato).
// ② La tabella GETTONI DEVICE della slide mobile: righe DOCUMENTALI
//    (attivo=false, non matchano mai) finché l'analisi non aggancia fascia
//    di prezzo e finanziamento del telefono venduto.
// Lancio: node seed_w3_punti_mobile.js   (dalla cartella del CRM)
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

// righe punti_*: solo conteggio (niente €) — [componente, nome, punti, ordine, note]
const PUNTI = [
  ["punti_security", "+ Security venduta insieme (conteggio)", 0.75, 7,
    "Con Security o Security Pro nel carrello la GA torna a valere 1 in soglia (0,25 + 0,75). L'opzione è nel campo Opzioni della vendita: si applica da sola."],
  ["punti_mnp_prov", "+ MNP da Iliad/Coop/Poste/Tiscali (conteggio)", 1, 8,
    "Extra punteggio dalla provenienza della vendita: si applica da sola."],
  ["punti_fin", "+ Telefono in finanziamento (conteggio)", 1.25, 9,
    "Componente da vendita: la applica l'analisi quando c'è un telefono incluso finanziato o Rata Smart."],
  ["punti_staff", "+ Professional Staff (conteggio)", 0.25, 10,
    "Extra punteggio sulle offerte Professional Staff: si applica da sola dal nome offerta. Nota: la slide W3 dice +0,5 su Staff XL — valore impostato su indicazione di Luca, editabile."],
];

// gettoni device documentali — [nome, €, ordine]
const DEVICE = [
  ["Gettone device · Tel. incl. C.F. e P.IVA VAR · 4G/5G street price <200€", 5, 30],
  ["Gettone device · Tel. incl. C.F. e P.IVA VAR · 5G 200-600€", 15, 31],
  ["Gettone device · Tel. incl. C.F. e P.IVA VAR · 5G ≥600€", 15, 32],
  ["Gettone device · Tel. incl. Findomestic · 4G/5G <200€", 20, 33],
  ["Gettone device · Tel. incl. Findomestic · 5G 200-600€", 25, 34],
  ["Gettone device · Tel. incl. Findomestic · 5G ≥600€", 35, 35],
  ["Gettone device · Tel. incl. Compass · 4G/5G <200€", 20, 36],
  ["Gettone device · Tel. incl. Compass · 5G 200-600€", 25, 37],
  ["Gettone device · Tel. incl. Compass · 5G ≥600€", 40, 38],
  ["Gettone device · Other device dati (Findomestic/Compass)", 15, 39],
  ["Gettone device · 2° device standard (smartphone & smart device)", 15, 40],
];

(async () => {
  await client.connect();
  await client.query("begin");
  try {
    // ① base a 0,25 (GA vale 1 solo con Security — valore di Luca)
    const upd = await client.query(
      `update pay_righe set punti = 0.25,
         note = 'Conteggio base: 0,25 senza Security — con Security/Security Pro si somma la riga +0,75 (=1). Valore dato da Luca 14/08; la slide W3 indica 0,75 senza: verificare con l''azienda.'
       where brand='windtre' and month=$1 and lato='azienda' and pista='mobile'
         and componente in ('base','base_underground')`, [MONTH]);
    console.log("basi mobile a 0,25:", upd.rowCount);

    const gia = await client.query(
      `select count(*)::int as n from pay_righe where brand='windtre' and month=$1 and componente like 'punti_%'`, [MONTH]);
    if (gia.rows[0].n > 0) console.log(`righe punti già presenti (${gia.rows[0].n}) — skip`);
    else {
      for (const [comp, nome, punti, ordine, note] of PUNTI) {
        await client.query(
          `insert into pay_righe (brand, month, lato, pista, componente, nome, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, ordine, note)
           values ('windtre', $1, 'azienda', 'mobile', $2, $3, false, $4, null, '{}', false, true, $5, $6)`,
          [MONTH, comp, nome, punti, ordine, note]);
      }
      console.log("righe punti inserite:", PUNTI.length);
    }

    // ② tabella telefoni (documentale: attivo=false, mai matchata)
    const giaD = await client.query(
      `select count(*)::int as n from pay_righe where brand='windtre' and month=$1 and nome like 'Gettone device%'`, [MONTH]);
    if (giaD.rows[0].n > 0) console.log(`gettoni device già presenti (${giaD.rows[0].n}) — skip`);
    else {
      for (const [nome, eur, ordine] of DEVICE) {
        await client.query(
          `insert into pay_righe (brand, month, lato, pista, nome, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, ordine, note)
           values ('windtre', $1, 'azienda', 'mobile', $2, false, 0, $3, '{}', true, false, $4,
                   'Documentale (spenta): l''importo dipende da fascia di prezzo e finanziamento del telefono — si aggancia in analisi col listino.')`,
          [MONTH, nome, eur, ordine]);
      }
      console.log("gettoni device inseriti:", DEVICE.length);
    }
    await client.query("commit");
  } catch (e) { await client.query("rollback"); throw e; }

  const post = await client.query(
    `select componente, nome, punti, pay_base, attivo from pay_righe
     where brand='windtre' and month=$1 and lato='azienda' and pista='mobile' order by ordine`, [MONTH]);
  console.log("=== pista mobile (lettera) ===");
  post.rows.forEach(r => console.log(" ", (r.componente || "·").padEnd(18), r.nome.slice(0, 60).padEnd(62), "punti", r.punti, r.pay_base != null ? ("€ " + r.pay_base) : "", r.attivo ? "" : "(spenta)"));
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
