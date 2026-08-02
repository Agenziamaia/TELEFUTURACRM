// IMPORT STORICO DEBITI da Book1.xlsx (Luca 02/08)
// Lancio: node import_book1.js   (dalla cartella del CRM)
//
// Regole concordate:
//  - importi POSITIVI = debiti, NEGATIVI = crediti (il file e' al contrario);
//  - si importano SOLO le persone che matchano un utente ATTIVO (gli ex
//    dipendenti restano fuori); "Daniel" = nome esatto → Daniel Sonnino;
//    ALIAS confermati da Luca: "Gian" = Antonino Gianluca Cutrupi;
//  - anni inferiti camminando sul calendario da Ottobre 2024 (anno esplicito
//    nel file vince, es. "Gennao 2026"); righe senza mese → mese corrente
//    del puntatore;
//  - COMPENSAZIONE FIFO: i crediti consumano i debiti piu' vecchi; cio' che
//    risulta compensato finisce in STORICO (stato 'saldato'), il residuo
//    resta APERTO — le liste mostrano solo il vivo, lo storico si consulta;
//  - ogni riga porta nel campo note il riferimento alla riga del file.
// Guardia anti doppio import PER PERSONA (creato_da='Import Book1'): lo
// script si puo' rilanciare, chi e' gia' dentro viene saltato.
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("pg");
const client = new Client({
  host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

const FILE = "/Users/macbookl/My Drive/Downloads D/Book1.xlsx";
const ALIAS = { gian: "Antonino Gianluca Cutrupi" };   // confermati da Luca
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const trovaMese = t => {
  const x = norm(t).replace(/[0-9]/g, "").trim();
  if (!x) return -1;
  for (let i = 0; i < 12; i++) if (MESI[i].startsWith(x.slice(0, 4)) || x.startsWith(MESI[i].slice(0, 4))) return i;
  return -1;
};

(async () => {
  await client.connect();
  const { rows: gia } = await client.query("select distinct user_id from user_movimenti where creato_da='Import Book1'");
  const giaDentro = new Set(gia.map(r => r.user_id));

  const { rows: utenti } = await client.query("select id, full_name from app_users where active is true");
  const match = (nomeFile) => {
    const nf = norm(nomeFile).replace(/[0-9.]/g, " ").trim();
    const ali = ALIAS[nf];
    if (ali) { const u = utenti.find(x => norm(x.full_name) === norm(ali)); if (u) return u; }
    const toks = nf.split(/\s+/); const pn = toks[0]; const resto = toks.slice(1).join(" ");
    let cand = utenti.filter(u => norm(u.full_name).split(/\s+/)[0] === pn);
    if (cand.length !== 1) cand = utenti.filter(u => { const t = norm(u.full_name).split(/\s+/); return t[0].startsWith(pn) || pn.startsWith(t[0]); });
    if (resto && cand.length > 1) cand = cand.filter(u => norm(u.full_name).split(/\s+/).slice(1).some(c => c.startsWith(resto[0])));
    return cand.length === 1 ? cand[0] : null;
  };

  const wb = XLSX.readFile(FILE);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  let py = 2024, pm = 9;   // puntatore calendario: Ottobre 2024
  const movs = [];
  for (let i = 15; i < rows.length; i++) {
    const r = rows[i]; if (!r || !r[0]) continue;
    const nome = String(r[0]).trim(), imp = Number(r[1]), nota = String(r[3] || "").trim();
    if (!isFinite(imp) || imp === 0) continue;
    const raw = String(r[2] || "").trim();
    const annoEsp = (raw.match(/20\d\d/) || [])[0];
    const mi = trovaMese(raw);
    let y, m;
    if (mi < 0) { y = py; m = pm; }
    else if (annoEsp) { y = Number(annoEsp); m = mi; }
    else {
      let best = null;
      for (const yy of [py - 1, py, py + 1]) { const d = (yy * 12 + mi) - (py * 12 + pm); const sc = Math.abs(d) - (d >= 0 ? 0.4 : 0); if (!best || sc < best.sc) best = { y: yy, sc }; }
      y = best.y; m = mi;
    }
    if (y * 12 + m > py * 12 + pm) { py = y; pm = m; }
    movs.push({ riga: i, nome, imp, comp: y + "-" + String(m + 1).padStart(2, "0") + "-01", nota, raw });
  }

  const per = {}; movs.forEach(mv => (per[mv.nome] = per[mv.nome] || []).push(mv));
  const ora = new Date().toISOString();
  const ins = []; const recap = [];
  for (const [nome, ms] of Object.entries(per)) {
    const u = match(nome);
    const totFile = Math.round(ms.reduce((s, m) => s + m.imp, 0) * 100) / 100;
    if (!u) { recap.push("SKIP " + nome + " (nessun utente attivo) — saldo file € " + totFile + ", " + ms.length + " movimenti NON importati"); continue; }
    if (giaDentro.has(u.id)) { recap.push("GIA' DENTRO " + nome + " → " + u.full_name + " — saltato"); continue; }
    const ord = [...ms].sort((a, b) => a.comp.localeCompare(b.comp) || a.riga - b.riga);
    const base = { user_id: u.id, origine: "debito", tipo: "one_shot", creato_da: "Import Book1" };
    const notaDi = m => ("Import Book1 · riga " + m.riga + " · mese file \"" + (m.raw || "—") + "\"");
    const titoloDi = m => (m.nota || "Movimento storico").slice(0, 80);
    let credito = ord.filter(m => m.imp < 0).reduce((s, m) => s - m.imp, 0);
    ord.filter(m => m.imp < 0).forEach(m => ins.push({ ...base, titolo: titoloDi(m), importo: -m.imp, segno: 1, competenza: m.comp, note: notaDi(m), stato: "saldato", saldato_il: ora, saldato_da: "Import storico Book1" }));
    let aperteTot = 0, aperteN = 0, storicoN = ord.filter(m => m.imp < 0).length;
    for (const m of ord.filter(x => x.imp > 0)) {
      if (credito >= m.imp - 0.001) {
        credito = Math.round((credito - m.imp) * 100) / 100;
        ins.push({ ...base, titolo: titoloDi(m), importo: m.imp, segno: -1, competenza: m.comp, note: notaDi(m) + " · compensata", stato: "saldato", saldato_il: ora, saldato_da: "Import storico Book1" });
        storicoN++;
      } else if (credito > 0.001) {
        const coperta = Math.round(credito * 100) / 100, residuo = Math.round((m.imp - coperta) * 100) / 100;
        ins.push({ ...base, titolo: titoloDi(m), importo: coperta, segno: -1, competenza: m.comp, note: notaDi(m) + " · quota compensata di " + m.imp, stato: "saldato", saldato_il: ora, saldato_da: "Import storico Book1" });
        ins.push({ ...base, titolo: titoloDi(m), importo: residuo, segno: -1, competenza: m.comp, note: notaDi(m) + " · residuo di " + m.imp, stato: "aperto" });
        credito = 0; storicoN++; aperteN++; aperteTot += residuo;
      } else {
        ins.push({ ...base, titolo: titoloDi(m), importo: m.imp, segno: -1, competenza: m.comp, note: notaDi(m), stato: "aperto" });
        aperteN++; aperteTot += m.imp;
      }
    }
    recap.push("OK " + nome + " → " + u.full_name + ": APERTO € " + (Math.round(aperteTot * 100) / 100) + " in " + aperteN + " voci · storico " + storicoN + " voci · saldo file € " + totFile);
  }

  await client.query("begin");
  try {
    for (const r of ins) {
      await client.query(
        `insert into user_movimenti (user_id, origine, tipo, titolo, note, importo, segno, competenza, stato, saldato_il, saldato_da, creato_da)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [r.user_id, r.origine, r.tipo, r.titolo, r.note, r.importo, r.segno, r.competenza, r.stato, r.saldato_il || null, r.saldato_da || null, r.creato_da]);
    }
    await client.query("commit");
  } catch (e) { await client.query("rollback"); throw e; }

  if (!ins.length) { console.log("Nulla da importare (tutti gia' dentro)"); recap.forEach(r => console.log(r)); await client.end(); return; }
  console.log("INSERITE " + ins.length + " righe (in transazione)");
  recap.forEach(r => console.log(r));
  const { rows: ver } = await client.query(
    `select au.full_name, sum(case when m.stato='aperto' then m.importo * (case when m.segno=1 then -1 else 1 end) else 0 end) aperto,
            count(*) filter (where m.stato='saldato') storico
     from user_movimenti m join app_users au on au.id = m.user_id
     where m.creato_da='Import Book1' group by au.full_name order by aperto desc`);
  console.log("── VERIFICA DA DB ──");
  ver.forEach(v => console.log(`  ${v.full_name}: aperto € ${Number(v.aperto).toFixed(2)} · ${v.storico} in storico`));
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
