// CHECK (solo lettura) — Luca 21/08: episodi di malus maturati mentre la
// persona era in FERIE APPROVATE. Stima: giorni di ferie dentro la finestra
// dell'episodio che il vecchio conteggio ha contato come aperti (lun-sab,
// non festivi, negozio non chiuso) × malus_euro. Nessuna scrittura.
const { readFileSync } = require("fs");
const env = readFileSync(new URL("./.env.local", "file://" + __dirname + "/"), "utf8");
for (const r of env.split("\n")) { const m = r.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim(); }
const U = process.env.NEXT_PUBLIC_SUPABASE_URL, K = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: K, Authorization: "Bearer " + K };
const q = (p) => fetch(U + "/rest/v1/" + p, { headers: H }).then((x) => x.json());
const ymd = (d) => { const p2 = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };

(async () => {
    const [eps, ute, fer, fest, chius] = await Promise.all([
        q("malus_storico?select=*&limit=5000"),
        q("app_users?select=id,full_name,status"),
        q("vacation_requests?select=user_id,date_from,date_to,status,tipo&limit=2000"),
        q("giorni_festivi?select=giorno"),
        q("chiusure_negozio?select=store,dal,al&limit=500").then((r) => Array.isArray(r) ? r : []),
    ]);
    const idNome = Object.fromEntries(ute.map((u) => [u.id, u.full_name]));
    const feriePer = {};
    fer.filter((f) => /approv/i.test(String(f.status || "")) && String(f.tipo || "ferie") !== "corsi")
        .forEach((f) => { const n = idNome[f.user_id]; if (!n) return; (feriePer[n] = feriePer[n] || []).push({ dal: String(f.date_from).slice(0, 10), al: String(f.date_to).slice(0, 10) }); });
    const festivi = new Set(fest.map((f) => String(f.giorno).slice(0, 10)));
    const norm = (s) => String(s || "").trim().toLowerCase();
    const stessoNeg = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)); };
    const negChiuso = (iso, negozio) => chius.some((c) => stessoNeg(c.store, negozio) && iso >= String(c.dal).slice(0, 10) && iso <= String(c.al).slice(0, 10));

    let toccati = 0, totAttuale = 0, totRiduzione = 0;
    const perPersona = {};
    for (const e of eps) {
        if (e.eliminato) continue;
        const ferie = feriePer[e.venditore];
        if (!ferie?.length) continue;
        // finestra di maturazione: (inizio − eccedenza? no: contiamo dentro
        // [inizio..fine] — è lì che i giorni sono stati fatturati)
        const da = new Date(String(e.data_inizio).slice(0, 10) + "T12:00:00");
        const a = e.data_fine ? new Date(String(e.data_fine).slice(0, 10) + "T12:00:00") : new Date();
        let gFerie = 0;
        const cur = new Date(da);
        while (cur <= a) {
            const iso = ymd(cur);
            const inFerie = ferie.some((p) => iso >= p.dal && iso <= p.al);
            if (inFerie && cur.getDay() !== 0 && !festivi.has(iso) && !negChiuso(iso, e.negozio)) gFerie++;
            cur.setDate(cur.getDate() + 1);
        }
        if (!gFerie) continue;
        const riduzione = Math.min(Number(e.importo) || 0, gFerie * (Number(e.malus_euro) || 0));
        if (riduzione <= 0) continue;
        toccati++;
        totAttuale += Number(e.importo) || 0;
        totRiduzione += riduzione;
        const k = e.venditore || "—";
        (perPersona[k] = perPersona[k] || { n: 0, attuale: 0, riduzione: 0, esempi: [] });
        perPersona[k].n++; perPersona[k].attuale += Number(e.importo) || 0; perPersona[k].riduzione += riduzione;
        if (perPersona[k].esempi.length < 3) perPersona[k].esempi.push(`${e.contract_id} ${e.data_inizio}→${e.data_fine || "in corso"} ${gFerie}gg ferie −${riduzione}€ (stato ${e.stato})`);
    }
    console.log(`EPISODI TOCCATI DA FERIE: ${toccati} · importo attuale ${Math.round(totAttuale)}€ · riduzione stimata −${Math.round(totRiduzione)}€\n`);
    Object.entries(perPersona).sort((x, y) => y[1].riduzione - x[1].riduzione).forEach(([n, v]) => {
        console.log(`${n}: ${v.n} episodi · ${Math.round(v.attuale)}€ → stima −${Math.round(v.riduzione)}€`);
        v.esempi.forEach((s) => console.log(`   ${s}`));
    });
    if (!toccati) console.log("Nessun episodio sovrapposto a ferie approvate: niente backfill necessario. ✅");
})();
