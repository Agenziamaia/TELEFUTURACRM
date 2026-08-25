// REGISTRA VENDITA × S4 (25/08/2026 sera, direttive Luca con screenshot):
//   ① S4 NON ha codici di inserimento (calderone unico: conta solo il negozio)
//      → regola campi brand=s4 a ordine -100 che PRENOTA «Codice Inserimento»
//      e lo nasconde (claim-then-skip di risolviCampi): via il widget, via
//      l'obbligo, e det["Cod.Ins."] non si scrive più. Zero codice, zero deploy.
//   ② bonifica: via il Cod.Ins. dai dettagli delle vendite S4 già registrate
//      (l'attribuzione resta su contracts.negozio).
//   ③ RID/Bollettino: gruppo «pagamento» a scelta OBBLIGATORIA su tutte le
//      offerte S4, come le fasce di consumo («rischiamo che si dimentica»).
// Idempotente. Lancio: node fix_s4_codice_pagamento.js
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

(async () => {
  await client.connect();

  // dump (date come testo — lezione del revisore) mai sovrascritto
  const dumpPath = path.join(__dirname, "dump_s4_codins_pre.json");
  if (!fs.existsSync(dumpPath)) {
    const { rows: contr } = await client.query(
      `select id, negozio, dettagli->>'Cod.Ins.' cod_ins from contracts where brand ilike 'S4%' and dettagli ? 'Cod.Ins.'`);
    const { rows: opz } = await client.query(
      `select k.id, o.nome offerta, p.nome prodotto, p.tipo_cliente, k.nome, k.obbligatoria
       from catalog_opzioni k join catalog_offerte o on o.id=k.offerta_id join catalog_prodotti p on p.id=o.prodotto_id
       where p.brand_id='s4' and k.gruppo_singolo='pagamento'`);
    fs.writeFileSync(dumpPath, JSON.stringify({ contratti_cod_ins: contr, opzioni_pagamento: opz }, null, 2));
    console.log(`Dump pre: ${contr.length} contratti con Cod.Ins. · ${opz.length} opzioni pagamento`);
  } else console.log("Dump pre già presente: non lo sovrascrivo");

  // ① regola campi: Codice Inserimento NASCOSTO per il brand s4
  const { rows: gia } = await client.query(
    `select id from catalog_campi_regole where condizioni->'brand' = '["s4"]'::jsonb and campi::text ilike '%Codice Inserimento%'`);
  if (gia.length) {
    console.log("① regola già presente, salto");
  } else {
    await client.query(
      `insert into catalog_campi_regole (etichetta, condizioni, campi, ordine, attivo) values ($1, $2, $3, -100, true)`,
      ["🚫 S4 — niente Codice Inserimento (calderone unico)",
        JSON.stringify({ brand: ["s4"] }),
        JSON.stringify([{ nome: "Codice Inserimento", nota: "S4 non ha codici di inserimento: le pratiche vanno in un calderone unico — l'attribuzione è il negozio della vendita", tipo: "testo", attivo: false, conferma: false }])]);
    console.log("① regola inserita (ordine -100: prenota il nome prima di tutte e lo nasconde solo per s4)");
  }

  // ② bonifica vendite S4 già registrate
  const b1 = await client.query(
    `update contracts set dettagli = dettagli - 'Cod.Ins.' where brand ilike 'S4%' and dettagli ? 'Cod.Ins.'`);
  const b2 = await client.query(
    `update contracts set dettagli = dettagli - 'Codice Inserimento' where brand ilike 'S4%' and dettagli ? 'Codice Inserimento'`);
  const { rows: [resid] } = await client.query(
    `select count(*)::int n from contracts where brand ilike 'S4%' and (dettagli ? 'Cod.Ins.' or dettagli ? 'Codice Inserimento')`);
  console.log(`② bonifica: ${b1.rowCount} Cod.Ins. + ${b2.rowCount} Codice Inserimento rimossi · residui ${resid.n} (attesi 0)`);

  // ③ RID/Bollettino obbligatori su tutte le offerte S4
  const o1 = await client.query(
    `update catalog_opzioni k set obbligatoria = true
     from catalog_offerte o, catalog_prodotti p
     where k.offerta_id = o.id and o.prodotto_id = p.id and p.brand_id = 's4'
       and k.gruppo_singolo = 'pagamento' and k.obbligatoria = false`);
  console.log(`③ RID/Bollettino a scelta obbligatoria (${o1.rowCount} opzioni aggiornate)`);

  // COLLAUDO: replica di risolviCampi (stessa semantica claim-then-skip)
  const { rows: regole } = await client.query(
    `select condizioni, campi from catalog_campi_regole where attivo = true order by ordine`);
  const risolvi = (brand, tipo, categoria, prodotto, offerta) => {
    const out = []; const visti = {};
    for (const r of regole) {
      const c = r.condizioni || {};
      if (c.brand && !c.brand.includes(brand)) continue;
      if (c.tipo && !c.tipo.includes(tipo)) continue;
      if (c.categoria && !c.categoria.includes(categoria)) continue;
      if (c.prodotto && !c.prodotto.includes(prodotto)) continue;
      if (c.offerta && !c.offerta.includes(offerta)) continue;
      if (c.offertaNon && c.offertaNon.includes(offerta)) continue;
      if (c.offertaContiene && !c.offertaContiene.some(s => (offerta || "").toLowerCase().includes(s.toLowerCase()))) continue;
      if (c.opzioni) continue;          // collaudo senza opzioni selezionate
      for (const cmp of (r.campi || [])) {
        if (visti[cmp.nome]) continue;
        visti[cmp.nome] = true;
        if (cmp.attivo === false) continue;
        out.push(cmp.nome);
      }
    }
    return out;
  };
  const s4c = risolvi("s4", "Consumer", "Energia", "Luce", "Domestici Smart");
  const s4b = risolvi("s4", "Business", "Energia", "Gas", "Altri Usi Smart");
  const w3 = risolvi("windtre", "Consumer", "Energia", "Luce", "Luce 30 Flat");
  const ok1 = !s4c.includes("Codice Inserimento") && !s4b.includes("Codice Inserimento");
  const ok2 = w3.includes("Codice Inserimento");
  console.log(`⑥ ${ok1 ? "✓" : "✗ KO"} s4 consumer/business senza Codice Inserimento — campi consumer: ${s4c.join(", ") || "(nessuno)"}`);
  console.log(`⑥ ${ok2 ? "✓" : "✗ KO"} windtre Energia col Codice Inserimento (altri brand intatti)`);
  const { rows: pag } = await client.query(
    `select count(*)::int n from catalog_opzioni k join catalog_offerte o on o.id=k.offerta_id
     join catalog_prodotti p on p.id=o.prodotto_id
     where p.brand_id='s4' and k.gruppo_singolo='pagamento' and k.obbligatoria=true`);
  console.log(`⑥ opzioni pagamento obbligatorie: ${pag[0]?.n ?? pag.n ?? JSON.stringify(pag)} (attese 8)`);
  if (!ok1 || !ok2) { console.error("COLLAUDO FALLITO"); process.exit(1); }
  await client.end();
  console.log("FATTO ✓ — niente deploy: Registra Vendita legge regole e catalogo a ogni apertura");
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
