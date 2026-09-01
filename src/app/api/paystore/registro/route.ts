import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { leggiRicaricaDaProdotto, eRicaricaSenzaNumero, nomeOperatoreCorto } from "@/lib/paystore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ IL REGISTRO PAYSTORE, LATO AMMINISTRAZIONE ═══════════════════════════
   Due cose che dal browser non si possono fare da sole:
   • LEGGERE le ricariche vendute — la tabella è revocata ad anon e
     authenticated perché contiene i numeri di cellulare dei clienti;
   • CAMBIARE i tagli — sono configurazione, e dal browser sono in sola
     lettura (un utente qualunque non deve poter svuotare il listino).

   ⚠️ IL PERIODO E IL CONFRONTO SI CALCOLANO QUI, come per la spesa dell'AI:
   la schermata mostra numeri, non li costruisce. */

type Riga = {
    id: string; creata_il: string; negozio: string | null; venditore: string | null;
    operatore: string; operatore_nome: string | null; numero: string;
    taglio: string | null; importo: number; stato: string; errore: string | null;
    /* con quale partita IVA è stata fatturata. Vuota quando il carrello era
       misto: lì la società la decide la merce, e la sa solo lo scontrino. */
    azienda: string | null;
};

const giorno = (iso: string) => iso.slice(0, 10);

function giorniFra(da: string, a: string): string[] {
    const out: string[] = [];
    const d = new Date(da + "T00:00:00Z"), fine = new Date(a + "T00:00:00Z");
    while (d <= fine) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
    return out.slice(-186);
}

async function recuperaScontrinate(da: string, a: string) {
    try {
        const { data: vendite } = await supabase.from("contracts")
            .select("id, prodotto, negozio, venditore, created_at, dettagli")
            .ilike("prodotto", "Ricarica%")
            .gte("created_at", da + "T00:00:00Z").lte("created_at", a + "T23:59:59Z")
            .limit(5000);
        if (!vendite?.length) return;

        const ids = vendite.map((v) => v.id);
        const { data: gia } = await supabase.from("paystore_ricariche").select("contract_id").in("contract_id", ids);
        const visti = new Set((gia || []).map((r) => r.contract_id));

        const nuove = [];
        for (const v of vendite) {
            if (visti.has(v.id)) continue;
            const d = leggiRicaricaDaProdotto(v.prodotto);
            /* ⚠️ ANCHE QUELLE SENZA NUMERO. «Ricarica Vodafone» venduta dal
               listino invece che dal pannello è una ricarica pagata di cui
               nessuno sa il numero: nasconderla non la fa sparire, la lascia
               solo senza nessuno che se ne occupi. Entra con il numero vuoto,
               e nella schermata si vede che è da completare. */
            const senzaNum = d ? null : eRicaricaSenzaNumero(v.prodotto);
            if (!d && !senzaNum) continue;                 // un caricatore da muro non è una ricarica
            const dett = (v.dettagli || {}) as { importo?: number; price?: number };
            const importo = Number(dett.importo ?? dett.price ?? d?.importo ?? 0);
            if (!(importo > 0)) continue;
            nuove.push({
                creata_il: v.created_at, negozio: v.negozio, venditore: v.venditore,
                operatore: d?.operatore || senzaNum, operatore_nome: d?.operatoreNome || nomeOperatoreCorto(senzaNum || ""),
                numero: d?.numero || "", importo, stato: "da_fare", contract_id: v.id,
                nota: d ? "ripresa dalla vendita scontrinata" : "venduta senza numero: da completare a mano",
            });
        }
        if (nuove.length) await supabase.from("paystore_ricariche").insert(nuove);
    } catch (e) {
        // il recupero è un aiuto, non un prerequisito: se non riesce, la
        // schermata mostra quello che c'è invece di non aprirsi
        console.error("[paystore] recupero delle scontrinate non riuscito:", String((e as Error)?.message || e));
    }
}

