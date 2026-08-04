/*
 * RIALLINEAMENTO MALUS — tetto 1000 righe PostgREST (04/08/2026)
 * ───────────────────────────────────────────────────────────────
 * CONTESTO: il fix d7ce866 ("caricaTutte") ha recuperato le pratiche che il
 * tetto max-rows 1000 di PostgREST nascondeva dal Tracking PDA, e ha ACCESO
 * lo split 3P Sky (RIC-02: senza `prodotto` nella select era codice morto).
 * Alla prima sync le righe ricomparse/nate oggi hanno generato episodi di
 * malus RETROATTIVI su pratiche che NESSUNO ha mai potuto vedere in
 * lavorazione. Direttiva Luca: quei malus vanno azzerati e le pratiche
 * riportate in warning (il malus rimatura solo se restano ferme di nuovo).
 *
 * MECCANISMO (replica in massa di `elimina` in ArchivioMalus.tsx):
 *   1. TOMBSTONE sull'episodio (eliminato=true, MAI delete: la ricostruzione
 *      deterministica della sync lo farebbe rinascere);
 *   2. se la pratica NON è definitiva (fermaMalus === false, funzione VERA
 *      importata via bundle esbuild, regole VERE da tracking_regole come le
 *      carica la pagina), evento `malus_azzerato` in contracts.storia
 *      retrodatato di soglia (succ_warning ?? senza_warning ?? 0) giorni
 *      LAVORATIVI lun–sab: la pratica riparte SUBITO in warning.
 *
 * CRITERIO DI SELEZIONE — nota sulla deviazione dal mandato:
 *   il mandato prevedeva stato='in_corso', ma al momento dell'esecuzione la
 *   sync aveva GIÀ congelato tutti gli episodi nati oggi (stato='attivo'):
 *   in parte chiusi da eventi in storia (condivisa con la riga fisso del 3P),
 *   in parte dallo "spazzino" della sync (updated_at 15:12 UTC, data_fine =
 *   oggi). Il criterio è quindi esteso a stato IN ('in_corso','attivo') —
 *   MAI 'compensato', MAI eliminato — fermi restando: created_at >= oggi
 *   (Europe/Rome) AND data_inizio < oggi (episodi COMPARSI oggi che
 *   pretendono di essere iniziati nel passato).
 *
 * CONTROPROVA per ogni episodio selezionato (conservativa, chi non passa
 * NON si tocca e finisce nel report):
 *   (a) contratto oltre la posizione 1000 per created_at desc al momento del
 *       fix: created_at < created_at del 1000° contratto più recente
 *       (calcolato sui contratti PRE-oggi, lo stato che vedeva PostgREST);
 *   (b) riga sky nata dallo split 3P (categoria episodio 'sky').
 *
 * USO (dalla root del repo, path con SPAZI: quotare):
 *   node scripts/riallinea_malus_recuperate.js            → DRY RUN (default)
 *   node scripts/riallinea_malus_recuperate.js --apply    → scrive a DB
 * Dump JSON di sicurezza pre-update sempre in scripts/.
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = path.resolve(__dirname, "..");
const { Client } = require(path.join(REPO, "node_modules", "pg"));

const APPLY = process.argv.includes("--apply");
const OGGI_ISO = "2026-08-04"; // giorno del fix (Europe/Rome)
const ELIMINATO_DA = "Riallineamento tetto 1000 (04/08)";
const UTENTE_EVENTO = "Riallineamento 04/08";
const TESTO_EVENTO =
  "🗑 Malus azzerato: pratica recuperata dal tetto 1000 righe (04/08) — mai stata visibile in lavorazione, contatore ripartito";

/* ── 1. Bundle esbuild delle funzioni VERE del tracking (niente reimplementazioni) ── */
function caricaHelpers() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "riallinea-malus-"));
  const entry = path.join(dir, "entry.mjs");
  const out = path.join(dir, "bundle.cjs");
  fs.writeFileSync(
    entry,
    'export { fermaMalus, regolaDi, impostaRegoleTracking } from "@/app/(dashboard)/pda/tracking/trackingHelpers";\n'
  );
  execFileSync(
    "npx",
    ["esbuild", entry, "--bundle", "--platform=node", "--format=cjs", `--outfile=${out}`, `--alias:@=${path.join(REPO, "src")}`],
    { cwd: REPO, stdio: ["ignore", "ignore", "inherit"] }
  );
  return require(out);
}

