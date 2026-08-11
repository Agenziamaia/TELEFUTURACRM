// MIGRAZIONE ESITI TRACKING — parte 3 (10/08/2026, ordine Luca in chat):
// "il riordino ha generato dei malus: tracciali e togli il malus; poi gli
//  esiti definitivi chiudono la pratica, gli altri seguono il naturale
//  sviluppo".
//
// Cosa fa:
//  ① EVENTO malus_azzerato (datato oggi) sulle pratiche toccate dal riordino
//     che restano NON definitive → il contatore riparte da oggi (sviluppo
//     naturale), niente malus retroattivo dai vecchi eventi. Set:
//       S1 fisso Sky ex in_corso → attesa_matricola (25)
//       S2 sky ex in_attivazione_sky → attesa_matricola (14, id dal backup 2)
//       S3 sky ex wm_confermata → incompleto (3, id dal backup 2)
//       S4 sky completo_sky (flag definitivo TOLTO da Luca → rimaturavano, 20)
//       S5 mnp re_inserita (flag definitivo tolto, 1)
//     (Gli esiti diventati definitivi — KO ecc. — fermano il malus da soli e
//      la sync congela i loro episodi aperti: nessun intervento.)
//  ② TOMBSTONE (eliminato=true, mai DELETE: la ricostruzione deterministica
//     li farebbe rinascere) degli episodi malus_storico delle coppie
//     (pratica, categoria) dei set: quelli APERTI e quelli nati OGGI.
//  ③ PRE-TOMBSTONE: con il bundle esbuild del codice VERO (ricostruisciEpisodi
//     + registro esiti DB + regole DB) si derivano gli episodi che la sync
//     client vorrebbe scrivere ADESSO su TUTTE le pratiche del tracking: ogni
//     episodio CHIUSO derivabile ma assente da malus_storico e' un artefatto
//     del riordino di oggi (la sync gira da settimane: il pregresso legittimo
//     e' gia' tutto a DB) → lo si inserisce GIA' eliminato, cosi' la sync lo
//     vede e non lo reinserisce vivo. (Copre anche i retroattivi delle
//     pratiche passate per "Completo" e oggi su altri esiti.)
//
// Prerequisito: bundle con
//   npx esbuild <entry> --bundle --platform=node --outfile=$MALUS_BUNDLE ...
// Lancio:  node migra_esiti_tracking3.js          (prova)
//          node migra_esiti_tracking3.js --apply
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
const APPLY = process.argv.includes("--apply");
const bundle = require(process.env.MALUS_BUNDLE || "/tmp/malus_bundle.cjs");
const BACKUP2 = process.env.BACKUP2 || "/tmp/backup_migra_esiti_tracking2.json";
const FIRMA = "Riordino esiti 10/08 (Claude)";

// stessa resa di formatDataInserimento/parseDataRiga della pagina
function dataInserimentoDi(val) {
  if (!val) return "—";
  const s = String(val);
  let d = null;
  if (s.includes("T")) d = new Date(s);
  else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, g] = s.split("-").map(Number); d = new Date(y, m - 1, g); }
  else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) { const [g, m, y] = s.split("/").map(Number); d = new Date(y, m - 1, g); }
  if (!d || isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}
const nomeDi = (cl) => !cl ? null : (cl.ragione_sociale || [cl.nome, cl.cognome].filter(Boolean).join(" ") || null);

