// W3 device — correzioni dal giro del revisore (26/08 sera).
//
// P0 · Le 9 righe del gettone device di NUOVA ATTIVAZIONE stavano sulla pista
//      `mobile`, che ha perc_ragazzi NULL = 100%: il tabellare derivato le
//      passava INTATTE ai ragazzi (955 € su 955 € ad agosto → margine zero per
//      l'azienda). Il gemello Customer Base invece è all'85%, perché la pista
//      `cb` ce l'ha impostata. Qui le righe vanno su una pista DEDICATA
//      `device`, con perc_ragazzi = 0 in attesa che Luca dica la percentuale:
//      meglio non pagarle affatto ai ragazzi che pagarle al 100% per svista.
//      Effetto collaterale positivo: i telefoni non gonfiano più i «pezzi»
//      della pista mobile.
//
// P1 · La soglia della gara smartphone CB legge una popolazione diversa dal
//      pagamento: la slide dice «extra 15 € sui 5G con SP ≥ 200 €» MA «al
//      raggiungimento di un minimo di 45 totali 5G nel periodo». Il
//      cancelletto conta TUTTI i 5G su CB, il pagamento solo quelli ≥ 200.
//      Servono quindi righe-contatore (1 pezzo, nessun €) accanto a quelle
//      che pagano.
//
// Idempotente. Lancio: NODE_PATH=<dir pg> node fix_device_revisore.js
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
const G5 = "Terminale 5G";

(async () => {
  await client.connect();
  try {
    await client.query("begin");

    // ── ① pista dedicata al gettone device di nuova attivazione ──
    const { rows: [{ n: haDev }] } = await client.query(
      "select count(*)::int n from pay_piste where brand=$1 and month=$2 and lato=$3 and chiave='device'", [B, M, L]);
    if (!haDev) {
      const { rows: [o] } = await client.query(
        "select coalesce(max(ordine),0)+1 ord from pay_piste where brand=$1 and month=$2 and lato=$3", [B, M, L]);
      await client.query(
        "insert into pay_piste (brand, month, lato, chiave, nome, ordine, um, perc_ragazzi) values ($1,$2,$3,'device',$4,$5,'pezzi',0)",
        [B, M, L, "Telefoni & device (nuova attivazione)", Number(o.ord)]);
    }
    const mossa = await client.query(
      `update pay_righe set pista='device' where brand=$1 and month=$2 and lato=$3
         and nome like 'Gettone device ·%' and pista='mobile'`, [B, M, L]);

    // ── ② righe-contatore della gara smartphone CB (soglia ≠ pagamento) ──
    const { rows: [o2] } = await client.query(
      "select coalesce(max(ordine),900)+1 ord from pay_righe where brand=$1 and month=$2 and lato=$3 and pista='smartphone_cb'", [B, M, L]);
    let ord = Number(o2.ord), ins = 0;
    const NOTA = "Slide 11: il cancelletto della gara è «un minimo di 45 TOTALI 5G nel periodo», mentre il premio di 15 € vale solo sui 5G con street price ≥ 200 €. Questa riga conta e basta: fa avanzare la soglia senza pagare nulla. Le righe che pagano sono più specifiche (chiedono anche la fascia) e vincono su questa quando il telefono supera i 200 €.";
    for (const prod of ["Tel. Rate CB", "Finanziato CB"]) {
      const nome = `Smartphone 5G su CB · solo conteggio · ${prod}`;
      const { rows: [{ n }] } = await client.query(
        "select count(*)::int n from pay_righe where brand=$1 and month=$2 and lato=$3 and nome=$4", [B, M, L, nome]);
      if (n) continue;
      await client.query(
        `insert into pay_righe (brand, month, lato, pista, nome, categoria, prodotto, opzione,
           punti, pay_base, pay_tiers, gettone, moltiplicatore, attivo, ordine, note, brand_vendita)
         values ($1,$2,$3,'smartphone_cb',$4,$5,$6,$7,1,null,'{}',false,false,true,$8,$9,$1)`,
        [B, M, L, nome, CAT, prod, G5, ord++, NOTA]);
      ins++;
    }
    await client.query("commit");
    console.log(`righe device spostate su pista dedicata: ${mossa.rowCount} · righe-contatore create: ${ins}`);
  } catch (e) {
    await client.query("rollback");
    console.error("ROLLBACK:", e.message);
    process.exitCode = 1; await client.end(); return;
  }

  const { rows } = await client.query(
    `select p.chiave, p.nome, p.perc_ragazzi, count(r.id)::int righe
     from pay_piste p left join pay_righe r
       on r.brand=p.brand and r.month=p.month and r.lato=p.lato and r.pista=p.chiave and r.attivo
     where p.brand=$1 and p.month=$2 and p.lato=$3 group by 1,2,3 order by p.chiave`, [B, M, L]);
  console.log("\nPISTE:");
  for (const r of rows)
    console.log(`  ${r.chiave.padEnd(15)} ${String(r.nome).padEnd(38)} ragazzi=${r.perc_ragazzi == null ? "100 (default)" : r.perc_ragazzi}%  righe=${r.righe}`);
  await client.end();
})();
