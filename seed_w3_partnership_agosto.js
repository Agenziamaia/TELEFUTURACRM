// PARTNERSHIP REWARD W3 — seed agosto (cantiere Gare da zero, 13/08/2026)
// ① pay_target_pdv (franchising): dal raw dell'Excel Target già importato
//    ricava i campi strutturati dentro extra:
//      extra.pr       = { target, premio80, premio }          (per PDV)
//      extra.ass_rs   = { decurt_sotto, premio500_da, premio750_da }  (RS)
//      extra.protetti = { rs_decurt_sotto, rs_decurt_eur, rs_premio_da, rs_premio_eur }
//    (indici colonna del foglio Target: 38-40 PR, 41-43 assicurazioni RS,
//     44-47 W3 Protetti, verificati sul dump del 13/08)
// ② pay_righe: semina gli EVENTI Customer Base della Partnership Reward
//    (pista 'partnership', punti dalla slide 14 della lettera GARA AGOSTO)
//    con guardia anti-doppio sulla pista.
// Lancio: node seed_w3_partnership_agosto.js   (dalla cartella del CRM)
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

// eventi CB validi per la Partnership Reward (lettera GARA AGOSTO, slide 14)
const EVENTI = [
  ["Cambio offerta MIA Untied / CYC Untied (incl. MIA Unlimited Untied 1° mese gratis)", 2],
  ["Cambio offerta MIA Easy Pay / Smart Pack / CYC Easy Pay (incl. MIA Unlimited EP 1° mese gratis)", 4],
  ["Rivincoli MIA EasyPay / Smart Pack · Rivincoli Dati", 4],
  ["Telefono in vendita a rate (incl. Smart Device 1° device)", 6],
  ["Telefono in finanziamento (incl. Multi 2° device e Smart Device 1° device)", 8],
  ["Cambio offerta Mobile Microbusiness (incl. da Consumer a Micro)", 4],
  ["Migrazione Customer Base fissa verso fibra", 2],
  ["Inserimento migrazione tecnologica (WLR verso FTTC)", 2],
  ["Cambio piano fisso Netflix su Customer Base profilata", 4],
  ["Add on: Reload Exchange", 2],
  ["Add on: Più Sicuri Casa&Ufficio", 1],
  ["Offerte speciali di Caring", 1],
];

const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d,.-]/g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };

(async () => {
  await client.connect();

  // ① campi strutturati dentro extra (solo righe franchising = cod_gara numerico)
  const t = await client.query(
    `select id, cod_gara, negozio, extra from pay_target_pdv
     where brand='windtre' and month=$1 and cod_gara ~ '^[0-9]+$' order by negozio`, [MONTH]);
  for (const r of t.rows) {
    const raw = r.extra?.raw;
    if (!Array.isArray(raw) || raw.length < 48) { console.log("SKIP (raw assente):", r.negozio); continue; }
    const extra = {
      ...r.extra,
      pr: { target: num(raw[38]), premio80: num(raw[39]), premio: num(raw[40]) },
      ass_rs: { premio500_da: num(raw[41]), premio750_da: num(raw[42]), decurt_sotto: num(raw[43]) },
      protetti: { rs_decurt_sotto: num(raw[44]), rs_decurt_eur: num(raw[45]), rs_premio_da: num(raw[46]), rs_premio_eur: num(raw[47]) },
    };
    await client.query(`update pay_target_pdv set extra=$1 where id=$2`, [JSON.stringify(extra), r.id]);
    console.log(`extra ok  ${r.negozio.padEnd(12)} PR target ${extra.pr.target} → 80% ${extra.pr.premio80} € · pieno ${extra.pr.premio} €`);
  }

  // ② eventi Partnership in pay_righe (guardia anti-doppio)
  const gia = await client.query(
    `select count(*)::int as n from pay_righe where brand='windtre' and month=$1 and pista='partnership'`, [MONTH]);
  if (gia.rows[0].n > 0) {
    console.log(`eventi già presenti (${gia.rows[0].n}) — nessun insert`);
  } else {
    await client.query("begin");
    try {
      let i = 0;
      for (const [nome, punti] of EVENTI) {
        await client.query(
          `insert into pay_righe (brand, month, lato, pista, nome, punti, pay_tiers, gettone, attivo, ordine, note)
           values ('windtre', $1, 'azienda', 'partnership', $2, $3, '{}', false, true, $4, 'Evento CB Partnership Reward (slide 14 lettera agosto)')`,
          [MONTH, nome, punti, ++i]);
      }
      await client.query("commit");
      console.log(`eventi Partnership inseriti: ${EVENTI.length}`);
    } catch (e) { await client.query("rollback"); throw e; }
  }
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
