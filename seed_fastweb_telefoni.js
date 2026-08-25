// GARE FASTWEB — EXTRA GARA TELEFONI agosto (cantiere gare FW, 25/08/2026).
// Fonte: «TELEFUTURA 2 - EXTRA GARA TELEFONI (2026 08).pdf» (Fastweb 4/08,
// arrivata il 25/08): gettoni per FASCIA × MODALITÀ, validi a prescindere
// dai target del mese (Tabella 1; celle ND = non vendibile, nessuna riga):
//   Low: rateale 25 · one shot 25 | Medium − (<400): 25 / 50 / 25
//   Medium + (>400): findomestic 50 · one shot 25 | High: findomestic 70
//   S26 e Fold8: findomestic 120 · one shot 70 | Apple: 100 / 100
//   Apple rigenerato: 25 / 25 / 25
// Il telefono deve essere abbinato a una sim delle offerte del piano
// (consuntivazione manageriale Fastweb): vincolo in nota, non nel motore.
//
// Cosa fa:
// 1. catalog_opzioni sull'offerta «Finanziamento» (fastweb): gruppo singolo
//    obbligatorio «fascia» (8 voci) + «modalita» (3 voci) — pattern GA/GNP
//    (gate in Registra Vendita e pillole nel Calcolatore, tutto data-driven).
//    Nomi senza parentesi in coda né virgole (il parser opzioni le mangia).
// 2. pay_piste «gas» e «telefoni» (senza soglie): danno ai gettoni la
//    % ai ragazzi di pista — richiesta Luca 25/08 sera («nella sezione
//    gettoni non posso impostare la percentuale»). Motore già pronto:
//    deriva() scala i gettoni con pista.
// 3. la riga Gas passa nella pista «gas»; la vecchia «TNP (Finanziamento)»
//    a 0 € si SPEGNE (ora i telefoni si pagano: una vendita senza fascia
//    deve tornare scopertura visibile, non uno 0 muto).
// 4. 17 righe gettone pista «telefoni», ancorate a opzione «fascia|modalità».
// Idempotente: se la pista «telefoni» fastweb di agosto esiste, esce.
// Lancio: NODE_PATH=<dir con pg> node seed_fastweb_telefoni.js
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

const BRAND = "fastweb";
const MONTH = "2026-08-01";
const LATO = "azienda";
const OFFERTA_FIN = "2ff10219-1690-406c-b396-9a39a945f495";   // catalog_offerte «Finanziamento» (fastweb)

const FASCE = ["Low", "Medium - fino a 400 €", "Medium + oltre 400 €", "High",
  "Samsung S26", "Samsung Fold8", "Apple", "Apple rigenerato"];
const MODALITA = ["Rateale Fastweb", "Finanziato Findomestic", "One Shot SIM+Device"];

const NOTA = "Extra gara telefoni agosto, Tabella 1: gettone per fascia e modalità, a prescindere dai target del mese. " +
  "Vale col telefono abbinato a una sim delle offerte del piano (verifica in consuntivazione Fastweb); fasce prodotti sul portale Cleo.";
// [nome, fascia, modalità, €]
const RIGHE = [
  ["Low · Rateale Fastweb", "Low", "Rateale Fastweb", 25],
  ["Low · One Shot", "Low", "One Shot SIM+Device", 25],
  ["Medium − (<400) · Rateale Fastweb", "Medium - fino a 400 €", "Rateale Fastweb", 25],
  ["Medium − (<400) · Findomestic", "Medium - fino a 400 €", "Finanziato Findomestic", 50],
  ["Medium − (<400) · One Shot", "Medium - fino a 400 €", "One Shot SIM+Device", 25],
  ["Medium + (>400) · Findomestic", "Medium + oltre 400 €", "Finanziato Findomestic", 50],
  ["Medium + (>400) · One Shot", "Medium + oltre 400 €", "One Shot SIM+Device", 25],
  ["High · Findomestic", "High", "Finanziato Findomestic", 70],
  ["Samsung S26 · Findomestic", "Samsung S26", "Finanziato Findomestic", 120],
  ["Samsung S26 · One Shot", "Samsung S26", "One Shot SIM+Device", 70],
  ["Samsung Fold8 · Findomestic", "Samsung Fold8", "Finanziato Findomestic", 120],
  ["Samsung Fold8 · One Shot", "Samsung Fold8", "One Shot SIM+Device", 70],
  ["Apple · Findomestic", "Apple", "Finanziato Findomestic", 100],
  ["Apple · One Shot", "Apple", "One Shot SIM+Device", 100],
  ["Apple rigenerato · Rateale Fastweb", "Apple rigenerato", "Rateale Fastweb", 25],
  ["Apple rigenerato · Findomestic", "Apple rigenerato", "Finanziato Findomestic", 25],
  ["Apple rigenerato · One Shot", "Apple rigenerato", "One Shot SIM+Device", 25],
];

