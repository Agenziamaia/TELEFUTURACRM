// BONIFICA MARCHE USATI (Luca 24/08: «il modello deve essere sempre un
// filtro valido» — il Pixel filtrato per "Google" non usciva). Il filtro
// Brand della pagina confronta il PREFISSO di `model` coi nomi CANONICI del
// catalogo dispositivi: qui si riscrive ogni model perché inizi ESATTAMENTE
// con la marca canonica. Tre famiglie: ① marca giusta ma case diverso
// (SAMSUNG→Samsung, GOOGLE→Google…) ② refusi/senza marca con mappa esplicita
// (MOTROLA→Motorola, IPHONE→Apple iPhone, GALAXY→Samsung, TCL-403→TCL 403,
// Moto E15→Motorola…) ③ residui NON risolti: solo elencati, mai inventati.
// Lancio: node bonifica_usati_brand.js [--apply]   (senza flag: recap)
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

// refusi e nomi senza marca → riscrittura esplicita (regex → rimpiazzo)
const SPECIALI = [
  [/^MOTROLA\s+/i, "Motorola "],                 // typo di import
  [/^TCL-/i, "TCL "],                            // "TCL-403" → "TCL 403"
  [/^iphone\s+/i, "Apple iPhone "],
  [/^ipad\s+/i, "Apple iPad "],
  [/^Moto\s+/i, "Motorola Moto "],
  [/^GALAXY\s+/i, "Samsung Galaxy "],
];

(async () => {
  await client.connect();
  const { rows: brands } = await client.query("select distinct brand from dispositivi_catalogo where categoria='smartphone' and brand is not null");
  const canon = brands.map(r => String(r.brand).trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  const { rows: usati } = await client.query("select id, model, store, status from usati order by created_at");
  const trovaCanon = (m) => canon.find(b => m.toLowerCase().startsWith(b.toLowerCase() + " ") || m.toLowerCase() === b.toLowerCase());

  const patch = [];
  const residui = [];
  for (const u of usati) {
    const m = String(u.model || "").trim();
    let nuovo = null;
    const hit = trovaCanon(m);
    if (hit) {
      if (!(m.startsWith(hit + " ") || m === hit)) nuovo = hit + m.slice(hit.length);   // solo il case del prefisso
    } else {
      for (const [re, sost] of SPECIALI) {
        const mm = m.match(re);
        if (mm) { nuovo = m.replace(re, typeof sost === "function" ? sost(mm) : sost); break; }
      }
      // il rimpiazzo deve produrre un prefisso canonico, sennò è un residuo
      if (nuovo && !trovaCanon(nuovo)) { residui.push({ ...u, tentato: nuovo }); nuovo = null; }
      else if (!nuovo) residui.push(u);
    }
    if (nuovo && nuovo !== m) patch.push({ id: u.id, da: m, a: nuovo, store: u.store, status: u.status });
  }

  console.log(`Dispositivi: ${usati.length} · da correggere: ${patch.length} · residui non risolti: ${residui.length}\n`);
  for (const p of patch) console.log(`  ${APPLY ? "✏️" : "·"} "${p.da}" → "${p.a}"  (${p.store} · ${p.status})`);
  if (residui.length) {
    console.log(`\n❓ RESIDUI (non tocco niente — decidere a mano):`);
    for (const r of residui) console.log(`  ${r.model} (${r.store} · ${r.status})${r.tentato ? ` — tentato "${r.tentato}" ma la marca non è a catalogo` : ""}`);
  }

  if (!APPLY) { console.log(`\n(recap — rilancia con --apply per applicare)`); await client.end(); return; }
  fs.writeFileSync(path.join(__dirname, "dump_usati_brand_pre.json"), JSON.stringify(patch, null, 2));
  let fatte = 0;
  for (const p of patch) {
    const { rowCount } = await client.query("update usati set model = $1 where id = $2", [p.a, p.id]);
    fatte += rowCount;
  }
  console.log(`\nApplicato: ${fatte}/${patch.length} · dump in dump_usati_brand_pre.json`);
  // riverifica finale: quanti model NON iniziano con una marca canonica?
  const { rows: dopo } = await client.query("select model from usati");
  const rotti = dopo.filter(r => !trovaCanon(String(r.model || "").trim()));
  console.log(`Riverifica: ${dopo.length - rotti.length}/${dopo.length} con marca canonica · fuori: ${rotti.length}`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
