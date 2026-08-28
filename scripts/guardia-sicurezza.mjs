#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   GUARDIA DI SICUREZZA (Luca 28/08) — «ogni modifica da qui in poi deve
   mantenere questo livello».

   Il 28/08 il CRM è stato blindato: il database non è più leggibile da
   estranei e ognuno vede solo ciò che gli spetta. Ma una protezione che
   dipende dalla memoria di chi scrive il codice, prima o poi si perde: basta
   una route nuova senza lucchetto, o un `select` che si fida di un id
   arrivato dal browser.

   Questa guardia controlla le regole DEL CODICE, non del database, e va
   lanciata prima di ogni deploy:  npm run sicurezza
   Se trova una violazione esce con errore e dice esattamente cosa fare.
   ═══════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join } from "path";

const R = "\x1b[31m", G = "\x1b[32m", Y = "\x1b[33m", B = "\x1b[1m", X = "\x1b[0m";
let violazioni = 0;
const problema = (t, come) => { violazioni++; console.log(`${R}  ✗ ${t}${X}\n    → ${come}`); };

/* Le uniche route che possono stare senza lucchetto di sessione, e perché.
   Aggiungere una voce qui è una DECISIONE DI SICUREZZA: va motivata. */
const SENZA_SESSIONE = {
    "auth/login": "è il login stesso",
    "auth/reset-password": "recupero password: chi lo usa non è ancora dentro",
    "auth/token": "rilascia il lasciapassare, verifica il cookie da sé",
    "auth/azioni": "verifica la sessione da sé, con i permessi",
    "qr/[token]": "upload dal telefono del cliente: pubblico per disegno, ristretto a una pratica",
    "whatsapp/webhook": "chiamata da Evolution, protetta dal suo token",
    "aircall/webhook": "chiamata da Aircall, protetta dal suo token",
    "whatsapp/triage": "girata dal cron",
    "email/triage": "girata dal cron",
    "print/enqueue": "agente di stampa, protetto dal suo token",
    "print/next": "agente di stampa, protetto dal suo token",
    "print/claim": "agente di stampa, protetto dal suo token",
    "print/done": "agente di stampa, protetto dal suo token",
    "print/ack": "agente di stampa, protetto dal suo token",
    "print/result": "agente di stampa, protetto dal suo token",
    "supabase-verify": "diagnostica senza dati",
};

const tuttiIFile = (dir, out = []) => {
    for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) tuttiIFile(p, out);
        else if (n === "route.ts") out.push(p);
    }
    return out;
};

console.log(`\n${B}🔒 GUARDIA DI SICUREZZA — controllo del codice${X}\n`);

/* ── 1. ogni route del server deve chiedere la sessione ─────────────────── */
console.log(`${B}1. Lucchetto sulle funzioni del server${X}`);
const route = tuttiIFile("src/app/api");
for (const f of route) {
    const nome = f.replace("src/app/api/", "").replace("/route.ts", "");
    const testo = readFileSync(f, "utf8");
    const haGate = testo.includes("richiedeSessione") || testo.includes("accesso(");
    const ammessa = Object.keys(SENZA_SESSIONE).some((k) => nome === k || nome.startsWith(k + "/"));
    if (!haGate && !ammessa) {
        problema(`${nome}: chiunque può chiamarla, anche senza login`,
            `aggiungi in cima all'handler:  const _g = await accesso(request, "${nome}"); if (!_g.ok) return _g.risposta;\n      (se dev'essere pubblica, motivala in SENZA_SESSIONE dentro questa guardia)`);
    }
}
console.log(`   ${route.length} funzioni esaminate\n`);

/* ── 1-bis. i PERMESSI DEL PANNELLO valgono anche qui (Luca 28/08) ────────
   «i permessi devono essere collegati TUTTI alla sezione permessi del
   pannello, altrimenti che senso ha». Una route che appartiene a una sezione
   del CRM deve passare da `accesso()`, che legge role_permissions: se usa la
   sola sessione, chi ha la sezione spenta ci arriva lo stesso. */
