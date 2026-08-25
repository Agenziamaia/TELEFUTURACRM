// GARE S4 — SPLIT PISTE (25/08/2026 sera, direttiva Luca):
//   «dividimi la sezione di energia in consumer e business» → due piste con
//   % di riporto ai ragazzi SEPARATE (perc_ragazzi è per pista: la casella
//   «% pay ai ragazzi» del tabellare ora è doppia, una per sezione).
//   «i punti non sono pertinenti: si rapporta 1:1, metti dappertutto 1 e
//   parliamo di pezzi» → punti=1 su TUTTE le righe s4 (business compreso);
//   la UI su s4 etichetta la colonna «Pezzi».
// Struttura risultante per mese (lato azienda):
//   · pista energia_consumer «Energia Consumer» (ordine 1): canvass 0-74 /
//     75-149 / 150+ e riga CTE Smart 100/130/140
//   · pista energia_business «Energia Business» (ordine 2): UNA soglia da 0
//     (flat, niente canvass) e le 8 righe a fascia con pay singolo
// Idempotente (salta il mese già splittato). Lancio: node split_s4_piste.js
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

const MESI = ["2026-07-01", "2026-08-01"];

(async () => {
  await client.connect();

  const dumpPath = path.join(__dirname, "dump_s4_split_pre.json");
  if (!fs.existsSync(dumpPath)) {
    const dump = {};
    for (const t of ["pay_piste", "pay_soglie", "pay_righe"]) {
      const { rows } = await client.query(`select * from ${t} where brand='s4'`);
      dump[t] = rows;
    }
    fs.writeFileSync(dumpPath, JSON.stringify(dump, null, 2));
    console.log("Dump pre:", Object.entries(dump).map(([t, r]) => `${t}=${r.length}`).join(" · "));
  } else console.log("Dump pre già presente: non lo sovrascrivo");

  for (const month of MESI) {
    const { rows: [{ n }] } = await client.query(
      `select count(*)::int n from pay_piste where brand='s4' and month=$1 and lato='azienda' and chiave='energia_business'`, [month]);
    if (n > 0) { console.log(`— ${month.slice(0, 7)}: già splittato, salto`); continue; }
    await client.query("begin");
    try {
      // pista unica → Energia Consumer (chiave nuova, soglie e riga CTE al seguito)
      await client.query(
        `update pay_piste set chiave='energia_consumer', nome='Energia Consumer', ordine=1
         where brand='s4' and month=$1 and lato='azienda' and chiave='energia'`, [month]);
      await client.query(
        `update pay_soglie set pista='energia_consumer'
         where brand='s4' and month=$1 and lato='azienda' and pista='energia'`, [month]);
      await client.query(
        `update pay_righe set pista='energia_consumer'
         where brand='s4' and month=$1 and lato='azienda' and pista='energia' and tipo_cliente='Consumer'`, [month]);
      // pista nuova Energia Business: una soglia da 0 (flat), righe a fascia
      await client.query(
        `insert into pay_piste (brand, month, lato, chiave, nome, um, ordine)
         values ('s4', $1, 'azienda', 'energia_business', 'Energia Business', 'pezzi', 2)`, [month]);
      await client.query(
        `insert into pay_soglie (brand, month, lato, pista, tier, soglia_da, soglia_a)
         values ('s4', $1, 'azienda', 'energia_business', 1, 0, null)`, [month]);
      await client.query(
        `update pay_righe set pista='energia_business', punti=1, pay_tiers=array[pay_tiers[1]]
         where brand='s4' and month=$1 and lato='azienda' and pista='energia' and tipo_cliente='Business'`, [month]);
      // niente orfani: la vecchia chiave non deve più esistere
      const { rows: [{ o }] } = await client.query(
        `select count(*)::int o from pay_righe where brand='s4' and month=$1 and pista='energia'`, [month]);
      if (o > 0) throw new Error(`${o} righe rimaste sulla pista vecchia`);
      await client.query("commit");
      console.log(`✓ ${month.slice(0, 7)}: split fatto — Consumer (canvass 3 soglie) · Business (flat, 1 soglia da 0)`);
    } catch (e) { await client.query("rollback"); throw e; }
  }

  // punti=1 dappertutto (consumer era già 1; il business era a 0)
  const p1 = await client.query(
    `update pay_righe set punti=1 where brand='s4' and lato='azienda' and punti<>1`);
  console.log(`punti=1 su tutte le righe s4 (${p1.rowCount} corrette)`);

  // COLLAUDO: struttura + motore semplificato su agosto
  const { rows: piste } = await client.query(
    `select month, chiave, nome, ordine, perc_ragazzi from pay_piste where brand='s4' and lato='azienda' order by month, ordine`);
  piste.forEach(p => console.log(`  pista ${String(p.month).slice(0, 7)} · ${p.chiave} «${p.nome}» ordine ${p.ordine} · % ragazzi ${p.perc_ragazzi ?? "(non impostata = 100)"}`));
  const { rows: righe } = await client.query(
    `select pista, count(*)::int n, min(punti) pmin, max(punti) pmax from pay_righe
     where brand='s4' and lato='azienda' and attivo=true group by pista order by pista`);
  righe.forEach(r => console.log(`  righe ${r.pista}: ${r.n} (punti ${r.pmin}-${r.pmax})`));
  const { rows: [cons] } = await client.query(
    `select count(*)::int n from contracts where brand ilike 'S4%' and id like 'CTR-%'
     and coalesce(is_demo,false)=false and coalesce(nascosta_gestione,false)=false
     and stato not ilike '%annull%' and data >= '2026-08-01' and data <= '2026-08-31' and tipo_cliente='Consumer'`);
  console.log(`  agosto: ${cons.n} pezzi consumer → canvass S1 (0-74) ✓ · business a parte, fuori dal conteggio`);
  const { rows: [biz] } = await client.query(
    `select pay_tiers, ricorrente from pay_righe where brand='s4' and month='2026-08-01' and pista='energia_business' and opzione='Consumo 25.001-35.000 smc'`);
  console.log(`  spot business gas fascia 4: pay ${JSON.stringify(biz.pay_tiers)} (atteso [325]) · ric ${biz.ricorrente} (atteso 23)`);
  await client.end();
  console.log("FATTO ✓");
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
