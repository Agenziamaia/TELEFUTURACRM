import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { negoziVisibiliDi } from "@/lib/visibleStoresServer";
import { sameStore } from "@/lib/negoziNomi";

/* ═══ CHI VEDE QUALE CONTO (Luca 31/08) ═══════════════════════════════════
   «L'amministrativo deve vederle tutte, ma gli altri negozi ognuno deve
   vedere il suo. Ho fatto login con Emanuele, che è lo store manager di
   Magliana, e lui vede i due conti in sospeso che sono di Donna Olimpia.»

   Era vero, ed era peggio di così: questa rotta si fidava del `?negozio=`
   che le arrivava. Non c'era NESSUN controllo su chi stesse chiedendo —
   bastava cambiare una parola nell'indirizzo per leggere i conti aperti di
   un altro punto vendita, col nome del cliente e l'importo; e il PATCH
   chiudeva o annullava per `id`, senza guardare di chi fosse.

   La regola giusta esiste già ed è scritta in `visibleStoresServer.ts`, che
   comincia proprio così: «una schermata che filtra bene protegge lo SCHERMO,
   non il DATO». Qui il varco stava a monte e non era mai stato messo.

   `sameStore` e non l'uguale secco: lo stesso negozio è scritto in modi
   diversi nel database. */
async function filtroNegozi(userId: string) {
    const v = await negoziVisibiliDi(userId);
    return (n: string | null | undefined) =>
        v.tutti || v.negozi.some((x) => sameStore(x, n || ""));
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Conti in sospeso (spec Francesco): la vendita è registrata ma lo scontrino si fa
// DOPO (il cliente torna a pagare). Qui si SALVA il conto (POST), si LISTA per negozio
// (GET) e si CHIUDE quando completato o annullato (PATCH). Lo scontrino/incasso vero
// avviene poi riaprendo il modale Incasso & Scontrino con questi items.

// POST { negozio, cliente?, items:[...], totale?, azienda?, note?, createdBy? }
export async function POST(req: Request) {
    let _s: { id: string; role: string; exp: number };
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    {
        // 🔒 sessione firmata + permesso della sezione, come nel pannello
        const _g = await accesso(req, "vendita/sospendi");
        if (!_g.ok) return _g.risposta;
        _s = _g.sess;
    }

    const b: any = await req.json().catch(() => ({}));
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) return NextResponse.json({ error: "nessuna voce da sospendere" }, { status: 400 });
    // e non si lascia un conto aperto sul bancone di qualcun altro
    if (b.negozio && !(await filtroNegozi(_s.id))(b.negozio))
        return NextResponse.json({ error: "non puoi sospendere un conto per questo punto vendita" }, { status: 403 });
    const { data, error } = await supabase.from("vendite_sospese").insert({
        negozio: b.negozio ?? null,
        cliente: b.cliente ?? null,
        items,
        totale: b.totale != null ? Number(b.totale) : null,
        azienda: b.azienda ?? null,
        note: b.note ?? null,
        created_by: b.createdBy ?? null,
        stato: "in_sospeso",
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
}

// GET ?negozio=Donna → conti in sospeso aperti del negozio (per il pulsante rosso).
export async function GET(req: Request) {
    let _s: { id: string; role: string; exp: number };
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    {
        // 🔒 sessione firmata + permesso della sezione, come nel pannello
        const _g = await accesso(req, "vendita/sospendi");
        if (!_g.ok) return _g.risposta;
        _s = _g.sess;
    }

    const { searchParams } = new URL(req.url);
    const negozio = searchParams.get("negozio");
    const puo = await filtroNegozi(_s.id);
    const { data, error } = await supabase.from("vendite_sospese")
        .select("id, negozio, cliente, items, totale, azienda, note, created_by, created_at")
        .eq("stato", "in_sospeso").order("created_at", { ascending: false }).limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    /* PRIMA il perimetro di chi chiede, POI l'eventuale negozio richiesto — e
       il negozio richiesto vale solo se rientra nel perimetro. Se non ci
       rientra non si risponde vuoto: si risponde con quello che quella
       persona può vedere davvero, che è la cosa utile al banco. */
    const miei = (data || []).filter((r) => puo(r.negozio));
    const sospesi = negozio && miei.some((r) => sameStore(r.negozio, negozio))
        ? miei.filter((r) => sameStore(r.negozio, negozio))
        : miei;
    return NextResponse.json({ ok: true, sospesi });
}

// PATCH { id, stato: "completata" | "annullata" } → chiude il conto in sospeso.
export async function PATCH(req: Request) {
    let _s: { id: string; role: string; exp: number };
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    {
        // 🔒 sessione firmata + permesso della sezione, come nel pannello
        const _g = await accesso(req, "vendita/sospendi");
        if (!_g.ok) return _g.risposta;
        _s = _g.sess;
    }

    const b: any = await req.json().catch(() => ({}));
    if (!b.id) return NextResponse.json({ error: "id richiesto" }, { status: 400 });
    /* SI CHIUDE SOLO QUELLO CHE SI PUÒ VEDERE. Qui si aggiornava per `id` e
       basta: chiunque avesse un id poteva annullare il conto aperto di un
       altro negozio — cioè far sparire dallo schermo del collega i soldi che
       deve ancora incassare, senza che nessuno se ne accorgesse. */
    const { data: riga } = await supabase.from("vendite_sospese")
        .select("negozio").eq("id", b.id).maybeSingle();
    if (!riga) return NextResponse.json({ error: "conto non trovato" }, { status: 404 });
    if (!(await filtroNegozi(_s.id))(riga.negozio))
        return NextResponse.json({ error: "questo conto non è del tuo punto vendita" }, { status: 403 });
    const stato = b.stato === "annullata" ? "annullata" : "completata";
    const { error } = await supabase.from("vendite_sospese")
        .update({ stato, completed_at: new Date().toISOString() }).eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
