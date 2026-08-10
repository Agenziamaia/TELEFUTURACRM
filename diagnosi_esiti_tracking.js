// DIAGNOSI ESITI TRACKING (10/08/2026): fotografa tracking_esiti, lo confronta
// col seed delle migrazioni (cosa ha rinominato/aggiunto/eliminato Luca dal
// pannello) e censisce le chiavi REALMENTE usate dalle pratiche per riga del
// Tracking (stessa logica di page.tsx: tv→sky, 3P split, mobile business→piva,
// righeTracking). Sola lettura. Lancio: node diagnosi_esiti_tracking.js
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
const tass = require(process.env.TASS_BUNDLE || "/tmp/tass_bundle.cjs");

// ── SEED fotografato dalle migrazioni (stato "prima" delle modifiche pannello) ──
const SEED_NEGOZIO = {
  mnp: { nuovo: ["Nuovo", false], contattare_cliente: ["Contattato Cliente", false], in_corso: ["In Corso", false], attivato: ["Completato", true], ko: ["KO", false], re_inserita: ["Re-Inserita", true] },
  fisso: { nuovo: ["Nuovo", false], contattare_cliente: ["Contattato Cliente", false], contattare_supporto: ["Contattato Supporto", false], in_corso: ["In Corso", false], attivato: ["Completato", true], ko: ["KO Ripensamento", false], ko_ripensamento: ["KO Ripensamento", false], ko_tecnico: ["KO Tecnico Definitivo", false], ko_reinserito: ["KO Reinserito", false], ricaduta: ["Ricaduta", false] },
  finanziamento: { nuovo: ["Nuovo", false], otp_mancante: ["OTP Mancante", false], liquidato: ["Liquidato", true], annullato: ["Annullato", false], cartaceo: ["Cartaceo", false], in_liquidazione: ["In Liquidazione", false], doc_mancante: ["Doc Mancante", false], contattare_supporto: ["Contattato Supporto", false], modulo_win_back: ["Modulo Win Back", false] },
  piva: { nuovo: ["Nuovo", false], contattare_cliente: ["Contattato Cliente", false], contattare_supporto: ["Contattato Supporto", false], in_lavorazione: ["In Lavorazione", false], cliente_irreperibile: ["Cliente Irreperibile", false], in_attesa_dispositivo: ["In Attesa Dispositivo", false], attivato: ["Completato", true], ko_tecnico_piva: ["KO Tecnico", false], ko_credito: ["KO Credito", false], ko_reinserito_piva: ["KO Reinserito", false] },
  energia: { nuovo: ["Nuovo", false], contattare_cliente: ["Contattato Cliente", false], contattare_supporto: ["Contattato Supporto", false], doc_mancante: ["Doc Mancante", false], in_lavorazione_en: ["In Lavorazione", false], attivato: ["Completato", true], ko: ["KO", false], ko_verifica_email: ["KO Verifica Email", false], ko_credito_en: ["KO Credito", false], inserimento_errato: ["Inserimento Errato", false], ko_reinserito_en: ["KO Reinserito", false], ko_mancanza_firma: ["KO Mancanza Firma", false], ko_sii: ["KO dal Sii", false] },
  sky: { nuovo: ["Nuovo", false], contattare_cliente: ["Contattato Cliente", false], in_attivazione_sky: ["In Attivazione", false], wm_sospetta: ["WM Sospetta", false], wm_confermata: ["TV WM - BB in Corso", false], tv_wm_bb_ok: ["TV WM - BB Ok", false], completo_sky: ["Completo", true], attesa_matricola: ["Attesa Matricola", false], ripensamento_sky: ["Ripensamento Cliente", false], attivo_sky: ["Attivo", true], ko_frode_mop: ["KO Frode MOP", false], ko_reinserito_sky: ["KO Reinserito", false], aperto_sparks: ["Aperto Sparks", false], recesso_info_errate: ["Recesso per Info Errate", false] },
  mobile: { nuovo: ["Nuovo", false], contattare_cliente: ["Contattato Cliente", false], contattare_supporto: ["Contattato Supporto", false], doc_mancante: ["Doc Mancante", false], in_corso: ["In Corso", false], attivato: ["Completato", true], ko: ["KO", false] },
  digitale: { nuovo: ["Nuovo", false], contattare_cliente: ["Contattato Cliente", false], contattare_supporto: ["Contattato Supporto", false], doc_mancante: ["Doc Mancante", false], in_corso: ["In Corso", false], attivato: ["Completato", true], ko: ["KO", false] },
  multi_servizi: { nuovo: ["Nuovo", false], contattare_cliente: ["Contattato Cliente", false], contattare_supporto: ["Contattato Supporto", false], doc_mancante: ["Doc Mancante", false], in_corso: ["In Corso", false], attivato: ["Completato", true], ko: ["KO", false] },
  pos: { nuovo: ["Nuovo", false], contattare_cliente: ["Contattato Cliente", false], contattare_supporto: ["Contattato Supporto", false], doc_mancante: ["Doc Mancante", false], in_corso: ["In Corso", false], attivato: ["Completato", true], ko: ["KO", false] },
};
const ADMIN_BASE = { da_verificare: ["Da Verificare", false], in_lavorazione: ["In Lavorazione", false], non_conforme: ["Non Conforme", false], confermato: ["Confermato", true], pagato: ["Pagato", true], stornato: ["Stornato", true] };
const SEED_ADMIN = Object.fromEntries(Object.keys(SEED_NEGOZIO).map(c => [c, { ...ADMIN_BASE }]));
SEED_ADMIN.finanziamento = { ...ADMIN_BASE, stornato_da_ripagare: ["Stornato, Da Ripagare", false], ripagato: ["Ripagato", true] };

