// W3 — GETTONE DEVICE acceso + EXTRA GARA SMARTPHONE CB (Luca 26/08 sera).
// Fonte: lettera FRANCHISING «GARA AGOSTO.pptx» (NON la Multibrand: lì gli
// importi CB sono diversi, 8 € invece di 10 €).
//
// ① Le 15 righe «Gettone device» erano SPENTE e senza ancore («documentale»)
//    perché l'importo dipende dalla fascia di street price del telefono, che
//    il motore non sapeva leggere. Ora la legge: `caricaContrattiMese`
//    aggancia il Modello Terminale al listino e aggiunge alla vendita le
//    opzioni «SP <200€» / «SP 200-600€» / «SP ≥600€» e «Terminale 5G».
//    Qui le righe vengono ancorate a quelle opzioni e riaccese.
//      NUOVA ATTIVAZIONE (slide mobile, per fascia di STREET PRICE):
//        TEL. INCL. C.F. e P.IVA VAR    5€ · 15€ · 15€   (other device dati: –)
//        TEL. INCL. C.F. FINDOMESTIC   20€ · 25€ · 35€   (other device dati 15€)
//        TEL. INCL. C.F. COMPASS       20€ · 25€ · 40€   (other device dati 15€)
//        2° DEVICE STANDARD                        15€
//      CUSTOMER BASE (slide 10, per IMPORTO AGGIUNTIVO e finanziaria):
//        imp. agg. = 0 (VAR e finanziato)          10€
//        imp. agg. > 0 VAR e Findomestic           15€
//        imp. agg. > 0 Compass                     20€
//        multi device (2° device standard)         15€
//    Le offerte di catalogo dicono già la finanziaria e l'importo aggiuntivo
//    («Findomestic 0», «Compass > 600€», «Rata 0», «Rata > 0»), quindi il CB
//    non ha bisogno della fascia: si ancora al nome offerta.
//
// ② EXTRA GARA SMARTPHONE CB (slide 11, esiste SOLO nel franchising): 15 € per
//    ogni smartphone 5G su Customer Base con street price ≥ 200 €, al
//    raggiungimento di un minimo di 45 5G nel mese — target PER PDV, che sulle
//    RS multipos si somma. Luca: «in gara abbiamo 4 punti vendita anche se i
//    franchising sono 5, uno è scontato» → TARGET 45 × 4 = 180.
//    Va data anche ai ragazzi (Luca: «condividiamola con loro»): la pista
//    entra nel tabellare derivato come le altre.
//
// Idempotente. Lancio: NODE_PATH=<dir pg> node accendi_device_w3.js
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

const B = "windtre", M = "2026-08-01", L = "azienda";
const CAT = "Telefono a Rate";
const BASSO = "SP <200€", MEDIO = "SP 200-600€", ALTO = "SP ≥600€";

// [nome, prodotto, offerta, opzione, €, nota]
const DEVICE = [
  // ─── nuova attivazione: VAR (vendita a rate, nessun finanziamento) ───
  ["Gettone device · VAR · SP <200€",        "Tel. Rate", null, BASSO,  5,
    "Lettera FR, tabella GETTONE DEVICE: «TEL. INCL. C.F. e P.IVA VAR» — smartphone 4G&5G con street price <200€."],
  ["Gettone device · VAR · SP 200-600€",     "Tel. Rate", null, MEDIO, 15,
    "Lettera FR: «TEL. INCL. C.F. e P.IVA VAR», 5G con street price da 200€ a 600€."],
  ["Gettone device · VAR · SP ≥600€",        "Tel. Rate", null, ALTO,  15,
    "Lettera FR: «TEL. INCL. C.F. e P.IVA VAR», 5G con street price ≥600€."],
  // ─── nuova attivazione: finanziato (la finanziaria è nel nome offerta) ───
  ["Gettone device · Findomestic · SP <200€",    "Finanziato", "Findomestic", BASSO, 20,
    "Lettera FR: «TEL. INCL. C.F. FINDOMESTIC», smartphone 4G&5G con street price <200€."],
  ["Gettone device · Findomestic · SP 200-600€", "Finanziato", "Findomestic", MEDIO, 25,
    "Lettera FR: «TEL. INCL. C.F. FINDOMESTIC», 5G da 200€ a 600€."],
  ["Gettone device · Findomestic · SP ≥600€",    "Finanziato", "Findomestic", ALTO,  35,
    "Lettera FR: «TEL. INCL. C.F. FINDOMESTIC», 5G ≥600€."],
  ["Gettone device · Compass · SP <200€",        "Finanziato", "Compass", BASSO, 20,
    "Lettera FR: «TEL. INCL. C.F. COMPASS», smartphone 4G&5G con street price <200€."],
  ["Gettone device · Compass · SP 200-600€",     "Finanziato", "Compass", MEDIO, 25,
    "Lettera FR: «TEL. INCL. C.F. COMPASS», 5G da 200€ a 600€."],
  ["Gettone device · Compass · SP ≥600€",        "Finanziato", "Compass", ALTO,  40,
    "Lettera FR: «TEL. INCL. C.F. COMPASS», 5G ≥600€."],
];

