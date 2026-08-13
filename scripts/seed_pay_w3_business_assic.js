// SEED WIND3 AZIENDA — piste BUSINESS P.IVA e ASSICURAZIONI, AGOSTO 2026
// (fonte: "GARA AGOSTO.pptx" slide 5-6 = Extra Gara P.IVA, slide 8 =
// Assicurazioni; precisazione Luca 13/08: la gara business è DI RETE, a PUNTI
// per il raggiungimento della soglia e a PAY UNITARIO sul singolo pezzo).
//
// BUSINESS P.IVA (gara per Ragione Sociale):
//   · ogni evento valido (Mobile GA business, Fisso/FWA acq., L&G acq.,
//     Protezione Pro) porta i SUOI punti in soglia e, in soglia, paga il
//     PREMIO UNITARIO a evento: 25/35/45/55 € (assunto profilo «con Business
//     Promoter Plus+» — da confermare con Luca).
//   · soglie ASSUNTE per la rete: FRANCHISING MULTIPOS con BP, 5 PDV
//     (primo pos + 4 × dal 2° pos): S1 25+4×15=85 · S2 30+4×22=118 ·
//     S3 35+4×32=163 · S4 45+4×40=205 punti — da confermare.
//   · punti (slide 6): World/Staff 1,5 · Full/Country/Data60-100/SuperInt 1 ·
//     Flex/Special/Data10 0,5 · Fisso/FWA 1 a linea (FRITZ!Box 1,5) ·
//     Luce&Gas 1 · Protezione Pro 5 · Negozio Protetti 5 (NON a catalogo).
//
// ASSICURAZIONI (per PDV, qui a rete = ×5):
//   · soglie punti per PDV: sottosoglia <10 · S1 ≥10 · S2 ≥15 · S3 ≥20 →
//     rete 50/75/100; pay = MOLTIPLICATORE flat del canone per prodotto;
//     il premio a volume (0/500/750 € per PDV, sottosoglia −500 sul premio
//     Partnership) NON è in questo motore (v2).
//   · SOLO offerte a catalogo (regola Luca): Protezione Pro Negozi (molt 1,5
//     da footnote T1), Sport 0,5pt ×2,5, Sport Famiglia 2pt ×3, Viaggi 1,5pt
//     ×2,5, Elettrodomestici 0,5pt ×1,5, Micio e Fido 2,5pt ×2,5. Fuori:
//     Casa&Famiglia (non a catalogo), Giro x il Mondo (paga 12,5% del premio,
//     modello diverso — chiesto a Luca).
//
// perc_ragazzi = 0 su ENTRAMBE le piste = SOLO AZIENDA: il derivato ragazzi
// le salta (supporto in commissioning.ts, 13/08).
// Idempotente: cancella e ricrea SOLO queste due piste (windtre/agosto/azienda).
// Lancio: node scripts/seed_pay_w3_business_assic.js
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
const BRAND = "windtre", MONTH = "2026-08-01", LATO = "azienda";

const PISTE = [
  { chiave: "business_piva", nome: "Business P.IVA (rete)", ordine: 4 },
  { chiave: "assicurazioni", nome: "Assicurazioni", ordine: 5 },
];
const SOGLIE = {
  business_piva: [[85, 117], [118, 162], [163, 204], [205, null]],
  assicurazioni: [[50, 74], [75, 99], [100, null]],
};

const PREMIO = [25, 35, 45, 55]; // € a evento, con BP Plus+ (da confermare)

// [nome, tc, cat, prod, off, punti, note] — pay a evento = PREMIO
const BUSINESS = [
  ["Professional World", "Business", null, null, "Professional World", 1.5, "punti 1,5 (slide 6)"],
  ["Professional Staff", "Business", null, null, "Professional Staff", 1.5, "punti 1,5 (slide 6)"],
  ["Professional Full", "Business", null, null, "Professional Full", 1, "punti 1"],
  ["Professional Country", "Business", null, null, "Professional Country", 1, "punti 1"],
  ["Professional Data 60", "Business", null, null, "Professional Data 60 Gb 5.99", 1, "punti 1"],
  ["Professional Data 60", "Business", null, null, "Professional Data 60 Gb 8.99", 1, "punti 1"],
  ["Professional Data 100", "Business", null, null, "Professional Data 100 Gb 9.99", 1, "punti 1"],
  ["Professional Data 100", "Business", null, null, "Professional Data 100 Gb 13.99", 1, "punti 1"],
  ["Professional Flex", "Business", null, null, "Professional Flex", 0.5, "punti 0,5"],
  ["Professional Flexy", "Business", null, null, "Professional Flexy", 0.5, "punti 0,5"],
  ["Professional Special", "Business", null, null, "Professional Special", 0.5, "punti 0,5"],
  ["Professional Data 10", "Business", null, null, "Professional Data 10 Gb 4.99", 0.5, "punti 0,5"],
  ["Fisso/FWA Business (per linea)", "Business", "Fisso", null, null, 1, "1 punto a linea; FRITZ!Box 1,5 e 2ª linea Professional 1,5 (v2)"],
  ["Luce Business (conta anche qui)", "Business", "Luce", null, null, 1, "l'evento L&G prende il suo gettone in Luce&Gas E conta/paga nella gara P.IVA (slide 6)"],
  ["Gas Business (conta anche qui)", "Business", "Gas", null, null, 1, "come sopra"],
  ["Protezione Pro Negozi - Affittuario", "Business", null, null, "Protezione Pro Negozi - Affittuario", 5, "punti 5"],
  ["Protezione Pro Negozi - Proprietario", "Business", null, null, "Protezione Pro Negozi - Proprietario", 5, "punti 5"],
];

