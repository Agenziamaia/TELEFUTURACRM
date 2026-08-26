// W3 — RIANCORAGGIO delle righe device sui TOKEN (correzione del primo giro).
// Il primo tentativo ancorava l'offerta per nome esatto («Findomestic»), che
// non matcha mai le varianti reali del catalogo («Findomestic < 600€»,
// «Findomestic 0 Rata Smart»…). Ora il motore mette sulla vendita due token
// puliti — `Fin. VAR|Fin. Findomestic|Fin. Compass` e `Imp.agg. 0|Imp.agg. >0`
// — più la fascia di street price e il 5G, e le righe si ancorano a quelli.
//
// Struttura scelta (conta QUALE riga vince il pick-one):
//   · Tel. Rate / Tel. Rate CB / Finanziato CB → righe PICK-ONE: su quei
//     prodotti non esiste nessun'altra riga, quindi non rubano niente.
//   · Finanziato (non-CB) → righe EXTRA_OPZIONE (additive): lì vive già la
//     riga «Telefono finanziato · GA (+1,25 in soglia)» e il pick-one paga UNA
//     riga sola — da pick-one il gettone avrebbe MANGIATO i punti della gara.
//   · Extra gara smartphone CB → pista PARALLELA (come Partnership e P.IVA):
//     conta gli stessi contratti con una regola sua, non compete col gettone.
//
// Idempotente. Lancio: NODE_PATH=<dir pg> node accendi_device_w3b.js
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

const B = "windtre", M = "2026-08-01", L = "azienda", CAT = "Telefono a Rate";
const BASSO = "SP <200€", MEDIO = "SP 200-600€", ALTO = "SP ≥600€", G5 = "Terminale 5G";
const FR = "Lettera FRANCHISING «GARA AGOSTO.pptx»";

// [nome, pista, componente, prodotto, opzione, €, punti, pay_tiers, nota]
const RIGHE = [
  // ── nuova attivazione, vendita a rate (VAR): pick-one, nessun concorrente
  ["Gettone device · VAR · SP <200€",    "mobile", null, "Tel. Rate", BASSO,  5, 0, null, `${FR}, tabella GETTONE DEVICE: «TEL. INCL. C.F. e P.IVA VAR» — smartphone 4G&5G con street price sotto i 200 €.`],
  ["Gettone device · VAR · SP 200-600€", "mobile", null, "Tel. Rate", MEDIO, 15, 0, null, `${FR}: «TEL. INCL. C.F. e P.IVA VAR», 5G da 200 a 600 €.`],
  ["Gettone device · VAR · SP ≥600€",    "mobile", null, "Tel. Rate", ALTO,  15, 0, null, `${FR}: «TEL. INCL. C.F. e P.IVA VAR», 5G oltre i 600 €.`],
  // ── nuova attivazione, finanziato: EXTRA additivi (il pick-one è già preso
  //    dalla riga dei punti +1,25, che non va persa)
  ["Gettone device · Findomestic · SP <200€",    "mobile", "extra_opzione", "Finanziato", `Fin. Findomestic|${BASSO}`, 20, 0, null, `${FR}: «TEL. INCL. C.F. FINDOMESTIC», street price sotto i 200 €. Si SOMMA alla riga dei punti (+1,25 in soglia), non la sostituisce.`],
  ["Gettone device · Findomestic · SP 200-600€", "mobile", "extra_opzione", "Finanziato", `Fin. Findomestic|${MEDIO}`, 25, 0, null, `${FR}: «TEL. INCL. C.F. FINDOMESTIC», 5G da 200 a 600 €.`],
  ["Gettone device · Findomestic · SP ≥600€",    "mobile", "extra_opzione", "Finanziato", `Fin. Findomestic|${ALTO}`,  35, 0, null, `${FR}: «TEL. INCL. C.F. FINDOMESTIC», 5G oltre i 600 €.`],
  ["Gettone device · Compass · SP <200€",        "mobile", "extra_opzione", "Finanziato", `Fin. Compass|${BASSO}`, 20, 0, null, `${FR}: «TEL. INCL. C.F. COMPASS», street price sotto i 200 €.`],
  ["Gettone device · Compass · SP 200-600€",     "mobile", "extra_opzione", "Finanziato", `Fin. Compass|${MEDIO}`, 25, 0, null, `${FR}: «TEL. INCL. C.F. COMPASS», 5G da 200 a 600 €.`],
  ["Gettone device · Compass · SP ≥600€",        "mobile", "extra_opzione", "Finanziato", `Fin. Compass|${ALTO}`,  40, 0, null, `${FR}: «TEL. INCL. C.F. COMPASS», 5G oltre i 600 €.`],
  // ── Customer Base: pick-one (nessun concorrente su quei prodotti)
  ["Gettone device CB · VAR · imp. aggiuntivo 0",          "cb", null, "Tel. Rate CB",  "Imp.agg. 0",  10, 0, null, `${FR} slide 10 «Customer Base Pay x Event»: «TELEFONO INCLUSO · IMP. AGG. = 0 VAR e FINANZIATO».`],
  ["Gettone device CB · VAR · imp. aggiuntivo >0",         "cb", null, "Tel. Rate CB",  "Imp.agg. >0", 15, 0, null, `${FR} slide 10: «IMP. AGG. > 0 VAR e FINDOMESTIC».`],
  ["Gettone device CB · imp. aggiuntivo 0 (finanziato)",   "cb", null, "Finanziato CB", "Imp.agg. 0",  10, 0, null, `${FR} slide 10: «IMP. AGG. = 0 VAR e FINANZIATO» — vale per entrambe le finanziarie.`],
  ["Gettone device CB · Findomestic · imp. aggiuntivo >0", "cb", null, "Finanziato CB", `Fin. Findomestic|Imp.agg. >0`, 15, 0, null, `${FR} slide 10: «IMP. AGG. > 0 VAR e FINDOMESTIC».`],
  ["Gettone device CB · Compass · imp. aggiuntivo >0",     "cb", null, "Finanziato CB", `Fin. Compass|Imp.agg. >0`,     20, 0, null, `${FR} slide 10: «IMP. AGG. > 0 COMPASS».`],
  // ── EXTRA GARA SMARTPHONE CB (slide 11, solo franchising): pista parallela,
  //    1 pezzo a evento verso il target, 15 € alla soglia
  ["Extra smartphone 5G su CB · Tel. Rate · SP 200-600€",  "smartphone_cb", null, "Tel. Rate CB",  `${MEDIO}|${G5}`, null, 1, [15], `${FR} slide 11 «EXTRA INCENTIVAZIONE SMARTPHONE CB»: 15 € per ogni smartphone 5G su Customer Base con street price ≥ 200 €, al raggiungimento di un minimo di 45 smartphone 5G nel mese. Il target è per punto vendita e sulle ragioni sociali multipos si somma: 45 × 4 punti vendita in gara = 180 (Luca 26/08: «i franchising sono 5 ma uno è scontato»). ⚠️ La lettera esclude i Multi 2° Device e gli Smart Device: il CRM oggi non li distingue, quindi il conteggio è per eccesso.`],
  ["Extra smartphone 5G su CB · Tel. Rate · SP ≥600€",     "smartphone_cb", null, "Tel. Rate CB",  `${ALTO}|${G5}`,  null, 1, [15], "Gemella per la fascia alta: la lettera dice «street price ≥ 200 €», che da noi sono due fasce."],
  ["Extra smartphone 5G su CB · Finanziato · SP 200-600€", "smartphone_cb", null, "Finanziato CB", `${MEDIO}|${G5}`, null, 1, [15], "Stessa voce per i telefoni finanziati su Customer Base."],
  ["Extra smartphone 5G su CB · Finanziato · SP ≥600€",    "smartphone_cb", null, "Finanziato CB", `${ALTO}|${G5}`,  null, 1, [15], "Stessa voce, fascia alta."],
];

