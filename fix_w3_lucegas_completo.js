// LUCE & GAS COMPLETO (Luca 14/08 sera: RID/Bollettino + Pronto Intervento)
// ① Gemelle «Bollettino» delle 4 righe L&G: −15 € a ogni soglia (lettera:
//    attivato senza SDD −15) — l'opzione Bollettino esiste già a catalogo.
// ② Pronto assistenza come VARIANTE del gettone convergente (lettera riga 3:
//    105-150 €) sulle due offerte convergenti consumer, con gemella
//    Bollettino (−15) — opzione «Pronto Intervento» creata a catalogo.
// ③ Pronto Intervento SPOSTATO da Assicurazioni a opzione L&G (decisione
//    Luca): spente le 2 offerte assicurazioni, via le loro righe pay; le 2
//    vendite storiche restano com'erano (segnalate a Luca).
// Lancio: node fix_w3_lucegas_completo.js   (dalla cartella del CRM)
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
const m15 = (a) => a.map(v => v - 15);

(async () => {
  await client.connect();
  await client.query("begin");
  try {
    // ① gemelle Bollettino delle righe esistenti
    const basi = await client.query(
      `select * from pay_righe where brand='windtre' and month=$1 and pista='lucegas' and (opzione is null or opzione='') order by ordine`, [MONTH]);
    let ins = 0;
    for (const b of basi.rows) {
      const gia = await client.query(
        `select count(*)::int as n from pay_righe where brand='windtre' and month=$1 and pista='lucegas' and offerta is not distinct from $2 and opzione='Bollettino' and tipo_cliente is not distinct from $3`,
        [MONTH, b.offerta, b.tipo_cliente]);
      if (gia.rows[0].n > 0) continue;
      await client.query(
        `insert into pay_righe (brand, month, lato, pista, nome, tipo_cliente, offerta, opzione, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, ordine, note)
         values ('windtre', $1, 'azienda', 'lucegas', $2, $3, $4, 'Bollettino', false, $5, null, $6, false, true, $7,
                 'Lettera: attivato senza SDD −15 € — variante Bollettino della riga base (che vale col RID).')`,
        [MONTH, b.nome + " · Bollettino (−15)", b.tipo_cliente, b.offerta, b.punti, m15(b.pay_tiers.map(Number)), Number(b.ordine) + 100]);
      ins++;
    }
    // ② varianti Pronto assistenza sulle convergenti consumer (105-150 lettera)
    const PRONTO = [
      ["New Start Casa Sconto Multiservice", "L&G Convergente + Pronto assistenza"],
      ["Smartphone Pack - New Start Casa Sconto Multiservice", "L&G Smartphone Pack + Pronto assistenza"],
    ];
    for (const [off, nome] of PRONTO) {
      const gia = await client.query(
        `select count(*)::int as n from pay_righe where brand='windtre' and month=$1 and pista='lucegas' and offerta=$2 and opzione like '%Pronto%'`, [MONTH, off]);
      if (gia.rows[0].n > 0) continue;
      await client.query(
        `insert into pay_righe (brand, month, lato, pista, nome, tipo_cliente, offerta, opzione, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, ordine, note)
         values ('windtre', $1, 'azienda', 'lucegas', $2, 'Consumer', $3, 'Pronto Intervento', false, 1, null, '{105,110,120,135,150}', false, true, 50,
                 'Lettera riga 3: convergente + pronto assistenza (il pronto vale +10). Nota lettera «non conta in soglia» riferita al pronto: l''attivazione conta 1.')`,
        [MONTH, nome, off]);
      await client.query(
        `insert into pay_righe (brand, month, lato, pista, nome, tipo_cliente, offerta, opzione, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, ordine, note)
         values ('windtre', $1, 'azienda', 'lucegas', $2, 'Consumer', $3, 'Pronto Intervento|Bollettino', false, 1, null, '{90,95,105,120,135}', false, true, 51,
                 'Come sopra ma senza SDD: −15 €.')`,
        [MONTH, nome + " · Bollettino (−15)", off]);
      ins += 2;
    }
    // opzione «Pronto Intervento» sulle 4 offerte convergenti consumer
    const convs = await client.query(
      `select o.id from catalog_offerte o join catalog_prodotti p on p.id=o.prodotto_id join catalog_categorie c on c.id=p.categoria_id
       where p.brand_id='windtre' and c.nome='Energia' and p.tipo_cliente='Consumer' and o.attivo and o.nome like '%Multiservice%'`);
    let opzIns = 0;
    for (const o of convs.rows) {
      const gia = await client.query(`select count(*)::int as n from catalog_opzioni where offerta_id=$1 and nome='Pronto Intervento'`, [o.id]);
      if (gia.rows[0].n > 0) continue;
      await client.query(`insert into catalog_opzioni (offerta_id, nome, ordine, attivo) values ($1, 'Pronto Intervento', 50, true)`, [o.id]);
      opzIns++;
    }
    // ③ via il Pronto dalle Assicurazioni (offerte spente + righe pay eliminate)
    const off2 = await client.query(
      `update catalog_offerte o set attivo=false from catalog_prodotti p
       where p.id=o.prodotto_id and p.brand_id='windtre' and p.nome='Assicurazioni' and o.nome in ('Pronto Intervento Luce','Pronto Intervento Gas')`);
    const delR = await client.query(
      `delete from pay_righe where brand='windtre' and month=$1 and pista='assicurazioni' and offerta in ('Pronto Intervento Luce','Pronto Intervento Gas')`, [MONTH]);
    await client.query("commit");
    console.log(`righe L&G nuove: ${ins} · opzioni Pronto create: ${opzIns} · offerte assicurazioni spente: ${off2.rowCount} · righe pay assicurazioni tolte: ${delR.rowCount}`);
  } catch (e) { await client.query("rollback"); throw e; }

  const post = await client.query(
    `select nome, tipo_cliente, offerta, opzione, pay_tiers from pay_righe where brand='windtre' and month=$1 and pista='lucegas' order by ordine`, [MONTH]);
  post.rows.forEach(r => console.log(" ", r.nome.padEnd(52), "|", (r.opzione || "RID/—").padEnd(28), JSON.stringify(r.pay_tiers.map(Number))));
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
