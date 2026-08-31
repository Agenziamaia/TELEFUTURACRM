import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { negoziVisibiliDi, negoziVisibiliComeVisto } from "@/lib/visibleStoresServer";
import { sameStore, stessoMagazzino } from "@/lib/negoziNomi";

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
async function filtroNegozi(userId: string, come?: string | null) {
    const v = await negoziVisibiliComeVisto(userId, come);
    /* I GEMELLI SONO LO STESSO BANCONE (revisore 31/08). `sameStore` confronta
       per prefisso, e «Magliana Multi» non è prefisso di «Magliana W3»: cinque
       persone attive vedevano solo metà del proprio locale, e Alin che prova a
       parcheggiare un conto su «Magliana W3» si prendeva un 403 col carrello
       già salvato e la merce già scaricata. `stessoMagazzino` è la regola che
       esiste apposta, usata dovunque nel magazzino. */
    return (n: string | null | undefined) =>
        v.tutti || v.negozi.some((x) => sameStore(x, n || "") || stessoMagazzino(x, n || ""));
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
    /* IL NEGOZIO È OBBLIGATORIO, E DEVE ESISTERE (revisore 31/08). Il
       controllo era `if (b.negozio && …)`: con il campo vuoto saltava del
       tutto, e il conto nasceva senza negozio. Da lì in poi non lo vedeva più
       nessuno tranne l'amministrazione, e il banco che quei soldi li deve
       incassare si prendeva un 403 provando a chiuderlo. E il nome non è
       testo libero: passavano «M», «Magliana», «Donna Olimpia». */
    const neg = String(b.negozio || "").trim();
    if (!neg) return NextResponse.json({ error: "manca il punto vendita" }, { status: 400 });
    const { data: esiste } = await supabase.from("stores").select("name").eq("name", neg).maybeSingle();
    if (!esiste) return NextResponse.json({ error: `punto vendita sconosciuto: «${neg}»` }, { status: 400 });
    if (!(await filtroNegozi(_s.id))(neg))
        return NextResponse.json({ error: "non puoi sospendere un conto per questo punto vendita" }, { status: 403 });
    const { data, error } = await supabase.from("vendite_sospese").insert({
        negozio: neg,
        cliente: b.cliente ?? null,
        items,
        totale: b.totale != null ? Number(b.totale) : null,
        azienda: b.azienda ?? null,
        note: b.note ?? null,
        // dalla SESSIONE FIRMATA, mai dal corpo: era nullo su tutte le righe
        created_by: _s.id,
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
    /* «GUARDA COME»: il browser dice chi si sta simulando, il server lo onora
       solo per RESTRINGERE (vedi `negoziVisibiliComeVisto`). Serve a poterlo
       provare: senza, cambiando persona a schermo si continuava a vedere tutto
       e sembrava che il filtro non funzionasse. */
    const come = searchParams.get("comeUtente");
    const vis = await negoziVisibiliComeVisto(_s.id, come);
    const puo = await filtroNegozi(_s.id, come);
    /* IL TETTO STA DOPO IL PERIMETRO, NON PRIMA (revisore 31/08). Prendendo le
       200 più recenti di TUTTI i negozi e filtrando poi in memoria, con quindici
       punti vendita e conti che restano aperti per settimane l'ordinamento per
       data avrebbe tagliato via le più VECCHIE — cioè i soldi in giro da più
       tempo — facendole sparire da ogni schermo, compreso quello
       dell'amministrazione. Prima il filtro stava in SQL e le 200 erano per
       negozio: sarebbe stata una regressione visibile solo alla scala che
       stiamo per raggiungere. */
    let q = supabase.from("vendite_sospese")
        .select("id, negozio, cliente, items, totale, azienda, note, created_by, created_at")
        .eq("stato", "in_sospeso").order("created_at", { ascending: false }).limit(500);
    if (!vis.tutti) {
        if (!vis.negozi.length) return NextResponse.json({ ok: true, sospesi: [] });
        /* L'elenco SQL deve contenere anche i GEMELLI, se no il filtro fine di
           `puo` non li vedrebbe mai: la riga non sarebbe nemmeno stata letta.
           I nomi si prendono da `stores`, non si indovinano. */
        const { data: tuttiNeg } = await supabase.from("stores").select("name");
        const con = new Set<string>(vis.negozi);
        (tuttiNeg ?? []).forEach((r) => {
            const n = String(r.name || "");
            if (n && vis.negozi.some((x) => stessoMagazzino(x, n))) con.add(n);
        });
        q = q.in("negozio", [...con]);
    }
    const { data, error } = await q;
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
    /* SI CHIUDE UNA VOLTA SOLA (revisore 31/08). Senza `.eq("stato", …)` un
       conto già COMPLETATO — cioè incassato e scontrinato — poteva tornare
       «annullato», con la data di chiusura sovrascritta e nessun nome accanto.
       Su un registratore di cassa quello non è un refuso: è una vendita
       incassata che sparisce dai conti. */
    const { data: fatto, error } = await supabase.from("vendite_sospese")
        .update({ stato, completed_at: new Date().toISOString(), closed_by: _s.id })
        .eq("id", b.id).eq("stato", "in_sospeso").select("id");
    if (!error && !fatto?.length)
        return NextResponse.json({ error: "questo conto era già stato chiuso" }, { status: 409 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
