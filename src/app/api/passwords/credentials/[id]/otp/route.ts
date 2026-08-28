import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { cercaESpostaMailOtp } from "@/lib/email";
import { profiloOtp, mittenteAtteso, codiceDaMessaggio, CARTELLA_OTP } from "@/lib/otpProfili";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* IL CODICE USA E GETTA, SU RICHIESTA (Luca 28/08 sera).
   Il collaboratore prova ad accedere al portale, l'operatore gli manda il
   codice via mail, lui preme il pulsante e il CRM glielo consegna — senza
   dargli in mano la casella, che riceve anche tutto il resto.

   Regole che tengono in piedi la cosa:
   · il codice NON si salva da nessuna parte: si legge dalla posta e si mostra;
   · nel registro finisce chi l'ha chiesto e quando, mai il numero;
   · si guarda solo la posta arrivata dagli indirizzi attesi dell'operatore, o
     basterebbe scrivere alla casella una mail con sei cifre per farsi dare un
     «codice»;
   · la mail viene portata via dall'INBOX: tre di queste caselle sono di
     negozio e i colleghi le aprono tutti i giorni. */

const MINUTI_VALIDI = 20;       // più vecchia di così, non è il codice di adesso

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
    // 🔒 stesso permesso della password: chi può vedere la credenziale può
    // chiedere il suo codice (scelta di Luca 28/08)
    const _g = await accesso(request, "passwords/credentials/[id]/otp");
    if (!_g.ok) return _g.risposta;
    const _s = _g.sess;

    const { id } = await ctx.params;
    const credId = parseInt(id, 10);
    if (isNaN(credId)) return NextResponse.json({ error: "Credenziale non valida" });

    const { data: cred } = await supabase.from("password_credentials")
        .select("id, access_type, username, otp_account_id, otp_profilo")
        .eq("id", credId).maybeSingle();
    if (!cred) return NextResponse.json({ error: "Credenziale non trovata" });
    if (!cred.otp_account_id || !cred.otp_profilo) {
        return NextResponse.json({ error: "Per questa utenza non è configurata la casella dei codici. Chiedi all'amministrazione di collegarla." });
    }

    const profilo = profiloOtp(cred.otp_profilo);
    if (!profilo) return NextResponse.json({ error: "Il formato della mail dei codici non è più riconosciuto: avvisa l'amministrazione." });

    const { data: acc } = await supabase.from("email_accounts")
        .select("id, email_address, username, pass_enc, imap_host, imap_port, smtp_host, smtp_port, last_uid, inbox_uidvalidity")
        .eq("id", cred.otp_account_id).maybeSingle();
    if (!acc) return NextResponse.json({ error: "La casella dei codici non è più collegata: avvisa l'amministrazione." });

    // ── si va a prendere la posta ────────────────────────────────────────
    let esito: Awaited<ReturnType<typeof cercaESpostaMailOtp>>;
    try {
        esito = await cercaESpostaMailOtp(acc as Parameters<typeof cercaESpostaMailOtp>[0], {
            mittenteOk: (from) => mittenteAtteso(from, profilo),
            cartellaOtp: CARTELLA_OTP,
            daMinuti: MINUTI_VALIDI,
        });
    } catch (e: unknown) {
        return NextResponse.json({ error: "Non riesco a leggere la casella dei codici: " + ((e as Error)?.message || "errore") });
    }
    if (esito.errore) return NextResponse.json({ error: "Casella dei codici: " + esito.errore });

    // il più recente che contenga davvero un numero leggibile
    let codice: string | null = null;
    let quando: string | null = null;
    for (const m of esito.trovate) {
        const c = codiceDaMessaggio(m, profilo);
        if (c) { codice = c; quando = m.date ? new Date(m.date).toISOString() : null; break; }
    }

    if (!codice) {
        return NextResponse.json({
            attesa: true,
            error: `Nessun codice arrivato negli ultimi ${MINUTI_VALIDI} minuti su ${acc.email_address}. Fai partire la richiesta dal portale e riprova tra qualche secondo.`,
        });
    }

    // ── registro: CHI l'ha chiesto, non il codice ────────────────────────
    await supabase.from("password_access_log").insert({
        credential_id: credId,
        user_id: _s.id,                       // sempre dalla sessione firmata
        action: "otp",
        details: {
            casella: acc.email_address,
            profilo: profilo.id,
            mail_del: quando,
            mail_spostate: esito.spostate,
        },
    }).then(undefined, () => { /* l'audit non deve mai far fallire la consegna */ });

    return NextResponse.json({
        codice,
        casella: acc.email_address,
        mailDel: quando,
        secondi: 60,                          // per quanto resta a schermo
    });
}
