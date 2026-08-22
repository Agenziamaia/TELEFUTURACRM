// Tabellare AZIENDA Sky · agosto 2026 — dalla lettera «GOLD AGOSTO 26.pdf»
// (archiviata in Gare→Sky→Lettere). 8 soglie a punti Gross + pay unitario per
// soglia (pay_tiers). Righe ancorate al CATALOGO (mai condizioni vuote: le
// righe libere fanno da acchiappa-tutto nel pick-one — lezione partnership).
// La pista si chiama "sky" come il lato ragazzi: senza soglie_pct/perc la
// derivazione NON tocca il tabellare ragazzi esistente.
// NON coperti (nessun prodotto a catalogo, elencati in /verifiche):
// Reconnection residenziali/essential, upselling (pack/wifi/Platinum/Glass
// Parco), UHD, Promo Convergenza, prepagato 12 mesi, componenti TP parziali,
// voce naz/int, POD, conversione da altro canale, secondo decoder bar,
// riconnessioni business. Conversioni Prova Sky: pay dedicato non tracciabile.
// Uso: node seed_sky_azienda_gold.js
const { readFileSync } = require("fs");
const env = readFileSync(new URL("./.env.local", "file://" + __dirname + "/"), "utf8");
for (const r of env.split("\n")) { const m = r.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim(); }
const U = process.env.NEXT_PUBLIC_SUPABASE_URL, K = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: K, Authorization: "Bearer " + K, "Content-Type": "application/json", Prefer: "return=minimal" };
const MONTH = "2026-08-01", B = "sky", L = "azienda";

const soglie = [
    [1, 0, 199], [2, 200, 299], [3, 300, 399], [4, 400, 499],
    [5, 500, 599], [6, 600, 1699], [7, 1700, 2099], [8, 2100, null],
].map(([tier, da, a]) => ({ brand: B, month: MONTH, lato: L, pista: "sky", tier, soglia_da: da, soglia_a: a }));

