// Bonifica nomi offerta sui contratti (caso Underground 9.99, Luca 20/08):
// a catalogo le Underground sono scritte con la VIRGOLA (9,99), su 35 contratti
// registrati erano salvate col PUNTO (9.99) — la modifica contratto cerca le
// opzioni per nome esatto e non trovava niente («L'offerta non ha opzioni a
// catalogo»). Riallinea contracts.offerta e dettagli.Offerta alla grafia del
// catalogo quando l'unica differenza è punto/virgola/spazi/maiuscole.
// Uso: node bonifica_offerte_catalogo.js         → anteprima
//      node bonifica_offerte_catalogo.js --apply → applica (dump locale prima)
const { readFileSync, writeFileSync } = require("fs");
const env = readFileSync(new URL("./.env.local", "file://" + __dirname + "/"), "utf8");
for (const r of env.split("\n")) { const m = r.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim(); }
const U = process.env.NEXT_PUBLIC_SUPABASE_URL, K = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: K, Authorization: "Bearer " + K, "Content-Type": "application/json" };
const APPLY = process.argv.includes("--apply");

const qa = async (p) => { let out = [], from = 0; for (;;) { const r = await fetch(`${U}/rest/v1/${p}&limit=1000&offset=${from}`, { headers: H }).then((x) => x.json()); if (!Array.isArray(r)) throw new Error(JSON.stringify(r).slice(0, 200)); out = out.concat(r); if (r.length < 1000) return out; from += 1000; } };
const norm = (s) => String(s || "").trim().toLowerCase().replace(/\./g, ",");

(async () => {
    const offs = await qa("catalog_offerte?select=nome");
    const nomi = new Set(offs.map((o) => o.nome));
    const byNorm = {}; for (const n of nomi) byNorm[norm(n)] ??= n;
    const ctr = await qa("contracts?id=like.CTR-*&offerta=not.is.null&select=id,brand,offerta,dettagli");
    const daFix = ctr.filter((c) => c.offerta && !nomi.has(c.offerta) && byNorm[norm(c.offerta)]);
    console.log(`da riallineare: ${daFix.length}`);
    for (const c of daFix) console.log(`  ${c.id} [${c.brand}] ${JSON.stringify(c.offerta)} -> ${JSON.stringify(byNorm[norm(c.offerta)])}`);
    if (!APPLY) { console.log("\n(anteprima — rilancia con --apply)"); return; }

    writeFileSync("dump_offerte_puntovirgola_pre.json", JSON.stringify(daFix, null, 1));
    console.log("\ndump pre-bonifica: dump_offerte_puntovirgola_pre.json (locale, gitignorato)");
    let ok = 0;
    for (const c of daFix) {
        const canon = byNorm[norm(c.offerta)];
        const det = c.dettagli && typeof c.dettagli === "object" ? { ...c.dettagli } : {};
        if (det.Offerta) det.Offerta = canon;
        const r = await fetch(`${U}/rest/v1/contracts?id=eq.${c.id}`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ offerta: canon, dettagli: det }) });
        if (r.ok) ok++; else console.log(`  ✗ ${c.id}: ${r.status} ${await r.text()}`);
    }
    console.log(`applicati: ${ok}/${daFix.length}`);
})();
