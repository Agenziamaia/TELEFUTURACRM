// BACKFILL MATCH (regole Luca 10/08 via Verifiche): finestra dalla DATA DELLA
// CHIAMATA (appointments.created_at) a +30gg dalla data fissata; ko/annullato
// riapribili. Due fasi:
//  1) appuntamenti NON attivati il cui CF ha una vendita in finestra →
//     attivato (stesso negozio radice = cooperation) / attivato_diverso_negozio;
//     pratiche caller collegate → Attivato (+contract_id se cooperation),
//     malus caller eliminati.
//  2) pratiche rimaste "Attivato Anomalia" con vendite VERE sul CF ma senza
//     appuntamento agganciabile → stato Attivato + contract_id (cooperation
//     diretta pratica↔vendita).
// Idempotente (salta gli attivati). Dump pre-modifica su file. Lancio: node fix_match_finestra.js
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
const norm = (s) => String(s || "").trim().toUpperCase();
const radice = (s) => String(s || "").trim().split(/\s+/)[0].toLowerCase();
const soloData = (s) => { const m = String(s || "").match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : null; };
const addG = (ymd, n) => { const [y, m, d] = ymd.split("-").map(Number); const x = new Date(Date.UTC(y, m - 1, d + n)); return x.toISOString().slice(0, 10); };
const FIRMA = "Sistema (backfill finestra 10/08)";

(async () => {
  await client.connect();
  const apps = (await client.query(`
    select id, cf_piva, referente_cf, date, created_at, store, status, customer_name
    from appointments
    where coalesce(type,'') <> 'richiamo'
      and coalesce(status,'') not in ('attivato','attivato_diverso_negozio')`)).rows;
  const ctr = (await client.query(`
    select c.id, c.negozio, c.data_registrazione, c.created_at, upper(trim(cl.cf_piva)) cf
    from contracts c join clients cl on cl.id = c.client_id
    where cl.cf_piva is not null and cl.cf_piva <> ''`)).rows;
  const perCf = {};
  ctr.forEach(c => {
    const dv = soloData(c.data_registrazione) || soloData(c.created_at);
    if (!c.cf || !dv) return;
    (perCf[c.cf] = perCf[c.cf] || []).push({ id: c.id, negozio: c.negozio, dv });
  });

  const dump = { fase1: [], fase2: [] };
  let att = 0, attAltro = 0;
  for (const a of apps) {
    const chiavi = [norm(a.cf_piva), norm(a.referente_cf)].filter(Boolean);
    const ad = soloData(a.date && a.date.toISOString ? a.date.toISOString() : a.date);
    if (!ad || !chiavi.length) continue;
    const dallaChiamata = soloData(a.created_at && a.created_at.toISOString ? a.created_at.toISOString() : a.created_at) || ad;
    const vendite = chiavi.flatMap(k => perCf[k] || []).filter(v => v.dv >= dallaChiamata && v.dv <= addG(ad, 30));
    if (!vendite.length) continue;
    const rApp = radice(a.store);
    const stessa = vendite.find(v => !rApp || radice(v.negozio) === rApp);
    const coop = !!stessa || !rApp;
    const vendita = stessa || vendite[0];
    const nuovo = coop ? "attivato" : "attivato_diverso_negozio";
    dump.fase1.push({ app: a.id, cliente: a.customer_name, da: a.status, a: nuovo, vendita: vendita.id, dv: vendita.dv });
    await client.query(`update appointments set status=$1 where id=$2`, [nuovo, a.id]);
    if (coop) await client.query(`update contracts set appointment_id=$1 where id=$2 and appointment_id is null`, [a.id, vendita.id]);
    // pratiche caller collegate all'appuntamento
    const prat = (await client.query(`select id, stato from calls where appointment_id=$1`, [a.id])).rows;
    for (const p of prat) {
      const statoNuovo = coop ? "Attivato" : "Attivato Altro Negozio";
      await client.query(`
        update calls set stato=$1, contract_id=$2,
          storico = coalesce(storico,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
            'data', now(), 'caller', $3::text, 'campo', 'stato', 'da', $4::text, 'a', $1::text,
            'dettagli', 'match retroattivo: vendita ' || $5 || ' in finestra (regola dalla chiamata)'))
        where id=$6`, [statoNuovo, coop ? vendita.id : null, FIRMA, p.stato, vendita.id, p.id]);
      await client.query(`update caller_malus set eliminato=true, eliminato_il=now(), eliminato_da=$1
        where call_id=$2 and stato <> 'compensato' and eliminato=false`, [FIRMA, p.id]);
    }
    if (coop) att++; else attAltro++;
    console.log(`✓ app ${a.id} ${a.cliente || a.customer_name} [${a.status || "—"} → ${nuovo}] vendita ${vendita.id} del ${vendita.dv}${prat.length ? ` · ${prat.length} pratica/e caller` : ""}`);
  }

  // ── FASE 2: anomalie residue con vendite vere sul CF (senza appuntamento) ──
  const anomalie = (await client.query(`select id, nome, cognome, ragione_sociale, cf, piva, stato from calls where stato='Attivato Anomalia'`)).rows;
  let f2 = 0;
  for (const p of anomalie) {
    const chiavi = [norm(p.cf), norm(p.piva)].filter(Boolean);
    const vendite = chiavi.flatMap(k => perCf[k] || []);
    if (!vendite.length) continue;
    const vendita = [...vendite].sort((x, y) => y.dv.localeCompare(x.dv))[0];
    dump.fase2.push({ call: p.id, nome: (p.ragione_sociale || `${p.nome || ""} ${p.cognome || ""}`).trim(), vendita: vendita.id, dv: vendita.dv });
    await client.query(`
      update calls set stato='Attivato', contract_id=$1,
        storico = coalesce(storico,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'data', now(), 'caller', $2::text, 'campo', 'stato', 'da', 'Attivato Anomalia', 'a', 'Attivato',
          'dettagli', 'riconciliazione: vendita ' || $1 || ' presente sul CF (cooperation diretta)'))
      where id=$3`, [vendita.id, FIRMA, p.id]);
    await client.query(`update caller_malus set eliminato=true, eliminato_il=now(), eliminato_da=$1
      where call_id=$2 and stato <> 'compensato' and eliminato=false`, [FIRMA, p.id]);
    f2++;
    console.log(`✓ anomalia → Attivato: ${dump.fase2[dump.fase2.length - 1].nome} (vendita ${vendita.id} del ${vendita.dv})`);
  }

  fs.writeFileSync(path.join(__dirname, "dump_match_finestra_pre.json"), JSON.stringify(dump, null, 2));
  const resid = (await client.query(`select count(*) n from calls where stato='Attivato Anomalia'`)).rows[0].n;
  console.log(`\n--- ESITO ---\nFase 1: ${att} attivati (cooperation) + ${attAltro} attivati altro negozio`);
  console.log(`Fase 2: ${f2} anomalie riconciliate con cooperation diretta`);
  console.log(`Anomalie residue (nessuna vendita sul CF): ${resid}`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
