import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { eUnLavoroAutomatico } from "@/lib/cronParola";
import { avvisaSuWhatsApp } from "@/lib/waAvviso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ IL GUARDIANO DELLE CASSE ═══════════════════════════════════════════════
 *
 * PERCHÉ ESISTE (03/09/2026). La cassa Multi di Magliana è rimasta muta per
 * ore: l'agente di stampa non era ripartito dopo lo spegnimento serale. Il CRM
 * lo SAPEVA — il monitor lo dava «down» — ma quell'informazione non arrivava a
 * nessuno: dal banco «cassa spenta» e «CRM che non parla con la cassa» sono
 * indistinguibili, e ce ne si accorge quando un cliente ha già pagato.
 *
 * IL SEGNALE: non «l'agente non risponde» — di notte è normale, i PC sono
 * spenti e sveglierebbe qualcuno per niente — ma **una stampa ferma in coda**.
 * Se c'è un documento `pending` da più di qualche minuto vuol dire che
 * qualcuno ha provato a vendere e non è uscito niente: è un guasto a
 * qualunque ora, e non serve nessuna fascia oraria per capirlo. Se il negozio
 * è chiuso non c'è coda, quindi non c'è allarme.
 *
 * UN AVVISO PER EPISODIO, più quello di rientro. Un allarme che si ripete ogni
 * cinque minuti smette di essere letto alla terza volta: `pos_allarmi` tiene
 * l'episodio aperto e si riapre solo dopo che la cassa è tornata a stampare.
 *
 * Chiamato da pg_cron ogni 5 minuti. Accetta la parola dei lavori automatici
 * (`x-cron`); nessuna sessione, nessun utente.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** da quanti minuti un documento fermo in coda diventa un guasto */
const FERMO_DA_MIN = 5;

const euroOra = (d: Date) =>
    d.toLocaleString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });

