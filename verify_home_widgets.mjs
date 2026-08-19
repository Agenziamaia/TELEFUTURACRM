// Riscontro numeri dei widget Home (Luca 17/08): replica ESATTA delle
// aggregazioni dei widget usando le STESSE funzioni del CRM (commissioning),
// confrontata con un riconteggio indipendente via REST puro.
// Uso: npx tsx verify_home_widgets.mjs
// (JS puro: il runner resta FUORI dal type-check di `next build` — il
// gemello .ts aveva rotto la build del box 204, mai più runner .ts in root)
import { readFileSync } from "fs";

const env = readFileSync(new URL("./.env.local", import.meta.url), "utf8");
for (const riga of env.split("\n")) {
    const m = riga.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: KEY, Authorization: "Bearer " + KEY };

const norm = (s) => String(s || "").trim().toLowerCase();
const sameStore = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)); };

async function main() {
    const { caricaContrattiMese, caricaTabellareAzienda, matchRigheAttivazione, puntiPerRighe } = await import("./src/lib/commissioning");

    const YM = "2026-08";

    // ── LATO WIDGET: stessa aggregazione di kpiW3/kpiVF in _widgets.tsx ──────
    // identica a kpiW3/kpiVF in _widgets.tsx (regole 19/08: pezzi = registrato,
    // business su piste dedicate, Rete Sicura CB anche come prodotto, sonda
    // sulle vendite senza riga pay)
    const aggrega = (rows, tab, brandId) => {
        const per = { puntiMobile: 0, pezziMobile: 0, simReg: 0, puntiFisso: 0, pezziFisso: 0, fisReg: 0, bizMobN: 0, bizMobP: 0, bizFisN: 0, bizFisP: 0, mobSenzaPay: 0, fisSenzaPay: 0, puntiAss: 0, pezziAss: 0, telGa: 0, telGaFin: 0, telCb: 0, telCbFin: 0, opCb: 0, reload: 0, rsGa: 0, rsCb: 0, luce: 0, gas: 0, kit: 0 };
        rows.forEach((c) => {
            const cat = String(c.categoria || "");
            const prod = String(c.prodotto || "");
            const off = String(c.offerta || "");
            const opz = String(c.opzioni || "");
            const isMob = /^mobile /i.test(cat);
            const isFis = /^fisso/i.test(cat);
            const isCb = /^customer base/i.test(cat);
            if (isMob) per.simReg++;
            if (isFis) per.fisReg++;
            if (/^telefono a rate/i.test(cat)) {
                const fin = /^finanziato/i.test(prod);
                if (/cb\s*$/i.test(prod)) { per.telCb++; if (fin) per.telCbFin++; }
                else { per.telGa++; if (fin) per.telGaFin++; }
            }
            if (isCb) per.opCb++;
            if (/reload/i.test(opz)) per.reload++;
            if (/\bkit\b/i.test(opz)) per.kit++;
            if (/rete sicura/i.test(opz)) { if (isCb) per.rsCb++; else per.rsGa++; }
            else if (isCb && /rete sicura/i.test(prod + " " + off)) per.rsCb++;
            if (/^energia/i.test(cat)) { if (/gas/i.test(prod)) per.gas++; else per.luce++; }
            const set = tab ? matchRigheAttivazione(tab.righe, c, brandId) : [];
            if (set.length) {
                const pista = set[0].pista; const p = puntiPerRighe(set);
                if (pista === "mobile") { per.puntiMobile += p; per.pezziMobile++; }
                else if (pista === "fisso") { per.puntiFisso += p; per.pezziFisso++; }
                else if (pista === "business_mobile") { per.bizMobN++; per.bizMobP += p; }
                else if (pista === "business_fisso") { per.bizFisN++; per.bizFisP += p; }
                else if (pista === "assicurazioni") { per.puntiAss += p; per.pezziAss++; }
            } else if (isMob || isFis) {
                if (isMob) per.mobSenzaPay++; else per.fisSenzaPay++;
            }
        });
        return per;
    };
    // invarianti di quadratura: il REGISTRATO si spiega per intero
    const quadra = (per) => {
        const errs = [];
        if (per.pezziMobile + per.bizMobN + per.mobSenzaPay !== per.simReg) errs.push(`SIM: ${per.pezziMobile} cons + ${per.bizMobN} biz + ${per.mobSenzaPay} senza-pay ≠ ${per.simReg} registrate`);
        if (per.pezziFisso + per.bizFisN + per.fisSenzaPay !== per.fisReg) errs.push(`Fisso: ${per.pezziFisso} cons + ${per.bizFisN} biz + ${per.fisSenzaPay} senza-pay ≠ ${per.fisReg} registrate`);
        return errs;
    };

    const [rw3, rvf, rfw, tw3, tvf] = await Promise.all([
        caricaContrattiMese("WindTre", `${YM}-01`),
        caricaContrattiMese("Vodafone", `${YM}-01`),
        caricaContrattiMese("Fastweb", `${YM}-01`),
        caricaTabellareAzienda("windtre", `${YM}-01`),
        caricaTabellareAzienda("vodafone", `${YM}-01`),
    ]);
    console.log(`Motore: W3 ${rw3.length} righe · VF ${rvf.length} · FW ${rfw.length} · tabellare W3 ${tw3 ? "ok" : "ASSENTE"} · VF ${tvf ? "ok" : "ASSENTE"}`);

    // ── RICONTEGGIO INDIPENDENTE via REST (percorso diverso) ────────────────
    const oggiISO = new Date().toISOString().slice(0, 10);
    const oraScatto = 19;
    const oggiFuori = new Date().getHours() < oraScatto ? oggiISO : null;
    const scarica = async (brand) => {
        let rows = [], from = 0;
        while (true) {
            const b = await fetch(`${URL_}/rest/v1/contracts?select=id,stato,negozio,venditore,prodotto,offerta,nascosta_gestione,data,dettagli&brand=ilike.${brand}*&data=gte.${YM}-01&data=lte.${YM}-31&or=(is_demo.is.null,is_demo.eq.false)&order=id&limit=1000&offset=${from}`, { headers: H }).then(r => r.json());
            rows.push(...b); if (b.length < 1000) break; from += 1000;
        }
        return rows.filter(r =>
            String(r.id).startsWith("CTR-") &&
            !/annull/i.test(r.stato || "") &&
            r.nascosta_gestione !== true &&
            !/sostituzion/i.test(String((r.dettagli || {}).categoria_catalogo || "") + " " + String(r.prodotto || "")) &&
            !/^(easy control|smart security)$/i.test(String(r.offerta || "").trim()) &&
            (!oggiFuori || String(r.data || "").slice(0, 10) !== oggiFuori)
        ).map(r => ({
            ...r,
            categoria: (r.dettagli || {}).categoria_catalogo || null,
            opzioni: (r.dettagli || {}).Opzioni == null ? "" : String(r.dettagli.Opzioni),
        }));
    };
    const [iw3, ivf] = await Promise.all([scarica("WindTre"), scarica("Vodafone")]);

    const contaIndip = (rows) => ({
        simReg: rows.filter(r => /^mobile /i.test(r.categoria || "")).length,
        fisReg: rows.filter(r => /^fisso/i.test(r.categoria || "")).length,
        telGa: rows.filter(r => /^telefono a rate/i.test(r.categoria || "") && !/cb\s*$/i.test(r.prodotto || "")).length,
        telGaFin: rows.filter(r => /^telefono a rate/i.test(r.categoria || "") && !/cb\s*$/i.test(r.prodotto || "") && /^finanziato/i.test(r.prodotto || "")).length,
        telCb: rows.filter(r => /^telefono a rate/i.test(r.categoria || "") && /cb\s*$/i.test(r.prodotto || "")).length,
        telCbFin: rows.filter(r => /^telefono a rate/i.test(r.categoria || "") && /cb\s*$/i.test(r.prodotto || "") && /^finanziato/i.test(r.prodotto || "")).length,
        opCb: rows.filter(r => /^customer base/i.test(r.categoria || "")).length,
        reload: rows.filter(r => /reload/i.test(r.opzioni)).length,
        rsGa: rows.filter(r => /rete sicura/i.test(r.opzioni) && !/^customer base/i.test(r.categoria || "")).length,
        rsCb: rows.filter(r => /^customer base/i.test(r.categoria || "") && (/rete sicura/i.test(r.opzioni) || /rete sicura/i.test(String(r.prodotto || "") + " " + String(r.offerta || "")))).length,
        luce: rows.filter(r => /^energia/i.test(r.categoria || "") && !/gas/i.test(r.prodotto || "")).length,
        gas: rows.filter(r => /^energia/i.test(r.categoria || "") && /gas/i.test(r.prodotto || "")).length,
        kit: rows.filter(r => /\bkit\b/i.test(r.opzioni)).length,
    });

    const casi = [
        { nome: "RETE (global)", scope: () => true },
        { nome: "Magliana W3 (store)", scope: (c) => sameStore(c.negozio, "Magliana W3") },
        { nome: "Libia (store)", scope: (c) => sameStore(c.negozio, "Libia") },
    ];
    let errori = 0;
    for (const caso of casi) {
        const wid = aggrega(rw3.filter(caso.scope), tw3, "windtre");
        const ind = contaIndip(iw3.filter(caso.scope));
        const diff = [...quadra(wid)];
        for (const k of Object.keys(ind)) if (wid[k] !== ind[k]) diff.push(`${k}: widget ${wid[k]} ≠ indip ${ind[k]}`);
        console.log(`\n■ W3 — ${caso.nome}`);
        console.log(`  punti: mobile ${wid.puntiMobile.toFixed(2)} (${wid.simReg} SIM reg.) · fisso ${wid.puntiFisso.toFixed(2)} (${wid.fisReg} reg.) · assic ${wid.puntiAss.toFixed(2)} (${wid.pezziAss}) · senza-pay ${wid.mobSenzaPay + wid.fisSenzaPay}`);
        console.log(`  conteggi: telGA ${wid.telGa}(fin ${wid.telGaFin}) · telCB ${wid.telCb}(fin ${wid.telCbFin}) · opCB ${wid.opCb} · reload ${wid.reload} · luce ${wid.luce} · gas ${wid.gas} · kit ${wid.kit}`);
        if (diff.length) { errori++; console.log("  ✗ DIFFERENZE: " + diff.join(" | ")); } else console.log("  ✓ riconteggio indipendente identico + quadratura ok");
    }

    const casiVf = [
        { nome: "RETE (global)", scope: () => true },
        { nome: "Baleniere (store)", scope: (c) => sameStore(c.negozio, "Baleniere") },
        { nome: "Magliana Multi+W3 (store di Emanuele)", scope: (c) => sameStore(c.negozio, "Magliana Multi") || sameStore(c.negozio, "Magliana W3") },
        { nome: "Eros Harzi (own)", scope: (c) => norm(c.venditore) === norm("Eros Harzi") },
    ];
    for (const caso of casiVf) {
        const wid = aggrega(rvf.filter(caso.scope), tvf, "vodafone");
        const fwEn = rfw.filter(caso.scope).filter((c) => /^energia/i.test(String(c.categoria || "")));
        fwEn.forEach((c) => { if (/gas/i.test(String(c.prodotto || ""))) wid.gas++; else wid.luce++; });
        const ind = contaIndip(ivf.filter(caso.scope));
        const diff = [...quadra(wid)];
        for (const k of ["simReg", "fisReg", "telGa", "telGaFin", "telCb", "telCbFin", "opCb", "rsGa", "rsCb"]) if (wid[k] !== ind[k]) diff.push(`${k}: widget ${wid[k]} ≠ indip ${ind[k]}`);
        console.log(`\n■ VF — ${caso.nome}`);
        console.log(`  punti: mobile ${wid.puntiMobile.toFixed(2)} (${wid.simReg} SIM reg.) · fisso ${wid.puntiFisso.toFixed(2)} (${wid.fisReg} linee reg.) · 💼 biz mob ${wid.bizMobN} (${wid.bizMobP.toFixed(1)} pt) · biz fis ${wid.bizFisN} (${wid.bizFisP.toFixed(1)} pt) · senza-pay ${wid.mobSenzaPay + wid.fisSenzaPay}`);
        console.log(`  conteggi: telGA ${wid.telGa}(fin ${wid.telGaFin}) · telCB ${wid.telCb}(fin ${wid.telCbFin}) · RS GA ${wid.rsGa} · RS CB ${wid.rsCb} · opCB ${wid.opCb} · luce ${wid.luce} · gas ${wid.gas} (con FW)`);
        if (diff.length) { errori++; console.log("  ✗ DIFFERENZE: " + diff.join(" | ")); } else console.log("  ✓ riconteggio indipendente identico + quadratura ok");
    }

    // Scomposizione di 2 vendite campione (controllo a occhio dei punti)
    const campioni = rw3.filter((c) => /security/i.test(String(c.opzioni || "")) && /^mobile/i.test(String(c.categoria || ""))).slice(0, 1)
        .concat(rw3.filter((c) => /^fisso/i.test(String(c.categoria || ""))).slice(0, 1));
    for (const c of campioni) {
        const set = tw3 ? matchRigheAttivazione(tw3.righe, c, "windtre") : [];
        console.log(`\n· campione: ${c.categoria} | ${c.prodotto} | ${c.offerta} | opz: ${String(c.opzioni || "").slice(0, 40)}`);
        console.log(`  set: ${set.map((r) => `${r.nome}(${r.punti ?? 0}pt)`).join(" + ")} = ${puntiPerRighe(set)} punti`);
    }

    // Marginalità Baleniere: Σqty + copertura mappa categorie
    let ext = []; let from = 0;
    while (true) {
        const b = await fetch(`${URL_}/rest/v1/contracts?select=id,stato,negozio,prodotto,dettagli&id=like.EXT-*&data=gte.${YM}-01&data=lte.${YM}-31&order=id&limit=1000&offset=${from}`, { headers: H }).then(r => r.json());
        ext.push(...b); if (b.length < 1000) break; from += 1000;
    }
    ext = ext.filter(r => !/annull/i.test(r.stato || ""));
    const [mc, mi] = await Promise.all([
        fetch(`${URL_}/rest/v1/marg_categories?select=id,name`, { headers: H }).then(r => r.json()),
        fetch(`${URL_}/rest/v1/marg_items?select=name,category_id`, { headers: H }).then(r => r.json()),
    ]);
    const catName = new Map(mc.map((c) => [c.id, c.name]));
    const mappa = new Map(mi.map((it) => [norm(it.name), catName.get(it.category_id)]));
    const bal = ext.filter(r => sameStore(r.negozio, "Baleniere"));
    const qty = (r) => Math.max(1, Number((r.dettagli || {}).qty) || 1);
    const pezziBal = bal.reduce((a, r) => a + qty(r), 0);
    const perCat = {}; bal.forEach(r => { const c = mappa.get(norm(r.prodotto)) || "Altro"; perCat[c] = (perCat[c] || 0) + qty(r); });
    const senzaMappa = ext.filter(r => !mappa.get(norm(r.prodotto))).length;
    // nota: niente baseline fissa — i pezzi crescono coi giorni (217 al 17/08)
    console.log(`\n■ MARGINALITÀ — Baleniere: ${bal.length} righe → ${pezziBal} pezzi · categorie: ${JSON.stringify(perCat)}`);
    console.log(`  copertura mappa categorie su tutta la rete: ${ext.length - senzaMappa}/${ext.length} righe mappate (${senzaMappa} in "Altro")`);

    console.log(`\n${errori === 0 ? "✅ TUTTI I RISCONTRI COINCIDONO" : `❌ ${errori} riscontri con differenze`}`);
}
main().catch(e => { console.error("ERRORE:", e); process.exit(1); });
