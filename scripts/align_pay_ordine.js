// ALLINEA l'ORDINE delle righe pay tra i due lati (segnalazione Luca 11/08:
// "le tabelle sono le stesse in termini di struttura, mettile nello stesso
// senso così se switcho da una visibilità all'altra controllo velocemente").
// L'AZIENDA (lettera ufficiale) è il canone: le righe RAGAZZI vengono
// rinumerate per seguire la stessa sequenza. Le piste si appaiano per
// POSIZIONE (ordine), non per chiave: vas (azienda) ↔ soluzioni_digitali
// (ragazzi) sono la stessa colonna del tabellare.
// Matching per riga, a cascata (dal più preciso al più lasco):
//   1. tipo_cliente · categoria · prodotto · offerta · brand_vendita
//   2. tipo_cliente · prodotto · offerta · brand_vendita
//   3. tipo_cliente · offerta · brand_vendita
//   4. offerta · brand_vendita
// Le ancore con molteplicità (es. Start Under 18 ×2) si appaiano in ordine.
// Le righe ragazzi SENZA gemella azienda restano in coda alla loro pista,
// nell'ordine relativo che già avevano. Tocca SOLO la colonna ordine.
// Lancio: node scripts/align_pay_ordine.js <brand> <YYYY-MM-01>
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("pg");
const client = new Client({
  host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

const BRAND = process.argv[2] || "vodafone";
const MONTH = process.argv[3] || "2026-08-01";

const norm = (v) => (v == null ? "" : String(v).trim().toLowerCase());
const chiavi = (r) => [
  [r.tipo_cliente, r.categoria, r.prodotto, r.offerta, r.brand_vendita],
  [r.tipo_cliente, r.prodotto, r.offerta, r.brand_vendita],
  [r.tipo_cliente, r.offerta, r.brand_vendita],
  [r.offerta, r.brand_vendita],
].map(parts => parts.map(norm).join("|"));

(async () => {
  await client.connect();
  const piste = (await client.query(
    `select chiave, lato, ordine from pay_piste where brand=$1 and month=$2 order by lato, ordine`,
    [BRAND, MONTH])).rows;
  const pisteAz = piste.filter(p => p.lato === "azienda");
  const pisteRg = piste.filter(p => p.lato === "ragazzi");
  if (!pisteAz.length || !pisteRg.length) {
    console.log(`Niente da fare: ${BRAND}/${MONTH} non ha piste su entrambi i lati.`);
    await client.end(); return;
  }
  // pista ragazzi -> pista azienda per POSIZIONE
  const gemella = {};
  pisteRg.forEach((p, i) => { if (pisteAz[i]) gemella[p.chiave] = pisteAz[i].chiave; });

  const righe = (await client.query(
    `select id, lato, pista, nome, tipo_cliente, categoria, prodotto, offerta, brand_vendita, gettone, ordine
       from pay_righe where brand=$1 and month=$2 and gettone=false and pista is not null
       order by lato, ordine`, [BRAND, MONTH])).rows;
  const az = righe.filter(r => r.lato === "azienda");
  const rg = righe.filter(r => r.lato === "ragazzi");

  let aggiornate = 0, inCoda = 0;
  for (const pr of pisteRg) {
    const pa = gemella[pr.chiave];
    const rrRg = rg.filter(r => r.pista === pr.chiave);
    const rrAz = az.filter(r => r.pista === pa);
    if (!rrRg.length) continue;

    // indice azienda: per ogni livello di chiave, code FIFO di posizioni
    const idx = [new Map(), new Map(), new Map(), new Map()];
    rrAz.forEach((r, pos) => chiavi(r).forEach((k, liv) => {
      if (!idx[liv].has(k)) idx[liv].set(k, []);
      idx[liv].get(k).push(pos);
    }));

    const posDi = new Map();   // id riga ragazzi -> posizione azienda
    const orfane = [];
    for (const r of rrRg) {
      const kk = chiavi(r);
      let pos = null;
      for (let liv = 0; liv < kk.length && pos == null; liv++) {
        const coda = idx[liv].get(kk[liv]);
        if (coda && coda.length) pos = coda.shift();
      }
      if (pos == null) orfane.push(r);
      else {
        posDi.set(r.id, pos);
        // brucia la riga azienda usata anche sugli altri livelli
        const usata = rrAz[pos];
        chiavi(usata).forEach((k, liv) => {
          const coda = idx[liv].get(k);
          if (coda) { const i = coda.indexOf(pos); if (i >= 0) coda.splice(i, 1); }
        });
      }
    }

    // sequenza finale: le agganciate nell'ordine azienda, poi le orfane in coda
    const agganciate = rrRg.filter(r => posDi.has(r.id)).sort((a, b) => posDi.get(a.id) - posDi.get(b.id));
    const sequenza = [...agganciate, ...orfane];
    const base = Math.min(...rrRg.map(r => Number(r.ordine))) || 0;
    for (let i = 0; i < sequenza.length; i++) {
      const nuovo = base + i;
      if (Number(sequenza[i].ordine) !== nuovo) {
        await client.query(`update pay_righe set ordine=$1 where id=$2`, [nuovo, sequenza[i].id]);
        aggiornate++;
      }
    }
    inCoda += orfane.length;
    console.log(`pista ${pr.chiave} (↔ ${pa}): ${agganciate.length} agganciate all'ordine azienda, ${orfane.length} in coda`);
  }
  console.log(`\nFATTO: ${aggiornate} righe rinumerate, ${inCoda} senza gemella azienda lasciate in coda alla pista.`);
  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
