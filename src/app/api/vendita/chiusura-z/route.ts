import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { buildRequestXml } from "@/lib/fiscalprint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Chiusura fiscale giornaliera — Report Z (spec Francesco #4). Mette in coda un
// comando zReport per OGNI RT del negozio (multi-societario: una chiusura per P.IVA),
// o per un singolo RT se si passa azienda/deviceUrl.
// ⚠️ AZIONE FISCALE IRREVERSIBILE: stampa la chiusura e trasmette i corrispettivi
// all'Agenzia delle Entrate. Va protetta lato UI (admin + conferma esplicita).
//   POST { negozio, azienda?, deviceUrl? }
export async function POST(req: Request) {
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    {
        // 🔒 sessione firmata + permesso della sezione, come nel pannello
        const _g = await accesso(req, "vendita/chiusura-z");
        if (!_g.ok) return _g.risposta;
        const _s = _g.sess;
    }

    const b: any = await req.json().catch(() => ({}));
    const negozio = b.negozio ?? null;
    if (!negozio && !b.deviceUrl) return NextResponse.json({ error: "negozio o deviceUrl richiesto" }, { status: 400 });

    // RT da chiudere.
    let targets: { azienda: string | null; rt_url: string }[] = [];
    if (b.deviceUrl) {
        targets = [{ azienda: b.azienda || null, rt_url: b.deviceUrl }];
    } else {
        let q = supabase.from("pos_rt").select("negozio, azienda, rt_url").eq("negozio", negozio);
        if (b.azienda) q = q.eq("azienda", b.azienda);
        const { data } = await q;
        targets = (data || []).map((r: any) => ({ azienda: r.azienda, rt_url: r.rt_url, negozio: r.negozio }));
        /* ⚠️ NIENTE REGISTRATORE DI RIPIEGO (revisione 02/09). Qui c'era
           `RT_DEVICE_URL || "http://192.168.1.219"`, e quella variabile
           d'ambiente non esiste: quell'indirizzo è **la cassa T1 di Donna
           Olimpia**. Un negozio senza righe in `pos_rt` — perché lo si
           rinomina, o perché la riga si perde — mandava la sua **chiusura
           fiscale, irreversibile e trasmessa all'Agenzia**, sul registratore
           di un altro negozio e di un'altra partita IVA.
           Sullo scontrino questo stesso ripiego era già stato tolto il 31/08;
           qui era rimasto. Meglio una chiusura che non parte, e lo dice, che
           una chiusura che parte nel posto sbagliato. */
        if (!targets.length) {
            return NextResponse.json({
                error: `«${negozio}» non ha nessun registratore censito: la chiusura non parte. `
                    + "Controlla Amministrazione → Fiscalità prima di chiudere la giornata.",
            }, { status: 400 });
        }
    }

    const xml = buildRequestXml("z_report");
    if (!xml) return NextResponse.json({ error: "impossibile costruire la chiusura Z" }, { status: 500 });

    const chiusure: any[] = [];
    for (const t of targets) {
        const { data, error } = await supabase.from("print_jobs").insert({
            /* IL LAVORO È DI CHI POSSIEDE IL REGISTRATORE, non di chi preme il
               pulsante: l'agente ritira i lavori col NOME ESATTO del suo
               negozio. Ad Acilia le due casse sono entrambe locali («custom»),
               e l'unico modo di distinguerle è il nome: intestare la Z di
               Acilia VS ad «Acilia Multi» la farebbe ritirare dall'agente
               sbagliato, cioè chiudere la cassa dell'altro banco. Lo scontrino
               questa regola ce l'ha già; qui mancava. */
            negozio: (t as { negozio?: string }).negozio || negozio,
            device_url: t.rt_url,
            kind: "z_report",
            request_xml: xml,
            status: "pending",
            meta: { azienda: t.azienda },
        }).select("id").single();
        if (error) return NextResponse.json({ error: error.message, chiusure }, { status: 500 });
        chiusure.push({ azienda: t.azienda, rt: t.rt_url, jobId: data.id });
    }
    return NextResponse.json({ ok: true, chiusure });
}