const base = { brand: B, month: MONTH, lato: L, pista: "sky", tipo_cliente: "Consumer", categoria: null, prodotto: null, offerta: null, opzione: null, brand_vendita: "sky", provenienza: null, moltiplicatore: false, componente: null, punti: 0, pay_base: null, pay_tiers: [], gettone: false, attivo: true, note: null };
let ord = 0;
const R = (x) => ({ ...base, ...x, ordine: ord++ });
const righe = [
    // ── TV / Glass / Prova ────────────────────────────────────────────────
    R({ nome: "Sky TV Only", categoria: "TV", prodotto: "TV", punti: 2, pay_tiers: [50, 115, 165, 205, 250, 275, 295, 310], note: "lettera: Sky TV Only/Sky Glass (Smart, +Cinema, +Sport)" }),
    R({ nome: "Sky TV Only · promo 14,99", categoria: "TV", prodotto: "TV", offerta: "Sky TV a 14,99€", punti: 2, pay_tiers: [45, 75, 105, 130, 175, 195, 220, 230], note: "TV+Intrattenimento Plus a 14,99/15,99/17,99" }),
    R({ nome: "Sky Glass 43\"", categoria: "TV", prodotto: "Sky Glass e Prova Sky", offerta: "Sky Glass 43\"", punti: 2, pay_tiers: [50, 115, 165, 205, 250, 275, 295, 310], note: "Glass Prospect; su parco: Top Strategy 45€ · Fallback 35€ (flat)" }),
    R({ nome: "Sky Glass 55\"", categoria: "TV", prodotto: "Sky Glass e Prova Sky", offerta: "Sky Glass 55\"", punti: 2, pay_tiers: [50, 115, 165, 205, 250, 275, 295, 310], note: "Glass Prospect; su parco: Top Strategy 45€ · Fallback 35€ (flat)" }),
    R({ nome: "Sky Glass 65\"", categoria: "TV", prodotto: "Sky Glass e Prova Sky", offerta: "Sky Glass 65\"", punti: 2, pay_tiers: [50, 115, 165, 205, 250, 275, 295, 310], note: "Glass Prospect; su parco: Top Strategy 45€ · Fallback 35€ (flat)" }),
    R({ nome: "Prova Sky TV (attivato)", categoria: "TV", prodotto: "Sky Glass e Prova Sky", offerta: "Prova Sky", punti: 0.5, pay_tiers: [5, 5, 5, 5, 5, 5, 5, 5], note: "convertito: CC/RID 45→200€ · prepagate 35→160€ — la conversione oggi non si registra, pay da gestire" }),
    // ── Triple Play ───────────────────────────────────────────────────────
    R({ nome: "Triple Play", categoria: "Fisso", prodotto: "3P", punti: 3, pay_tiers: [65, 160, 235, 280, 340, 365, 380, 400], note: "2 pt TV + 1 pt Wifi; copre i 35,90 con Cinema/Sport" }),
    R({ nome: "Triple Play · promo 29,90", categoria: "Fisso", prodotto: "3P", offerta: "Sky TV + Sky Fibra a 29,90€", punti: 3, pay_tiers: [65, 135, 200, 235, 290, 320, 335, 345], note: "lettera: TP con offerta promozionata 29,90/27,90" }),
    R({ nome: "Triple Play · promo 27,90", categoria: "Fisso", prodotto: "3P", offerta: "Sky TV + Sky Fibra a 27,90€", punti: 3, pay_tiers: [65, 135, 200, 235, 290, 320, 335, 345], note: "lettera: TP con offerta promozionata 29,90/27,90" }),
    R({ nome: "Triple Play (legacy 35,80)", categoria: "Fisso", prodotto: "3P 35,80", punti: 3, pay_tiers: [65, 160, 235, 280, 340, 365, 380, 400], note: "prodotto legacy pre-catalogo" }),
    // ── Only Sky Wifi ─────────────────────────────────────────────────────
    R({ nome: "Only Sky Wifi", categoria: "Fisso", prodotto: "Sky Fibra", punti: 1, pay_tiers: [50, 90, 120, 150, 200, 210, 220, 230], note: "valori con CC/RID; con carte prepagate 40→185 (metodo di pagamento oggi non distinguibile)" }),
    R({ nome: "Only Sky Wifi (legacy)", categoria: "Fisso", prodotto: "Fisso", offerta: "Sky Fibra", punti: 1, pay_tiers: [50, 90, 120, 150, 200, 210, 220, 230], note: "riga legacy pre-catalogo" }),
    // ── Sky Mobile ────────────────────────────────────────────────────────
    R({ nome: "Sky Mobile MNP", prodotto: "Mobile MNP", punti: 0.5, pay_tiers: [10, 32, 34, 36, 38, 40, 43, 45], note: "ricarica automatica o pura; conta nel cancelletto 6 SIM" }),
    R({ nome: "Sky Mobile GA · Ric. automatica", categoria: "Mobile Ric. Auto", prodotto: "Mobile GA", punti: 0.5, pay_tiers: [21, 22, 24, 25, 27, 28, 32, 36], note: "conta nel cancelletto 6 SIM; pay dall'estratto conto successivo" }),
    R({ nome: "Sky Mobile GA · Ricarica pura", categoria: "Mobile Wallet", prodotto: "Mobile GA", punti: 0, pay_tiers: [3, 3, 3, 3, 3, 3, 3, 3], note: "0 punti; pagata se il 1° rinnovo va a buon fine il mese successivo" }),
    // ── Business (gettoni fuori soglia dove la lettera li dà a gettone) ───
    R({ nome: "Sky Wifi Business", tipo_cliente: "Business", categoria: "Fisso", prodotto: "Fibra", punti: 1, pay_tiers: [50, 120, 150, 180, 230, 240, 250, 260], note: "con extra commission da soglia 2 fino al 31/08" }),
    R({ nome: "Offerta Uffici", tipo_cliente: "Business", categoria: "TV", prodotto: "TV Uffici", punti: 2, gettone: true, pay_base: 200, note: "2 pt e pxq PER punto di visione; promo smart 34,90 = 200€ · promo open 39,90 = 100€ — a catalogo non distinte, default smart" }),
    R({ nome: "Sky Bar", tipo_cliente: "Business", categoria: "TV", prodotto: "Sky Bar", punti: 4, gettone: true, pay_base: 600, note: "promo con canone: gettone 600€; Prova Sky Bar (att. 100€ + conv. 500€) e Sala Comune 9€ escluse; secondo decoder 75€" }),
    R({ nome: "Sky Hotel · 0-3 stanze", tipo_cliente: "Business", categoria: "TV", prodotto: "Sky Hotel", offerta: "Da 0 a 3 Stanze", punti: 1.5, gettone: true, pay_base: 60, note: "0,5 pt/camera (qui 3) · gettone 20€×3; con Prova Sky: 50€ att. + conversione al netto" }),
    R({ nome: "Sky Hotel · 4+ stanze", tipo_cliente: "Business", categoria: "TV", prodotto: "Sky Hotel", offerta: "Over 4 Stanze", punti: 2, gettone: true, pay_base: 240, note: "0,5 pt/camera e 20€×3×camere (valori per 4): col numero stanze reale servirà un campo vendita" }),
];

(async () => {
    // pulizia idempotente del lato azienda del mese, poi insert
    for (const t of ["pay_righe", "pay_soglie", "pay_piste"]) {
        const r = await fetch(`${U}/rest/v1/${t}?brand=eq.${B}&month=eq.${MONTH}&lato=eq.${L}`, { method: "DELETE", headers: H });
        if (!r.ok) { console.log(`✗ pulizia ${t}:`, r.status, await r.text()); return; }
    }
    const ins = async (t, body) => {
        const r = await fetch(`${U}/rest/v1/${t}`, { method: "POST", headers: H, body: JSON.stringify(body) });
        if (!r.ok) { console.log(`✗ ${t}:`, r.status, await r.text()); process.exit(1); }
    };
    await ins("pay_piste", [{ brand: B, month: MONTH, lato: L, chiave: "sky", nome: "Punti Sky", um: "punti", ordine: 1 }]);
    await ins("pay_soglie", soglie);
    await ins("pay_righe", righe);
    console.log(`Sky azienda seminato: 1 pista, ${soglie.length} soglie, ${righe.length} righe`);
})();
