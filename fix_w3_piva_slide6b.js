// EXTRA GARA P.IVA — le ultime due voci della SLIDE 6 che valevano ZERO
// (rilievi del revisore, 26/08):
//   · «Negozio Protetti: 5» — voce DISTINTA da «Protezione Pro: 5»: la nota
//     a piè di slide le separa («Protezione Pro Attivazioni, Negozio Protetti
//     Installato e Attivo»). Sono i kit Protecta in configurazione NEGOZIO
//     venduti a un Business (a DB: pista protetti, offerta Protecta, 10
//     configurazioni). Nella gara P.IVA basta una riga: 5 punti.
//   · «Luce&Gas: 1» — le due righe c'erano ma ancorate a `categoria='Luce'` e
//     `categoria='Gas'`, che nel catalogo NON esistono: l'energia ha
//     categoria «Energia» e Luce/Gas è il PRODOTTO. Non matchavano mai.
// Idempotente. Lancio: NODE_PATH=<dir pg> node fix_w3_piva_slide6b.js
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

const B = "windtre", M = "2026-08-01", L = "azienda", P = "business_piva";
const TIERS = [25, 35, 45, 55];
const NOTA_ANCORA = " Ancora corretta il 26/08: nel catalogo la categoria è «Energia» e Luce/Gas è il prodotto — prima la riga non matchava nessuna vendita.";
const NOTA_PROTETTI = "Slide 6, New Business: «Negozio Protetti: 5» — voce distinta da «Protezione Pro: 5» (la nota di slide separa «Protezione Pro Attivazioni» da «Negozio Protetti Installato e Attivo»). Sono i kit Protecta in configurazione NEGOZIO venduti a un Business.";

(async () => {
  await client.connect();
  try {
    await client.query("begin");
    const l = await client.query(
      `update pay_righe set categoria = 'Energia', prodotto = 'Luce', note = note || $1
       where brand = $2 and month = $3 and lato = $4 and pista = $5 and categoria = 'Luce'`,
      [NOTA_ANCORA, B, M, L, P]);
    const g = await client.query(
      `update pay_righe set categoria = 'Energia', prodotto = 'Gas', note = note || $1
       where brand = $2 and month = $3 and lato = $4 and pista = $5 and categoria = 'Gas'`,
      [NOTA_ANCORA, B, M, L, P]);

    const nome = "Negozio Protetti (kit Protecta business)";
    const { rows: [{ n }] } = await client.query(
      "select count(*)::int n from pay_righe where brand=$1 and month=$2 and lato=$3 and pista=$4 and nome=$5", [B, M, L, P, nome]);
    if (!n) {
      const { rows: [o] } = await client.query(
        "select coalesce(max(ordine),200)+1 ord from pay_righe where brand=$1 and month=$2 and lato=$3 and pista=$4", [B, M, L, P]);
      await client.query(
        `insert into pay_righe (brand, month, lato, pista, nome, tipo_cliente, offerta, punti, pay_base, pay_tiers,
           gettone, attivo, ordine, note, moltiplicatore)
         values ($1,$2,$3,$4,$5,'Business','Protecta',5,null,$6,false,true,$7,$8,false)`,
        [B, M, L, P, nome, TIERS, o.ord, NOTA_PROTETTI]);
    }
    await client.query("commit");
    console.log(`Luce business: ${l.rowCount} · Gas business: ${g.rowCount} · Negozio Protetti: ${n ? "già c'era" : "creata"}`);
  } catch (e) {
    await client.query("rollback");
    console.error("ROLLBACK:", e.message);
    process.exitCode = 1; await client.end(); return;
  }
  const { rows } = await client.query(
    `select nome, tipo_cliente, categoria, prodotto, offerta, punti from pay_righe
     where brand=$1 and month=$2 and lato=$3 and pista=$4 and attivo
       and (nome like 'Luce%' or nome like 'Gas%' or nome like 'Negozio Protetti%') order by ordine`, [B, M, L, P]);
  for (const r of rows) console.log(`  ${r.nome.padEnd(42)} ${r.tipo_cliente || "-"}/${r.categoria || "-"}/${r.prodotto || "-"}/${r.offerta || "-"} = ${r.punti} pt`);
  await client.end();
})();