(async () => {
  await client.connect();

  const { rows: [{ n }] } = await client.query(
    "select count(*)::int n from pay_piste where brand=$1 and month=$2 and lato=$3 and chiave='telefoni'",
    [BRAND, MONTH, LATO]);
  if (n > 0) { console.log("Pista telefoni già presente: niente da fare."); await client.end(); return; }

  // dump di sicurezza (mai sovrascritto)
  const dump = {};
  for (const [nome, sql, par] of [
    ["pay_piste", "select * from pay_piste where brand=$1", [BRAND]],
    ["pay_righe", "select * from pay_righe where brand=$1", [BRAND]],
    ["catalog_opzioni_fin", "select * from catalog_opzioni where offerta_id=$1", [OFFERTA_FIN]],
  ]) {
    const { rows } = await client.query(sql, par);
    dump[nome] = rows;
  }
  let dumpFile = path.join(__dirname, "dump_fastweb_pay_pre_telefoni.json");
  if (fs.existsSync(dumpFile)) dumpFile = dumpFile.replace(/\.json$/, `_${Date.now()}.json`);
  fs.writeFileSync(dumpFile, JSON.stringify(dump, null, 2));
  console.log("Dump pre-modifica:", path.basename(dumpFile),
    Object.entries(dump).map(([t, r]) => `${t}=${r.length}`).join(" · "));

  try {
    await client.query("begin");

    // 1. opzioni obbligatorie a gruppo singolo (idempotenti per nome)
    const { rows: esist } = await client.query("select nome from catalog_opzioni where offerta_id=$1", [OFFERTA_FIN]);
    const giaLi = new Set(esist.map(x => x.nome));
    let ord = 1;
    for (const nome of FASCE) {
      if (!giaLi.has(nome)) await client.query(
        "insert into catalog_opzioni (offerta_id, nome, tipo, gruppo_singolo, ordine, attivo, obbligatoria) values ($1,$2,null,'fascia',$3,true,true)",
        [OFFERTA_FIN, nome, ord]);
      ord++;
    }
    ord = 11;
    for (const nome of MODALITA) {
      if (!giaLi.has(nome)) await client.query(
        "insert into catalog_opzioni (offerta_id, nome, tipo, gruppo_singolo, ordine, attivo, obbligatoria) values ($1,$2,null,'modalita',$3,true,true)",
        [OFFERTA_FIN, nome, ord]);
      ord++;
    }

    // 2. piste senza soglie per la % ai ragazzi dei gettoni
    await client.query(
      "insert into pay_piste (brand, month, chiave, nome, um, ordine, lato) values ($1,$2,'gas','Gas',$3,6,$4), ($1,$2,'telefoni','Telefoni',$3,7,$4)",
      [BRAND, MONTH, "pezzi", LATO]);

    // 3. Gas nella sua pista; TNP 0 € spenta
    const gas = await client.query(
      "update pay_righe set pista='gas' where brand=$1 and month=$2 and lato=$3 and offerta='Gas' and categoria='Energia' and tipo_cliente='Consumer'",
      [BRAND, MONTH, LATO]);
    if (gas.rowCount !== 1) throw new Error(`update Gas: attese 1 riga, toccate ${gas.rowCount}`);
    const tnp = await client.query(
      `update pay_righe set attivo=false, note=$1
       where brand=$2 and month=$3 and lato=$4 and prodotto='Finanziato' and gettone=true and pay_base=0`,
      ["Documentale — spenta il 25/08: i telefoni T2 si pagano con l'extra gara (righe per fascia e modalità qui sotto). " +
        "Una vendita senza fascia/modalità deve risultare scopertura, non uno 0.", BRAND, MONTH, LATO]);
    if (tnp.rowCount !== 1) throw new Error(`update TNP: attese 1 riga, toccate ${tnp.rowCount}`);

    // 4. gettoni telefoni per fascia × modalità
    let o = 1;
    for (const [nome, fascia, mod, importo] of RIGHE) {
      await client.query(
        `insert into pay_righe (brand, month, lato, pista, nome, tipo_cliente, categoria, prodotto, offerta,
           opzione, punti, pay_base, pay_tiers, gettone, attivo, ordine, note)
         values ($1,$2,$3,'telefoni',$4,null,'Telefono a Rate','Finanziato',null,$5,0,$6,'{}',true,true,$7,$8)`,
        [BRAND, MONTH, LATO, nome, `${fascia}|${mod}`, importo, o++, NOTA]);
    }

    await client.query("commit");
    console.log("Commit ok.");
  } catch (e) {
    await client.query("rollback");
    console.error("ROLLBACK:", e.message);
    process.exitCode = 1;
    await client.end();
    return;
  }

  const { rows: opz } = await client.query(
    "select nome, gruppo_singolo from catalog_opzioni where offerta_id=$1 and attivo order by gruppo_singolo, ordine", [OFFERTA_FIN]);
  console.log("Opzioni Finanziamento:", opz.map(x => `${x.gruppo_singolo}:${x.nome}`).join(" · "));
  const { rows: righe } = await client.query(
    "select nome, opzione, pay_base, attivo from pay_righe where brand=$1 and month=$2 and lato=$3 and (pista='telefoni' or prodotto='Finanziato') order by ordine",
    [BRAND, MONTH, LATO]);
  for (const r of righe) console.log(` ${r.attivo ? "●" : "○"} ${r.nome} [${r.opzione || "—"}] → ${r.pay_base} €`);
  await client.end();
})();
