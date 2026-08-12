// SEED del tabellare WIND3 — LATO AZIENDA, AGOSTO 2026 (fonte: "GARA
// AGOSTO.pptx" in Telco/Operatori/W3/Agosto 2026 — commissioning ufficiale).
// MODELLO W3: pay = CANONE MENSILE dell'offerta (catalog_offerte.canone_mensile)
// × MOLTIPLICATORE della soglia → righe con moltiplicatore=true (i tiers sono
// moltiplicatori, non €). Le SOGLIE vere sono PER PDV (pay_target_pdv, import
// mensile): qui a livello rete si usa la SOMMA dei 5 PDV come riferimento.
// L&G = gettoni € a soglie proprie. IN NOTA (v2): punteggi pesati (PiùSicuri
// 1/0,75, MNP Iliad/Coop/Poste/Tiscali +1 punto, TIED +1,25…), 4ª soglia
// mobile subordinata alla 2ª fisso, TIED +moltiplicatore, FTTH +1, Bollettino
// flat 38-53, contrattuale 23€, assicurazioni a moltiplicatore, CB pay-per-
// event, partnership/reward. Idempotente: solo windtre/2026-08-01 lato azienda.
// Lancio: node scripts/seed_pay_w3_azienda_agosto.js
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
  { chiave: "mobile", nome: "Mobile", ordine: 1 },
  { chiave: "fisso", nome: "Fisso", ordine: 2 },
  { chiave: "lucegas", nome: "Luce & Gas", ordine: 3 },
];
// soglie RETE = somma dei 5 PDV del foglio target agosto (le vere sono per PDV)
// soglie RETE = quelle date da Luca (550/810/940 · 210/330/400); le soglie
// oltre la 3ª valgono solo PER PDV (pay_target_pdv, foglio target mensile)
const SOGLIE = {
  mobile: [[550, 809], [810, 939], [940, null]],
  fisso: [[210, 329], [330, 399], [400, null]],
  lucegas: [[10, 24], [25, 39], [40, 54], [55, 99], [100, null]],
};

// MOLTIPLICATORI (righe con molt=true): [pista, nome, tc, cat, prod, off, tiers, note]
const MX = [
  ["mobile", "GA base ×canone", "Consumer", null, "Mobile GA", null, [1.0, 1.5, 2.0, 2.25], "in soglia: con Più Sicuri 1 pt, senza 0,75; TIED +1,25 pt e ×TIED 2,0/2,0/2,25/2,25 (v2)"],
  ["mobile", "MNP ×canone", "Consumer", null, "Mobile MNP", null, [2.0, 2.5, 3.0, 3.25], "+1 MNP già incluso; da Iliad/Coop/Poste/Tiscali +1 punto in soglia (v2)"],
  ["mobile", "GA P.IVA ×canone", "Business", null, "Mobile GA", null, [2.0, 2.5, 3.0, 3.25], "+1 P.IVA incluso"],
  ["mobile", "MNP P.IVA ×canone", "Business", null, "Mobile MNP", null, [3.0, 3.5, 4.0, 4.25], "+1 MNP +1 P.IVA inclusi"],
  ["fisso", "Fisso base ×canone", "Consumer", "Fisso", "Fisso", "Fisso", [2.0, 3.0, 3.5, 4.0, 5.0], "+1 FTTH e +2 convergenza da riga dedicata; contrattuale 23€ in nota"],
  ["fisso", "Fisso Conv ×canone", "Consumer", "Fisso", "Fisso", "Fisso Conv", [4.0, 5.0, 5.5, 6.0, 7.0], "base +2 convergenza; contrattuale 19€"],
  ["fisso", "Voce Casa ×canone", "Consumer", "Fisso", "Fisso", "Voce Casa", [2.0, 3.0, 3.5, 4.0, 5.0], "contrattuale 17€"],
  ["fisso", "FWA ×canone", "Consumer", "Fisso", "FWA", null, [3.5, 4.5, 5.0, 5.5, 6.5], "base +1,5 FWA; conta 1 in soglia"],
  ["fisso", "FWA Indoor Conv ×canone", "Consumer", "Fisso", "FWA", "Super Internet Casa Indoor 5G Conv", [5.5, 6.5, 7.0, 7.5, 8.5], "base +1,5 FWA +2 convergenza"],
  ["fisso", "FWA Outdoor Conv ×canone", "Consumer", "Fisso", "FWA", "Super Internet Casa Outdoor 5G Conv", [5.5, 6.5, 7.0, 7.5, 8.5], "base +1,5 FWA +2 convergenza"],
  ["fisso", "Fisso P.IVA ×canone", "Business", "Fisso", "Fisso", null, [3.0, 4.0, 4.5, 5.0, 6.0], "base +1 P.IVA; conta 1,5 in soglia (v2); Professional Box FRITZ!Box +40€ in nota"],
  ["fisso", "Fisso P.IVA Conv ×canone", "Business", "Fisso", "Fisso", "Super Fibra Conv", [5.0, 6.0, 6.5, 7.0, 8.0], "base +1 P.IVA +2 convergenza"],
  ["fisso", "FWA P.IVA ×canone", "Business", "Fisso", "FWA", null, [4.5, 5.5, 6.0, 6.5, 7.5], "base +1,5 FWA +1 P.IVA"],
  ["fisso", "FWA P.IVA Conv ×canone", "Business", "Fisso", "FWA", "Super Internet Professional 5G Conv", [6.5, 7.5, 8.0, 8.5, 9.5], "base +1,5 FWA +1 P.IVA +2 conv"],
];
// UNDERGROUND ×: 0,5-1,75 +1 MNP (offerta col prezzo nel nome, RA e wallet)
const UG = ["Underground 4,99", "Underground 5.99", "Underground 6.99", "Underground 7.99", "Underground 8.99", "Underground 9.99", "Underground 10.99", "Underground 5,99", "Underground 6,99", "Underground 7,99", "Underground 8,99", "Underground 9,99", "Underground 10,99"];
for (const off of [...new Set(UG)])
  MX.push(["mobile", "Underground MNP ×canone", "Consumer", null, "Mobile MNP", off, [1.5, 2.0, 2.5, 2.75], "GA base Underground 0,5-1,75 +1 MNP"]);

