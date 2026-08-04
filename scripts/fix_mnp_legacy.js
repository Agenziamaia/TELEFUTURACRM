// FIX MNP LEGACY (caso Kashfa, 05/08): le pratiche del flusso pre-catalogo
// scrivevano "N. MNP"/"Op. MNP" senza il flag MNP="Sì" → controlli vuoti →
// fuori dal Tracking. Questo runner: (1) dump di sicurezza; (2) backfill
// controlli=['mnp'] (o ['finanziamento']) dove i segnali legacy ci sono;
// (3) PARACADUTE anti-malus-retroattivo: per le pratiche NON definitive che
// rientrano nel Tracking, evento malus_azzerato in storia retrodatato di
// succ_warning giorni lavorativi (la pratica nasce a inizio WARNING, il malus
// rimatura solo se resta ferma — stesso trattamento dello split Sky 04/08).
// Uso: node scripts/fix_mnp_legacy.js          (dry run)
//      node scripts/fix_mnp_legacy.js --apply
const fs = require("fs");
const path = require("path");
const APPLY = process.argv.includes("--apply");
const CRM = path.join(__dirname, "..");
const env = Object.fromEntries(fs.readFileSync(path.join(CRM, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const { Client } = require("pg");
const c = new Client({
  host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

// stati che FERMANO il malus (allineato a trackingHelpers/fermaMalus: definitivi)
const DEFINITIVI = /attiv|liquidat|complet|annullat|recess|storn|^ko/i;

const sottraiLavorativi = (da, n) => {
  const d = new Date(da); d.setHours(12, 0, 0, 0);
  let resta = n;
  while (resta > 0) { d.setDate(d.getDate() - 1); if (d.getDay() !== 0) resta--; }
  return d;
};
const isoData = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

(async () => {
  await c.connect();
  // regola mobile: soglia warning dai dati VERI
  const { rows: reg } = await c.query(
    "select categoria, succ_warning, senza_warning from tracking_regole where categoria = 'mobile' limit 1");
  const soglia = reg.length ? (reg[0].succ_warning ?? reg[0].senza_warning ?? 0) : 0;
  console.log("regola mobile: soglia warning =", soglia, "gg lavorativi");

  const { rows } = await c.query(`
    select id, prodotto, stato, stato_negozio, stati_categoria, storia, negozio, data,
           (dettagli ? 'N. MNP') or (dettagli ? 'Op. MNP') or (dettagli ? 'N.MNP') or (dettagli ? 'Numero MNP') as legacy_mnp
    from contracts
    where categoria_macro = 'mobile'
      and coalesce(lower(tipo_cliente), 'consumer') <> 'business'
      and (controlli is null or cardinality(controlli) = 0)
      and brand not ilike '%marginal%' and brand not ilike '%extra%' and brand not ilike 'very%'
      and prodotto not ilike '%sost%'
      and ( dettagli ? 'N. MNP' or dettagli ? 'Op. MNP' or prodotto ilike '%mnp%' or prodotto ilike '%finanz%' )
    order by data`);
  console.log("pratiche da sistemare:", rows.length);

  const dump = path.join(__dirname, `dump_mnp_legacy_pre_${Date.now()}.json`);
  fs.writeFileSync(dump, JSON.stringify(rows, null, 2));
  console.log("dump di sicurezza:", dump);

  let ctrlN = 0, eventiN = 0;
  for (const r of rows) {
    const controllo = /finanz/i.test(r.prodotto || "") ? "finanziamento" : "mnp";
    // stato per il malus: stati_categoria.mobile ?? stato_negozio ?? stato
    const statoCat = (r.stati_categoria && r.stati_categoria.mobile) || r.stato_negozio || r.stato || "";
    const definitiva = DEFINITIVI.test(statoCat);
    console.log(` ${APPLY ? "APPLICO" : "dry"} ${r.id} · ${r.prodotto} · stato "${statoCat}" → controlli=[${controllo}]${definitiva ? " (definitiva: niente evento)" : " + evento warning"}`);
    if (!APPLY) continue;
    await c.query("update contracts set controlli = array[$1]::text[] where id = $2", [controllo, r.id]);
    ctrlN++;
    if (!definitiva) {
      const evento = {
        data: isoData(sottraiLavorativi(new Date(), soglia)),
        tipo: "malus_azzerato",
        testo: "🔁 Pratica MNP legacy rientrata nel Tracking (fix 05/08): contatore ripartito, pratica in WARNING per la lavorazione",
        utente: "Riallineamento MNP legacy 05/08", ruolo: "admin",
      };
      const storia = Array.isArray(r.storia) ? [...r.storia, evento] : [evento];
      await c.query("update contracts set storia = $1::jsonb where id = $2", [JSON.stringify(storia), r.id]);
      eventiN++;
    }
  }
  if (APPLY) console.log(`FATTO: controlli su ${ctrlN} pratiche, eventi warning su ${eventiN}`);
  else console.log("DRY RUN: nessuna scrittura. Rilanciare con --apply.");
  await c.end();
})().catch((e) => { console.error("ERRORE:", e.message); process.exit(1); });