console.log(`${B}1-bis. Permessi collegati al pannello amministrativo${X}`);
const SEZIONI = ["passwords", "whatsapp", "email", "ai", "vendita", "pos", "aircall", "usati", "dispositivi", "smartphones"];
for (const f of route) {
    const nome = f.replace("src/app/api/", "").replace("/route.ts", "");
    const testo = readFileSync(f, "utf8");
    const ammessa = Object.keys(SENZA_SESSIONE).some((k) => nome === k || nome.startsWith(k + "/"));
    if (ammessa) continue;
    const suaSezione = SEZIONI.some((k) => nome === k || nome.startsWith(k + "/"));
    if (suaSezione && !testo.includes("accesso(")) {
        problema(`${nome}: controlla la sessione ma NON il permesso della sezione`,
            `usa il varco unico:  const _g = await accesso(request, "${nome}"); if (!_g.ok) return _g.risposta;\n      (così vale quello che è impostato in Amministrazione → Permessi, e non una lista scritta nel codice)`);
    }
    // e nessuno deve reintrodurre elenchi di ruoli dentro una route.
    // admin/dev fanno eccezione: passano ovunque per disegno, non sono un
    // criterio di permesso ma la scorciatoia di chi amministra il sistema.
    if (/\b(role|ruolo)\s*===\s*["'](direttore_generale|store_manager|venditore|direttore_commerciale|caller)["']/.test(testo)
        || /\[[^\]]*["'](direttore_generale|store_manager)["'][^\]]*\]\s*\.includes\(/.test(testo)) {
        problema(`${nome}: decide i permessi con un elenco di ruoli scritto nel codice`,
            `i permessi stanno in Amministrazione → Permessi: usa accesso()/permessoSezione(), non liste fisse`);
    }
}
console.log("   controllo completato\n");

/* ── 2. l'identità non si prende MAI da quello che manda il browser ────── */
console.log(`${B}2. Identità presa dalla sessione, non dal client${X}`);
for (const f of route) {
    const nome = f.replace("src/app/api/", "").replace("/route.ts", "");
    const testo = readFileSync(f, "utf8");
    if (!testo.includes("richiedeSessione")) continue;
    // un userId preso dal corpo della richiesta e usato come identità di chi
    // agisce. `userId: altroNome` NON conta: è un rinominamento esplicito, il
    // segno che quel valore è il BERSAGLIO dell'operazione, non chi la fa
    const daBody = /const\s*\{[^}]*\buserId\b(?!\s*:)[^}]*\}\s*=\s*(body|await\s+req(uest)?\.json\(\))/.test(testo);
    const daQuery = /searchParams\.get\(["'](userId|uid|u)["']\)/.test(testo);
    if (daBody || daQuery) {
        problema(`${nome}: si fida dell'identità dichiarata dal browser`,
            `prendi l'utente dalla sessione:  const userId = _s.id;  (un dipendente può dichiararsi admin)`);
    }
}
console.log("   controllo completato\n");

/* ── 3. la chiave amministratore non deve finire nel browser ───────────── */
console.log(`${B}3. La chiave amministratore resta sul server${X}`);
const client = tuttiIFile("src/app").filter((f) => !f.includes("/api/"));
const pagine = [];
const raccogli = (dir) => {
    for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) raccogli(p);
        else if (/\.(tsx|ts)$/.test(n)) pagine.push(p);
    }
};
raccogli("src/app"); raccogli("src/components"); raccogli("src/context");
for (const f of pagine) {
    if (f.includes("/api/")) continue;
    const testo = readFileSync(f, "utf8");
    if (testo.includes("supabaseAdmin") || testo.includes("SERVICE_ROLE")) {
        problema(`${f}: usa la chiave amministratore fuori dal server`,
            `nel browser si usa sempre \`supabase\` (da @/lib/supabaseClient), mai supabaseAdmin`);
    }
}
console.log(`   ${pagine.length} file di interfaccia esaminati\n`);