// L&G: gettoni € a soglie (SDD; regressivi in nota)
const LG = [
  ["lucegas", "L&G New Start Casa (SDD)", "Consumer", "Energia", null, "New Start Casa", [70, 75, 85, 100, 115], "gettoni regressivi 20/35/45/85 sotto soglia (nota); no SDD −15€; convergenza +25€ su un POD/PDR"],
  ["lucegas", "L&G Convergente Multiservice", "Consumer", "Energia", null, "New Start Casa Sconto Multiservice", [95, 100, 110, 125, 140], "gettone incl. convergente con fisso GA/CB"],
  ["lucegas", "L&G Smartphone Pack Multiservice", "Consumer", "Energia", null, "Smartphone Pack - New Start Casa Sconto Multiservice", [95, 100, 110, 125, 140], "come il convergente Multiservice"],
  ["lucegas", "L&G Microbusiness (SDD)", "Business", "Energia", null, null, [110, 115, 125, 140, 155], "con Extra P.IVA fino a 210€; condomini stornati"],
];

(async () => {
  await client.connect();
  await client.query("begin");
  try {
    for (const t of ["pay_righe", "pay_soglie", "pay_piste"])
      await client.query(`delete from ${t} where brand=$1 and month=$2 and lato=$3`, [BRAND, MONTH, LATO]);
    for (const p of PISTE)
      await client.query(`insert into pay_piste (brand, month, chiave, nome, um, ordine, lato) values ($1,$2,$3,$4,'punti',$5,$6)`,
        [BRAND, MONTH, p.chiave, p.nome, p.ordine, LATO]);
    for (const [pista, scala] of Object.entries(SOGLIE))
      for (let i = 0; i < scala.length; i++)
        await client.query(`insert into pay_soglie (brand, month, pista, tier, soglia_da, soglia_a, lato) values ($1,$2,$3,$4,$5,$6,$7)`,
          [BRAND, MONTH, pista, i + 1, scala[i][0], scala[i][1], LATO]);
    let ord = 0;
    for (const [pista, nome, tc, cat, prod, off, tiers, note] of MX)
      await client.query(
        `insert into pay_righe (brand, month, pista, nome, tipo_cliente, categoria, prodotto, offerta,
           punti, pay_base, pay_tiers, gettone, moltiplicatore, note, ordine, brand_vendita, lato)
         values ($1,$2,$3,$4,$5,$6,$7,$8,1,null,$9,false,true,$10,$11,'windtre',$12)`,
        [BRAND, MONTH, pista, nome, tc, cat, prod, off, tiers, note, ord++, LATO]);
    for (const [pista, nome, tc, cat, prod, off, tiers, note] of LG)
      await client.query(
        `insert into pay_righe (brand, month, pista, nome, tipo_cliente, categoria, prodotto, offerta,
           punti, pay_base, pay_tiers, gettone, moltiplicatore, note, ordine, brand_vendita, lato)
         values ($1,$2,$3,$4,$5,$6,$7,$8,1,null,$9,false,false,$10,$11,'windtre',$12)`,
        [BRAND, MONTH, pista, nome, tc, cat, prod, off, tiers, note, ord++, LATO]);
    await client.query("commit");
  } catch (e) { await client.query("rollback"); console.error("FAIL:", e.message); process.exit(1); }
  const n = async (t) => (await client.query(`select count(*) n from ${t} where brand=$1 and month=$2 and lato=$3`, [BRAND, MONTH, LATO])).rows[0].n;
  console.log(`OK — azienda W3: piste ${await n("pay_piste")} (3) · soglie ${await n("pay_soglie")} (14) · righe ${await n("pay_righe")} (attese ${MX.length + LG.length})`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