(async () => {
  await client.connect();
  try {
    await client.query("begin");
    // via le righe del primo giro (ancoraggio sbagliato)
    const via = await client.query(
      `delete from pay_righe where brand=$1 and month=$2 and lato=$3
         and (nome like 'Gettone device%' or nome like 'Extra smartphone%')`, [B, M, L]);

    const { rows: [o] } = await client.query(
      "select coalesce(max(ordine),900)+1 ord from pay_righe where brand=$1 and month=$2 and lato=$3", [B, M, L]);
    let ord = Number(o.ord);
    for (const [nome, pista, comp, prod, opz, eur, punti, tiers, nota] of RIGHE) {
      await client.query(
        `insert into pay_righe (brand, month, lato, pista, nome, componente, categoria, prodotto, opzione,
           punti, pay_base, pay_tiers, gettone, moltiplicatore, attivo, ordine, note, brand_vendita)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false,true,$14,$15,$1)`,
        [B, M, L, pista, nome, comp, CAT, prod, opz, punti, eur, tiers || [], eur != null, ord++, nota]);
    }
    // l'extra gara si condivide coi ragazzi (Luca: «non dedicarla solo
    // all'azienda»): stessa % della gara Customer Base, da cui discende
    const { rows: [cb] } = await client.query(
      "select perc_ragazzi from pay_piste where brand=$1 and month=$2 and lato=$3 and chiave='cb'", [B, M, L]);
    await client.query(
      "update pay_piste set perc_ragazzi=$4, um='pezzi' where brand=$1 and month=$2 and lato=$3 and chiave='smartphone_cb'",
      [B, M, L, cb?.perc_ragazzi ?? 85]);
    await client.query("commit");
    console.log(`vecchie rimosse: ${via.rowCount} · nuove: ${RIGHE.length} · % ragazzi extra gara: ${cb?.perc_ragazzi ?? 85}`);
  } catch (e) {
    await client.query("rollback");
    console.error("ROLLBACK:", e.message);
    process.exitCode = 1; await client.end(); return;
  }
  const { rows } = await client.query(
    `select pista, nome, componente, prodotto, opzione, pay_base, punti, pay_tiers from pay_righe
     where brand=$1 and month=$2 and lato=$3 and attivo
       and (nome like 'Gettone device%' or nome like 'Extra smartphone%') order by pista, ordine`, [B, M, L]);
  console.log("\nRIGHE ATTIVE:");
  for (const r of rows)
    console.log(`  [${String(r.pista).padEnd(13)}] ${(r.componente ? "＋" : "·")} ${r.nome.padEnd(50)} ${String(r.prodotto).padEnd(14)} ${String(r.opzione).padEnd(30)} ${r.pay_base != null ? r.pay_base + " €" : `${r.punti} pz → ${JSON.stringify(r.pay_tiers)} €`}`);
  await client.end();
})();
