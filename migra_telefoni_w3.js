// TELEFONO A RATE W3 — da 35 offerte a 4, con le informazioni che contano
// spostate in OPZIONI OBBLIGATORIE (Luca 26/08: «ha più senso mettere solamente
// il finanziamento e poi un'opzione obbligatoria, così come per luce e gas»).
//
// Il «5G» e il «< 600€ / > 600€» nei nomi erano stampelle del vecchio Excel:
// oggi la fascia di prezzo e il 5G li dà il listino terminali, partendo dal
// Modello Terminale che i ragazzi scrivono comunque.
//
//   Tel. Rate      → «Rata»          + rata mensile
//   Tel. Rate CB   → «Rata»          + rata mensile
//   Finanziato     → «Finanziamento» + rata mensile · finanziaria · tipo rata
//   Finanziato CB  → «Finanziamento» + rata mensile · finanziaria · tipo rata
//
// «Importo aggiuntivo» è come lo chiama la lettera; ai ragazzi si dice RATA
// MENSILE (Luca: «scriviamolo in modo diverso ai ragazzi»).
//
// BACKFILL: le vendite già registrate passano alle offerte nuove e ricevono le
// opzioni dedotte dal vecchio nome. Si scrive in TRE posti, che devono restare
// allineati: `contracts.offerta`, `contracts.opzioni` (JSONB — è quello che
// filtra Ricerca Vendite) e `dettagli.Opzioni` (la stringa che legge il motore
// di pay). Le 30 «Rata 5G» su CB: Luca 26/08 → tutte come rata 0 (10 €).
//
// Le offerte vecchie NON si cancellano, si spengono: lo storico resta leggibile.
// Idempotente. Lancio: NODE_PATH=<dir pg> node migra_telefoni_w3.js
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
const RATA0 = "Rata mensile 0 €", RATAX = "Rata mensile oltre 0 €";
const FIND = "Findomestic", COMP = "Compass";
const STD = "Rata standard", SMART = "Rata Smart";

// prodotto → nome della sua unica offerta + gruppi obbligatori
const NUOVO = {
  "Tel. Rate":     { offerta: "Rata",          gruppi: [["rata mensile", [RATA0, RATAX]]] },
  "Tel. Rate CB":  { offerta: "Rata",          gruppi: [["rata mensile", [RATA0, RATAX]]] },
  "Finanziato":    { offerta: "Finanziamento", gruppi: [["rata mensile", [RATA0, RATAX]], ["finanziaria", [FIND, COMP]], ["tipo rata", [STD, SMART]]] },
  "Finanziato CB": { offerta: "Finanziamento", gruppi: [["rata mensile", [RATA0, RATAX]], ["finanziaria", [FIND, COMP]], ["tipo rata", [STD, SMART]]] },
};

/** dal vecchio nome offerta alle opzioni nuove; null = non deducibile */
function opzioniDaVecchia(prodotto, off) {
  const o = String(off || "");
  const fin = /compass/i.test(o) ? COMP : (/findomestic/i.test(o) ? FIND : null);
  const smart = /rata smart/i.test(o) ? SMART : (fin ? STD : null);
  let rata = null;
  if (/>\s*0/.test(o) || /[<>]\s*\d/.test(o)) rata = RATAX;
  else if (/(^|\s)0(\s|$)/.test(o.replace(/>\s*0/g, ""))) rata = RATA0;
  // Luca 26/08: «le rate 5G che hanno registrato gestiamole tutte come
  // commissioning da 10 €, come se fossero importo aggiuntivo zero — sono 30
  // pezzi, parliamo di 5 € di differenza»
  else if (/^rata(\s+5g)?$/i.test(o.trim())) rata = RATA0;
  if (String(prodotto).startsWith("Finanziato") && !(fin && smart)) return null;
  if (!rata) return null;
  return [rata, ...(fin ? [fin] : []), ...(smart ? [smart] : [])];
}

