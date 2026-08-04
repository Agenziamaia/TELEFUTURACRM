// genera-emoji.mjs — genera src/lib/emojiData.json per il picker dell'EditorRicco (COM-01)
//
// Unisce emojibase-data en+it (nomi e keywords CLDR ufficiali) nel set RGI base:
// ~1.900 emoji SENZA varianti di carnagione (le skin stanno annidate in `skins`
// e qui si ignorano), senza il gruppo Unicode "Component" (toni di pelle, capelli)
// e senza gli indicatori regionali sciolti (🇦…🇿, privi di gruppo).
//
// Output compatto: [{ e: emoji, n: nome italiano, k: keywords it+en, g: gruppo }]
// con g = indice nei 9 gruppi Unicode (stesso ordine di GRUPPI_EMOJI in
// EditorRicco.tsx: Faccine ed emozioni, Persone e corpo, Animali e natura,
// Cibo e bevande, Viaggi e luoghi, Attività, Oggetti, Simboli, Bandiere).
//
// Uso: node scripts/genera-emoji.mjs
// Il JSON generato si COMMITTA: emojibase-data resta solo devDependency.

import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const en = require("emojibase-data/en/data.json");
const it = require("emojibase-data/it/data.json");

// gruppo emojibase → indice compatto (il 2 = Component si salta)
const GRUPPO_OUT = { 0: 0, 1: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8 };
const NOMI_GRUPPI = [
    "Faccine ed emozioni", "Persone e corpo", "Animali e natura", "Cibo e bevande",
    "Viaggi e luoghi", "Attività", "Oggetti", "Simboli", "Bandiere",
];

const perHex = new Map(it.map((r) => [r.hexcode, r]));

const base = en
    .filter((r) => r.group !== undefined && GRUPPO_OUT[r.group] !== undefined)
    .sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9));

const out = [];
for (const r of base) {
    const loc = perHex.get(r.hexcode);
    const nome = ((loc && loc.label) || r.label || "").trim();
    // keywords: tag italiani + label/tag inglesi, minuscole, senza doppioni né il nome stesso
    const chiavi = new Set();
    const aggiungi = (s) => {
        const v = String(s || "").trim().toLowerCase();
        if (v && v !== nome.toLowerCase()) chiavi.add(v);
    };
    ((loc && loc.tags) || []).forEach(aggiungi);
    aggiungi(r.label);
    (r.tags || []).forEach(aggiungi);
    out.push({ e: r.emoji, n: nome, k: [...chiavi], g: GRUPPO_OUT[r.group] });
}

const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "emojiData.json");
const json = JSON.stringify(out);
writeFileSync(dest, json + "\n");

// riepilogo a video per il controllo umano
const conteggi = NOMI_GRUPPI.map((nome, g) => `${nome}: ${out.filter((d) => d.g === g).length}`);
console.log(`emojiData.json → ${out.length} emoji, ${(json.length / 1024).toFixed(0)} KB`);
console.log(conteggi.join(" · "));
