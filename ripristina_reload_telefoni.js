// RIPRISTINO delle opzioni «reload» sul telefono a rate W3.
//
// Rifacendo il catalogo ho ricreato solo i gruppi NUOVI (rata mensile,
// finanziaria, tipo rata) e mi sono perso quelli che con la semplificazione non
// c'entravano niente: Reload, Reload EU, Reload Plus, Reload Exchange — gruppo
// `reload`, facoltativo. Risultato: da stasera non si potevano più mettere.
// (Segnalazione di Luca 26/08. Le vendite già registrate NON hanno perso
// niente: il backfill aveva conservato le opzioni preesistenti — 113 Reload,
// 19 EU, 6 Plus, 1 Exchange, integre sia in `contracts.opzioni` sia nei
// dettagli. Il buco era solo nel catalogo, cioè da qui in avanti.)
//
// La lista viene dal dump delle offerte eliminate, non da memoria.
// Idempotente. Lancio: NODE_PATH=<dir pg> node ripristina_reload_telefoni.js
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

const CAT = "Telefono a Rate";

// dal dump delle offerte cancellate: nome → [gruppo, obbligatoria]
const DAL_DUMP = (() => {
  const f = fs.readdirSync(__dirname).filter(x => /^dump_offerte_spente_\d+\.json$/.test(x)).sort().pop();
  if (!f) return null;
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, f), "utf8"));
  const off = Object.fromEntries((d.offerte || []).map(o => [o.id, o]));
  const per = {};
  for (const o of (d.opzioni || [])) {
    const of = off[o.offerta_id];
    if (!of) continue;
    (per[of.prodotto] ||= {})[o.nome] = { gruppo: o.gruppo_singolo, obb: !!o.obbligatoria, tipo: o.tipo };
  }
  console.log(`Lista recuperata dal dump ${f}`);
  return per;
})();

(async () => {
  await client.connect();
  if (!DAL_DUMP) { console.error("dump non trovato: non invento la lista"); process.exitCode = 1; await client.end(); return; }
  try {
    await client.query("begin");
    const { rows: offerte } = await client.query(
      `select o.id, o.nome, p.nome prodotto, p.tipo_cliente
       from catalog_offerte o join catalog_prodotti p on p.id = o.prodotto_id
       join catalog_categorie c on c.id = p.categoria_id
       where p.brand_id='windtre' and c.nome=$1 and o.attivo order by p.nome`, [CAT]);
    let ins = 0;
    for (const of of offerte) {
      const perse = DAL_DUMP[of.prodotto] || {};
      const { rows: [{ ord }] } = await client.query(
        "select coalesce(max(ordine),0)+1 ord from catalog_opzioni where offerta_id=$1", [of.id]);
      let o = Number(ord);
      for (const [nome, spec] of Object.entries(perse)) {
        const { rows: [{ n }] } = await client.query(
          "select count(*)::int n from catalog_opzioni where offerta_id=$1 and nome=$2", [of.id, nome]);
        if (n) continue;
        await client.query(
          "insert into catalog_opzioni (offerta_id, nome, gruppo_singolo, obbligatoria, tipo, ordine, attivo) values ($1,$2,$3,$4,$5,$6,true)",
          [of.id, nome, spec.gruppo, spec.obb, spec.tipo, o++]);
        ins++;
      }
    }
    await client.query("commit");
    console.log(`opzioni ripristinate: ${ins}`);
  } catch (e) {
    await client.query("rollback");
    console.error("ROLLBACK:", e.message);
    process.exitCode = 1; await client.end(); return;
  }

  const { rows } = await client.query(
    `select p.nome prodotto, p.tipo_cliente, o.nome offerta,
            string_agg(z.nome || case when z.obbligatoria then ' ✱' else '' end, ' · ' order by z.ordine) opzioni
     from catalog_offerte o join catalog_prodotti p on p.id=o.prodotto_id
     join catalog_categorie c on c.id=p.categoria_id
     left join catalog_opzioni z on z.offerta_id=o.id
     where p.brand_id='windtre' and c.nome=$1 and o.attivo
     group by p.nome, p.tipo_cliente, o.nome order by p.nome, p.tipo_cliente`, [CAT]);
  console.log("\nCATALOGO ORA (✱ = scelta obbligatoria):");
  for (const r of rows) console.log(`\n  ${r.prodotto} [${r.tipo_cliente}] «${r.offerta}»\n     ${r.opzioni}`);
  await client.end();
})();
