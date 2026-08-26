// MODELLI TERMINALE scritti a mano → nome vero del listino (Luca 26/08:
// «pulisci il dato, associa i prodotti, non lasciare le voci in questo modo»).
//
// Restavano 16 vendite senza aggancio, quasi tutte lo stesso telefono scritto
// in otto modi diversi (il TCL K70 con «70k» invece di «k70»). Qui il modello
// viene riscritto col nome del listino, così la fascia di prezzo si aggancia e
// resta agganciata anche ai prossimi calcoli.
//
// ⚠️ Due associazioni sono APPROSSIMATE, perché la variante esatta a listino
// non c'è: il TCL 501 da 64 GB (a listino solo il 2+32GB) e il Redmi Note 15
// Pro+ (a listino solo il Note 15 liscio). In entrambi i casi la FASCIA di
// street price è la stessa, quindi il gettone non cambia — ma vanno dette.
//
// Idempotente. Lancio: NODE_PATH=<dir pg> node pulisci_modelli_w3.js
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

// come l'hanno scritto → come si chiama a listino
const MAPPA = [
  [/^\s*(tcl\s*)?(70\s*k|k\s*70|k70)\s*(5g)?\s*$/i, "TCL K70 5G 4+128GB", "refuso 70K/K70"],
  [/^\s*tcl\s*70k\s*5g\s*$/i,                       "TCL K70 5G 4+128GB", "refuso 70K/K70"],
  [/tcl\s*501/i,                                    "TCL 501 2+32GB",     "⚠️ a listino c'è solo il 2+32GB: stessa fascia, gettone identico"],
  [/^\s*s26\s*256/i,                                "Samsung Galaxy S26 256GB", "scritto senza marca"],
  [/samsung\s*z\s*flip\s*8|samsung\s*zflip\s*8/i,   "Samsung Galaxy Z Flip8 256GB", "scritto senza «Galaxy»"],
  [/redmi\s*note\s*15\s*pro/i,                      "Xiaomi Redmi Note 15 5G 8+256", "⚠️ a listino c'è solo il Note 15 liscio: stessa fascia"],
  [/vivo\s*v70\s*fe/i,                              "vivo V70 5G FE",     "scritto con accessori e taglio"],
];

(async () => {
  await client.connect();
  const { rows: pre } = await client.query(
    `select id, dettagli->>'Modello Terminale' modello from contracts
     where brand='WindTre' and dettagli->>'categoria_catalogo'='Telefono a Rate'
       and dettagli->>'Modello Terminale' is not null order by id`);
  const stamp = Date.now();
  fs.writeFileSync(path.join(__dirname, `dump_modelli_${stamp}.json`), JSON.stringify(pre, null, 1));
  console.log(`Dump ${pre.length} modelli → dump_modelli_${stamp}.json\n`);

  try {
    await client.query("begin");
    const fatti = new Map();
    for (const r of pre) {
      const m = String(r.modello || "").trim();
      const hit = MAPPA.find(([re]) => re.test(m));
      if (!hit || m === hit[1]) continue;
      await client.query(
        `update contracts set dettagli = jsonb_set(dettagli, '{Modello Terminale}', to_jsonb($2::text)) where id=$1`,
        [r.id, hit[1]]);
      const k = `${m}  →  ${hit[1]}   (${hit[2]})`;
      fatti.set(k, (fatti.get(k) || 0) + 1);
    }
    await client.query("commit");
    console.log("MODELLI RISCRITTI:");
    for (const [k, n] of [...fatti].sort((a, b) => b[1] - a[1])) console.log(`  ${n}× ${k}`);
    if (!fatti.size) console.log("  (niente da fare: già puliti)");
  } catch (e) {
    await client.query("rollback");
    console.error("ROLLBACK:", e.message);
    process.exitCode = 1;
  }
  await client.end();
})();