export async function POST(request: Request) {
    if (!(await eUnLavoroAutomatico(request))) {
        return NextResponse.json({ error: "non autorizzato" }, { status: 401 });
    }
    const ora = Date.now();
    const sogliaISO = new Date(ora - FERMO_DA_MIN * 60000).toISOString();

    /* I NEGOZI CHE DEVONO STAMPARE. Chi non è in `pos_scontrino_negozi` non
       stampa per scelta (Registra Vendita salva e basta): non è un guasto. */
    const { data: abilitatiRows } = await supabase.from("pos_scontrino_negozi").select("negozio");
    const abilitati = new Set((abilitatiRows ?? []).map((r) => String(r.negozio)));

    /* LA CODA FERMA. `pending` = mai ritirato da un agente. Non guardo i `sent`:
       quelli sono stati presi in carico, e marcarli come guasto è il difetto
       opposto (un incasso che sparisce dal totale del giorno).
       ⚠️ FUORI GLI INCASSI CONTANTI (`cash_collect`), misurato ad Acilia il
       04/09: quei lavori restano in attesa di UNA PERSONA — il cliente che
       mette i soldi nella cassa automatica — e l'operatore li annulla di
       continuo quando il cliente cambia idea e paga con la carta. Ad Acilia
       ne risultano otto «falliti» in una mattina mentre la stessa cassa
       stampava scontrini regolarmente: contarli come guasto vuol dire far
       squillare il telefono del tecnico ogni giorno per niente, e un allarme
       che grida al lupo smette di essere letto. */
    const { data: fermi } = await supabase.from("print_jobs")
        .select("negozio, kind, created_at")
        .eq("status", "pending")
        .neq("kind", "cash_collect")
        .lt("created_at", sogliaISO)
        .order("created_at", { ascending: true })
        .limit(500);

    type Guasto = { negozio: string; quanti: number; daMin: number };
    const guasti = new Map<string, Guasto>();
    for (const j of fermi ?? []) {
        const neg = String(j.negozio || "");
        /* l'agente del negozio è quello scritto sul job (`pos_rt.agente`): può
           non coincidere col nome del punto vendita — a Magliana due agenti
           («Magliana W3», «Magliana Multi») per un solo `stores.name`. Se non
           è fra gli abilitati per nome esatto, si guarda la radice. */
        const abilitato = abilitati.has(neg) || [...abilitati].some((a) => neg.startsWith(a));
        if (!neg || !abilitato) continue;
        const g = guasti.get(neg) || { negozio: neg, quanti: 0, daMin: 0 };
        g.quanti++;
        g.daMin = Math.max(g.daMin, Math.round((ora - new Date(j.created_at).getTime()) / 60000));
        guasti.set(neg, g);
    }

    /* GLI EPISODI GIÀ APERTI */
    const { data: apertiRows } = await supabase.from("pos_allarmi")
        .select("negozio, aperto_il, ultimo_avviso_il").is("chiuso_il", null);
    const aperti = new Map((apertiRows ?? []).map((r) => [String(r.negozio), r]));

    /* A CHI SI SCRIVE. Numeri separati da virgola, dal pannello: cambiare il
       tecnico di turno non deve voler dire toccare il software. */
    const { data: imp } = await supabase.from("impostazioni_servizio")
        .select("wa_allarme_casse").eq("id", 1).maybeSingle();
    const destinatari = String(imp?.wa_allarme_casse || "")
        .split(/[,;\s]+/).map((n) => n.replace(/\D/g, "")).filter((n) => n.length >= 6);

    const inviati: string[] = [];
    const rientri: string[] = [];
    const errori: string[] = [];

    async function scrivi(testo: string) {
        if (!destinatari.length) { errori.push("nessun destinatario configurato in impostazioni_servizio.wa_allarme_casse"); return; }
        for (const n of destinatari) {
            const r = await avvisaSuWhatsApp(n, testo);
            if (!r.ok) errori.push(`${n}: ${r.errore}`);
        }
    }

    // ── 1. NUOVI GUASTI ────────────────────────────────────────────────────
    for (const g of guasti.values()) {
        if (aperti.has(g.negozio)) continue;            // episodio già aperto: non si ripete
        const testo =
            `⚠️ CASSA FERMA · ${g.negozio}\n\n` +
            `${g.quanti} ${g.quanti === 1 ? "documento" : "documenti"} in coda, il più vecchio da ${g.daMin} minuti: ` +
            `l'agente di stampa non li ritira, quindi il negozio non riesce a stampare scontrini.\n\n` +
            `Da controllare sul PC della cassa: che sia acceso, che l'utente abbia fatto il LOGIN ` +
            `(l'agente parte all'accesso, non all'accensione) e che TelefuturaCassa sia in esecuzione.\n\n` +
            `Rilevato alle ${euroOra(new Date(ora))}.`;
        await scrivi(testo);
        await supabase.from("pos_allarmi").upsert({
            negozio: g.negozio, aperto_il: new Date(ora).toISOString(),
            ultimo_avviso_il: new Date(ora).toISOString(), chiuso_il: null,
            dettaglio: `${g.quanti} in coda da ${g.daMin} min`,
        }, { onConflict: "negozio" });
        inviati.push(g.negozio);
    }

    // ── 2. RIENTRI ─────────────────────────────────────────────────────────
    for (const [neg, ep] of aperti) {
        if (guasti.has(neg)) continue;                  // ancora fermo
        const daMin = Math.round((ora - new Date(ep.aperto_il).getTime()) / 60000);
        await scrivi(
            `✅ RIENTRATO · ${neg}\n\n` +
            `La cassa stampa di nuovo, la coda è stata smaltita. ` +
            `Il fermo è durato circa ${daMin} minuti.\n\n` +
            `Alle ${euroOra(new Date(ora))}.`,
        );
        await supabase.from("pos_allarmi").update({ chiuso_il: new Date(ora).toISOString() }).eq("negozio", neg);
        rientri.push(neg);
    }

    return NextResponse.json({
        ok: true,
        fermi: [...guasti.values()],
        avvisiInviati: inviati,
        rientri,
        destinatari: destinatari.length,
        errori,
    });
}
