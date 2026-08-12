// IMPORT del foglio target MENSILE Wind3 (Target Wind3 <Mese>.xlsx) in
// pay_target_pdv — una riga per PDV con cluster e soglie personalizzate.
// Mappa COD_GARA → negozio da Luca (11/08). Idempotente per mese.
// Lancio: node scripts/import_target_w3.js "<file.xlsx>" [YYYY-MM]
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
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
const NEGOZI = {
  "9000721835": "Magliana", "9001154565": "Mazzini", "9001297833": "Mazzini",
  "9001302496": "San Paolo", "9001426666": "Libia",
};
const file = process.argv[2];
const mese = process.argv[3] || new Date().toISOString().slice(0, 7);
if (!file) { console.error("uso: node scripts/import_target_w3.js <xlsx> [YYYY-MM]"); process.exit(1); }
const wb = XLSX.readFile(file);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
const head = rows[1].map(String);
const col = (nome) => head.findIndex(h => h.toUpperCase().includes(nome));
const num = (v) => (v === "" || v == null ? null : Number(v));
(async () => {
  await client.connect();
  await client.query("begin");
  await client.query("delete from pay_target_pdv where month=$1 and brand='windtre'", [`${mese}-01`]);
  let n = 0;
  for (const r of rows.slice(2)) {
    const cod = String(r[col("COD_GARA")] || "").trim();
    if (!/^\d{6,}$/.test(cod)) continue;
    // parsing POSIZIONALE robusto: nella riga, il PRIMO "STRADA/CC x" è il
    // cluster MOBILE (seguito da 4 soglie), l'ULTIMO è il cluster FISSO
    // (seguito da 5 soglie); il primo "CLUSTER ..." è la pista P.IVA (3 soglie).
    const isPos = (v) => /^(STRADA|CENTRO|CC)\b/i.test(String(v || "").trim());
    const posIdx = r.map((v, i) => (isPos(v) ? i : -1)).filter(i => i >= 0);
    if (!posIdx.length) continue;
    const iClM = posIdx[0];
    const iCF = posIdx.length > 1 ? posIdx[posIdx.length - 1] : -1;
    const iClP = r.findIndex((v, i) => i > iClM && /^CLUSTER\b/i.test(String(v || "").trim()));
    const sm = [r[iClM + 1], r[iClM + 2], r[iClM + 3], r[iClM + 4]].map(num);
    const sp = iClP > 0 ? [r[iClP + 1], r[iClP + 2], r[iClP + 3]].map(num) : [];
    const sf = iCF > 0 ? [r[iCF + 1], r[iCF + 2], r[iCF + 3], r[iCF + 4], r[iCF + 5]].map(num) : [];
    await client.query(
      `insert into pay_target_pdv (month, brand, cod_gara, negozio, ragione_sociale, peso_mobile, peso_biz, peso_fix,
         cluster_mobile, soglie_mobile, cluster_piva, soglie_piva, cluster_fisso, soglie_fisso, extra)
       values ($1,'windtre',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [`${mese}-01`, cod, NEGOZI[cod] || null, String(r[col("RAGIONE")] || ""),
       num(r[col("PESO POS MOBILE")]), num(r[col("PESO POS BIZ")]), num(r[col("PESO POS FIX")]),
       String(r[iClM] || ""), sm, iClP > 0 ? String(r[iClP]) : null, sp, iCF > 0 ? String(r[iCF]) : null, sf,
       JSON.stringify({ raw: r.slice(0, 60) })]);
    n++;
  }
  await client.query("commit");
  console.log(`OK — importati ${n} PDV per ${mese} (mappa negozi: ${Object.values(NEGOZI).join(", ")})`);
  const chk = await client.query("select cod_gara, negozio, cluster_mobile, soglie_mobile, cluster_fisso, soglie_fisso from pay_target_pdv where month=$1 order by cod_gara", [`${mese}-01`]);
  chk.rows.forEach(r => console.log(" ", r.cod_gara, r.negozio, "| mob", r.cluster_mobile, r.soglie_mobile, "| fix", r.cluster_fisso, r.soglie_fisso));
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