/* ── 2. Aritmetica date: replica ESATTA di _sottraiLavorativi/_isoData (ArchivioMalus) ── */
function sottraiLavorativi(da, n) {
  const d = new Date(da);
  d.setHours(12, 0, 0, 0);
  let resta = n;
  while (resta > 0) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() !== 0) resta--;
  }
  return d;
}
const isoData = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

(async () => {
  const env = fs.readFileSync(path.join(REPO, ".env.local"), "utf8");
  const pw = env.match(/SUPABASE_DB_PASSWORD=(.+)/)[1].trim();
  const ref = env.match(/NEXT_PUBLIC_SUPABASE_URL=https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
  const helpers = caricaHelpers();

  const c = new Client({
    host: "aws-1-eu-central-2.pooler.supabase.com",
    port: 5432,
    user: "postgres." + ref,
    password: pw,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  /* ── 3. Regole VERE: stessa lettura della pagina (select * from tracking_regole),
     numerici coerenti col JSON di PostgREST (pg rende NUMERIC come stringa). ── */
  const { rows: regoleRows } = await c.query("select * from tracking_regole");
  const NUMS = [
    "senza_lavorare", "senza_warning", "senza_malus",
    "succ_lavorare", "succ_warning", "succ_malus",
    "compl_lavorare", "compl_warning", "compl_malus", "malus_euro",
  ];
  const regole = regoleRows.map((r) => {
    const o = { ...r };
    for (const k of NUMS) o[k] = r[k] === null ? null : Number(r[k]);
    return o;
  });
  if (regole.length) helpers.impostaRegoleTracking(regole);

  /* ── 4. Selezione episodi (v. nota criterio in testa al file) ── */
  const selEpisodi = `
    select m.id, m.contract_id, m.categoria, m.brand, m.negozio, m.venditore, m.nominativo,
           to_char(m.data_inizio,'YYYY-MM-DD') as data_inizio,
           to_char(m.data_fine,'YYYY-MM-DD')   as data_fine,
           m.giorni, m.malus_euro::float8 as malus_euro, m.importo::float8 as importo,
           m.stato, m.eliminato, m.created_at, m.updated_at
    from malus_storico m
    where m.eliminato = false
      and m.stato in ('in_corso','attivo')
      and m.created_at >= timestamptz '${OGGI_ISO} 00:00:00+02'
      and m.data_inizio < date '${OGGI_ISO}'
    order by m.data_inizio, m.created_at`;
  const { rows: episodi } = await c.query(selEpisodi);

  // informativi: quanti avrebbe preso il criterio letterale del mandato
  const strettiN = episodi.filter((e) => e.stato === "in_corso").length;

  // informativi: episodi di oggi NON selezionati perché data_inizio >= oggi
  const { rows: fuoriPerimetro } = await c.query(`
    select m.id, m.contract_id, m.categoria, m.nominativo, to_char(m.data_inizio,'YYYY-MM-DD') as data_inizio,
           m.importo::float8 as importo, m.stato
    from malus_storico m
    where m.eliminato = false
      and m.created_at >= timestamptz '${OGGI_ISO} 00:00:00+02'
      and m.data_inizio >= date '${OGGI_ISO}'
    order by m.created_at`);

  /* ── 5. Controprova: cutoff = created_at del 1000° contratto più recente
     al momento del fix (dataset PRE-oggi, ordinamento della pagina). ── */
  const { rows: cutRows } = await c.query(`
    select created_at from contracts
    where created_at < timestamptz '${OGGI_ISO} 00:00:00+02'
    order by created_at desc, id offset 999 limit 1`);
  const cutoff1000 = cutRows[0] ? new Date(cutRows[0].created_at) : null;

  const contractIds = [...new Set(episodi.map((e) => e.contract_id))];
  const { rows: contratti } = contractIds.length
    ? await c.query(
        `select id, created_at, categoria, brand, prodotto, stato_negozio, stati_categoria, storia
         from contracts where id = any($1)`,
        [contractIds]
      )
    : { rows: [] };
  const byId = new Map(contratti.map((r) => [r.id, r]));

  /* ── 6. Piano operativo ── */
  const oggi = new Date();
  const piano = []; // episodi che passano la controprova
  const esclusi = []; // episodi selezionati che NON passano (non si toccano)
  for (const ep of episodi) {
    const pr = byId.get(ep.contract_id) || null;
    const passaA = !!(pr && cutoff1000 && new Date(pr.created_at) < cutoff1000);
    const passaB = ep.categoria === "sky";
    if (!passaA && !passaB) {
      esclusi.push({ ...ep, motivo: "controprova fallita: contratto entro il tetto 1000 e categoria non sky" });
      continue;
    }
    // replica di `elimina`: statoCat = stati_categoria[cat] ?? stato_negozio ?? ""
    const statoCat = ((pr && pr.stati_categoria) || {})[ep.categoria] || (pr && pr.stato_negozio) || "";
    const definitiva = helpers.fermaMalus(statoCat, ep.categoria);
    let evento = null;
    if (!definitiva) {
      const r = helpers.regolaDi(ep.categoria);
      const soglia = (r && (r.succ_warning ?? r.senza_warning)) ?? 0;
      evento = {
        data: isoData(sottraiLavorativi(oggi, soglia)),
        tipo: "malus_azzerato",
        testo: TESTO_EVENTO,
        utente: UTENTE_EVENTO,
        ruolo: "admin",
      };
    }
    piano.push({
      episodio: ep,
      controprova: { oltre_tetto_1000: passaA, sky_split_3p: passaB },
      contratto: pr && {
        id: pr.id, created_at: pr.created_at, categoria: pr.categoria, brand: pr.brand,
        prodotto: pr.prodotto, stato_negozio: pr.stato_negozio, stati_categoria: pr.stati_categoria,
      },
      stato_cat_risolto: statoCat,
      definitiva,
      evento,
    });
  }

  /* ── 7. Dump di sicurezza pre-update (episodi + storia dei contratti toccati) ── */
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dumpPath = path.join(__dirname, `dump_malus_riallineamento_pre_${ts}.json`);
  fs.writeFileSync(
    dumpPath,
    JSON.stringify(
      {
        eseguito_il: new Date().toISOString(),
        modalita: APPLY ? "APPLY" : "DRY-RUN",
        criterio: {
          nota: "stato esteso a in_corso+attivo: la sync aveva gia' congelato gli episodi nati oggi (v. testata runner)",
          created_at_da: `${OGGI_ISO} 00:00:00+02`,
          data_inizio_prima_di: OGGI_ISO,
          criterio_letterale_in_corso_avrebbe_selezionato: strettiN,
        },
        cutoff_1000: cutoff1000 ? cutoff1000.toISOString() : null,
        regole_usate: regole,
        piano,
        esclusi_controprova: esclusi,
        fuori_perimetro_data_inizio_oggi: fuoriPerimetro,
        contratti_pre_update: contratti, // con storia COMPLETA pre-modifica
      },
      null,
      2
    )
  );

  /* ── 8. Riepilogo a video ── */
  const eur = (n) => "€ " + Number(n).toFixed(2);
  const inWarning = piano.filter((p) => !p.definitiva);
  const soloTombstone = piano.filter((p) => p.definitiva);
  const totale = piano.reduce((s, p) => s + Number(p.episodio.importo), 0);
  console.log(`\n=== RIALLINEAMENTO MALUS 04/08 — ${APPLY ? "APPLY" : "DRY RUN"} ===`);
  console.log(`Cutoff 1000° contratto (pre-oggi): ${cutoff1000 ? cutoff1000.toISOString() : "n/d"}`);
  console.log(`Episodi selezionati: ${episodi.length} (criterio letterale 'in_corso': ${strettiN})`);
  console.log(`  → da azzerare: ${piano.length} per ${eur(totale)}`);
  console.log(`     · pratiche riportate in warning: ${inWarning.length}`);
  console.log(`     · pratiche definitive (solo tombstone): ${soloTombstone.length}`);
  console.log(`  → esclusi da controprova: ${esclusi.length}`);
  console.log(`Fuori perimetro (data_inizio >= oggi, NON toccati): ${fuoriPerimetro.length}`);
  console.log(`Dump pre-update: ${dumpPath}\n`);
  for (const p of piano) {
    const e = p.episodio;
    console.log(
      `  [${p.definitiva ? "TOMBSTONE" : "TOMB+WARN"}] ${e.contract_id} ${e.categoria} ${eur(e.importo)} ` +
        `inizio ${e.data_inizio} fine ${e.data_fine || "—"} stato=${e.stato} ` +
        `(${e.nominativo || "—"} · ${e.venditore || "—"} · ${e.negozio || "—"})` +
        (p.evento ? ` → evento ${p.evento.data}` : " → pratica definitiva, nessun evento")
    );
  }
  for (const x of esclusi) console.log(`  [ESCLUSO] ${x.contract_id} ${x.categoria} ${eur(x.importo)} — ${x.motivo}`);
  for (const x of fuoriPerimetro) console.log(`  [FUORI PERIMETRO] ${x.contract_id} ${x.categoria} ${eur(x.importo)} inizio ${x.data_inizio} — data_inizio >= oggi`);

  if (!APPLY) {
    console.log("\nDRY RUN: nessuna scrittura. Rilanciare con --apply per applicare.");
    await c.end();
    return;
  }

  /* ── 9. APPLY in transazione ── */
  await c.query("begin");
  try {
    let tombstones = 0;
    for (const p of piano) {
      const r = await c.query(
        `update malus_storico
         set eliminato = true, eliminato_il = now(), eliminato_da = $2, updated_at = now()
         where id = $1 and eliminato = false`,
        [p.episodio.id, ELIMINATO_DA]
      );
      if (r.rowCount !== 1) throw new Error(`tombstone non applicato su episodio ${p.episodio.id} (rowCount=${r.rowCount})`);
      tombstones++;
    }
    // eventi raggruppati per contratto (una sola scrittura per pratica),
    // append server-side: stesso risultato del read-modify-write dell'app,
    // senza clobber di eventi concorrenti.
    const perContratto = new Map();
    for (const p of piano) {
      if (!p.evento) continue;
      if (!perContratto.has(p.episodio.contract_id)) perContratto.set(p.episodio.contract_id, []);
      perContratto.get(p.episodio.contract_id).push(p.evento);
    }
    let eventi = 0;
    for (const [cid, evs] of perContratto) {
      evs.sort((a, b) => a.data.localeCompare(b.data));
      const r = await c.query(
        `update contracts
         set storia = case when jsonb_typeof(storia) = 'array' then storia || $2::jsonb else $2::jsonb end
         where id = $1`,
        [cid, JSON.stringify(evs)]
      );
      if (r.rowCount !== 1) throw new Error(`evento non scritto sul contratto ${cid} (rowCount=${r.rowCount})`);
      eventi += evs.length;
    }
    await c.query("commit");
    console.log(`\nAPPLY OK — tombstone: ${tombstones}, eventi malus_azzerato: ${eventi} su ${perContratto.size} pratiche.`);
  } catch (e) {
    await c.query("rollback");
    console.error("\nAPPLY FALLITO, rollback eseguito:", e.message);
    process.exit(1);
  }

  /* ── 10. Verifica post-apply ── */
  const { rows: residui } = await c.query(`
    select m.id, m.contract_id, m.categoria, m.stato, to_char(m.data_inizio,'YYYY-MM-DD') as data_inizio
    from malus_storico m
    where m.eliminato = false and m.stato <> 'compensato'
      and m.created_at >= timestamptz '${OGGI_ISO} 00:00:00+02'
      and m.data_inizio < date '${OGGI_ISO}'`);
  const idsConEvento = [...new Set(piano.filter((p) => p.evento).map((p) => p.episodio.contract_id))];
  const { rows: verEventi } = idsConEvento.length
    ? await c.query(
        `select id from contracts
         where id = any($1)
           and storia @> $2::jsonb`,
        [idsConEvento, JSON.stringify([{ tipo: "malus_azzerato", utente: UTENTE_EVENTO }])]
      )
    : { rows: [] };
  console.log(`\n=== VERIFICA POST-APPLY ===`);
  console.log(`Episodi retroattivi residui (attesi solo gli esclusi, ${esclusi.length}): ${residui.length}`);
  for (const r of residui) console.log(`  residuo: ${r.contract_id} ${r.categoria} stato=${r.stato} inizio ${r.data_inizio}`);
  console.log(`Pratiche con evento malus_azzerato scritto: ${verEventi.length} / ${idsConEvento.length} attese`);
  if (residui.length !== esclusi.length || verEventi.length !== idsConEvento.length) {
    console.error("ATTENZIONE: la verifica post-apply NON torna, controllare a mano.");
    process.exitCode = 2;
  } else {
    console.log("Verifica OK.");
  }
  await c.end();
})().catch((e) => {
  console.error("RUNNER FALLITO:", e.message);
  process.exit(1);
});