export async function GET(request: Request) {
    const g = await accesso(request, "paystore");
    if (!g.ok) return g.risposta;

    const q = new URL(request.url).searchParams;
    const oggi = new Date().toISOString().slice(0, 10);
    const da = (q.get("da") || oggi.slice(0, 8) + "01").slice(0, 10);
    const a = (q.get("a") || oggi).slice(0, 10);
    const negozio = q.get("negozio") || "";
    const operatore = q.get("operatore") || "";

    /* il periodo PRECEDENTE di pari lunghezza: «quante ne facevamo prima» è
       metà della risposta a «quante ne facciamo» */
    const nGiorni = Math.max(1, giorniFra(da, a).length);
    const primaFine = new Date(new Date(da + "T00:00:00Z").getTime() - 86400000).toISOString().slice(0, 10);
    const primaInizio = new Date(new Date(primaFine + "T00:00:00Z").getTime() - (nGiorni - 1) * 86400000).toISOString().slice(0, 10);

    /* ═══ IL REGISTRO SI RIPARA DA SOLO ═════════════════════════════════
       Luca, primo giorno di vendite: «devo vedere TUTTE le ricariche che
       vengono scontrinate. E invece non ce le ho.»

       La fonte certa di cosa è stato scontrinato è `contracts`: quella riga
       si scrive nella stessa operazione della vendita. Il registro è una
       scrittura IN PIÙ, fatta da una seconda chiamata — e una seconda
       chiamata può fallire: il primo giorno è successo davvero, per una
       colonna dichiarata `uuid` quando gli id dei contratti sono testo, e il
       registro è rimasto vuoto mentre i negozi vendevano.

       Perciò qui, prima di leggere, si guarda se c'è qualcosa di scontrinato
       che non ha la sua riga, e gliela si dà. Costa una query e toglie di
       mezzo per sempre la domanda «perché manca?». */
    await recuperaScontrinate(da, a);

    const campi = "id, creata_il, negozio, venditore, operatore, operatore_nome, numero, taglio, importo, stato, errore, azienda, nota, stato_da, stato_il";
    const [{ data: righe }, { data: prima }, { data: tagli }] = await Promise.all([
        supabase.from("paystore_ricariche").select(campi)
            .gte("creata_il", da + "T00:00:00Z").lte("creata_il", a + "T23:59:59Z")
            .order("creata_il", { ascending: false }).limit(20000),
        supabase.from("paystore_ricariche").select("importo")
            .gte("creata_il", primaInizio + "T00:00:00Z").lte("creata_il", primaFine + "T23:59:59Z").limit(20000),
        supabase.from("paystore_tagli").select("id, operatore, etichetta, valore, ordine, attivo, origine").order("operatore").order("ordine"),
    ]);

    let R = (righe || []) as Riga[];
    if (negozio) R = R.filter((r) => r.negozio === negozio);
    if (operatore) R = R.filter((r) => r.operatore === operatore);

    const somma = (l: { importo: number }[]) => l.reduce((s, r) => s + Number(r.importo || 0), 0);

    const perGiorno = giorniFra(da, a).map((gg) => {
        const d = R.filter((r) => giorno(r.creata_il) === gg);
        const ops = [...new Set(d.map((r) => r.operatore))];
        return {
            giorno: gg, quante: d.length, euro: somma(d),
            parti: ops.map((o) => ({
                operatore: o,
                nome: d.find((r) => r.operatore === o)?.operatore_nome || o,
                quante: d.filter((r) => r.operatore === o).length,
                euro: somma(d.filter((r) => r.operatore === o)),
            })).sort((x, y) => y.euro - x.euro),
        };
    });

    const perOperatore = [...new Set(R.map((r) => r.operatore))].map((o) => {
        const d = R.filter((r) => r.operatore === o);
        return { operatore: o, nome: d[0]?.operatore_nome || o, quante: d.length, euro: somma(d) };
    }).sort((x, y) => y.euro - x.euro);

    const perNegozio = [...new Set(R.map((r) => r.negozio || "—"))].map((n) => {
        const d = R.filter((r) => (r.negozio || "—") === n);
        return { negozio: n, quante: d.length, euro: somma(d) };
    }).sort((x, y) => y.euro - x.euro);

    return NextResponse.json({
        ok: true, da, a, negozio, operatore,
        totale: { quante: R.length, euro: somma(R), euroPrima: somma((prima || []) as { importo: number }[]) },
        /* ⚠️ QUELLE DA GUARDARE, in cima e contate a parte: una ricarica
           incassata e non erogata è l'unica ragione per cui uno apre questa
           schermata di fretta. */
        daGuardare: R.filter((r) => r.stato === "da_fare" || r.stato === "fallita"),
        perStato: [...new Set(R.map((r) => r.stato))].map((s) => ({ stato: s, quante: R.filter((r) => r.stato === s).length })),
        perGiorno, perOperatore, perNegozio,
        ultime: R.slice(0, 200),
        negozi: [...new Set((righe || []).map((r) => r.negozio).filter(Boolean))],
        operatori: [...new Set((righe || []).map((r) => r.operatore))],
        tagli: tagli || [],
    });
}

