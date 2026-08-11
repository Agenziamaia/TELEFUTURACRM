// MALUS DELLE PRATICHE "SCONGELATE" (11/08/2026, ok Luca — soluzione 2):
// il fix del caso Becattini (contatore sull'ultimo evento DATATO) ha rimesso
// in moto l'orologio delle pratiche il cui ultimo evento era una modifica
// contratto senza data. Giusto che tornino lavorabili, ma il malus maturato
// nel periodo in cui il sistema NASCONDEVA l'allarme non va addebitato:
//   ① evento `malus_azzerato` RETRODATATO di succ_lavorare giorni lavorativi
//     (paracadute Kashfa): la pratica riparte gia' in ⚡ Da lavorare, il
//     warning/malus rimatura solo se resta ferma da qui in avanti;
//   ② tombstone degli episodi malus nati OGGI dallo scongelamento (95€);
//   ③ pre-tombstone degli episodi chiusi che la ricostruzione derivera' dai
//     nuovi eventi (mai DELETE: rinascerebbero).
// Prerequisito: bundle esbuild (env MALUS_BUNDLE). Lancio:
//   node fix_malus_sbloccate.js          (prova)
//   node fix_malus_sbloccate.js --apply
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
const B = require(process.env.MALUS_BUNDLE || "/tmp/malus_bundle2.cjs");
const FIRMA = "Scongelamento contatori 11/08 (Claude, ok Luca)";

const dataOk = (s) => { const d = String(s || ""); return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(d) || /^\d{4}-\d{2}-\d{2}/.test(d) || d.includes("T"); };
const dIns = (v) => { if (!v) return "—"; const s = String(v); let d = null; if (s.includes("T")) d = new Date(s); else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, g] = s.split("-").map(Number); d = new Date(y, m - 1, g); } if (!d || isNaN(d)) return "—"; return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }); };
const subLavorativi = (da, n) => { const d = new Date(da); let resta = n; while (resta > 0) { d.setDate(d.getDate() - 1); if (d.getDay() !== 0) resta--; } return d; };

