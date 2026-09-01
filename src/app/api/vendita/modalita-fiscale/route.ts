import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ ACCENDERE LA CASSA FISCALE, UN NEGOZIO ALLA VOLTA ══════════════════════
   Luca 01/09: «come facciamo ad abilitarli fiscalmente? Avrei avuto una sorta
   di pulsante».

   Oggi tutti e quindici i negozi hanno `pos_scontrino_negozi.test_mode = true`:
   il CRM stampa un DOCUMENTO NON FISCALE (PROVA) e il registratore telematico
   non viene coinvolto. Spegnere quel flag vuol dire cominciare a emettere
   documenti commerciali veri, che si annullano solo con una procedura fiscale:
   non è un'impostazione, è un interruttore che si preme una volta.

   PERCHÉ PASSA DAL SERVER: sulla tabella c'è il custode `tf_guardia`, che
   lascia scrivere solo al server o al governo. E perché il ruolo va letto dal
   database con l'id della sessione firmata, non chiesto al browser.

   PERCHÉ C'È UN CONTROLLO PRIMA: in prova il server SALTA la verifica del
   reparto IVA. Il giorno che si passa al fiscale, una voce senza reparto
   smette di essere una riga sbiadita e diventa un rifiuto secco che ferma
   l'intera vendita — con il cliente davanti. Meglio saperlo prima di premere.

   GET  → l'elenco dei negozi con lo stato e cosa manca per accendere
   POST { negozio, fiscale: boolean }
   ═══════════════════════════════════════════════════════════════════════════ */

const PUO = ["amministrativo", "direttore_generale", "admin", "dev"];

async function chiSei(id: string) {
    const { data } = await supabase.from("app_users").select("role, full_name, active").eq("id", id).maybeSingle();
    return data;
}

export async function GET(req: Request) {
    let _s: { id: string; role: string; exp: number };
    {
        const _g = await accesso(req, "vendita/pos-attivita");
        if (!_g.ok) return _g.risposta;
        _s = _g.sess;
    }
    const io_ = await chiSei(_s.id);
    if (!io_ || io_.active === false || !PUO.includes(String(io_.role || "")))
        return NextResponse.json({ ok: true, negozi: [], puoi: false });

    const [neg, rt, voci, art] = await Promise.all([
        supabase.from("pos_scontrino_negozi").select("negozio, test_mode").order("negozio"),
        supabase.from("pos_rt").select("negozio, azienda, rt_url"),
        // le voci di catalogo che finiscono sullo scontrino senza reparto
        supabase.from("marg_items").select("name").eq("active", true).eq("va_in_scontrino", true).is("reparto", null),
        // e gli articoli di magazzino nella stessa condizione
        supabase.from("mag_articoli").select("codice", { count: "exact", head: true }).eq("attivo", true).is("reparto", null),
    ]);

    /* CHI HA RISPOSTO DI RECENTE. Un negozio il cui agente non parla non deve
       passare al fiscale: il documento non uscirebbe, e a quel punto la
       vendita resta appesa con i soldi già presi. */
    const da = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: job } = await supabase.from("print_jobs")
        .select("negozio, status, created_at").gte("created_at", da).in("status", ["done", "error"]);
    const vivo = new Set((job || []).filter((j: { status: string }) => j.status === "done").map((j: { negozio: string }) => j.negozio));

    const senzaReparto = (voci.data || []).map((v: { name: string }) => v.name);
    const articoliSenzaReparto = art.count ?? 0;

    return NextResponse.json({
        ok: true, puoi: true,
        senzaReparto, articoliSenzaReparto,
        negozi: (neg.data || []).map((n: { negozio: string; test_mode: boolean }) => ({
            negozio: n.negozio,
            fiscale: n.test_mode === false,
            registratori: (rt.data || []).filter((r: { negozio: string }) => r.negozio === n.negozio)
                .map((r: { azienda: string; rt_url: string }) => ({ azienda: r.azienda, rt_url: r.rt_url })),
            haStampato: vivo.has(n.negozio),
        })),
    });
}

export async function POST(req: Request) {
    let _s: { id: string; role: string; exp: number };
    {
        const _g = await accesso(req, "vendita/pos-attivita");
        if (!_g.ok) return _g.risposta;
        _s = _g.sess;
    }
    const io_ = await chiSei(_s.id);
    if (!io_ || io_.active === false || !PUO.includes(String(io_.role || "")))
        return NextResponse.json({ error: "solo l'amministrazione può accendere la cassa fiscale" }, { status: 403 });

    const b = await req.json().catch(() => ({})) as { negozio?: string; fiscale?: boolean };
    const negozio = String(b.negozio || "").trim();
    if (!negozio) return NextResponse.json({ error: "negozio mancante" }, { status: 400 });
    const fiscale = b.fiscale === true;

    /* SI ACCENDE SOLO DOVE C'È UN REGISTRATORE. Senza, il CRM manderebbe il
       documento a un dispositivo che non esiste e la vendita resterebbe
       appesa: meglio dirlo adesso che scoprirlo col cliente davanti. */
    if (fiscale) {
        const { data: rt } = await supabase.from("pos_rt").select("negozio").eq("negozio", negozio).limit(1);
        if (!rt?.length)
            return NextResponse.json({ error: `${negozio} non ha nessun registratore configurato: non si può passare al fiscale` }, { status: 400 });
    }

    const { error } = await supabase.from("pos_scontrino_negozi")
        .update({ test_mode: !fiscale }).eq("negozio", negozio);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    /* RESTA SCRITTO CHI L'HA PREMUTO. È il momento in cui un negozio comincia
       a emettere documenti fiscali: fra un mese si vorrà sapere quando e per
       mano di chi. */
    await supabase.from("admin_tasks").insert({
        tipo: "cassa_fiscale",
        titolo: `🧾 ${negozio}: cassa ${fiscale ? "FISCALE" : "in prova"}`,
        dettaglio: `${io_.full_name || "un amministratore"} ha messo ${negozio} in modalità ${fiscale ? "FISCALE: da adesso escono documenti commerciali veri" : "di prova: da adesso escono documenti NON fiscali"}.`,
        link: "/amministrazione?sez=fiscalita&tab=cassascontrini",
        target_role: "direzione",
        created_by: io_.full_name || null,
        done: true, done_by: io_.full_name || null, done_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, negozio, fiscale });
}
