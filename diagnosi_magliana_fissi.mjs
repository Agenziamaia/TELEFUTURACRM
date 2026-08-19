// Diagnosi 19/08: Ricerca Vendite mostra 6 fissi Vodafone a Magliana, il
// widget Home ne conta 3 (6 punti). Passo ogni riga nel motore e stampo chi
// aggancia e chi no; poi audit rete-wide degli scarti per W3 e VF.
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

async function main() {
    const { caricaContrattiMese, caricaTabellareAzienda, matchRigheAttivazione, puntiPerRighe } = await import("./src/lib/commissioning");

    // ── 1. I fissi VF di Magliana, presi GREZZI dal DB (come Ricerca Vendite) ──
    let rows = [], from = 0;
    while (true) {
        const b = await fetch(`${URL_}/rest/v1/contracts?select=id,data,stato,negozio,venditore,prodotto,offerta,tipo_cliente,nascosta_gestione,is_demo,dettagli&brand=ilike.Vodafone*&negozio=ilike.Magliana*&data=gte.2026-08-01&data=lte.2026-08-31&order=data&limit=1000&offset=${from}`, { headers: H }).then(r => r.json());
        rows.push(...b); if (b.length < 1000) break; from += 1000;
    }
    const fissi = rows.filter(r => /fisso/i.test(String((r.dettagli || {}).categoria_catalogo || "")));
    console.log(`Fissi Vodafone Magliana* ad agosto (dal DB, senza filtri): ${fissi.length}`);
    fissi.forEach(r => {
        console.log(`  · ${r.id.slice(0, 12)} ${String(r.data).slice(0, 10)} stato:${r.stato} nascosta:${r.nascosta_gestione === true} demo:${r.is_demo === true} | ${r.prodotto} / ${r.offerta} | opz: ${String((r.dettagli || {}).Opzioni || "—").slice(0, 40)} | ${r.venditore}`);
    });

    // ── 2. Cosa vede il MOTORE (stesso loader del widget) ──────────────────
    const [rvf, tvf] = await Promise.all([
        caricaContrattiMese("Vodafone", "2026-08-01"),
        caricaTabellareAzienda("vodafone", "2026-08-01"),
    ]);
    const magl = rvf.filter(c => /^magliana/i.test(String(c.negozio || "")));
    const maglFissi = magl.filter(c => /fisso/i.test(String(c.categoria || "")));
    console.log(`\nFissi che ARRIVANO al motore (dopo perimetro gare + ora di scatto): ${maglFissi.length}`);
    for (const c of maglFissi) {
        const set = matchRigheAttivazione(tvf.righe, c, "vodafone");
        const pista = set.length ? set[0].pista : "—";
        console.log(`  · ${c.id.slice(0, 12)} ${String(c.data).slice(0, 10)} | ${c.prodotto} / ${c.offerta} | tipo:${c.tipo_cliente || "—"} → ${set.length ? `AGGANCIATO pista ${pista}, ${puntiPerRighe(set)} pt (${set.map(r => r.nome).join(" + ")})` : "❌ NESSUNA RIGA PAY"}`);
    }
    // chi c'è nel DB ma NON arriva al motore?
    const idsMotore = new Set(rvf.map(c => c.id));
    const fuori = fissi.filter(r => !idsMotore.has(r.id));
    const oggiISO = new Date().toISOString().slice(0, 10);
    console.log(`\nFissi nel DB ma FUORI dal perimetro motore: ${fuori.length}`);
    fuori.forEach(r => {
        const annullata = /annull/i.test(r.stato || "");
        let motivo = "??";
        if (annullata) motivo = "annullata";
        else if (r.nascosta_gestione === true) motivo = "nascosta gestione";
        else if (r.is_demo === true) motivo = "demo";
        else if (String(r.data).slice(0, 10) === oggiISO) motivo = "vendita di OGGI (entra alle 19)";
        console.log(`  · ${r.id.slice(0, 12)} ${String(r.data).slice(0, 10)} stato:${r.stato} → motivo probabile: ${motivo}`);
    });

    // le righe base fisso del tabellare VF (per capire le condizioni)
    console.log(`\nRighe pista FISSO nel tabellare azienda VF:`);
    (tvf?.righe || []).filter(r => r.pista === "fisso").forEach(r => {
        console.log(`  · "${r.nome}" comp:${r.componente || "—"} punti:${r.punti ?? 0} cond: cat=${r.categoria || "*"} prod=${r.prodotto || "*"} off=${r.offerta || "*"} tipo=${r.tipo_cliente || "*"}`);
    });

    // ── 3. AUDIT RETE: quante vendite il motore NON aggancia (VF e W3)? ────
    for (const [label, brand, brandId] of [["Vodafone", "Vodafone", "vodafone"], ["WindTre", "WindTre", "windtre"]]) {
        const rws = brand === "Vodafone" ? rvf : await caricaContrattiMese(brand, "2026-08-01");
        const tab = brand === "Vodafone" ? tvf : await caricaTabellareAzienda(brandId, "2026-08-01");
        const scarti = new Map();
        let ok = 0;
        rws.forEach(c => {
            const set = matchRigheAttivazione(tab.righe, c, brandId);
            if (set.length) { ok++; return; }
            const k = `${c.categoria} | ${c.prodotto} | ${c.offerta}`;
            scarti.set(k, (scarti.get(k) || 0) + 1);
        });
        const nScarti = [...scarti.values()].reduce((a, b) => a + b, 0);
        console.log(`\n■ ${label}: ${rws.length} vendite nel perimetro → agganciate ${ok}, SENZA riga pay ${nScarti}`);
        [...scarti.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, n]) => console.log(`   ${n}× ${k}`));
    }
}
main().catch(e => { console.error("ERRORE:", e); process.exit(1); });
