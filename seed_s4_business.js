// GARE S4 — SECONDA ONDATA (25/08/2026, terminal S4, direttive Luca pomeriggio):
//   ① DDL: pay_righe.ricorrente + pay_righe.pay_ragazzi_tiers (migrazione 20260825150000)
//   ② consumer CTE Smart: ricorrente 4 €/mese, via il pay_base (non esiste una
//      «base» su S4), S1 di agosto riallineata a 0 come luglio, nota rifatta
//   ③ business «Altri Usi Smart»: 4 fasce di consumo per Luce (kWh) e 4 per
//      Gas (smc) — SOLO gettone Smart (Green Cap non si registra), pay flat
//      per fascia + ricorrente per fascia; punti 0 = fuori dal canvass PDP
//      del residenziale (da confermare con Luca). Oltre la 4ª fascia: ad hoc.
//   ④ catalogo: opzioni «fascia di consumo» (gruppo a scelta OBBLIGATORIA)
//      sulle due offerte business — Registra Vendita le chiede da solo
//   ⑤ lettera: PDF del piano nell'archivio Lettere di gara come
//      «Lettera di incentivazione» (vige fino a nuovo accordo)
// Fonte: «Provvigioni S4 2026 LUCA PERROTTA (2).pdf». Idempotente. Lancio:
//   node seed_s4_business.js
const fs = require("fs");
const path = require("path");

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const SUPA_URL = (env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const ANON = (env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
const ref = SUPA_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("pg");
const client = new Client({
  host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

const MESI = ["2026-07-01", "2026-08-01"];
const PDF_LETTERA = "/Users/macbookl/My Drive/Downloads D/Provvigioni S4 2026 LUCA PERROTTA (2).pdf";
const NOTE_CONSUMER = "Gettone CTE Smart residenziale, 1 PDP = 1 punto nel canvass (bollettino o RID: identico). " +
  "Canvass mese non cumulabile: ≥75 PDP del mese → 130 €, ≥150 → 140 €, retroattivo su tutti i PDP (da confermare). " +
  "Ricorrente nella colonna dedicata: dall'8° mese dal contratto (≈ 6° di fornitura). " +
  "Storno 100% se il cliente non supera 3 fatture. Fonte: Lettera di incentivazione (Piano Luca Perrotta 2026).";
const NOTE_BUSINESS = "Gettone Smart per fascia di consumo annuo (solo Smart: Green Cap e Amici non si registrano). " +
  "La fascia si sceglie in Registra Vendita (scelta obbligatoria sul cliente business). " +
  "Punti 0: non conta nel canvass PDP del residenziale (da confermare). " +
  "Oltre la 4ª fascia il gettone è ad hoc, da concordare con S4. Storno 100% sotto le 3 fatture.";

// fasce dal PDF (colonna GETTONE SMART + RICORRENTE DAL 6° MESE SMART)
const FASCE = {
  Luce: [
    { opzione: "Consumo 0-15.000 kWh", pay: 150, ric: 8 },
    { opzione: "Consumo 15.001-55.000 kWh", pay: 160, ric: 11 },
    { opzione: "Consumo 55.001-100.000 kWh", pay: 220, ric: 15 },
    { opzione: "Consumo 100.001-200.000 kWh", pay: 405, ric: 29 },
  ],
  Gas: [
    { opzione: "Consumo 0-10.000 smc", pay: 150, ric: 8 },
    { opzione: "Consumo 10.001-15.000 smc", pay: 160, ric: 11 },
    { opzione: "Consumo 15.001-25.000 smc", pay: 220, ric: 15 },
    { opzione: "Consumo 25.001-35.000 smc", pay: 325, ric: 23 },
  ],
};

(async () => {
  await client.connect();

  // dump di sicurezza (mai sovrascritto)
  const dumpPath = path.join(__dirname, "dump_s4_business_pre.json");
  if (!fs.existsSync(dumpPath)) {
    const dump = {};
    for (const t of ["pay_righe", "pay_soglie", "pay_piste"]) {
      const { rows } = await client.query(`select * from ${t} where brand='s4'`);
      dump[t] = rows;
    }
    const { rows: opz } = await client.query(
      `select k.* from catalog_opzioni k join catalog_offerte o on o.id=k.offerta_id
       join catalog_prodotti p on p.id=o.prodotto_id where p.brand_id='s4'`);
    dump.catalog_opzioni = opz;
    fs.writeFileSync(dumpPath, JSON.stringify(dump, null, 2));
    console.log("Dump pre:", Object.entries(dump).map(([t, r]) => `${t}=${r.length}`).join(" · "));
  } else console.log("Dump pre già presente: non lo sovrascrivo");

  // ① DDL (idempotente)
  const ddl = fs.readFileSync(path.join(__dirname, "supabase/migrations/20260825150000_s4_pay_ricorrente_ragazzi.sql"), "utf8");
  await client.query(ddl);
  console.log("① DDL ok: pay_righe.ricorrente + pay_righe.pay_ragazzi_tiers");

  // ② consumer: ricorrente 4, base via, nota nuova; S1 agosto → 0
  for (const month of MESI) {
    const { rowCount } = await client.query(
      `update pay_righe set ricorrente=4, pay_base=null, note=$3
       where brand='s4' and month=$1 and lato='azienda' and tipo_cliente='Consumer' and offerta=$2`,
      [month, "Domestici Smart", NOTE_CONSUMER]);
    console.log(`② ${month.slice(0, 7)}: consumer aggiornata (${rowCount} riga)`);
  }
  const s1 = await client.query(
    `update pay_soglie set soglia_da=0 where brand='s4' and month='2026-08-01' and pista='energia' and tier=1 and soglia_da<>0`);
  console.log(`② S1 agosto riallineata a 0 (${s1.rowCount} riga toccata)`);

  // ③ business: 8 righe per mese (idempotente per nome, transazione per mese)
  for (const month of MESI) {
    const { rows: [{ n }] } = await client.query(
      `select count(*)::int n from pay_righe where brand='s4' and month=$1 and lato='azienda' and tipo_cliente='Business'`, [month]);
    if (n > 0) { console.log(`③ ${month.slice(0, 7)}: business già presente (${n} righe), salto`); continue; }
    await client.query("begin");
    try {
      let ord = 10;
      for (const prodotto of ["Luce", "Gas"]) {
        for (const f of FASCE[prodotto]) {
          // pay_base NULL (revisore 25/08): su S4 la «base» non esiste — con
          // S1 da 0 il tier è sempre ≥1 e la pillola Base non deve ricomparire
          await client.query(
            `insert into pay_righe (brand, month, lato, pista, nome, tipo_cliente, categoria, prodotto, offerta, opzione,
               punti, pay_base, pay_tiers, gettone, attivo, note, ordine, ricorrente)
             values ('s4', $1, 'azienda', 'energia', $2, 'Business', null, $3, 'Altri Usi Smart', $4,
               0, null, $5, false, true, $6, $7, $8)`,
            [month, `Altri Usi · ${prodotto} ${f.opzione.replace("Consumo ", "")}`, prodotto, f.opzione,
              [f.pay, f.pay, f.pay], NOTE_BUSINESS, ord++, f.ric]);
        }
        ord = prodotto === "Luce" ? 20 : ord;
      }
      await client.query("commit");
      console.log(`③ ${month.slice(0, 7)}: 8 righe business seminate (4 Luce + 4 Gas, pay flat per fascia)`);
    } catch (e) { await client.query("rollback"); throw e; }
  }

  // ④ catalogo: opzioni fascia (gruppo obbligatorio) sulle 2 offerte business
  const { rows: offerte } = await client.query(
    `select o.id, p.nome prodotto from catalog_offerte o
     join catalog_prodotti p on p.id=o.prodotto_id
     where p.brand_id='s4' and p.tipo_cliente='Business' and o.nome='Altri Usi Smart'`);
  if (offerte.length !== 2) throw new Error(`attese 2 offerte business Altri Usi Smart, trovate ${offerte.length}`);
  for (const off of offerte) {
    let aggiunte = 0;
    for (const [i, f] of FASCE[off.prodotto].entries()) {
      const { rows: gia } = await client.query(
        `select id from catalog_opzioni where offerta_id=$1 and nome=$2`, [off.id, f.opzione]);
      if (gia.length) continue;
      await client.query(
        `insert into catalog_opzioni (offerta_id, nome, tipo, gruppo_singolo, obbligatoria, ordine, attivo)
         values ($1, $2, null, 'fascia di consumo', true, $3, true)`, [off.id, f.opzione, 20 + i]);
      aggiunte++;
    }
    console.log(`④ Altri Usi Smart · ${off.prodotto}: ${aggiunte} fasce aggiunte (gruppo «fascia di consumo», scelta obbligatoria)`);
  }

  // ⑤ lettera nell'archivio (bucket contracts + gare_lettere)
  const { rows: giaLettera } = await client.query(
    `select id from gare_lettere where brand='s4' and filename ilike 'Lettera di incentivazione%'`);
  if (giaLettera.length) {
    console.log("⑤ lettera già in archivio, salto");
  } else {
    const pdf = fs.readFileSync(PDF_LETTERA);
    const storagePath = `lettere/s4/2026-08/${Date.now()}-Lettera_di_incentivazione_S4_2026.pdf`;
    const up = await fetch(`${SUPA_URL}/storage/v1/object/contracts/${storagePath}`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/pdf" },
      body: pdf,
    });
    if (!up.ok) throw new Error(`upload lettera fallito: ${up.status} ${await up.text()}`);
    await client.query(
      `insert into gare_lettere (brand, month, filename, path, note, created_by)
       values ('s4', '2026-08-01', $1, $2, $3, $4)`,
      ["Lettera di incentivazione S4 2026.pdf", storagePath,
        "Piano Luca Perrotta — non è la lettera del solo agosto: vige fino a nuovo accordo (fino al 31/12/2026 con tacito rinnovo).",
        "Terminal S4 (Claude)"]);
    console.log(`⑤ lettera caricata: ${storagePath} (${Math.round(pdf.length / 1024)} KB)`);
  }

  // ⑥ COLLAUDO: stesso match del motore (pick-one, subset s4: niente
  // componenti/partnership/provenienze) su casi sintetici + copertura reale
  const { rows: righeAgo } = await client.query(
    `select * from pay_righe where brand='s4' and month='2026-08-01' and lato='azienda' and attivo=true order by ordine`);
  const eq = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  const match = (righe, c) => {
    let best = null, bs = -1;
    for (const r of righe) {
      if (r.componente || r.pista === "partnership") continue;
      let s = 0;
      if (r.tipo_cliente != null) { if (!eq(r.tipo_cliente, c.tipo_cliente)) continue; s++; }
      if (r.categoria != null) { if (!eq(r.categoria, c.categoria)) continue; s++; }
      if (r.prodotto != null) { if (!eq(r.prodotto, c.prodotto)) continue; s++; }
      if (r.offerta != null) { if (!eq(r.offerta, c.offerta)) continue; s += 2; }
      if (r.opzione != null && String(r.opzione).trim() !== "") {
        const scelte = String(c.opzioni || "").split(",").map(x => x.replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase()).filter(Boolean);
        const req = String(r.opzione).split("|").map(x => x.trim().toLowerCase()).filter(Boolean);
        if (!req.every(t => scelte.includes(t))) continue;
        s += 2 * req.length;
      }
      if (s > bs || (s === bs && best && r.ordine < best.ordine)) { best = r; bs = s; }
    }
    return best;
  };
  const casi = [
    { nome: "consumer Luce RID", c: { tipo_cliente: "Consumer", categoria: "Energia", prodotto: "Luce", offerta: "Domestici Smart", opzioni: "RID" }, atteso: 100 },
    { nome: "business Luce fascia 2", c: { tipo_cliente: "Business", categoria: "Energia", prodotto: "Luce", offerta: "Altri Usi Smart", opzioni: "RID, Consumo 15.001-55.000 kWh" }, atteso: 160 },
    { nome: "business Gas fascia 4", c: { tipo_cliente: "Business", categoria: "Energia", prodotto: "Gas", offerta: "Altri Usi Smart", opzioni: "Bollettino, Consumo 25.001-35.000 smc" }, atteso: 325 },
    { nome: "business senza fascia", c: { tipo_cliente: "Business", categoria: "Energia", prodotto: "Luce", offerta: "Altri Usi Smart", opzioni: "RID" }, atteso: null },
  ];
  let ko = 0;
  for (const t of casi) {
    const r = match(righeAgo, t.c);
    const pay = r ? Number(r.pay_tiers[0]) : null;
    const ok = pay === t.atteso;
    if (!ok) ko++;
    console.log(`⑥ ${ok ? "✓" : "✗ KO"} ${t.nome} → ${r ? `«${r.nome}» S1 ${pay} € (ric ${r.ricorrente} €/m)` : "nessuna riga"} — atteso ${t.atteso ?? "nessuna riga"}`);
  }
  const { rows: [tot] } = await client.query(
    `select count(*)::int n from pay_righe where brand='s4' and lato='azienda' and attivo=true`);
  console.log(`Totale righe pay s4 attive: ${tot.n} (attese 18 = 2 mesi × (1 consumer + 8 business))`);
  if (ko) { console.error(`COLLAUDO FALLITO: ${ko} casi KO`); process.exit(1); }
  await client.end();
  console.log("FATTO ✓");
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