(async () => {
  await client.connect();
  B.impostaEsitiTracking((await client.query("select * from tracking_esiti")).rows);
  const reg = (await client.query("select * from tracking_regole")).rows;
  B.impostaRegoleTracking(reg.length ? reg : null);
  const SUCC_LAVORARE = Object.fromEntries(reg.map((r) => [r.categoria, r.succ_lavorare ?? 2]));

  const contracts = (await client.query(
    `select c.id, c.brand, c.categoria, c.prodotto, c.categoria_macro, c.controlli, c.tipo_cliente,
            c.dettagli, c.stati_categoria, c.stato_negozio, c.stato_admin, c.storia, c.tracking_nascosto,
            c.data_registrazione, c.data, c.created_at, c.negozio, c.venditore,
            cl.nome, cl.cognome, cl.ragione_sociale
     from contracts c left join clients cl on cl.id = c.client_id`)).rows;

  const righeDi = (x) => {
    const macro = String(x.categoria_macro || "").toLowerCase() || B.categoriaDi(x.brand, x.categoria, x.prodotto);
    const ctrl = (Array.isArray(x.controlli) && x.controlli.length) ? x.controlli : B.controlliDi(x.dettagli || {});
    if (macro === "tv") return ["sky"];
    if (macro === "fisso" && String(x.brand || "").toLowerCase().includes("sky") && /\b3\s*P\b/i.test(String(x.prodotto || ""))) return ["fisso", "sky"];
    if (macro === "mobile" && String(x.tipo_cliente || "").toLowerCase() === "business") return ["piva"];
    return B.righeTracking(macro, ctrl);
  };
  const rowDi = (x, cat, storia) => {
    const perCat = x.stati_categoria || {};
    return {
      id: x.id, categoria: cat, brand: x.brand || "—", negozio: x.negozio || "—",
      venditore: x.venditore || "—", nominativo: (x.ragione_sociale || [x.nome, x.cognome].filter(Boolean).join(" ")) || "—",
      dataInserimento: dIns(x.data_registrazione || x.data || x.created_at),
      storia: storia ?? (Array.isArray(x.storia) ? x.storia : []),
      statoNegozio: perCat[cat] ?? (x.stato_negozio || "nuovo"), statoPratica: "—",
      statoAdmin: x.stato_admin || "da_verificare",
      telefono: "—", numContratto: x.id, numAttivazione: "—", cf: "—", indirizzo: "—",
    };
  };

  // ── censimento: pratiche scongelate con fase > 0 (o episodio nato oggi) ──
  const oggiEp = (await client.query(
    `select id, contract_id, categoria, importo::float from malus_storico
     where eliminato is not true and created_at::date = current_date`)).rows;
  const daEvento = new Map(); // id contratto -> { minSucc, cats }
  for (const x of contracts) {
    if (x.tracking_nascosto || !B.vaInTracking(x)) continue;
    const st = Array.isArray(x.storia) ? x.storia : [];
    if (!st.length || dataOk(st[st.length - 1]?.data)) continue; // non era congelata
    let attiva = false; let minSucc = 99;
    for (const cat of righeDi(x)) {
      const row = rowDi(x, cat);
      if (B.isMalusRow(row) || B.isAttenzioneRow(row) || B.isDaLavorareRow(row)) {
        attiva = true;
        minSucc = Math.min(minSucc, SUCC_LAVORARE[cat] ?? 2);
      }
    }
    if (attiva) daEvento.set(x.id, { minSucc: minSucc === 99 ? 2 : minSucc });
  }
  // anche i contratti degli episodi di oggi (se non gia' dentro)
  for (const e of oggiEp) if (!daEvento.has(e.contract_id)) {
    const x = contracts.find((c) => c.id === e.contract_id);
    if (x) daEvento.set(x.id, { minSucc: SUCC_LAVORARE[e.categoria] ?? 2 });
  }
  console.log(`contratti da azzerare (retrodatato): ${daEvento.size} · episodi di oggi da tombstonare: ${oggiEp.length} (${oggiEp.reduce((a, e) => a + e.importo, 0)}€)`);
  oggiEp.forEach((e) => console.log(`   ${e.contract_id}#${e.categoria} ${e.importo}€`));

  // ── eventi (in memoria) ──
  const storiaNuova = new Map();
  for (const [id, info] of daEvento) {
    const x = contracts.find((c) => c.id === id);
    const dataEv = subLavorativi(new Date(), info.minSucc).toLocaleDateString("it-IT");
    const evento = {
      data: dataEv, tipo: "malus_azzerato",
      testo: "🔁 Contatore ripartito (fix modifiche-contratto senza data, 11/08): il malus del periodo nascosto non si addebita — la pratica resta da lavorare",
      utente: FIRMA, ruolo: "admin",
    };
    storiaNuova.set(id, [...(Array.isArray(x.storia) ? x.storia : []), evento]);
  }

  // ── pre-tombstone: derivabili-ma-assenti sui contratti toccati ──
  const esistenti = (await client.query(`select id, contract_id, categoria, data_inizio::text, data_fine::text, eliminato from malus_storico`)).rows;
  const byKey = new Set(esistenti.map((e) => `${e.contract_id}#${e.categoria}#${e.data_inizio}`));
  const daPreTomb = [];
  for (const [id] of daEvento) {
    const x = contracts.find((c) => c.id === id);
    for (const cat of righeDi(x)) {
      const row = rowDi(x, cat, storiaNuova.get(id));
      let der = [];
      try { der = B.ricostruisciEpisodi(row); } catch { continue; }
      for (const d of der) {
        if (d.data_fine === null) continue;
        if (!byKey.has(`${d.contract_id}#${d.categoria}#${d.data_inizio}`)) daPreTomb.push(d);
      }
    }
  }
  console.log(`episodi chiusi derivabili ma assenti (da pre-tombstonare): ${daPreTomb.length}`);

  // ── backup ──
  const dest = process.env.BACKUP_DEST || "/tmp/backup_malus_sbloccate.json";
  fs.writeFileSync(dest, JSON.stringify({
    quando: new Date().toISOString(),
    contratti: [...daEvento.keys()],
    storiaPre: [...daEvento.keys()].map((id) => ({ id, storia: contracts.find((c) => c.id === id)?.storia ?? null })),
    oggiEp, daPreTomb,
  }, null, 1));
  console.log("backup →", dest);
  if (!APPLY) { console.log("\nPROVA: nessuna scrittura (rilancia con --apply)"); await client.end(); return; }

  // ── transazione ──
  await client.query("begin");
  try {
    let ev = 0, tomb = 0, pre = 0;
    for (const [id, storia] of storiaNuova) { await client.query(`update contracts set storia=$1::jsonb where id=$2`, [JSON.stringify(storia), id]); ev++; }
    for (const e of oggiEp) {
      await client.query(`update malus_storico set eliminato=true, eliminato_il=now(), eliminato_da=$2, data_fine=coalesce(data_fine,current_date) where id=$1`, [e.id, FIRMA]);
      tomb++;
    }
    for (const d of daPreTomb) {
      await client.query(
        `insert into malus_storico (contract_id, categoria, brand, negozio, venditore, nominativo, data_inizio, data_fine, giorni, malus_euro, importo, stato, eliminato, eliminato_il, eliminato_da)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'attivo',true,now(),$12) on conflict do nothing`,
        [d.contract_id, d.categoria, d.brand, d.negozio, d.venditore, d.nominativo, d.data_inizio, d.data_fine, d.giorni, d.malus_euro, d.importo, FIRMA]);
      pre++;
    }
    console.log(`① eventi retrodatati: ${ev} · ② tombstone episodi di oggi: ${tomb} · ③ pre-tombstone: ${pre}`);
    if (ev !== daEvento.size || tomb !== oggiEp.length) throw new Error("conteggi inattesi: rollback");
    await client.query("commit");
    console.log("COMMIT ok");
  } catch (err) { await client.query("rollback"); console.error("ROLLBACK:", err.message); process.exit(1); }

  // ── scan: nessun contratto toccato in malus/warning; ⚡ ammesso ──
  let male = 0;
  for (const [id] of daEvento) {
    const x = contracts.find((c) => c.id === id);
    for (const cat of righeDi(x)) {
      const row = rowDi(x, cat, storiaNuova.get(id));
      if (B.isMalusRow(row) || B.isAttenzioneRow(row)) { male++; console.log("  ⚠️ ancora malus/warning:", id, cat); }
    }
  }
  const vivi = (await client.query(`select count(*)::int n, coalesce(sum(importo),0)::float t from malus_storico where eliminato is not true and created_at::date=current_date`)).rows[0];
  console.log(`\nSCAN: contratti toccati ancora in malus/warning ${male} (attesi 0) · episodi vivi di oggi ${vivi.n} (attesi 0, ${vivi.t}€)`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
