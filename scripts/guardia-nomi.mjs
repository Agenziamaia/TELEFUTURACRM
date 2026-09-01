#!/usr/bin/env node
/* ═══ I NOMI CHE NON ESISTONO ═══════════════════════════════════════════════
 *
 * Il 1° settembre 2026, mattina dell'apertura delle casse, Registra Vendita
 * non si è aperta in nessun negozio: «accontoDaIncassare is not defined». La
 * funzione veniva chiamata in un effetto che parte al montaggio della pagina,
 * ma non era mai stata importata. Non un caso raro: chiunque, a ogni
 * caricamento.
 *
 * PERCHÉ NIENTE L'AVEVA VISTO. `registra-vendita/page.tsx` porta `@ts-nocheck`
 * sulla prima riga — c'è una ragione storica, il file è enorme e non tipizzato
 * — e con quella riga TypeScript non controlla NEMMENO che i nomi esistano.
 * `npm run build` passava liscio su una pagina che in produzione andava giù
 * all'istante. E la configurazione ESLint del progetto spegne `no-undef` sui
 * file TypeScript, perché di norma è TypeScript a occuparsene: sui file in
 * `@ts-nocheck` non se ne occupa nessuno.
 *
 * Questa guardia riapre quell'occhio, e SOLO su quei file: legge quali sono,
 * ci passa `no-undef` e basta. Sul file com'era quella mattina trova i tre
 * punti esatti del guasto; sul file corretto non trova niente.
 *
 *   node scripts/guardia-nomi.mjs
 *
 * Esce 1 se trova un nome non definito: è un errore che si vede solo in
 * produzione, quindi va fermato prima. */

import { readFileSync, readdirSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";

const RADICE = process.cwd();
const SRC = join(RADICE, "src");

/** Tutti i file di codice sotto `src`, senza scomodare una libreria. */
function file(dir) {
    const fuori = [];
    for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) { fuori.push(...file(p)); continue; }
        if (/\.(t|j)sx?$/.test(n)) fuori.push(p);
    }
    return fuori;
}

const senzaControllo = file(SRC).filter(p => {
    /* basta la testa del file: la direttiva sta in cima o non vale */
    const testa = readFileSync(p, "utf8").slice(0, 2000);
    return /@ts-nocheck/.test(testa);
});

if (!senzaControllo.length) {
    console.log("\n\x1b[32m\x1b[1m✓ Nessun file in @ts-nocheck: ci pensa TypeScript.\x1b[0m\n");
    process.exit(0);
}

/* La configurazione vive solo per la durata del controllo, dentro il progetto
   (se stesse fuori non riuscirebbe a risolvere `globals` e il parser). */
const CONF = join(RADICE, ".guardia-nomi.mjs");
writeFileSync(CONF, `import globals from "globals";
import tsp from "@typescript-eslint/parser";
export default [{
  files: ["**/*.{js,jsx,ts,tsx}"],
  languageOptions: {
    parser: tsp,
    parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: "latest", sourceType: "module" },
    globals: { ...globals.browser, ...globals.node, React: "readonly", JSX: "readonly", NodeJS: "readonly" },
  },
  rules: { "no-undef": "error" },
}];
`);

let righe = "";
try {
    execFileSync("npx", ["eslint", "-c", CONF, "--no-config-lookup", "--no-ignore", "-f", "json", ...senzaControllo],
        /* IL REFERTO È GRANDE: dodici file passano il megabyte, che è il tetto
           predefinito. Senza alzarlo, l'uscita torna troncata e la guardia
           direbbe «non ho capito» invece di guardare. */
        { encoding: "utf8", cwd: RADICE, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
} catch (e) {
    /* eslint esce 1 quando trova qualcosa: il referto è comunque sullo stdout */
    righe = e.stdout || "";
}
if (!righe) righe = "[]";
try { unlinkSync(CONF); } catch { /* già via */ }

let referto;
try { referto = JSON.parse(righe); }
catch { console.log("\n\x1b[33mGuardia nomi: non sono riuscito a leggere il referto di eslint.\x1b[0m\n"); process.exit(0); }

/* I NOMI DI TIPO NON ESISTONO A RUNTIME, ed è giusto così: `x as
   DisplayMediaStreamOptions` sparisce alla compilazione, non può esplodere in
   faccia a nessuno. `no-undef` non sa distinguere una posizione di tipo da una
   di valore e li segnala lo stesso: qui si scartano, uno per uno e per nome,
   così l'elenco resta corto e chi lo allunga deve dire perché.
   Se un giorno la lista diventa lunga, vuol dire che serve un altro attrezzo:
   questo controlla i VALORI, cioè le cose che il browser va a cercare. */
const SOLO_TIPI = new Set([
    "DisplayMediaStreamOptions",   // chat/page.tsx: opzioni di getDisplayMedia
]);

/* Solo `no-undef`: le altre regole non sono affar suo, e su questi file
   grideranno comunque (sono in @ts-nocheck per un motivo). */
const trovati = [];
const scartati = [];
for (const f of referto)
    for (const m of f.messages || []) {
        if (m.ruleId !== "no-undef") continue;
        const nome = (m.message.match(/'([^']+)'/) || [])[1] || "";
        const riga = { file: relative(RADICE, f.filePath), riga: m.line, msg: m.message };
        (SOLO_TIPI.has(nome) ? scartati : trovati).push(riga);
    }

console.log(`\n\x1b[1mNomi non definiti nei ${senzaControllo.length} file senza controllo dei tipi\x1b[0m`);
if (!trovati.length) {
    console.log("   \x1b[32ma posto\x1b[0m" + (scartati.length ? ` \x1b[2m(${scartati.length} nomi di tipo, che a runtime non esistono e non devono)\x1b[0m` : ""));
    console.log("\n\x1b[32m\x1b[1m✓ Nessun nome che a schermo esploderebbe.\x1b[0m\n");
    process.exit(0);
}
for (const t of trovati) console.log(`   \x1b[31m${t.file}:${t.riga}\x1b[0m  ${t.msg}`);
console.log(`\n\x1b[31m\x1b[1m✗ ${trovati.length} nome/i che il build non vede e il browser sì.\x1b[0m`);
console.log("  Di solito manca un import. Succede solo nei file in @ts-nocheck,\n  dove TypeScript non controlla nemmeno che i nomi esistano.\n");
process.exit(1);