(async () => {
  await client.connect();
  const stamp = Date.now();
  try {
    // ── DUMP di tutto ciò che tocchiamo ──
    const { rows: offPre } = await client.query(
      `select o.id, o.nome, o.attivo, p.nome prodotto from catalog_offerte o
       join catalog_prodotti p on p.id = o.prodotto_id
       join catalog_categorie c on c.id = p.categoria_id
       where p.brand_id='windtre' and c.nome=$1 order by p.nome, o.nome`, [CAT]);
    const { rows: venPre } = await client.query(
      `select id, offerta, prodotto, opzioni, dettagli->'Opzioni' det_opz from contracts
       where brand='WindTre' and dettagli->>'categoria_catalogo'=$1 order by id`, [CAT]);
    fs.writeFileSync(path.join(__dirname, `dump_migra_telefoni_${stamp}.json`),
      JSON.stringify({ offerte: offPre, vendite: venPre }, null, 1));
    console.log(`Dump: ${offPre.length} offerte · ${venPre.length} vendite → dump_migra_telefoni_${stamp}.json`);

    await client.query("begin");
    const idProd = {};
    for (const prod of Object.keys(NUOVO)) {
      const { rows } = await client.query(
        `select p.id from catalog_prodotti p join catalog_categorie c on c.id=p.categoria_id
         where p.brand_id='windtre' and c.nome=$1 and p.nome=$2`, [CAT, prod]);
      idProd[prod] = rows.map(r => r.id);
    }

    // ── ① offerte nuove + gruppi obbligatori ──
    let nOff = 0, nOpz = 0;
    const idOff = {};
    for (const [prod, spec] of Object.entries(NUOVO)) {
      idOff[prod] = [];
      for (const pid of idProd[prod]) {
        let { rows } = await client.query(
          "select id from catalog_offerte where prodotto_id=$1 and nome=$2", [pid, spec.offerta]);
        if (!rows.length) {
          rows = (await client.query(
            "insert into catalog_offerte (prodotto_id, nome, ordine, attivo) values ($1,$2,0,true) returning id",
            [pid, spec.offerta])).rows;
          nOff++;
        } else {
          await client.query("update catalog_offerte set attivo=true, ordine=0 where id=$1", [rows[0].id]);
        }
        const oid = rows[0].id;
        idOff[prod].push(oid);
        let ord = 0;
        for (const [gruppo, voci] of spec.gruppi) {
          for (const nome of voci) {
            const { rows: [{ n }] } = await client.query(
              "select count(*)::int n from catalog_opzioni where offerta_id=$1 and nome=$2", [oid, nome]);
            if (!n) {
              await client.query(
                "insert into catalog_opzioni (offerta_id, nome, gruppo_singolo, obbligatoria, ordine, attivo) values ($1,$2,$3,true,$4,true)",
                [oid, nome, gruppo, ord]);
              nOpz++;
            } else {
              await client.query(
                "update catalog_opzioni set gruppo_singolo=$3, obbligatoria=true, attivo=true where offerta_id=$1 and nome=$2",
                [oid, nome, gruppo]);
            }
            ord++;
          }
        }
      }
    }

    // ── ② backfill delle vendite ──
    let mosse = 0, appese = 0;
    for (const v of venPre) {
      const spec = NUOVO[String(v.prodotto)];
      if (!spec) continue;
      if (String(v.offerta) === spec.offerta) continue;      // già migrata
      const nuove = opzioniDaVecchia(v.prodotto, v.offerta);
      if (!nuove) { appese++; continue; }
      // opzioni preesistenti (Reload, Security…) da NON perdere
      const gia = Array.isArray(v.opzioni) ? v.opzioni : [];
      const nomiGia = gia.map(x => String(x?.nome || "")).filter(Boolean);
      const tutte = [...nomiGia.filter(n => !nuove.includes(n)), ...nuove];
      const jsonb = tutte.map(n => ({ nome: n, quantita: null }));
      await client.query(
        `update contracts set offerta=$2, opzioni=$3::jsonb,
           dettagli = jsonb_set(jsonb_set(coalesce(dettagli,'{}'::jsonb), '{Offerta}', to_jsonb($2::text)), '{Opzioni}', to_jsonb($4::text))
         where id=$1`,
        [v.id, spec.offerta, JSON.stringify(jsonb), tutte.join(", ")]);
      mosse++;
    }

    // ── ③ le vecchie offerte si spengono, non si cancellano ──
    const spente = await client.query(
      `update catalog_offerte o set attivo=false
       from catalog_prodotti p, catalog_categorie c
       where o.prodotto_id=p.id and p.id=any($1::uuid[]) and c.id=p.categoria_id
         and o.nome <> all($2::text[]) and o.attivo`,
      [Object.values(idProd).flat(), [...new Set(Object.values(NUOVO).map(x => x.offerta))]]);

    await client.query("commit");
    console.log(`offerte nuove: ${nOff} · opzioni obbligatorie: ${nOpz} · vecchie spente: ${spente.rowCount}`);
    console.log(`vendite migrate: ${mosse} · rimaste appese: ${appese}`);
  } catch (e) {
    await client.query("rollback");
    console.error("ROLLBACK:", e.message);
    process.exitCode = 1; await client.end(); return;
  }

  const { rows } = await client.query(
    `select p.nome prodotto, o.nome offerta, o.attivo,
            (select count(*) from catalog_opzioni z where z.offerta_id=o.id and z.obbligatoria) obb,
            (select count(*) from contracts ct where ct.brand='WindTre' and ct.prodotto=p.nome and ct.offerta=o.nome) vendite
     from catalog_offerte o join catalog_prodotti p on p.id=o.prodotto_id
     join catalog_categorie c on c.id=p.categoria_id
     where p.brand_id='windtre' and c.nome=$1 and o.attivo order by p.nome`, [CAT]);
  console.log("\nCATALOGO ORA:");
  for (const r of rows)
    console.log(`  ${r.prodotto.padEnd(15)} «${r.offerta}»  opzioni obbligatorie: ${r.obb}  vendite: ${r.vendite}`);
  await client.end();
})();