// CB: si ancora al nome offerta, che dice già finanziaria e importo aggiuntivo
const DEVICE_CB = [
  ["Gettone device CB · imp. aggiuntivo 0 (VAR)",          "Tel. Rate CB",   "Rata 0",      10,
    "Lettera FR slide 10, Customer Base Pay x Event: «TELEFONO INCLUSO · IMP. AGG. = 0 VAR e FINANZIATO»."],
  ["Gettone device CB · imp. aggiuntivo >0 (VAR)",         "Tel. Rate CB",   "Rata > 0",    15,
    "Lettera FR slide 10: «IMP. AGG. > 0 VAR e FINDOMESTIC»."],
  ["Gettone device CB · Findomestic · imp. aggiuntivo 0",  "Finanziato CB",  "Findomestic 0", 10,
    "Lettera FR slide 10: «IMP. AGG. = 0 VAR e FINANZIATO»."],
  ["Gettone device CB · Findomestic · imp. aggiuntivo >0", "Finanziato CB",  "Findomestic", 15,
    "Lettera FR slide 10: «IMP. AGG. > 0 VAR e FINDOMESTIC»."],
  ["Gettone device CB · Compass · imp. aggiuntivo 0",      "Finanziato CB",  "Compass 0",   10,
    "Lettera FR slide 10: «IMP. AGG. = 0 VAR e FINANZIATO»."],
  ["Gettone device CB · Compass · imp. aggiuntivo >0",     "Finanziato CB",  "Compass",     20,
    "Lettera FR slide 10: «IMP. AGG. > 0 COMPASS»."],
];

