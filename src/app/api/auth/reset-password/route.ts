import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { decifraSegreto, verificaCodice } from "@/lib/totp";
import { inviaCredenziali, passwordProvvisoria } from "@/lib/emailCredenziali";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RESET PASSWORD AUTOMATICO (Luca 01/08, seconda direttiva): l'utente chiede
// il reset e riceve SUBITO una password provvisoria sulla PROPRIA email —
// niente piu' richieste all'amministrazione. Al primo accesso la cambia
// (must_change_password, flusso esistente); la 2FA continua a proteggere il
// login anche se la mail venisse intercettata.
// Resta la via ISTANTANEA per chi ha l'authenticator sotto mano (mode "totp"):
// codice a 6 cifre + nuova password, senza passare dalla posta.
// Risposte NEUTRE: non si rivela mai se un'email esiste oppure no.
// La mail parte dalla casella amministrazione@ (o la prima attiva) gia'
// collegata al CRM (email_accounts, stessa via SMTP della chat).

// anti abuso: per email, max 5 verifiche TOTP e 3 invii mail ogni 10'
const tentativi = new Map<string, { n: number; t: number }>();
const FINESTRA_MS = 10 * 60 * 1000;
function bloccato(chiave: string, max: number): boolean {
    const r = tentativi.get(chiave);
    if (!r || Date.now() - r.t > FINESTRA_MS) return false;
    return r.n >= max;
}
function segna(chiave: string) {
    const r = tentativi.get(chiave);
    if (!r || Date.now() - r.t > FINESTRA_MS) tentativi.set(chiave, { n: 1, t: Date.now() });
    else r.n += 1;
}

export async function POST(request: Request) {
    try {
        const { email, code, newPassword, mode } = await request.json();
        const em = String(email || "").trim().toLowerCase();
        if (!em) return NextResponse.json({ ok: false, error: "Scrivi la tua email." });

        // ── MODALITA' EMAIL (default): password provvisoria sulla posta ──
        if (mode !== "totp") {
            if (bloccato("mail:" + em, 3)) return NextResponse.json({ ok: false, error: "Hai già richiesto il reset da poco: controlla la posta (anche lo spam) o riprova tra qualche minuto." });
            segna("mail:" + em);

            const { data: row } = await supabase.from("app_users")
                .select("id, full_name, email").eq("active", true).ilike("email", em).limit(1).maybeSingle();
            // utente inesistente: stessa risposta di quello esistente (neutra)
            if (!row) return NextResponse.json({ ok: true });

            // IL TESTO E' UNO SOLO (revisione 31/08): stava qui in copia, e le
            // due versioni erano gia' divergenti — una salutava col nome
            // proprio, l'altra col nome e cognome, e solo una aveva il link
            // cliccabile. Adesso lo scrive `inviaCredenziali`, che conosce i
            // tre toni: qui il tono e' «me la sono chiesta io».
            const temp = passwordProvvisoria();
            // prima la MAIL, poi la password: se l'invio fallisce la vecchia
            // password resta valida e nessuno rimane chiuso fuori
            const esito = await inviaCredenziali({ a: row.email, nome: row.full_name, password: temp, tono: "reset_self" });
            if (!esito.ok) return NextResponse.json({ ok: false, error: "Invio email non riuscito: riprova o avvisa l'amministrazione. (" + esito.errore + ")" });
            // admin_set_password: hash bcrypt + must_change_password=true (la cambia al primo accesso)
            const { error: e1 } = await supabase.rpc("admin_set_password", { p_user_id: row.id, p_new: temp });
            if (e1) return NextResponse.json({ ok: false, error: "Salvataggio non riuscito: riprova." });
            return NextResponse.json({ ok: true });
        }

        // ── MODALITA' TOTP: cambio immediato verificandosi con l'authenticator ──
        const codice = String(code || "").trim();
        const nuova = String(newPassword || "");
        if (!codice || !nuova) return NextResponse.json({ ok: false, error: "Compila codice e nuova password." });
        if (nuova.length < 8) return NextResponse.json({ ok: false, error: "La nuova password deve avere almeno 8 caratteri." });
        if (bloccato("totp:" + em, 5)) return NextResponse.json({ ok: false, error: "Troppi tentativi: riprova tra qualche minuto." });

        const { data: row } = await supabase.from("app_users")
            .select("id, totp_secret, totp_enabled").eq("active", true).ilike("email", em).limit(1).maybeSingle();
        let secret = "";
        try { secret = row?.totp_secret ? decifraSegreto(row.totp_secret) : ""; } catch { secret = ""; }
        if (!row || !row.totp_enabled || !secret) {
            return NextResponse.json({ ok: false, fallback: true, error: "Su questo account la verifica in due passaggi non risulta attiva: usa il reset via email." });
        }
        if (!verificaCodice(codice, secret)) {
            segna("totp:" + em);
            return NextResponse.json({ ok: false, error: "Codice non valido: controlla l'app authenticator." });
        }
        const { error: e1 } = await supabase.rpc("admin_set_password", { p_user_id: row.id, p_new: nuova });
        if (e1) return NextResponse.json({ ok: false, error: "Salvataggio non riuscito: " + e1.message });
        await supabase.from("app_users").update({ must_change_password: false }).eq("id", row.id);
        tentativi.delete("totp:" + em);
        return NextResponse.json({ ok: true });
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Errore interno" }, { status: 500 });
    }
}
