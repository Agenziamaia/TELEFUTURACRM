// BONIFICA MALUS "RIENTRO FERIE" (Luca 23/08, caso Goretti).
// Il congelamento ferie è live dal 21/08: gli episodi NATI PRIMA maturavano
// anche nei giorni di ferie, e la bonifica del 21 ha tolto solo i giorni
// DENTRO il periodo — lasciando i residui del giorno di rientro (es. Goretti:
// 5 Vodafone con inizio 19/08, ultimo giorno di ferie, e 2 Sky col 20/08).
// REGOLA (modello di Luca): un malus può iniziare al rientro SOLO se la
// scadenza naturale cadeva il PRIMO giorno di ferie (episodio con inizio =
// dal); tutti gli episodi con inizio DENTRO le ferie (> dal) o sul primo
// giorno operativo di rientro sono artefatti → TOMBSTONE (la ricostruzione
// corretta, se una pratica è ancora ferma, rimetterà il malus alla data
// giusta: il tombstone blocca solo la stessa data d'inizio).
// Solo ferie CONCLUSE prima del 21/08 (dopo, il motore fa giusto da solo).
// Uso: node bonifica_malus_rientro.js [--apply]   (senza flag: solo recap)
const fs = require("fs");
const path = require("path");
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
    .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const APPLY = process.argv.includes("--apply");
const FEATURE_LIVE = "2026-08-21";   // congelamento ferie in produzione

// primo giorno NON domenica dopo `al` (festivi/chiusure trascurabili qui)
function rientroDopo(al) {
    const d = new Date(al + "T12:00");
    do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

(async () => {
    const [{ data: fer, error: e1 }, { data: ute, error: e2 }] = await Promise.all([
        sb.from("vacation_requests").select("user_id, employee_name, date_from, date_to, status, tipo"),
        sb.from("app_users").select("id, full_name"),
    ]);
    if (e1 || e2) { console.error("ERRORE query:", (e1 || e2).message); process.exit(1); }
    const nomeDi = Object.fromEntries((ute || []).filter(u => u.full_name).map(u => [u.id, u.full_name]));
    const periodi = (fer || [])
        .filter(f => /approv/i.test(String(f.status || "")) && String(f.tipo || "ferie") !== "corsi")
        .map(f => ({ nome: nomeDi[f.user_id] || f.employee_name, dal: String(f.date_from).slice(0, 10), al: String(f.date_to).slice(0, 10) }))
        .filter(p => p.nome && p.al < FEATURE_LIVE);   // solo ferie concluse pre-congelamento
    console.log(`Periodi di ferie approvati conclusi prima del ${FEATURE_LIVE}: ${periodi.length}`);

    const daTogliere = [];
    for (const p of periodi) {
        const rientro = rientroDopo(p.al);
        const { data: eps, error } = await sb.from("malus_storico")
            .select("id, contract_id, categoria, negozio, venditore, nominativo, data_inizio, data_fine, giorni, importo, stato, eliminato")
            .eq("venditore", p.nome).gt("data_inizio", p.dal).lte("data_inizio", rientro)
            .or("eliminato.is.null,eliminato.eq.false");
        if (error) { console.error("ERRORE episodi:", error.message); process.exit(1); }
        for (const e of (eps || [])) {
            if (e.stato === "compensato") continue;   // mai toccare i compensati
            daTogliere.push({ ...e, ferie: `${p.dal}→${p.al}`, rientro });
        }
    }

    if (!daTogliere.length) { console.log("Nessun residuo da bonificare. ✅"); return; }
    let tot = 0;
    console.log(`\n── RESIDUI DA TOMBSTONE (${daTogliere.length}) ──`);
    for (const e of daTogliere) {
        tot += Number(e.importo) || 0;
        console.log(`  ${e.venditore} · ${e.contract_id} · ${e.categoria} · inizio ${e.data_inizio} (ferie ${e.ferie}, rientro ${e.rientro}) · ${e.giorni}gg = ${e.importo}€ [${e.stato}]`);
    }
    console.log(`TOTALE da azzerare: ${Math.round(tot * 100) / 100}€`);

    if (!APPLY) { console.log("\n(recap — rilancia con --apply per applicare)"); return; }
    fs.writeFileSync(path.join(__dirname, "dump_malus_rientro_pre.json"), JSON.stringify(daTogliere, null, 2));
    let fatte = 0;
    for (const e of daTogliere) {
        const { error } = await sb.from("malus_storico").update({
            eliminato: true, eliminato_il: new Date().toISOString(),
            eliminato_da: "bonifica rientro ferie (23/08)",
            updated_at: new Date().toISOString(),
        }).eq("id", e.id);
        if (error) console.error("  FALLITO", e.id, error.message); else fatte++;
    }
    console.log(`\nApplicato: ${fatte}/${daTogliere.length} tombstone · dump in dump_malus_rientro_pre.json`);
})();