(async () => {
  await client.connect();
  const { rows: pre } = await client.query(
    "select id, nome, attivo, pay_base, prodotto, offerta, opzione from pay_righe where brand=$1 and month=$2 and lato=$3 and nome ilike 'Gettone device%' order by ordine", [B, M, L]);
  let dump = path.join(__dirname, "dump_device_w3_pre.json");
  if (fs.existsSync(dump)) dump = dump.replace(/\.json$/, `_${Date.now()}.json`);
  fs.writeFileSync(dump, JSON.stringify(pre, null, 1));
  console.log(`Dump (${pre.length} righe device): ${path.basename(dump)}`);

  try {
    await client.query("begin");
    // le vecchie righe documentali spente: via, sono sostituite
    const via = await client.query(
      "delete from pay_righe where brand=$1 and month=$2 and lato=$3 and nome ilike 'Gettone device%' and not attivo", [B, M, L]);

    const { rows: [o] } = await client.query(
      "select coalesce(max(ordine),900)+1 ord from pay_righe where brand=$1 and month=$2 and lato=$3 and pista='mobile'", [B, M, L]);
    let ord = Number(o.ord), ins = 0;
    const nuova = async (nome, prodotto, offerta, opzione, eur, nota, pista) => {
      const { rows: [{ n }] } = await client.query(
        "select count(*)::int n from pay_righe where brand=$1 and month=$2 and lato=$3 and nome=$4", [B, M, L, nome]);
      if (n) return;
      await client.query(
        `insert into pay_righe (brand, month, lato, pista, nome, tipo_cliente, categoria, prodotto, offerta, opzione,
           punti, pay_base, pay_tiers, gettone, moltiplicatore, attivo, ordine, note, brand_vendita)
         values ($1,$2,$3,$4,$5,null,$6,$7,$8,$9,0,$10,'{}',true,false,true,$11,$12,$1)`,
        [B, M, L, pista, nome, CAT, prodotto, offerta, opzione, eur, ord++, nota]);
      ins++;
    };
    for (const [nome, prod, off, opz, eur, nota] of DEVICE) await nuova(nome, prod, off, opz, eur, nota, "mobile");
    for (const [nome, prod, off, eur, nota] of DEVICE_CB) await nuova(nome, prod, off, null, eur, nota, "cb");

    // ② EXTRA GARA SMARTPHONE CB — pista + soglia + riga evento
    const PISTA = "smartphone_cb";
    const { rows: [{ n: haPista }] } = await client.query(
      "select count(*)::int n from pay_piste where brand=$1 and month=$2 and lato=$3 and chiave=$4", [B, M, L, PISTA]);
    if (!haPista) {
      const { rows: [op] } = await client.query(
        "select coalesce(max(ordine),0)+1 ord from pay_piste where brand=$1 and month=$2 and lato=$3", [B, M, L]);
      await client.query(
        "insert into pay_piste (brand, month, lato, chiave, nome, ordine) values ($1,$2,$3,$4,$5,$6)",
        [B, M, L, PISTA, "Smartphone CB (extra 5G)", Number(op.ord)]);
    }
    const { rows: [{ n: haSoglia }] } = await client.query(
      "select count(*)::int n from pay_soglie where brand=$1 and month=$2 and lato=$3 and pista=$4", [B, M, L, PISTA]);
    if (!haSoglia) {
      await client.query(
        "insert into pay_soglie (brand, month, lato, pista, tier, soglia_da, bonus) values ($1,$2,$3,$4,1,180,null)",
        [B, M, L, PISTA]);
    }
    await nuova("Extra smartphone 5G su CB (SP ≥200€)", null, null, null, 15,
      "Lettera FR slide 11 «EXTRA INCENTIVAZIONE SMARTPHONE CB»: extra gettone 15 € per ogni smartphone 5G su Customer Base con street price ≥ 200 €, al raggiungimento di un minimo di 45 smartphone 5G nel mese. Il target è PER PUNTO VENDITA e sulle RS multipos si somma: 45 × 4 PDV in gara = 180 (Luca 26/08: «i franchising sono 5 ma uno è scontato»). Esclusi tutti i Multi 2° Device e gli Smart Device.", PISTA);
    // ancore proprie: solo CB, solo 5G, solo fascia ≥200 (due righe gemelle
    // perché le fasce ≥200 sono due: 200-600 e ≥600)
    await client.query(
      `update pay_righe set categoria=$4, opzione=$5 where brand=$1 and month=$2 and lato=$3
         and nome = 'Extra smartphone 5G su CB (SP ≥200€)' and opzione is null`,
      [B, M, L, CAT, `${MEDIO}|Terminale 5G`]);
    await nuova("Extra smartphone 5G su CB (SP ≥600€)", null, null, `${ALTO}|Terminale 5G`, 15,
      "Gemella della riga sopra per la fascia alta: la lettera dice «street price ≥ 200 €», che da noi sono due fasce (200-600 e ≥600).", PISTA);

    await client.query("commit");
    console.log(`documentali rimosse: ${via.rowCount} · righe nuove: ${ins}`);
  } catch (e) {
    await client.query("rollback");
    console.error("ROLLBACK:", e.message);
    process.exitCode = 1; await client.end(); return;
  }

  const { rows } = await client.query(
    `select pista, nome, prodotto, offerta, opzione, pay_base from pay_righe
     where brand=$1 and month=$2 and lato=$3 and attivo
       and (nome ilike 'Gettone device%' or nome ilike 'Extra smartphone%') order by pista, ordine`, [B, M, L]);
  console.log("\nRIGHE ATTIVE:");
  for (const r of rows)
    console.log(`  [${r.pista}] ${r.nome.padEnd(42)} ${String(r.prodotto || "-").padEnd(14)} ${String(r.offerta || "-").padEnd(13)} ${String(r.opzione || "-").padEnd(24)} ${r.pay_base} €`);
  await client.end();
})();