const nb = b => String(b || "").trim().toLowerCase().replace(/\s+/g, "");

(async () => {
  await client.connect();
  const esiti = (await client.query(`select * from tracking_esiti order by lato, categoria, coalesce(brand,''), ordine`)).rows;

  // ── 1. DIFF pannello vs seed (liste generali, brand NULL) ──
  console.log("══════════ 1. MODIFICHE DAL PANNELLO (vs seed migrazioni) ══════════");
  for (const lato of ["negozio", "admin"]) {
    const seed = lato === "negozio" ? SEED_NEGOZIO : SEED_ADMIN;
    const cats = new Set([...Object.keys(seed), ...esiti.filter(r => (r.lato || "negozio") === lato && !r.brand).map(r => r.categoria)]);
    for (const cat of [...cats].sort()) {
      const db = esiti.filter(r => r.categoria === cat && (r.lato || "negozio") === lato && !r.brand);
      const s = seed[cat] || {};
      const righe = [];
      for (const [chiave, [eti, compl]] of Object.entries(s)) {
        const hit = db.find(r => r.chiave === chiave);
        if (!hit) righe.push(`  ✂️  ELIMINATO  ${chiave}  (era "${eti}"${compl ? ", DEFINITIVO" : ""})`);
        else {
          const cambi = [];
          if (hit.etichetta !== eti) cambi.push(`RINOMINATO "${eti}" → "${hit.etichetta}"`);
          if (!!hit.completata !== compl) cambi.push(`flag definitivo ${compl} → ${hit.completata}`);
          if (!hit.attiva) cambi.push("SPENTO");
          if (cambi.length) righe.push(`  ✏️  ${chiave}: ${cambi.join(" · ")}`);
        }
      }
      for (const r of db.filter(r => !s[r.chiave]))
        righe.push(`  ➕ AGGIUNTO  ${r.chiave}  "${r.etichetta}"${r.completata ? "  [DEFINITIVO]" : ""}${r.attiva ? "" : "  [spento]"}${r.malus_giorno ? `  [malus ${r.malus_giorno}€/gg]` : ""}`);
      if (righe.length) { console.log(`\n[${lato}] ${cat}:`); righe.forEach(x => console.log(x)); }
    }
  }

  // ── 2. LISTE PER OPERATORE (brand non NULL): confronto col GENERALE attuale ──
  console.log("\n══════════ 2. LISTE PER OPERATORE (fisso per brand) ══════════");
  const conBrand = esiti.filter(r => r.brand);
  const gruppi = {};
  conBrand.forEach(r => { const k = `${r.lato || "negozio"}|${r.categoria}|${nb(r.brand)}`; (gruppi[k] = gruppi[k] || []).push(r); });
  for (const [k, rows] of Object.entries(gruppi).sort()) {
    const [lato, cat, b] = k.split("|");
    const gen = esiti.filter(r => r.categoria === cat && (r.lato || "negozio") === lato && !r.brand);
    console.log(`\n[${lato}] ${cat} § ${b}  (${rows.length} voci, ${rows.filter(r => r.attiva).length} attive):`);
    rows.forEach(r => {
      const g = gen.find(x => x.chiave === r.chiave);
      const note = [];
      if (!g) note.push("solo di questo brand");
      else if (g.etichetta !== r.etichetta) note.push(`≠ generale ("${g.etichetta}")`);
      if (r.completata) note.push("DEFINITIVO");
      if (!r.attiva) note.push("spento");
      if (r.malus_giorno) note.push(`malus ${r.malus_giorno}€/gg`);
      console.log(`   ${r.chiave.padEnd(24)} "${r.etichetta}"${note.length ? "  [" + note.join(" · ") + "]" : ""}`);
    });
    const mancanti = gen.filter(g => !rows.some(r => r.chiave === g.chiave));
    if (mancanti.length) console.log(`   ⤷ chiavi del generale ASSENTI qui: ${mancanti.map(g => `${g.chiave}("${g.etichetta}")`).join(", ")}`);
  }

  // ── 3. CENSIMENTO chiavi usate dalle pratiche (replica page.tsx) ──
  console.log("\n══════════ 3. CHIAVI USATE DALLE PRATICHE (per riga tracking) ══════════");
  const contracts = (await client.query(
    `select id, brand, categoria, prodotto, categoria_macro, controlli, tipo_cliente,
            dettagli, stati_categoria, stato_negozio, stato_admin, tracking_nascosto
     from contracts`)).rows;
  console.log(`contracts totali: ${contracts.length}`);

  // liste applicabili (come _lista degli helpers): brand se esiste, senno' generale
  const listaN = (cat, brandKey) => {
    const b = brandKey ? esiti.filter(r => r.categoria === cat && (r.lato || "negozio") === "negozio" && nb(r.brand) === brandKey) : [];
    if (b.length) return b;
    return esiti.filter(r => r.categoria === cat && (r.lato || "negozio") === "negozio" && !r.brand);
  };
  const listaA = (cat, brandKey) => {
    const b = brandKey ? esiti.filter(r => r.categoria === cat && r.lato === "admin" && nb(r.brand) === brandKey) : [];
    if (b.length) return b;
    return esiti.filter(r => r.categoria === cat && r.lato === "admin" && !r.brand);
  };

  const usoN = {}, usoA = {}, perCatCount = {};
  let inTracking = 0;
  for (const c of contracts) {
    if (!tass.vaInTracking(c)) continue;
    inTracking++;
    const macro = String(c.categoria_macro || "").toLowerCase() || tass.categoriaDi(c.brand, c.categoria, c.prodotto);
    const ctrl = (Array.isArray(c.controlli) && c.controlli.length) ? c.controlli : tass.controlliDi(c.dettagli || {});
    const cats = (() => {
      if (macro === "tv") return ["sky"];
      if (macro === "fisso" && String(c.brand || "").toLowerCase().includes("sky") && /\b3\s*P\b/i.test(String(c.prodotto || ""))) return ["fisso", "sky"];
      if (macro === "mobile" && String(c.tipo_cliente || "").toLowerCase() === "business") return ["piva"];
      return tass.righeTracking(macro, ctrl);
    })();
    const perCat = c.stati_categoria || {};
    const bk = nb(c.brand);
    for (const cat of cats) {
      perCatCount[cat] = (perCatCount[cat] || 0) + 1;
      // chiave persistita per la riga: stati_categoria[cat], senno' stato_negozio ereditato
      const chiave = perCat[cat] ?? (c.stato_negozio || "nuovo");
      const fonte = perCat[cat] != null ? "propria" : "ereditata";
      const kk = `${cat}|${bk}|${chiave}|${fonte}`;
      usoN[kk] = (usoN[kk] || 0) + 1;
      const ka = `${cat}|${bk}|${c.stato_admin || "da_verificare"}`;
      usoA[ka] = (usoA[ka] || 0) + 1;
    }
  }
  console.log(`pratiche nel perimetro tracking: ${inTracking}`);
  console.log("righe per categoria:", JSON.stringify(perCatCount));

  const problemi = [];
  console.log("\n— LATO NEGOZIO: chiavi non presenti (o spente) nella lista applicabile —");
  for (const [kk, n] of Object.entries(usoN).sort((a, b) => b[1] - a[1])) {
    const [cat, bk, chiave, fonte] = kk.split("|");
    const l = listaN(cat, bk);
    const hit = l.find(r => r.chiave === chiave);
    if (hit && hit.attiva) continue;
    const stato = hit ? "SPENTA" : "ORFANA";
    problemi.push({ lato: "negozio", cat, brand: bk, chiave, fonte, n, stato });
    console.log(`  ${stato}  ${cat}${bk ? "§" + bk : ""}  chiave="${chiave}" (${fonte})  × ${n}`);
  }
  console.log("\n— LATO ADMIN: chiavi non presenti (o spente) nella lista applicabile —");
  for (const [ka, n] of Object.entries(usoA).sort((a, b) => b[1] - a[1])) {
    const [cat, bk, chiave] = ka.split("|");
    const l = listaA(cat, bk);
    const hit = l.find(r => r.chiave === chiave);
    if (hit && hit.attiva) continue;
    const stato = hit ? "SPENTA" : "ORFANA";
    problemi.push({ lato: "admin", cat, brand: bk, chiave, n, stato });
    console.log(`  ${stato}  ${cat}${bk ? "§" + bk : ""}  chiave="${chiave}"  × ${n}`);
  }
  if (!problemi.length) console.log("  (nessuna: tutte le chiavi usate sono censite e attive)");

  // dump per le fasi successive
  const out = { esiti, usoN, usoA, perCatCount, problemi, quando: new Date().toISOString() };
  const dest = process.env.DUMP_DEST || "/tmp/diagnosi_esiti_tracking.json";
  fs.writeFileSync(dest, JSON.stringify(out, null, 1));
  console.log("\ndump →", dest);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