// [nome, tc, off, punti, molt, note] — moltiplicatore FLAT del canone
const ASSIC = [
  ["Protezione Pro Negozi - Affittuario", "Business", "Protezione Pro Negozi - Affittuario", 4, 1.5, "molt 1,5 a T1 sul prodotto Negozi (footnote slide 8); canone da definire a catalogo"],
  ["Protezione Pro Negozi - Proprietario", "Business", "Protezione Pro Negozi - Proprietario", 4, 1.5, "come sopra"],
  ["Sport", "Consumer", "Sport", 0.5, 2.5, "5,99 €/mese; polizza annuale +0,5 punti (v2)"],
  ["Sport Famiglia", "Consumer", "Sport Famiglia", 2, 3, "12,99 €/mese"],
  ["Viaggi", "Consumer", "Viaggi", 1.5, 2.5, "Viaggi & Vacanze 7,99 €/mese"],
  ["Elettrodomestici", "Consumer", "Elettrodomestici", 0.5, 1.5, "4,99 €/mese"],
  ["Micio e Fido", "Consumer", "Micio e Fido", 2.5, 2.5, "PET 15,99 €/mese"],
];

(async () => {
  await client.connect();
  await client.query("begin");
  try {
    const chiavi = PISTE.map(p => p.chiave);
    await client.query(`delete from pay_righe where brand=$1 and month=$2 and lato=$3 and pista=any($4)`, [BRAND, MONTH, LATO, chiavi]);
    await client.query(`delete from pay_soglie where brand=$1 and month=$2 and lato=$3 and pista=any($4)`, [BRAND, MONTH, LATO, chiavi]);
    await client.query(`delete from pay_piste where brand=$1 and month=$2 and lato=$3 and chiave=any($4)`, [BRAND, MONTH, LATO, chiavi]);
    for (const p of PISTE)
      await client.query(`insert into pay_piste (brand, month, chiave, nome, um, ordine, lato, perc_ragazzi) values ($1,$2,$3,$4,'punti',$5,$6,0)`,
        [BRAND, MONTH, p.chiave, p.nome, p.ordine, LATO]);
    for (const [pista, scala] of Object.entries(SOGLIE))
      for (let i = 0; i < scala.length; i++)
        await client.query(`insert into pay_soglie (brand, month, pista, tier, soglia_da, soglia_a, lato) values ($1,$2,$3,$4,$5,$6,$7)`,
          [BRAND, MONTH, pista, i + 1, scala[i][0], scala[i][1], LATO]);
    let ord = 200;
    for (const [nome, tc, cat, prod, off, punti, note] of BUSINESS)
      await client.query(
        `insert into pay_righe (brand, month, pista, nome, tipo_cliente, categoria, prodotto, offerta,
           punti, pay_base, pay_tiers, gettone, moltiplicatore, note, ordine, brand_vendita, lato)
         values ($1,$2,'business_piva',$3,$4,$5,$6,$7,$8,null,$9,false,false,$10,$11,'windtre',$12)`,
        [BRAND, MONTH, nome, tc, cat, prod, off, punti, PREMIO, note, ord++, LATO]);
    for (const [nome, tc, off, punti, molt, note] of ASSIC)
      await client.query(
        `insert into pay_righe (brand, month, pista, nome, tipo_cliente, categoria, prodotto, offerta,
           punti, pay_base, pay_tiers, gettone, moltiplicatore, note, ordine, brand_vendita, lato)
         values ($1,$2,'assicurazioni',$3,$4,null,null,$5,$6,null,$7,false,true,$8,$9,'windtre',$10)`,
        [BRAND, MONTH, nome, tc, off, punti, [molt, molt, molt], note, ord++, LATO]);
    await client.query("commit");
  } catch (e) { await client.query("rollback"); console.error("FAIL:", e.message); process.exit(1); }
  const n = async (t) => (await client.query(`select count(*) n from ${t} where brand=$1 and month=$2 and lato=$3 and coalesce(pista, chiave, '') = any($4)`, [BRAND, MONTH, LATO, PISTE.map(p => p.chiave)]).catch(() => null));
  const conta = async (t, col) => (await client.query(`select count(*) n from ${t} where brand=$1 and month=$2 and lato=$3 and ${col}=any($4)`, [BRAND, MONTH, LATO, PISTE.map(p => p.chiave)])).rows[0].n;
  console.log(`OK — W3 azienda: piste ${await conta("pay_piste", "chiave")} (2) · soglie ${await conta("pay_soglie", "pista")} (7) · righe ${await conta("pay_righe", "pista")} (attese ${BUSINESS.length + ASSIC.length})`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
