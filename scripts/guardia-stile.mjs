#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   GUARDIA DI STILE — Registra Vendita (Luca 29/08)

   «È inutile che abbiamo fatto il lavoro ieri se poi ritorniamo a complicare.
    Inserisci delle regole leggibili e chiare per tutti.»

   Le regole stanno scritte in docs/REGOLE_REGISTRA_VENDITA.md. Ma un
   documento che nessuno rilegge dura tre settimane: questa guardia controlla
   da sola le poche cose che il compilatore NON vede, e che in un giorno solo
   sono già costate una pagina in errore, cinque colori inesistenti e una
   sezione senza cornice.

   Non è un giudice del gusto: verifica quattro fatti, tutti misurabili.
       npm run stile
   ═══════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const R = "\x1b[31m", G = "\x1b[32m", Y = "\x1b[33m", B = "\x1b[1m", X = "\x1b[0m";
let violazioni = 0;

/* LE SEZIONI SORVEGLIATE (revisore design 31/08). Il magazzino è stato
   rivestito con la stessa cassetta di Registra Vendita e oggi passerebbe da
   solo — zero stili a mano, zero className doppi. Ma la guardia non lo
   guardava, quindi domani niente lo tratterrebbe: si aggiunge adesso, che
   costa zero, invece che dopo aver rifatto il giro. */
const SEZIONI = [
    "src/app/(dashboard)/registra-vendita",
    "src/app/(dashboard)/magazzino",
    /* DOCUMENTI, dalla sera del 01/09. Nasce con la cassetta `rv*` e nasce
       sorvegliata: la revisione del giorno stesso ha trovato quattro classi
       INVENTATE (`rvWrap`, `rvTitolo`, `rvNota-ko`, `rvNota-warn`) che il CSS
       non aveva — e una classe che non esiste non da' nessun errore, esce solo
       un elemento nudo. Questa e' l'unica rete che le prende. */
    "src/app/(dashboard)/documenti",
];

function file(dir, out = []) {
    for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) file(p, out);
        else if (/\.(tsx|ts)$/.test(n)) out.push(p);
    }
    return out;
}
const righe = (p) => readFileSync(p, "utf8").split("\n");

function regola(titolo, spiega, trovati) {
    console.log(`\n${B}${titolo}${X}`);
    if (!trovati.length) { console.log(`   ${G}a posto${X}`); return; }
    violazioni += trovati.length;
    console.log(`   ${R}${trovati.length} da sistemare${X} — ${spiega}`);
    trovati.slice(0, 12).forEach((t) => console.log(`   ${Y}·${X} ${t}`));
    if (trovati.length > 12) console.log(`   ${Y}·${X} …e altri ${trovati.length - 12}`);
}

const files = SEZIONI.flatMap(d => file(d));

// ── 1. className scritto due volte: vince l'ultimo, il primo sparisce ─────
//    Il file ha @ts-nocheck: né il compilatore né il lint lo vedono. È già
//    successo, e due sezioni sono rimaste senza cornice.
{
    const t = [];
    files.forEach((p) => righe(p).forEach((r, i) => {
        if (/className=[^>]*className=/.test(r)) t.push(`${p}:${i + 1}`);
    }));
    regola("1. Un solo className per tag",
        "in JSX vince l'ultimo e il primo sparisce senza errori", t);
}

// ── 2. il colore con la trasparenza attaccata in coda ────────────────────
//    `group.color + "22"` vale solo su un esadecimale scritto per esteso: qui
//    i colori sono var(--tf-…), la proprietà diventa invalida e il browser la
//    butta via IN SILENZIO. Cinque casi trovati il 28/08, tutti vivi.
{
    const t = [];
    files.forEach((p) => righe(p).forEach((r, i) => {
        if (/[A-Za-z_][\w.]*\s*\+\s*"[0-9a-fA-F]{2}"/.test(r)) t.push(`${p}:${i + 1}`);
    }));
    regola("2. Niente trasparenza attaccata a un colore",
        'su una variabile CSS non è un colore valido: usa color-mix(in srgb, … N%, transparent)', t);
}

