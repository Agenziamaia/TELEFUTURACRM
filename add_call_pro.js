// AGGIUNGE "Call Pro" al catalogo VF (Luca 19/08: dimenticata — «aggiungila
// OVUNQUE, la fonte è il catalogo»): 4 offerte Consumer (Mobile Wallet e
// Mobile Ric. Auto × Mobile GA e Mobile MNP) con le stesse opzioni della
// Call Power, + le 4 righe di gara dalla lettera agosto riga «C'All Pro»:
// MNP valore 1 · GA 0,5 + compenso gara 25€ dal raggiungimento di soglia ≥1.
// Uso: node add_call_pro.js [--apply]
const fs = require("fs");
const env = fs.readFileSync(__dirname + "/.env.local", "utf8");
const url = (env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/) || [])[1].trim();
const key = (env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/) || [])[1].trim();
const H = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=representation" };
const APPLY = process.argv.includes("--apply");
const NOME = "Call Pro";

(async () => {
    const esiste = await fetch(`${url}/rest/v1/catalog_offerte?select=id&nome=eq.${encodeURIComponent(NOME)}`, { headers: H }).then((r) => r.json());
    if (Array.isArray(esiste) && esiste.length) { console.log("Call Pro già a catalogo (" + esiste.length + " offerte) — niente da fare."); return; }

    const prodotti = await fetch(`${url}/rest/v1/catalog_prodotti?select=id,nome,categoria_id&brand_id=eq.vodafone&tipo_cliente=eq.Consumer&nome=in.("Mobile GA","Mobile MNP")`, { headers: H }).then((r) => r.json());
    const cats = await fetch(`${url}/rest/v1/catalog_categorie?select=id,nome&id=in.(${[...new Set(prodotti.map((p) => p.categoria_id))].join(",")})`, { headers: H }).then((r) => r.json());
    const catNome = (id) => (cats.find((c) => c.id === id) || {}).nome || id;
    const slots = prodotti.filter((p) => /Mobile (Wallet|Ric\. Auto)/.test(catNome(p.categoria_id)));
    console.log("Collocazioni (" + slots.length + "):");
    slots.forEach((p) => console.log("  " + catNome(p.categoria_id) + " / " + p.nome));

    // sorgente opzioni: la Call Power del prodotto omologo (stesso nome prodotto)
    const cp = await fetch(`${url}/rest/v1/catalog_offerte?select=id,prodotto_id,ordine&nome=eq.Call Power`, { headers: H }).then((r) => r.json());
    const cpProd = Object.fromEntries(cp.map((o) => [o.prodotto_id, o]));
    const prodDiCp = Object.fromEntries(cp.map((o) => { const p = prodotti.find((x) => x.id === o.prodotto_id); return [p ? p.nome : "?", o]; }));
    const opzDi = {};
    for (const [pn, o] of Object.entries(prodDiCp)) {
        opzDi[pn] = await fetch(`${url}/rest/v1/catalog_opzioni?select=nome,tipo,gruppo_singolo,obbligatoria,canone_mensile,ordine,attivo&offerta_id=eq.${o.id}&order=ordine`, { headers: H }).then((r) => r.json());
        console.log("Opzioni Call Power " + pn + ": " + opzDi[pn].map((x) => x.nome).join(", "));
    }
    // regole campi per-offerta della Call Power? (da clonare se esistono)
    const regole = await fetch(`${url}/rest/v1/catalog_campi_regole?select=id,etichetta,condizioni&limit=300`, { headers: H }).then((r) => r.json());
    const regCp = (Array.isArray(regole) ? regole : []).filter((r) => JSON.stringify(r.condizioni || {}).includes("Call Power"));
    console.log("Regole campi per-offerta Call Power:", regCp.length, regCp.map((r) => r.etichetta).join(" · ") || "");

    const PAY = [
        { prodotto: "Mobile GA", punti: 0.5 },
        { prodotto: "Mobile MNP", punti: 1 },
    ];
    console.log("\nRighe gara da creare (×2 lati): " + PAY.map((p) => `${p.prodotto} ${p.punti}pt pay [25×6]`).join(" · "));
    if (!APPLY) { console.log("\n(anteprima — rilancia con --apply)"); return; }

    for (const p of slots) {
        const ordine = (cpProd[p.id] || prodDiCp[p.nome] || { ordine: 90 }).ordine;
        const ins = await fetch(`${url}/rest/v1/catalog_offerte`, { method: "POST", headers: H, body: JSON.stringify({ prodotto_id: p.id, nome: NOME, ordine, attivo: true }) }).then((r) => r.json());
        if (!Array.isArray(ins) || !ins.length) { console.log("ERR offerta " + catNome(p.categoria_id) + "/" + p.nome, JSON.stringify(ins).slice(0, 120)); continue; }
        const offId = ins[0].id;
        const opz = (opzDi[p.nome] || opzDi["Mobile GA"] || []).map((o) => ({ ...o, offerta_id: offId }));
        if (opz.length) {
            const or = await fetch(`${url}/rest/v1/catalog_opzioni`, { method: "POST", headers: H, body: JSON.stringify(opz) }).then((r) => r.json());
            console.log(`✅ ${catNome(p.categoria_id)} / ${p.nome} → offerta + ${Array.isArray(or) ? or.length : "ERR"} opzioni`);
        } else console.log(`✅ ${catNome(p.categoria_id)} / ${p.nome} → offerta (senza opzioni)`);
    }
    const righe = [];
    for (const lato of ["azienda", "ragazzi"]) for (const p of PAY) {
        righe.push({
            brand: "vodafone", month: "2026-08-01", lato, pista: "mobile",
            nome: `Call Pro · ${p.prodotto.replace("Mobile ", "")}`,
            tipo_cliente: "Consumer", categoria: null, prodotto: p.prodotto, offerta: NOME,
            punti: p.punti, pay_base: 0, pay_tiers: [25, 25, 25, 25, 25, 25],
            gettone: false, attivo: true, ordine: 60, brand_vendita: "vodafone",
            note: "Lettera agosto: C'All Pro vale 1 in MNP e 0,5 in GA, compenso gara 25€ da soglia ≥1 (sotto S1 nulla).",
        });
    }
    const rr = await fetch(`${url}/rest/v1/pay_righe`, { method: "POST", headers: H, body: JSON.stringify(righe) }).then((r) => r.json());
    console.log(Array.isArray(rr) ? `✅ ${rr.length} righe di gara inserite (2 lati × GA/MNP)` : "ERR righe " + JSON.stringify(rr).slice(0, 150));
    console.log("✅ fatto");
})();
