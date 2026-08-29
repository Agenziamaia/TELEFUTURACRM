import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { accesso } from "@/lib/permessiServer";
import { cestinaCodiciScaduti } from "@/lib/email";
import { profiloOtp, mailAccettabile, CARTELLA_OTP } from "@/lib/otpProfili";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* LA PULIZIA DELLE MAIL COI CODICI (Luca 29/08).
   «Dopo 10-15 minuti tanti codici non sono più validi: a quel punto deve
   girare, leggere la tempistica e spostare quelle email nel cestino per
   lasciare la casella di posta pulita.»

   Gira DA SOLA (cron), non quando qualcuno chiede un codice: era proprio quello
   il difetto — se nessuno chiedeva niente, le mail restavano nella posta in
   arrivo. Un giro apre ogni casella usata per i codici e butta nel cestino
   quelle vecchie dei mittenti attesi. La posta di lavoro non si tocca.

   Si chiama in POST. Come le altre rotte periodiche del CRM (triage email e
   WhatsApp) la protezione è un token nelle variabili del server: qui NON si può
   usare `accesso()` perché non c'è nessun utente collegato — è una macchina. */
export async function POST(req: Request) {
    const atteso = process.env.TRIAGE_ADMIN_TOKEN || "";
    if (!atteso || req.headers.get("x-triage-token") !== atteso) {
        return NextResponse.json({ error: "non autorizzato" }, { status: 401 });
    }

    /* LE CASELLE DA PULIRE SONO QUELLE CHE SERVONO DAVVERO UN'UTENZA, e per
       ognuna si guardano i mittenti dei profili che quelle utenze usano: una
       casella che riceve i codici Fastweb non deve farsi buttare la posta da
       una regola pensata per un altro operatore. */
    const { data: cred } = await supabase.from("password_credentials")
        .select("otp_account_id, otp_profilo")
        .not("otp_account_id", "is", null);

    const profiliPerCasella = new Map<string, Set<string>>();
    for (const c of cred || []) {
        const id = String(c.otp_account_id);
        const p = String(c.otp_profilo || "");
        if (!p) continue;
        if (!profiliPerCasella.has(id)) profiliPerCasella.set(id, new Set());
        profiliPerCasella.get(id)!.add(p);
    }
    if (!profiliPerCasella.size) return NextResponse.json({ ok: true, caselle: 0, cestinate: 0 });

    const { data: caselle } = await supabase.from("email_accounts")
        .select("id, email_address, username, pass_enc, imap_host, imap_port, smtp_host, smtp_port")
        .in("id", [...profiliPerCasella.keys()]);

    const esiti: { casella: string; cestinate: number; guardate: string[]; errore: string | null }[] = [];
    for (const acc of caselle || []) {
        const profili = [...(profiliPerCasella.get(String(acc.id)) || [])]
            .map((id) => profiloOtp(id)).filter(Boolean);
        if (!profili.length) continue;
        const r = await cestinaCodiciScaduti(acc as Parameters<typeof cestinaCodiciScaduti>[0], {
            // basta che combaci con UNO dei profili che quella casella serve
            mittenteOk: (m) => profili.some((p) => mailAccettabile(m, p!)),
            cartellaOtp: CARTELLA_OTP,
        });
        esiti.push({ casella: String(acc.email_address), ...r });
        if (r.errore) console.warn(`[otp-pulizia] ${acc.email_address}: ${r.errore}`);
        else if (r.cestinate) console.log(`[otp-pulizia] ${acc.email_address}: ${r.cestinate} nel cestino`);
    }

    return NextResponse.json({
        ok: true,
        caselle: esiti.length,
        cestinate: esiti.reduce((t, e) => t + e.cestinate, 0),
        dettaglio: esiti,
    });
}

/** Stato, per capire a colpo d'occhio quali caselle il giro tocca.
 *  ⚠️ SOTTO IL VARCO della sezione Password: questa risposta dice quale utenza
 *  riceve i codici su quale casella — cioè la mappa per andarsi a prendere un
 *  secondo fattore. La guardia me l'ha giustamente segnalata aperta. */
export async function GET(request: Request) {
    const _g = await accesso(request, "passwords/pulizia-otp");
    if (!_g.ok) return _g.risposta;
    const { data: cred } = await supabase.from("password_credentials")
        .select("username, otp_profilo, otp_account_id")
        .not("otp_account_id", "is", null);
    const ids = [...new Set((cred || []).map((c) => String(c.otp_account_id)))];
    const { data: caselle } = ids.length
        ? await supabase.from("email_accounts").select("id, email_address").in("id", ids)
        : { data: [] };
    const nome = new Map((caselle || []).map((a) => [String(a.id), String(a.email_address)]));
    return NextResponse.json({
        minutiPrimaDelCestino: 15,
        utenze: (cred || []).map((c) => ({
            utenza: c.username, formato: c.otp_profilo, casella: nome.get(String(c.otp_account_id)) || "?",
        })),
    });
}