/* ── I TAGLI ────────────────────────────────────────────────────────────────
   Si cambiano da qui e non dal browser. `origine` resta 'manuale': quando
   arriverà l'API del fornitore, le righe che riscrive lei nasceranno 'api' e
   si vedrà a colpo d'occhio quali sono state messe a mano. */
export async function POST(request: Request) {
    const g = await accesso(request, "paystore");
    if (!g.ok) return g.risposta;

    let b: { azione?: string; id?: string; operatore?: string; etichetta?: string; valore?: number; ordine?: number; attivo?: boolean; stato?: string; nota?: string; numero?: string };
    try { b = await request.json(); } catch { return NextResponse.json({ error: "corpo non valido" }, { status: 400 }); }

    if (b.azione === "spegni" || b.azione === "accendi") {
        if (!b.id) return NextResponse.json({ error: "id mancante" }, { status: 400 });
        const { error } = await supabase.from("paystore_tagli")
            .update({ attivo: b.azione === "accendi", aggiornato_il: new Date().toISOString() }).eq("id", b.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
    }

    if (b.azione === "salva") {
        const valore = Number(b.valore);
        if (!b.operatore || !String(b.etichetta || "").trim() || !(valore > 0))
            return NextResponse.json({ error: "servono operatore, etichetta e un importo maggiore di zero" }, { status: 400 });
        const riga = {
            operatore: String(b.operatore), etichetta: String(b.etichetta).trim(),
            valore, ordine: Number(b.ordine) || 0, attivo: b.attivo !== false,
            origine: "manuale", aggiornato_il: new Date().toISOString(),
        };
        const { error } = b.id
            ? await supabase.from("paystore_tagli").update(riga).eq("id", b.id)
            : await supabase.from("paystore_tagli").upsert(riga, { onConflict: "operatore,etichetta" });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
    }

    /* ⚠️ LO STATO SI CAMBIA A MANO, e finché le ricariche si fanno sul
       terminale del fornitore è l'unico modo che c'è: «fatta» è la parola di
       una persona, quindi resta scritto chi l'ha detta e quando. Con l'API
       collegata lo scriverà il motore, e questi pulsanti resteranno per i
       casi che l'API non copre. */
    if (b.azione === "stato") {
        if (!b.id || !["da_fare", "fatta", "fallita", "annullata"].includes(String(b.stato)))
            return NextResponse.json({ error: "stato non valido" }, { status: 400 });
        const { data: chi } = await supabase.from("app_users").select("full_name").eq("id", g.sess.id).maybeSingle();
        const { error } = await supabase.from("paystore_ricariche").update({
            stato: b.stato, stato_da: chi?.full_name || g.sess.id, stato_il: new Date().toISOString(),
            ...(b.nota !== undefined ? { nota: b.nota || null } : {}),
        }).eq("id", b.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
    }

    /* il numero mancante si può scrivere qui: una ricarica venduta dal
       listino non ce l'ha, e senza numero nessuno la può eseguire */
    if (b.azione === "numero") {
        const num = String(b.numero || "").replace(/\D/g, "");
        if (!b.id || num.length < 7 || num.length > 11) return NextResponse.json({ error: "numero non valido" }, { status: 400 });
        const { error } = await supabase.from("paystore_ricariche").update({ numero: num }).eq("id", b.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
    }

    if (b.azione === "elimina") {
        if (!b.id) return NextResponse.json({ error: "id mancante" }, { status: 400 });
        const { error } = await supabase.from("paystore_tagli").delete().eq("id", b.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "azione sconosciuta" }, { status: 400 });
}
