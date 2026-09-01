import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

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

    const campi = "id, creata_il, negozio, venditore, operatore, operatore_nome, numero, taglio, importo, stato, errore, azienda";
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
        daGuardare: R.filter((r) => r.stato === "da_inviare" || r.stato === "fallita"),
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

    let b: { azione?: string; id?: string; operatore?: string; etichetta?: string; valore?: number; ordine?: number; attivo?: boolean };
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

    if (b.azione === "elimina") {
        if (!b.id) return NextResponse.json({ error: "id mancante" }, { status: 400 });
        const { error } = await supabase.from("paystore_tagli").delete().eq("id", b.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "azione sconosciuta" }, { status: 400 });
}
