import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { isAdminOrAbove } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ I PALLINI DEL MAGAZZINO ════════════════════════════════════════════════
 *
 * Luca 03/09: «a fianco a Trasferimenti deve comparire una notifica stile CRM,
 * quel classico viola, nel momento in cui stai ricevendo un trasferimento. E
 * deve comparire un pallino rosso che bippa nel momento in cui c'è un problema
 * su un trasferimento di cui tu sei il mittente, e deve bippare rosso anche
 * sul destinatario… e questo problema deve risultare bippando di rosso anche
 * al reparto amministrativo. Ora, non deve bippare rosso solamente ai
 * trasferimenti: deve bippare rosso anche il suo hub di Magazzino, così che
 * dall'esterno, anche se non apro Magazzino, lo vedo».
 *
 * Due numeri, due colori, due domande diverse:
 *   · VIOLA  — «sta arrivando roba»: quanti documenti sono in viaggio verso di
 *              me e aspettano che li prenda in carico. È un promemoria.
 *   · ROSSO  — «qualcosa non torna»: quanti trasferimenti che mi riguardano
 *              hanno un problema aperto. È una chiamata.
 *
 * ── CHI VEDE COSA ──────────────────────────────────────────────────────────
 * Un negozio vede i suoi: quelli che riceve (viola) e quelli che riceve O che
 * ha mandato con un problema (rosso). L'amministrazione vede tutti i problemi,
 * perché è quella che li risolve quando i due negozi non si parlano.
 *
 * ── IL LOCALE, NON L'INSEGNA ───────────────────────────────────────────────
 * «Magliana W3» e «Magliana Multi» sono un banco solo: chi lavora all'uno
 * vede la merce dell'altro, perché fisicamente è lo stesso scaffale. Il
 * confronto si fa sulla prima parola, che è la regola che il database usa già
 * nelle sue policy.
 * ═══════════════════════════════════════════════════════════════════════════ */

const locale = (n: string) => String(n || "").trim().split(/\s+/)[0].toLowerCase();

export async function GET(req: Request) {
    let _s: { id: string; role: string; exp: number };
    {
        const _g = await accesso(req, "magazzino");
        if (!_g.ok) return _g.risposta;
        _s = _g.sess;
    }
    const { data: io } = await supabase.from("app_users")
        .select("id, role, active, primary_store").eq("id", _s.id).maybeSingle();
    if (!io || io.active === false) return NextResponse.json({ ok: true, inArrivo: 0, problemi: 0 });

    const admin = isAdminOrAbove(String(io.role || ""));

    /* I NEGOZI DI CHI CHIEDE. `user_stores` è l'elenco vero; `primary_store`
       resta come rete di sicurezza per chi ha solo quello. */
    const { data: us } = await supabase.from("user_stores").select("store_name").eq("user_id", io.id);
    const miei = new Set<string>();
    (us ?? []).forEach((r: { store_name: string | null }) => { if (r.store_name) miei.add(locale(r.store_name)); });
    if (io.primary_store) miei.add(locale(String(io.primary_store)));

    /* SI LEGGE POCO E SI CONTA QUI. Il pallino lo chiedono tutti ogni due
       minuti: una query che torna quattro colonne dei soli documenti aperti
       costa meno di tre `count` separati con dei filtri per negozio che
       PostgREST non sa esprimere sul «locale». */
    /* IL CONTO DEI RITARDI SI FA QUI, che è il posto dove tutti passano ogni
       due minuti: così gli episodi sono sempre di oggi senza bisogno di un
       cron che qualcuno deve ricordarsi di guardare. La funzione è
       idempotente — un episodio per documento e per persona — quindi quindici
       browser che chiedono insieme scrivono le stesse righe, non quindici. */
    /* SE IL MOTORE SI ROMPE LO SI DEVE SAPERE: prima l'errore veniva buttato
       via e il malus semplicemente smetteva di maturare, in silenzio. */
    const { error: errMaturazione } = await supabase.rpc("mag_matura_ritardi");
    if (errMaturazione) console.error("[avvisi] maturazione ritardi fallita:", errMaturazione.message);

    const { data: dd, error } = await supabase.from("mag_ddt")
        .select("da_negozio, a_negozio, stato, creato_il, problema_il, problema_chiuso_il")
        .in("stato", ["in_transito", "parziale"])
        .limit(2000);
    if (error) return NextResponse.json({ ok: false, inArrivo: 0, problemi: 0, ritardo: 0, avviso: 0 }, { status: 200 });

    /* LA SCALA DEL PATTO (Luca 03/09): sei giorni lavorativi per accettare, dal
       quarto lampeggia arancione, dal settimo diventa rosso e costa 5 €/giorno.
       I giorni li conta il database — sa quali negozi aprono la domenica e
       quali sono i festivi — e li si chiede in blocco per non fare una query
       per documento. */
    const { data: reg } = await supabase.from("mag_trasferimenti_regole")
        .select("giorni_avviso, giorni_max, decorrenza").eq("id", 1).maybeSingle();
    const r = reg as { giorni_avviso: number; giorni_max: number; decorrenza: string | null } | null;

    let inArrivo = 0, problemi = 0, ritardo = 0, avviso = 0;
    type Riga = { da_negozio: string; a_negozio: string; stato: string; creato_il: string; problema_il: string | null; problema_chiuso_il: string | null };
    const aperti = (dd ?? []) as Riga[];

    /* i giorni lavorativi di ogni documento, in una chiamata sola */
    const giorni = new Map<number, number>();
    if (r?.decorrenza) {
        const q = aperti.map((d, i) => ({ i, negozio: d.a_negozio, da: d.creato_il.slice(0, 10) > r.decorrenza! ? d.creato_il.slice(0, 10) : r.decorrenza! }));
        const { data: gg } = await supabase.rpc("mag_giorni_lavorativi_molti", { p_righe: q });
        ((gg ?? []) as { i: number; n: number }[]).forEach(x => giorni.set(x.i, x.n));
    }

    aperti.forEach((d, i) => {
        const mioDest = miei.has(locale(d.a_negozio));
        const mioMitt = miei.has(locale(d.da_negozio));
        const guasto = !!d.problema_il && !d.problema_chiuso_il;
        if (mioDest && d.stato === "in_transito") inArrivo++;
        /* IL ROSSO DEL PROBLEMA ARRIVA A TUTTI E TRE: chi manda, chi riceve, e
           chi in mezzo ci deve mettere una pezza. */
        if (guasto && (admin || mioDest || mioMitt)) problemi++;
        /* IL RITARDO NO: quello è del negozio che deve accettare, e basta
           (Luca: «qui il pallino è solo per il negozio oggetto di problema»).
           E chi ha segnalato un problema è fuori: è l'uscita di sicurezza. */
        if (!mioDest || guasto || !r?.decorrenza) return;
        const n = giorni.get(i) ?? 0;
        if (n > r.giorni_max) ritardo++;
        else if (n >= r.giorni_avviso) avviso++;
    });

    return NextResponse.json({ ok: true, inArrivo, problemi, ritardo, avviso });
}