// ── 3. un modale a schermo intero deve stare in un portal ────────────────
//    Le card hanno backdrop-blur, che àncora i figli in posizione fissa:
//    misurato, un modale diventa 420×130 invece di 1200×713.
{
    const t = [];
    files.forEach((p) => {
        const r = righe(p);
        const haPortal = r.some((x) => x.includes("createPortal"));
        r.forEach((x, i) => {
            if (!/fixed inset-0|position:\s*"fixed"\s*,\s*inset:\s*0/.test(x)) return;
            if (!haPortal) t.push(`${p}:${i + 1}`);
        });
    });
    regola("3. I modali passano da un portal",
        "dentro un riquadro sfocato un elemento fisso viene ancorato al riquadro, non alla finestra", t);
}

// ── 4. gli stili scritti a mano non devono RICRESCERE ────────────────────
//    Non si pretende zero: certi casi unici restano. Si pretende che il
//    numero non risalga, se no fra un mese siamo al punto di partenza.
{
    const TETTO = 1080;   // misurato il 29/08: 1014. Il tetto lascia respiro, non deriva.
    const n = files.reduce((s, p) => s + (readFileSync(p, "utf8").match(/style=\{\{/g) || []).length, 0);
    console.log(`\n${B}4. Gli stili scritti a mano non risalgono${X}`);
    if (n > TETTO) {
        violazioni++;
        console.log(`   ${R}${n} stili a mano, il tetto è ${TETTO}${X}`);
        console.log(`   ${Y}·${X} usa le classi .rv* di globals.css; se ne manca una, aggiungila ALLA CASSETTA`);
        console.log(`   ${Y}·${X} se il tetto va alzato davvero, alzalo QUI e scrivi perché`);
    } else {
        console.log(`   ${G}${n} stili a mano (tetto ${TETTO})${X}`);
    }
}

/* ── 5. UNA CLASSE INVENTATA NON DA' NESSUN ERRORE ───────────────────────────
   E' il difetto trovato la sera del 01/09 su Documenti: `rvWrap`, `rvTitolo`,
   `rvNota-ko`, `rvNota-warn` non esistevano in globals.css. Niente si e'
   lamentato — sono usciti quattro elementi NUDI: il titolo di sezione era due
   righe di testo normale, l'errore usciva grigio come una nota qualunque.
   TypeScript non guarda dentro le stringhe e il CSS non sa chi lo chiama:
   questo controllo e' l'unico punto in cui le due cose si incontrano. */
{
    console.log(`\n${B}5. Ogni classe .rv* usata esiste davvero nella cassetta${X}`);
    /* SENZA I COMMENTI: `definite` si costruiva sul file intero, quindi un nome
       CITATO in un commento passava per definito. In globals.css ce ne sono gia'
       due cosi' (`rvRapido-euro`, dove e' scritto che non funzionava, e
       `rvGiac-`): scrivendoli in un className la guardia diceva «a posto» e
       l'elemento usciva nudo — cioe' esattamente il caso che deve prendere. */
    const css = readFileSync("src/app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const definite = new Set([...css.matchAll(/\.(rv[A-Za-z0-9_-]+)/g)].map(m => m[1]));
    const orfane = new Map();
    for (const f of files) {
        righe(f).forEach((r, i) => {
            /* solo dentro le stringhe di classi: className="…" e cn("…") */
            for (const m of r.matchAll(/["'`]([^"'`]*\brv[A-Za-z0-9_-]+[^"'`]*)["'`]/g)) {
                for (const c of m[1].split(/\s+/)) {
                    if (!/^rv[A-Za-z0-9_-]+$/.test(c) || definite.has(c)) continue;
                    /* «"rvBadge-"+b.st» e' un nome COMPOSTO a runtime, non uno
                       inventato: qui si vede solo il pezzo davanti. Chi lo
                       compone lo fa da un elenco chiuso di toni, e a guardarlo
                       da fuori non si puo' dire di piu'. */
                    if (c.endsWith("-")) continue;
                    const k = `${c}  —  ${f.replace("src/app/(dashboard)/", "")}:${i + 1}`;
                    if (!orfane.has(c)) orfane.set(c, k);
                }
            }
        });
    }
    regola("classi .rv* inventate", "queste classi NON esistono in globals.css: l'elemento esce nudo. Aggiungile alla cassetta, o usa quella giusta", [...orfane.values()]);
}

console.log("");
if (violazioni) {
    console.log(`${R}${B}✗ ${violazioni} violazioni delle regole di stile.${X}`);
    console.log(`  Le regole stanno in ${B}docs/REGOLE_REGISTRA_VENDITA.md${X} — si possono cambiare, ma si cambiano lì.\n`);
    process.exit(1);
}
console.log(`${G}${B}✓ Registra Vendita segue le sue regole.${X}\n`);
