// MIGRAZIONE Vodafone fisso (Luca 10/08): Casa {Start,Pro,Ultra} × {Conv,
// Lock In, Mass Market} → i 3 nomi semplici. Backup → transazione → verifiche
// → delete delle 9 voci di catalogo (cascade su opzioni/valori).
const fs = require("fs"); const path = require("path");
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("pg");
const c = new Client({ host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });

const MAPPA = {};
for (const g of ["Casa Start", "Casa Pro", "Casa Ultra"])
  for (const v of ["Conv", "Lock In", "Mass Market"]) MAPPA[`${g} ${v}`] = g;
const VECCHIE = Object.keys(MAPPA);
const BK = "/private/tmp/claude-501/-Users-macbookl-My-Drive-Desktop-Claude-Work/3c8b91ad-a970-4470-b3d1-e5cade84535b/scratchpad/backup_migrazione_casa_vf.json";

(async () => {
  await c.connect();

  // ── guardia: le regole campi citano i nomi vecchi? (bloccante se sì) ──
  // (solo i 9 nomi ESATTI: "Super Internet Casa …" di WindTre non c'entra)
  const rG = await c.query(`select id, etichetta from catalog_campi_regole where ${VECCHIE.map((_, i) => `condizioni::text ilike '%' || $${i + 1} || '%'`).join(" or ")}`, VECCHIE);
  if (rG.rows.length) { console.log("⛔ STOP: regole campi citano le varianti:", JSON.stringify(rG.rows)); process.exit(1); }

  // ── BACKUP completo di tutto ciò che tocco ──
  const bkContr = (await c.query(`select id, offerta, dettagli->>'Offerta' det_offerta from contracts where brand='Vodafone' and (offerta = any($1) or dettagli->>'Offerta' = any($1))`, [VECCHIE])).rows;
  const bkPay = (await c.query(`select * from pay_righe where offerta = any($1)`, [VECCHIE])).rows;
  const bkOff = (await c.query(`select o.*, (select json_agg(z) from catalog_opzioni z where z.offerta_id=o.id) opzioni, (select json_agg(v) from catalog_valori v where v.offerta_id=o.id) valori
    from catalog_offerte o join catalog_prodotti p on p.id=o.prodotto_id where p.brand_id='vodafone' and p.nome='Fisso' and o.nome = any($1)`, [VECCHIE])).rows;
  fs.writeFileSync(BK, JSON.stringify({ quando: new Date().toISOString(), contratti: bkContr, pay_righe: bkPay, catalogo: bkOff }, null, 1));
  console.log(`backup: ${bkContr.length} contratti, ${bkPay.length} righe pay, ${bkOff.length} voci catalogo → ${path.basename(BK)}`);

  await c.query("begin");
  try {
    let totC = 0, totD = 0;
    for (const [vec, nuo] of Object.entries(MAPPA)) {
      const u1 = await c.query(`update contracts set offerta=$2 where brand='Vodafone' and offerta=$1`, [vec, nuo]);
      const u2 = await c.query(`update contracts set dettagli = jsonb_set(dettagli,'{Offerta}', to_jsonb($2::text)) where brand='Vodafone' and dettagli->>'Offerta' = $1`, [vec, nuo]);
      totC += u1.rowCount; totD += u2.rowCount;
      if (u1.rowCount || u2.rowCount) console.log(`  ${vec.padEnd(24)} → ${nuo.padEnd(12)} colonna=${u1.rowCount} dettagli=${u2.rowCount}`);
    }
    console.log(`contratti aggiornati: colonna=${totC}, dettagli=${totD}`);

    // pay_righe (cantiere Calcolatore): per gruppo tengo UNA riga col nome
    // semplice e cancello le due sorelle — il motore matcha per offerta
    for (const g of ["Casa Start", "Casa Pro", "Casa Ultra"]) {
      const keep = await c.query(`update pay_righe set offerta=$2 where offerta=$1 returning id`, [`${g} Conv`, g]);
      const del = await c.query(`delete from pay_righe where offerta = any($1) returning id`, [[`${g} Lock In`, `${g} Mass Market`]]);
      console.log(`  pay ${g}: tenuta ${keep.rowCount}, cancellate ${del.rowCount}`);
    }

    // ── VERIFICA dentro la transazione: ZERO tracce dei nomi vecchi ──
    const v1 = (await c.query(`select count(*) n from contracts where offerta = any($1)`, [VECCHIE])).rows[0].n;
    const v2 = (await c.query(`select count(*) n from contracts, lateral jsonb_each_text(dettagli) j where j.value = any($1)`, [VECCHIE])).rows[0].n;
    const v3 = (await c.query(`select count(*) n from pay_righe where offerta = any($1)`, [VECCHIE])).rows[0].n;
    console.log(`verifica residui: contracts.offerta=${v1}, dettagli(qualsiasi chiave)=${v2}, pay_righe=${v3}`);
    if (+v1 || +v2 || +v3) throw new Error("residui trovati: rollback");

    // ── DELETE delle 9 voci di catalogo (cascade opzioni+valori) ──
    const del9 = await c.query(`delete from catalog_offerte o using catalog_prodotti p
      where p.id=o.prodotto_id and p.brand_id='vodafone' and p.nome='Fisso' and o.nome = any($1) returning o.nome`, [VECCHIE]);
    console.log(`catalogo: cancellate ${del9.rowCount} voci → ${del9.rows.map(r=>r.nome).join(", ")}`);
    if (del9.rowCount !== 9) throw new Error(`attese 9 voci, trovate ${del9.rowCount}: rollback`);

    await c.query("commit");
    console.log("✅ COMMIT");
  } catch (e) { await c.query("rollback"); console.error("⛔ ROLLBACK:", e.message); process.exit(1); }

  // ── verifica finale post-commit ──
  const f1 = (await c.query(`select offerta, count(*) n from contracts where offerta ilike 'casa %' and brand='Vodafone' group by offerta order by offerta`)).rows;
  console.log("VF casa* dopo migrazione:", f1.map(r => `${r.offerta}×${r.n}`).join("  "));
  const f2 = (await c.query(`select o.nome from catalog_offerte o join catalog_prodotti p on p.id=o.prodotto_id where p.brand_id='vodafone' and p.nome='Fisso' and o.nome ilike 'casa%' order by o.nome`)).rows;
  console.log("catalogo VF fisso casa*:", f2.map(r => r.nome).join(", "));
  await c.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
