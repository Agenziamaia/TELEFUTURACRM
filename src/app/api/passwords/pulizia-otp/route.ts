import { NextResponse } from "next/server";
import { eUnLavoroAutomatico } from "@/lib/cronParola";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
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

   Si chiama in POST dal cron: nessun utente collegato, è una macchina — quindi
   O una sessione di amministrazione O la parola d'ordine dei lavori (01/09).
   Era l'ULTIMA delle cinque rimasta aperta a chiunque su Internet: le altre
   quattro l'avevano già presa, questa no.
   ⚠️ E VA FRENATA LO STESSO. Ogni giro apre una connessione IMAP su OGNI
   casella dei codici, e i server di posta le contano: martellandola si
   arriverebbe al blocco, cioè i negozi senza codici. Un giro ogni cinque
   minuti basta e avanza (il cron ne chiede uno ogni dieci). */
const MINUTI_FRA_UN_GIRO_E_L_ALTRO = 5;

export async function POST(req: Request) {
    if (!(await eUnLavoroAutomatico(req))) {
        const _g = await accesso(req, "passwords/pulizia-otp");
        if (!_g.ok) return _g.risposta;
    }
    let corpo: { force?: boolean } = {};
    try { corpo = await req.json(); } catch { /* corpo vuoto: è il cron */ }
    // il «force» lo può chiedere solo chi ha il token di servizio
    const forzato = !!corpo?.force && !!process.env.TRIAGE_ADMIN_TOKEN
        && req.headers.get("x-triage-token") === process.env.TRIAGE_ADMIN_TOKEN;

    const { data: stato } = await supabase.from("otp_pulizia_stato")
        .select("ultima_corsa").eq("id", 1).maybeSingle();
    const ultima = stato?.ultima_corsa ? new Date(stato.ultima_corsa).getTime() : 0;
    if (!forzato && ultima && Date.now() - ultima < MINUTI_FRA_UN_GIRO_E_L_ALTRO * 60_000) {
        return NextResponse.json({ ok: true, saltato: "troppo presto", ultimaCorsa: stato?.ultima_corsa });
    }
    // si segna SUBITO: due chiamate quasi simultanee non partono in parallelo
    await supabase.from("otp_pulizia_stato").update({ ultima_corsa: new Date().toISOString() }).eq("id", 1);

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

    const cestinate = esiti.reduce((t, e) => t + e.cestinate, 0);
    await supabase.from("otp_pulizia_stato").update({
        ultimo_esito: `${esiti.length} caselle · ${cestinate} nel cestino`,
    }).eq("id", 1);
    return NextResponse.json({ ok: true, caselle: esiti.length, cestinate, dettaglio: esiti });
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
