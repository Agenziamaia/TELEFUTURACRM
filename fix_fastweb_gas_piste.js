// GAS come PISTA, non come gettone (Luca 26/08: «non vedo il senso di
// lasciarlo nei gettoni, e il Gas consumer non lo vedo da nessuna parte»).
// Era a gettone perché la soglia della lettera è «≥1 pda» — sempre raggiunta,
// quindi di fatto un importo fisso. Ma così finiva nella card Gettoni e
// spariva dalle sezioni: struttura ora identica alla luce, due piste
//   · gas           → «Energy Gas»          S1 da 1 · 100 € (di cui base 60)
//   · gas_business  → «Energy Gas Business» S1 da 1 · 140 € (di cui base 70)
// Le righe passano da gettone a riga di pista con punti = 1 (1 pda = 1
// punto: senza, l'avanzamento resterebbe a 0 e pagherebbe la sola base).
// Il pay resta lo stesso: con almeno una vendita la soglia è presa.
// Rilanciabile. Lancio: NODE_PATH=<dir pg> node fix_fastweb_gas_piste.js
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

const B = "fastweb", M = "2026-08-01", L = "azienda";

(async () => {
  await client.connect();
  const { rows: pre } = await client.query(
    "select * from pay_righe where brand=$1 and month=$2 and lato=$3 and pista in ('gas','gas_business')", [B, M, L]);
  let dumpFile = path.join(__dirname, "dump_fastweb_gas_pre.json");
  if (fs.existsSync(dumpFile)) dumpFile = dumpFile.replace(/\.json$/, `_${Date.now()}.json`);
  fs.writeFileSync(dumpFile, JSON.stringify(pre, null, 1));
  console.log("Dump:", path.basename(dumpFile), `(${pre.length} righe)`);

  try {
    await client.query("begin");

    // pista gas: nome allineato alla luce
    await client.query(
      "update pay_piste set nome='Energy Gas', ordine=6 where brand=$1 and month=$2 and lato=$3 and chiave='gas'", [B, M, L]);
    // pista business nuova (stessa % ai ragazzi del gas res, si cambia dal pannello)
    const { rows: [{ n }] } = await client.query(
      "select count(*)::int n from pay_piste where brand=$1 and month=$2 and lato=$3 and chiave='gas_business'", [B, M, L]);
    if (!n) await client.query(
      `insert into pay_piste (brand, month, chiave, nome, um, ordine, lato, perc_ragazzi)
       values ($1,$2,'gas_business','Energy Gas Business','pezzi',7,$3,
         (select perc_ragazzi from pay_piste where brand=$1 and month=$2 and lato=$3 and chiave='gas'))`, [B, M, L]);

    // soglie «≥1 pda» (Tabelle 3 e 4 della lettera)
    for (const pista of ["gas", "gas_business"]) {
      const { rows: [{ c }] } = await client.query(
        "select count(*)::int c from pay_soglie where brand=$1 and month=$2 and lato=$3 and pista=$4", [B, M, L, pista]);
      if (!c) await client.query(
        "insert into pay_soglie (brand, month, pista, tier, soglia_da, soglia_a, lato) values ($1,$2,$3,1,1,null,$4)", [B, M, pista, L]);
    }

    // righe: da gettone a riga di pista (punti 1 = 1 pda), con «di cui base»
    const r1 = await client.query(
      `update pay_righe set gettone=false, punti=1, pay_base=60, pay_tiers='{100}', pista='gas'
       where brand=$1 and month=$2 and lato=$3 and nome='Gas'`, [B, M, L]);
    const r2 = await client.query(
      `update pay_righe set gettone=false, punti=1, pay_base=70, pay_tiers='{140}', pista='gas_business'
       where brand=$1 and month=$2 and lato=$3 and nome='Gas · Business'`, [B, M, L]);
    if (r1.rowCount !== 1 || r2.rowCount !== 1) throw new Error(`attese 1+1 righe, toccate ${r1.rowCount}+${r2.rowCount}`);

    await client.query("commit");
    console.log("Commit ok.");
  } catch (e) {
    await client.query("rollback");
    console.error("ROLLBACK:", e.message);
    process.exitCode = 1; await client.end(); return;
  }

  const { rows: piste } = await client.query(
    "select chiave, nome, perc_ragazzi, ordine from pay_piste where brand=$1 and month=$2 and lato=$3 order by ordine", [B, M, L]);
  console.log("\nPiste:"); for (const p of piste) console.log(`  ${p.ordine}. ${p.nome} [${p.chiave}] % ragazzi: ${p.perc_ragazzi ?? "(100)"}`);
  const { rows: righe } = await client.query(
    "select nome, pista, punti, pay_base, pay_tiers, gettone, ricorrente from pay_righe where brand=$1 and month=$2 and lato=$3 and pista like 'gas%' order by pista", [B, M, L]);
  console.log("\nRighe gas:"); for (const r of righe) console.log(`  ${r.nome} [${r.pista}] punti=${r.punti} base=${r.pay_base} S1=${r.pay_tiers} gettone=${r.gettone} M+6=${r.ricorrente}`);
  await client.end();
})();
