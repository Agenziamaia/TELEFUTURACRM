import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { eUnLavoroAutomatico } from "@/lib/cronParola";
import { numeroAutomatismo } from "@/lib/automatismiConfig";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { corsaTriageEmail, EMAIL_TRIAGE_VERSIONE } from "@/lib/ai/emailTriage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * TRIAGE AI delle EMAIL — vedi lib/ai/emailTriage (gemello del triage
 * WhatsApp). POST {} = un giro (lock+debounce nella lib; cron pg_cron
 * 'email-triage' ogni 10' sfalsato di 5, sveglia dal widget). body.force
 * onorato SOLO con header x-triage-token = env TRIAGE_ADMIN_TOKEN (stessa
 * regola della route WhatsApp). GET = stato + censimento per la diagnosi.
 */
export async function POST(req: Request) {
    /* ⚠️ O UNA PERSONA, O IL LAVORO AUTOMATICO (31/08). Il GET l'avevo chiuso
       stamattina e questo POST era rimasto aperto a chiunque su Internet — e
       ogni corsa costa denaro vero e può far cestinare posta in automatico.
       Il cron delle 10-in-10 non ha una sessione: si presenta con la parola. */
    let daPersona = false;
    if (!(await eUnLavoroAutomatico(req))) {
        const _g = await accesso(req, "email/triage");
        if (!_g.ok) return _g.risposta;
        daPersona = true;
    }
    let body: any = {};
    try { body = await req.json(); } catch { }
    const tokenOk = !!process.env.TRIAGE_ADMIN_TOKEN
        && req.headers.get("x-triage-token") === process.env.TRIAGE_ADMIN_TOKEN;
    // il tetto per corsa si regola dall'hub Automatismi; il corpo della
    // richiesta lo scavalca solo per una prova mirata
    const maxPannello = await numeroAutomatismo("email-triage", "max", 1, 60);
    /* IL «FORZA» VALE ANCHE PER UNA PERSONA (01/09). Serve al bottone «fai una
       corsa adesso» dell'hub Automatismi: fra due corse c'è un freno di quattro
       minuti, e premendo il bottone in un momento a caso non partiva quasi mai
       — l'hub diceva «fatte 0» e sembrava un guasto. Forzare salta solo il
       freno, e ci arriva soltanto chi ha già passato il controllo dei permessi. */
    const esito = await corsaTriageEmail({ force: !!body?.force && (tokenOk || daPersona), max: Number(body?.max) || maxPannello });
    return NextResponse.json(esito);
}

async function conta(filtro?: (q: any) => any): Promise<number> {
    let q: any = supabase.from("email_triage").select("*", { count: "exact", head: true });
    if (filtro) q = filtro(q);
    const { count } = await q;
    return count || 0;
}

export async function GET(request: Request) {
    /* ⚠️ NON AVEVA NESSUNA GUARDIA (31/08): i conteggi del triage — quante
       email da rispondere, quante spazzatura, quante cestinate — uscivano a
       chiunque conoscesse l'indirizzo, senza nemmeno essere collegati. */
    const _g = await accesso(request, "email/triage");
    if (!_g.ok) return _g.risposta;
    const [{ data: stato }, totale, rispondere, daLeggere, niente, spazzatura, cestinate] = await Promise.all([
        supabase.from("email_triage_stato").select("in_corsa_da, ultima_corsa, ultimo_esito").eq("id", 1).maybeSingle(),
        conta(),
        conta((q) => q.eq("stato", "rispondere")),
        conta((q) => q.eq("stato", "da_leggere")),
        conta((q) => q.eq("stato", "niente")),
        conta((q) => q.eq("stato", "spazzatura")),
        conta((q) => q.eq("azione_auto", "cestinata")),
    ]);
    return NextResponse.json({
        versione: EMAIL_TRIAGE_VERSIONE,
        ultima_corsa: stato?.ultima_corsa || null,
        in_corsa_da: stato?.in_corsa_da || null,
        ultimo_esito: stato?.ultimo_esito || null,
        classificate_totali: totale,
        conteggi: { rispondere, da_leggere: daLeggere, niente, spazzatura, cestinate },
    });
}
