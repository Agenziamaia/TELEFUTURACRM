// W3 FISSO — la 2ª linea INCLUSA nel Professional Box conta in soglia
// (Luca 26/08: «un Super Fibra Professional Box deve valere 4,25 punti»).
// Lettera GARA AGOSTO, pagina FISSO, nota sul conteggio in soglia:
//   «Le acquisizioni Super Fibra Professional Box con modem FRITZ!Box avranno
//    punteggio extra +1 (totale 4 punti: 1,5 1° linea + 1,5 2° linea + 1 extra)»
// Oggi il Box vale 2,75: la componente «seconda_linea» si accende solo
// dall'opzione «2°Linea», che su quelle offerte NON esiste a catalogo perché
// è compresa nel prodotto. Serve una componente dedicata.
//
// ⚠️ SOLO PUNTI, ZERO EURO — ragionamento sui canoni:
//   Super Fibra 31,99 · Super Fibra Professional Box 51,99 (+20 €)
//   Il pay del fisso è canone × moltiplicatore: sul Box il moltiplicatore
//   gira già su un canone che INCLUDE la seconda linea. Aggiungere anche il
//   tier della riga «seconda linea» (20/30/35/40/50 €) sarebbe pagarla due
//   volte. Idem per il contrattuale: la lettera dà i 10 € all'offerta «2ª
//   linea Professional» venduta a sé, non a una linea inclusa in un altro
//   contratto (che ha già il suo contrattuale da 23 € o 19 € se convergente).
// Il caso «Super Fibra + opzione 2°Linea» resta invariato: lì la linea NON è
// nel canone e continua a pagare il suo tier.
// Idempotente. Lancio: NODE_PATH=<dir pg> node fix_w3_seconda_linea_inclusa.js
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

const B = "windtre", M = "2026-08-01";
const NOME = "+ Seconda linea INCLUSA (Professional Box)";
const NOTA = "Lettera FISSO: «Super Fibra Professional Box con modem FRITZ!Box — punteggio extra +1 " +
  "(totale 4 punti: 1,5 1ª linea + 1,5 2ª linea + 1 extra)». La 2ª linea è compresa nell'offerta " +
  "(a catalogo l'opzione «2°Linea» non esiste su queste offerte): conta 1,5 in soglia ma NON paga a parte — " +
  "il canone del Box (51,99 contro 31,99) la include già e il pay è canone × moltiplicatore. " +
  "Si accende dal nome offerta, non da un'opzione.";

(async () => {
  await client.connect();
  try {
    await client.query("begin");
    // su ENTRAMBI i lati dove esiste il tabellare fisso W3
    const { rows: lati } = await client.query(
      "select distinct lato from pay_piste where brand=$1 and month=$2 and chiave='fisso'", [B, M]);
    let ins = 0;
    for (const { lato } of lati) {
      const { rows: [{ n }] } = await client.query(
        "select count(*)::int n from pay_righe where brand=$1 and month=$2 and lato=$3 and componente='seconda_linea_inclusa'", [B, M, lato]);
      if (n) continue;
      // ordine subito dopo la «seconda linea» classica
      const { rows: [o] } = await client.query(
        "select coalesce(max(ordine),20)+1 ord from pay_righe where brand=$1 and month=$2 and lato=$3 and pista='fisso' and componente='seconda_linea'", [B, M, lato]);
      await client.query(
        `insert into pay_righe (brand, month, lato, pista, nome, componente, punti, pay_base, pay_tiers,
           gettone, attivo, ordine, note, moltiplicatore)
         values ($1,$2,$3,'fisso',$4,'seconda_linea_inclusa',1.5,null,'{}',false,true,$5,$6,false)`,
        [B, M, lato, NOME, o.ord, NOTA]);
      ins++;
    }
    await client.query("commit");
    console.log(`righe «2ª linea inclusa» inserite: ${ins} (lati: ${lati.map(x => x.lato).join(", ")})`);
  } catch (e) {
    await client.query("rollback");
    console.error("ROLLBACK:", e.message);
    process.exitCode = 1; await client.end(); return;
  }
  const { rows } = await client.query(
    "select lato, nome, componente, punti, pay_base, pay_tiers from pay_righe where brand=$1 and month=$2 and pista='fisso' and componente like 'seconda_linea%' order by lato, ordine", [B, M]);
  for (const r of rows) console.log(`  [${r.lato}] ${r.nome} · ${r.componente} · punti ${r.punti} · base ${r.pay_base} · tiers ${r.pay_tiers}`);
  await client.end();
})();
