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

console.log("");
if (violazioni) {
    console.log(`${R}${B}✗ ${violazioni} violazioni delle regole di stile.${X}`);
    console.log(`  Le regole stanno in ${B}docs/REGOLE_REGISTRA_VENDITA.md${X} — si possono cambiare, ma si cambiano lì.\n`);
    process.exit(1);
}
console.log(`${G}${B}✓ Registra Vendita segue le sue regole.${X}\n`);
