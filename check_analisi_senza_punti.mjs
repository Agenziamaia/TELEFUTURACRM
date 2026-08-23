// DIAGNOSI «⚠ 142 senza punti» nella carta Wind3 di Analisi (Luca 23/08).
// Replica ESATTA di arricchisci() in analisi/page.tsx per il perimetro W3 del
// mese: senzaRiga = nessuna riga agganciata da matchRigheAttivazione (che per
// regola SALTA le righe pista partnership). Poi spacca i senza-punti:
// quanti agganciano una riga PARTNERSHIP (CB a punti) e quanti sono orfani veri.
// Uso: npx tsx check_analisi_senza_punti.mjs   (sola lettura, nessuna scrittura)
import { readFileSync } from "fs";

const env = readFileSync(new URL("./.env.local", import.meta.url), "utf8");
for (const riga of env.split("\n")) {
    const m = riga.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
}

async function main() {
    const { caricaContrattiMese, caricaTabellare, caricaTabellareAzienda, matchRigheAttivazione, matchRigaPartnership, brandIdDaLabel } =
        await import("./src/lib/commissioning");
    const YM = "2026-08-01";   // stesso formato di mesiISO in analisi/page.tsx
    const [rw3, tw3, aw3] = await Promise.all([
        caricaContrattiMese("WindTre", YM),
        caricaTabellare("windtre", YM),
        caricaTabellareAzienda("windtre", YM),   // le righe PARTNERSHIP vivono qui
    ]);
    console.log(`Contratti W3 ${YM}: ${rw3.length} · righe ragazzi: ${tw3.righe.length} (partnership: ${tw3.righe.filter((r) => r.pista === "partnership").length}) · righe azienda: ${aw3?.righe.length ?? 0} (partnership: ${aw3?.righe.filter((r) => r.pista === "partnership").length ?? 0})`);

    const senza = [];
    let conPunti = 0;
    const perPista = new Map();
    for (const c of rw3) {
        const set = matchRigheAttivazione(tw3.righe, c, brandIdDaLabel(c.brand) || "windtre");
        if (set.length) {
            conPunti++;
            const p = set[0]?.pista || "?";
            perPista.set(p, (perPista.get(p) || 0) + 1);
        } else senza.push(c);
    }
    console.log(`\nCon punti (piste ragazzi): ${conPunti} · ⚠ SENZA punti: ${senza.length}`);
    console.log("con punti per pista:", [...perPista.entries()].map(([k, n]) => `${k}=${n}`).join(" · "));

    // TRIANGOLO = SOLO ANOMALIE VERE (Luca 23/08): fuori telefoni a rate
    // (GA pay-only + CB in Partnership) e assicurazioni (target di gruppo)
    const altreRegole = senza.filter((c) => /^telefono a rate/i.test(String(c.categoria || ""))
        || /assicurazion/i.test(String(c.prodotto || "") + " " + String(c.categoria || "")));
    console.log(`in altre regole (telefoni + assicurazioni, esclusi dal triangolo): ${altreRegole.length}`);
    console.log(`⚠ TRIANGOLO ATTESO dopo la regola: ${senza.length - altreRegole.length}`);

    // spacco dei senza-punti: partnership (righe AZIENDA) vs orfani veri
    const righePr = aw3?.righe || [];
    const conPr = [];
    const orfani = [];
    for (const c of senza) {
        const r = matchRigaPartnership(righePr, c);
        if (r) conPr.push({ c, r });
        else orfani.push(c);
    }
    let prPunti = 0;
    for (const { r } of conPr) prPunti += Number(r.punti) || 0;
    console.log(`di cui AGGANCIANO una riga Partnership (CB a punti): ${conPr.length} → ${prPunti} pt CB`);
    console.log(`di cui ORFANI VERI (nessuna riga, nemmeno partnership): ${orfani.length}`);

    const raggruppa = (lista, chiave) => {
        const m = new Map();
        for (const x of lista) {
            const k = chiave(x);
            m.set(k, (m.get(k) || 0) + 1);
        }
        return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };

    console.log(`\n── Partnership-match per riga agganciata ──`);
    for (const [k, n] of raggruppa(conPr, (x) => `${x.r.categoria || "—"} · ${x.r.prodotto || "—"} (${x.r.punti} pt)`)) {
        console.log(`  ${String(n).padStart(4)} × ${k}`);
    }

    console.log(`\n── ORFANI VERI per categoria · prodotto · offerta ──`);
    for (const [k, n] of raggruppa(orfani, (c) => `${c.categoria || "—"} · ${c.prodotto || "—"} · ${c.offerta || "—"} · ${c.tipo_cliente || "cons"}`)) {
        console.log(`  ${String(n).padStart(4)} × ${k}`);
    }

    // controprova sul totale eventi partnership della rete (atteso ~164 = 886pt al 21/08)
    let evTot = 0, ptTot = 0;
    for (const c of rw3) {
        const r = matchRigaPartnership(righePr, c);
        if (r) { evTot++; ptTot += Number(r.punti) || 0; }
    }
    console.log(`\nControprova Partnership su TUTTO il perimetro (righe azienda): ${evTot} eventi = ${ptTot} pt`);
}
main().catch((e) => { console.error("ERRORE:", e.message); process.exit(1); });
