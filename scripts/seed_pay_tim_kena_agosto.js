// SEED tabellari TIM + KENA AGOSTO 2026 (fonte: "Piano Incentivazione Agosto
// 2026 - Distribuzione Italia Srl.pdf" — lettera UFFICIALE di agosto, vale
// SIA lato ragazzi SIA lato azienda per parola di Luca 10/08).
// TIM: pista "mnp" (soglie in MNP: <7 / ≥7 / ≥30 con l'extra +5€ già dentro
// la S3; il +10€ MVNO da Iliad/Coop/Poste e il tetto 50/55 sono in nota — la
// provenienza non è ancora letta dal motore) e pista "fisso" (accessi 1-5/≥6).
// KENA: pista "mnp" a scaglioni 1-5 / 6-20 / 21-40 (oltre 40 si paga a fascia
// 1 — nota); fasce canone dal NOME offerta (>6,99 / ≤6,99); valori STD — le
// MNP STAR (da Iliad/Fastweb/Coop/Poste) pagano di più, in nota.
// NON seedati (domanda in Verifiche): TIM Unica, DAZN, Tutto Voce, TIM WiFi
// GO, rateizzazioni, business TIM, gara completezza 300€, fascia ≥9,99€
// mobile TIM, "con contenuto" sul fisso, Kena Your Home/Dati Promo, Subbyx,
// malus (mancata domiciliazione/ric.aut/T3) e boost 1-12/8.
// Idempotente: cancella e ricrea SOLO tim/2026-08-01 e kena/2026-08-01.
// Lancio: node scripts/seed_pay_tim_kena_agosto.js
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("pg");
const client = new Client({
  host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

const MONTH = "2026-08-01";

// ── TIM ─────────────────────────────────────────────────────────
const TIM = {
  brand: "tim",
  piste: [
    { chiave: "mnp", nome: "MNP", um: "pezzi", ordine: 1 },
    { chiave: "fisso", nome: "Accessi Fisso", um: "pezzi", ordine: 2 },
  ],
  soglie: {
    mnp: [[1, 6], [7, 29], [30, null]],      // S3 = Extra Gara 30 MNP (+5€ già nei tiers)
    fisso: [[1, 5], [6, null]],
  },
  // [pista, nome, tc, categoria, prodotto, offerta, punti, tiers, note]
  righe: [
    ["mnp", "MNP con opzione", "Consumer", null, "Mobile MNP", null, 1, [17, 35, 40],
      "fascia canone <9,99€; le offerte ≥9,99€ valgono 20/40/45 (quali sono? vedi Verifiche); +10€ se MNP da Iliad/Coop/Poste (provenienza non automatizzata); tetto lettera 50/55€"],
    ["fisso", "NIP/ULL senza contenuto", "Consumer", "Fisso", "Fisso", "Tim Wifi Casa", 1, [50, 90],
      "con contenuto TV = 75/115 (aggancio da definire); Telepass primario ≥5 = +20€ su NIP/ULL; mancata domiciliazione −10€"],
  ],
  // [nome, tc, categoria, prodotto, offerta, importo, note]
  gettoni: [
    ["AL opzionate ed etniche", "Consumer", null, "Mobile GA", null, 8, "vale anche per le etniche (International); mancata domiciliazione −7€"],
    ["FWA Ricaricabile", "Consumer", "Fisso", "FWA", "Tim Wifi FWA", 24, "immediati"],
    ["TimVision XS (PxQ singolo contenuto)", "Consumer", "TV", "TV", "TimVision XS", 5, "PxQ singolo contenuto CB — confermare l'equivalenza"],
    ["TimVision Family S (nuova linea)", "Consumer", "TV", "TV", "TimVision S", 10, null],
    ["TimVision Family M (nuova linea)", "Consumer", "TV", "TV", "TimVision M", 15, null],
    ["TimVision Family L (nuova linea)", "Consumer", "TV", "TV", "TimVision L", 20, "con DAZN = 25€ (offerta non a catalogo)"],
    ["Telepass Family", "Consumer", "Multi-Servizi", "Telepass", null, 10, "con Assistenza Stradale Europa = 20€ — a catalogo c'è una sola offerta Telepass"],
  ],
};

// ── KENA ────────────────────────────────────────────────────────
// Fasce dal NOME offerta: ≤6,99 → STD 35/41/65 · >6,99 → STD 40/51/70.
// STAR (da Iliad/Fastweb/Coop/Poste): 45/56/80 e 50/66/90 — in nota finché il
// motore non legge la provenienza. Wallet: −15€ se manca la ric. automatica.
const K_BASSA = ["4,99 Voce 10GB Top", "5,99 100GB 5G Top", "Special 5,99 2 Mesi Gratis"];
const K_ALTA = ["11,99 200GB 5G Top", "7,99 250GB 5G Top", "9,99 350GB 5G Top", "Kena 7,99 Flash Smart 150", "Kena 7,99 Flash Star"];
const KENA = {
  brand: "kena",
  piste: [{ chiave: "mnp", nome: "MNP", um: "pezzi", ordine: 1 }],
  soglie: { mnp: [[1, 5], [6, 20], [21, 40]] },   // oltre 40: pagate a fascia 1 (nota lettera)
  righe: [
    ...K_BASSA.map(off => ["mnp", `MNP ≤6,99 · ${off}`, "Consumer", null, "Mobile MNP", off, 1, [35, 41, 65],
      "STD; STAR (da Iliad/FW/Coop/Poste) = 45/56/80; senza ric. automatica −15€"]),
    ...K_ALTA.map(off => ["mnp", `MNP >6,99 · ${off}`, "Consumer", null, "Mobile MNP", off, 1, [40, 51, 70],
      "STD; STAR (da Iliad/FW/Coop/Poste) = 50/66/90; senza ric. automatica −15€"]),
    ["mnp", "AL (GA)", "Consumer", null, "Mobile GA", null, 0, [8, 10, 12],
      "segue gli scaglioni MNP senza portare pezzi; con MNP≥2 = 10/12/14 (non automatizzato)"],
  ],
  gettoni: [
    // Kena Pack: conta nei target, gettone fisso (riga con pista+punti e gettone=true)
    ["Kena Pack · MNP", "Consumer", null, "Mobile MNP", "Kena Pack", 20, "conta nei target; STAR = 25€; storno 50% se non rinnovata entro il 7° mese", "mnp", 1],
    ["Kena Pack · AL", "Consumer", null, "Mobile GA", "Kena Pack", 10, "conta nel target AL", null, 0],
    ["Kena Easy Europe", "Consumer", null, "Mobile GA", "Kena Easy Europe", 5, "fuori target"],
    ["Kena Easy Europe Plus", "Consumer", null, "Mobile GA", "Kena Easy Europe Plus", 10, "fuori target"],
    ["Domo Kena (non compensata)", "Consumer", null, null, "Domo Kena 1GB", 0, "la lettera la esclude esplicitamente: 0€, nessun target"],
  ],
};

(async () => {
  await client.connect();
  for (const T of [TIM, KENA]) {
    await client.query("begin");
    try {
      for (const t of ["pay_righe", "pay_soglie", "pay_piste"])
        await client.query(`delete from ${t} where brand=$1 and month=$2 and lato='ragazzi'`, [T.brand, MONTH]);
      for (const p of T.piste)
        await client.query(
          `insert into pay_piste (brand, month, chiave, nome, um, ordine) values ($1,$2,$3,$4,$5,$6)`,
          [T.brand, MONTH, p.chiave, p.nome, p.um, p.ordine]);
      for (const [pista, scala] of Object.entries(T.soglie))
        for (let i = 0; i < scala.length; i++)
          await client.query(
            `insert into pay_soglie (brand, month, pista, tier, soglia_da, soglia_a) values ($1,$2,$3,$4,$5,$6)`,
            [T.brand, MONTH, pista, i + 1, scala[i][0], scala[i][1]]);
      let ord = 0;
      for (const [pista, nome, tc, cat, prod, off, punti, tiers, note] of T.righe)
        await client.query(
          `insert into pay_righe (brand, month, pista, nome, tipo_cliente, categoria, prodotto, offerta,
                                  punti, pay_base, pay_tiers, gettone, note, ordine, brand_vendita)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,null,$10,false,$11,$12,$1)`,
          [T.brand, MONTH, pista, nome, tc, cat, prod, off, punti, tiers, note, ord++]);
      for (const [nome, tc, cat, prod, off, importo, note, pista, punti] of T.gettoni)
        await client.query(
          `insert into pay_righe (brand, month, pista, nome, tipo_cliente, categoria, prodotto, offerta,
                                  punti, pay_base, pay_tiers, gettone, note, ordine, brand_vendita)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'{}',true,$11,$12,$1)`,
          [T.brand, MONTH, pista || null, nome, tc, cat, prod, off, punti || 0, importo, note, ord++]);
      await client.query("commit");
    } catch (e) { await client.query("rollback"); console.error(`FAIL ${T.brand}:`, e.message); process.exit(1); }
    const n = async (t) => (await client.query(`select count(*) n from ${t} where brand=$1 and month=$2`, [T.brand, MONTH])).rows[0].n;
    console.log(`OK ${T.brand} — piste ${await n("pay_piste")} · soglie ${await n("pay_soglie")} · righe ${await n("pay_righe")} (attese ${T.righe.length + T.gettoni.length})`);
    const orfane = (await client.query(`
      select r.nome, r.offerta from pay_righe r where r.brand=$1 and r.month=$2 and r.offerta is not null
      and not exists (
        select 1 from catalog_offerte o
        join catalog_prodotti p on p.id = o.prodotto_id
        join catalog_categorie c on c.id = p.categoria_id
        where p.brand_id = r.brand
          and lower(o.nome) = lower(r.offerta)
          and (r.categoria is null or lower(c.nome) = lower(r.categoria))
          and (r.prodotto is null or lower(p.nome) = lower(r.prodotto))
          and (r.tipo_cliente is null or lower(p.tipo_cliente) = lower(r.tipo_cliente))
      )`, [T.brand, MONTH])).rows;
    if (orfane.length) { console.log("⚠️ RIGHE SENZA OFFERTA A CATALOGO:"); orfane.forEach(r => console.log("  -", r.nome, "→", r.offerta)); }
    else console.log(`✅ ${T.brand}: tutte le righe agganciano il catalogo`);
  }
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