/* ── 4. i segreti non devono diventare pubblici ─────────────────────────── */
console.log(`${B}4. Nessun segreto esposto al browser${X}`);
for (const f of [...route, ...pagine]) {
    const testo = readFileSync(f, "utf8");
    for (const m of testo.matchAll(/NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE|PASSWORD|TOKEN|KEY)[A-Z_]*/g)) {
        if (m[0] === "NEXT_PUBLIC_SUPABASE_ANON_KEY") continue;   // pubblica per disegno
        problema(`${f}: ${m[0]} è una variabile pubblica ma sembra un segreto`,
            `i segreti non vanno mai in variabili NEXT_PUBLIC_: finiscono nel codice della pagina`);
    }
}
console.log("   controllo completato\n");

/* ── 5. UNA SOLA REGOLA DEI PERMESSI, non due copie (Luca 28/08) ─────────
   Il pomeriggio del 28 il server aveva una sua versione «equivalente» della
   precedenza ruolo→grado→persona: sbagliava a leggere il menù e per un'ora ha
   negato le password a chi eredita i valori di fabbrica (direttore generale
   compreso). La regola vive in nav.ts: il server la CHIAMA, non la riscrive. */
console.log(`${B}5. I permessi si calcolano in un posto solo${X}`);
{
    const f = "src/lib/permessiServer.ts";
    if (existsSync(f)) {
        const testo = readFileSync(f, "utf8");
        if (!/effectiveAllowed\s*\(/.test(testo))
            problema(`${f}: non usa effectiveAllowed di nav.ts`,
                `il permesso di una sezione si calcola con la STESSA funzione del browser e del pannello (nav.ts): una seconda copia della regola diverge sempre`);
        if (/\.includes\(\s*role\s*\)/.test(testo))
            problema(`${f}: sembra decidere confrontando il ruolo a mano`,
                `passa da effectiveAllowed(role, href, ruoliDefault, perms, gruppo): tiene conto di gruppo, grado e persona`);
    }
}
console.log("   controllo completato\n");

/* ── 6. le pagine SENZA login non possono chiedere di sovrascrivere ──────
   /m/* le apre il cliente col QR, senza account: lì «upsert» chiede anche il
   permesso di modificare file già caricati — che a un ospite non si dà, o
   chiunque potrebbe rimpiazzare il documento d'identità di un altro. */
console.log(`${B}6. Le pagine pubbliche non sovrascrivono file${X}`);
{
    // qui servono le PAGINE, non le route: tuttiIFile raccoglie solo route.ts
    const sorgenti = (dir, out = []) => {
        for (const n of readdirSync(dir)) {
            const p = join(dir, n);
            if (statSync(p).isDirectory()) sorgenti(p, out);
            else if (/\.(tsx?|jsx?)$/.test(n)) out.push(p);
        }
        return out;
    };
    const pubbliche = existsSync("src/app/m") ? sorgenti("src/app/m") : [];
    for (const f of pubbliche) {
        const testo = readFileSync(f, "utf8");
        if (/storage[\s\S]{0,120}?upsert\s*:\s*true/.test(testo))
            problema(`${f}: carica su Storage con upsert: true`,
                `una pagina senza login non ha (e non deve avere) il permesso di sovrascrivere: togli upsert, il nome del file porta già l'orario`);
    }
    console.log(`   ${pubbliche.length} file pubblici esaminati\n`);
}

/* ── esito ─────────────────────────────────────────────────────────────── */
if (violazioni) {
    console.log(`${R}${B}✗ ${violazioni} violazion${violazioni === 1 ? "e" : "i"} di sicurezza.${X}`);
    console.log(`  Il livello di protezione del 28/08 va mantenuto: sistema i punti qui sopra.\n`);
    process.exit(1);
}
console.log(`${G}${B}✓ Nessuna violazione: il livello di sicurezza è mantenuto.${X}\n`);