(async () => {
  await client.connect();

  // ── registro esiti + regole nel codice vero ──
  const esiti = (await client.query(`select * from tracking_esiti`)).rows;
  bundle.impostaEsitiTracking(esiti);
  const regole = (await client.query(`select * from tracking_regole`)).rows;
  bundle.impostaRegoleTracking(regole.length ? regole : null);

  // ── SET del riordino ──
  const bk = JSON.parse(fs.readFileSync(BACKUP2, "utf8"));
  const idsS2 = bk.pre.filter(r => r.stati_categoria?.sky === "in_attivazione_sky").map(r => r.id);
  const idsS3 = bk.pre.filter(r => r.stati_categoria?.sky === "wm_confermata").map(r => r.id);
  const q = async (s, p) => (await client.query(s, p)).rows;
  // S1 dagli id del backup della parte 2: SOLO le 25 ex in_corso (una pratica
  // era gia' in attesa_matricola prima del riordino — il suo storico e' legittimo)
  const s1 = bk.pre.filter(r => r.stati_categoria?.fisso === "in_corso").map(r => ({ id: r.id }));
  const s4 = await q(`select id from contracts where stati_categoria->>'sky'='completo_sky' or (stato_negozio='completo_sky' and not (stati_categoria ? 'sky'))`);
  const s5 = await q(`select id from contracts where stati_categoria->>'mnp'='re_inserita' or (stato_negozio='re_inserita' and not (stati_categoria ? 'mnp'))`);
  const coppie = new Map(); // id -> Set<categoria>
  const addCoppia = (id, cat) => { const s = coppie.get(id) || new Set(); s.add(cat); coppie.set(id, s); };
  s1.forEach(r => addCoppia(r.id, "fisso"));
  idsS2.forEach(id => addCoppia(id, "sky"));
  idsS3.forEach(id => addCoppia(id, "sky"));
  s4.forEach(r => addCoppia(r.id, "sky"));
  s5.forEach(r => addCoppia(r.id, "mnp"));
  console.log(`SET: S1 fisso Sky ${s1.length} (attese 25) · S2 ${idsS2.length} (14) · S3 ${idsS3.length} (3) · S4 completo_sky ${s4.length} (20) · S5 re_inserita ${s5.length} (1) → contratti unici ${coppie.size}`);

  // ── carica TUTTE le pratiche del tracking per la derivazione (punto ③) ──
  const contracts = (await client.query(
    `select c.id, c.brand, c.categoria, c.prodotto, c.categoria_macro, c.controlli, c.tipo_cliente,
            c.dettagli, c.stati_categoria, c.stato_negozio, c.stato_admin, c.storia, c.tracking_nascosto,
            c.data_registrazione, c.data, c.created_at, c.negozio, c.venditore,
            cl.nome, cl.cognome, cl.ragione_sociale
     from contracts c left join clients cl on cl.id = c.client_id`)).rows;
  const inTracking = contracts.filter(c => bundle.vaInTracking(c));

  // righe come le costruisce la pagina (tv→sky, 3P split, mobile business→piva)
  const righeDi = (c) => {
    const macro = String(c.categoria_macro || "").toLowerCase() || bundle.categoriaDi(c.brand, c.categoria, c.prodotto);
    const ctrl = (Array.isArray(c.controlli) && c.controlli.length) ? c.controlli : bundle.controlliDi(c.dettagli || {});
    if (macro === "tv") return ["sky"];
    if (macro === "fisso" && String(c.brand || "").toLowerCase().includes("sky") && /\b3\s*P\b/i.test(String(c.prodotto || ""))) return ["fisso", "sky"];
    if (macro === "mobile" && String(c.tipo_cliente || "").toLowerCase() === "business") return ["piva"];
    return bundle.righeTracking(macro, ctrl);
  };
  const rowDi = (c, cat, storia) => {
    const perCat = c.stati_categoria || {};
    const sn = perCat[cat] ?? (c.stato_negozio || "nuovo");
    return {
      id: c.id, categoria: cat, brand: c.brand || "—", negozio: c.negozio || "—",
      venditore: c.venditore || "—", nominativo: nomeDi(c) || "—",
      dataInserimento: dataInserimentoDi(c.data_registrazione || c.data || c.created_at),
      storia: storia ?? (Array.isArray(c.storia) ? c.storia : []),
      statoNegozio: sn, statoPratica: "—", statoAdmin: c.stato_admin || "da_verificare",
      telefono: "—", numContratto: c.id, numAttivazione: "—", cf: "—", indirizzo: "—",
    };
  };

  // ── ① evento azzeramento (in memoria; scrittura solo con --apply) ──
  const oggi = new Date().toLocaleDateString("it-IT");
  const evento = {
    data: oggi, tipo: "malus_azzerato",
    testo: "🔁 Riordino esiti 10/08: contatore ripartito da oggi, malus del riordino azzerato",
    utente: FIRMA, ruolo: "admin",
  };
  const storiaNuova = new Map(); // id -> storia con evento
  for (const id of coppie.keys()) {
    const c = contracts.find(x => x.id === id);
    if (!c) { console.error("  ⚠️ contratto non trovato:", id); continue; }
    storiaNuova.set(id, [...(Array.isArray(c.storia) ? c.storia : []), evento]);
  }

  // ── ③ derivazione episodi POST-azzeramento su tutte le pratiche ──
  const esistenti = (await client.query(`select id, contract_id, categoria, data_inizio::text, data_fine::text, eliminato, stato, importo from malus_storico`)).rows;
  const byKey = new Map();
  esistenti.forEach(e => byKey.set(`${e.contract_id}#${e.categoria}#${e.data_inizio}`, e));
  const daTombstonare = []; // inserts pre-eliminati
  for (const c of inTracking) {
    if (c.tracking_nascosto) continue;
    const storia = storiaNuova.get(c.id);
    for (const cat of righeDi(c)) {
      const row = rowDi(c, cat, storia);
      let derivati = [];
      try { derivati = bundle.ricostruisciEpisodi(row); } catch (e) { console.error("  ⚠️ derivazione fallita", c.id, cat, e.message); continue; }
      for (const d of derivati) {
        if (d.data_fine === null) continue; // gli aperti legittimi li gestisce la sync
        if (!byKey.has(`${d.contract_id}#${d.categoria}#${d.data_inizio}`)) daTombstonare.push(d);
      }
    }
  }
  console.log(`episodi CHIUSI derivabili ma assenti (artefatti del riordino, da pre-tombstonare): ${daTombstonare.length}`);
  const perPratica = {};
  daTombstonare.forEach(d => { const k = `${d.contract_id}#${d.categoria}`; perPratica[k] = (perPratica[k] || 0) + d.importo; });
  Object.entries(perPratica).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, imp]) => console.log(`   ${k} → ${imp}€`));

  // ── ② episodi esistenti da tombstonare (aperti o nati oggi, coppie del riordino) ──
  const ids = [...coppie.keys()];
  const pariCat = (e) => coppie.get(e.contract_id)?.has(e.categoria);
  const apertiSet = esistenti.filter(e => !e.eliminato && pariCat(e) && e.data_fine === null);
  const natiOggi = (await client.query(
    `select id, contract_id, categoria, importo::float from malus_storico
     where eliminato is not true and created_at::date = current_date and contract_id = any($1)`, [ids]))
    .rows.filter(pariCat);
  const daChiudere = [...new Map([...apertiSet, ...natiOggi].map(e => [e.id, e])).values()];
  console.log(`episodi esistenti da tombstonare (aperti/nati oggi sui set): ${daChiudere.length} — importi: ${daChiudere.map(e => e.importo + "€").join(", ") || "—"}`);

  // ── backup ──
  const dest = process.env.BACKUP_DEST || "/tmp/backup_migra_esiti_tracking3.json";
  fs.writeFileSync(dest, JSON.stringify({
    quando: new Date().toISOString(),
    coppie: [...coppie.entries()].map(([id, s]) => [id, [...s]]),
    storiaPre: [...coppie.keys()].map(id => ({ id, storia: contracts.find(x => x.id === id)?.storia ?? null })),
    daChiudere, daTombstonare,
  }, null, 1));
  console.log("backup →", dest);

  if (!APPLY) { console.log("\nPROVA: nessuna scrittura (rilancia con --apply)"); await client.end(); return; }

  // ── transazione ──
  await client.query("begin");
  try {
    let ev = 0;
    for (const [id, storia] of storiaNuova) {
      await client.query(`update contracts set storia = $1::jsonb where id = $2`, [JSON.stringify(storia), id]);
      ev++;
    }
    let tomb = 0;
    for (const e of daChiudere) {
      await client.query(
        `update malus_storico set eliminato = true, eliminato_il = now(), eliminato_da = $2,
                data_fine = coalesce(data_fine, current_date) where id = $1`, [e.id, FIRMA]);
      tomb++;
    }
    let pre = 0;
    for (const d of daTombstonare) {
      await client.query(
        `insert into malus_storico (contract_id, categoria, brand, negozio, venditore, nominativo,
           data_inizio, data_fine, giorni, malus_euro, importo, stato, eliminato, eliminato_il, eliminato_da)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,now(),$13)
         on conflict do nothing`,
        [d.contract_id, d.categoria, d.brand, d.negozio, d.venditore, d.nominativo,
         d.data_inizio, d.data_fine, d.giorni, d.malus_euro, d.importo, "attivo", FIRMA]);
      pre++;
    }
    console.log(`① eventi azzeramento scritti: ${ev} (attesi ${coppie.size})`);
    console.log(`② episodi tombstonati: ${tomb}`);
    console.log(`③ episodi pre-tombstonati: ${pre}`);
    if (ev !== coppie.size) throw new Error("conteggio eventi inatteso: rollback");
    await client.query("commit");
    console.log("COMMIT ok");
  } catch (err) { await client.query("rollback"); console.error("ROLLBACK:", err.message); process.exit(1); }

  // ── scan post: nessuna pratica dei set deve essere in malus, e nessun
  //    episodio derivabile deve mancare da malus_storico ──
  const esitiPost = (await client.query(`select id, contract_id, categoria, data_inizio::text from malus_storico`)).rows;
  const byKeyPost = new Set(esitiPost.map(e => `${e.contract_id}#${e.categoria}#${e.data_inizio}`));
  let inMalus = 0, mancanti = 0;
  for (const c of inTracking) {
    if (c.tracking_nascosto) continue;
    const storia = storiaNuova.get(c.id);
    for (const cat of righeDi(c)) {
      const row = rowDi(c, cat, storia);
      if (coppie.get(c.id)?.has(cat) && bundle.isMalusRow(row)) { inMalus++; console.log("  ⚠️ ancora in malus:", c.id, cat); }
      for (const d of bundle.ricostruisciEpisodi(row))
        if (d.data_fine !== null && !byKeyPost.has(`${d.contract_id}#${d.categoria}#${d.data_inizio}`)) mancanti++;
    }
  }
  console.log(`\nSCAN: pratiche dei set ancora in malus ${inMalus} (attese 0) · episodi chiusi derivabili senza riga a DB ${mancanti} (attesi 0)`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
