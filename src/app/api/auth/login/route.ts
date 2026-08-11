import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { cifraSegreto, decifraSegreto, generaSegreto, otpauthUri, verificaCodice } from "@/lib/totp";
import QRCode from "qrcode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Login con 2FA (TOTP) verificata LATO SERVER. La password si controlla come
// prima (RPC verify_login); poi, se l'utente non ha ancora la 2FA, la si obbliga
// a iscriversi (QR), altrimenti si chiede il codice. La sessione (row utente)
// torna al client SOLO quando password + 2FA sono ok.
//
// Stadi possibili nella risposta:
//   { ok:true, user }                      -> autenticato
//   { ok:false, error }                    -> password errata / errore
//   { stage:"change", email }              -> primo accesso: cambio password
//   { stage:"totp", email, error? }        -> inserire il codice
//   { stage:"enroll", email, otpauth, qr } -> scansionare il QR + codice
export async function POST(request: Request) {
    try {
        const { email, password, code, enrolling } = await request.json();
        const em = String(email || "").trim();
        if (!em || !password) return NextResponse.json({ ok: false, error: "Email e password obbligatorie" });

        const { data, error } = await supabase.rpc("verify_login", { p_email: em, p_password: password });
        if (error) return NextResponse.json({ ok: false, error: error.message });
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) return NextResponse.json({ ok: false, error: "Email o password non validi" });

        // ── MOD-33 (Luca 10/08): SOSPENSIONE e LICENZIAMENTO PROGRAMMATO ──
        // verify_login filtra gia' i licenziati effettivi (where u.active);
        // qui si negano i SOSPESI e si concretizza il licenziamento arrivato a
        // scadenza (status/active allineati al primo tentativo di accesso).
        // Select difensivo: senza migrazione le colonne mancano e vale il solo
        // filtro storico su active.
        {
            let stato: { sospeso_dal?: string | null; data_licenziamento?: string | null } | null = null;
            const r1 = await supabase.from("app_users").select("sospeso_dal, data_licenziamento").eq("id", row.id).maybeSingle();
            if (!r1.error) stato = r1.data;
            const oggi = new Date().toISOString().slice(0, 10);
            const dl = String(stato?.data_licenziamento || "");
            if (dl && dl <= oggi) {
                await supabase.from("app_users").update({ status: "licenziato", active: false }).eq("id", row.id);
                return NextResponse.json({ ok: false, error: "Account disattivato: l'accesso al CRM non è più consentito." });
            }
            const sd = String(stato?.sospeso_dal || "");
            if (sd && sd <= oggi) {
                return NextResponse.json({ ok: false, error: "Account sospeso dall'amministrazione: accesso non consentito." });
            }
        }

        // primo accesso: prima la password personale, poi la 2FA (al login dopo)
        if (row.must_change_password) return NextResponse.json({ stage: "change", email: row.email });

        // stato 2FA dell'utente (segreto cifrato, mai restituito al client)
        const { data: sec } = await supabase.from("app_users").select("totp_secret, totp_enabled").eq("id", row.id).maybeSingle();
        const enabled = !!sec?.totp_enabled;

        // INTERRUTTORE ROLLOUT: in PILOTA la 2FA e' obbligatoria solo per questi
        // utenti; con la lista VUOTA diventa obbligatoria per TUTTI. Chi ha gia'
        // attivato la 2FA la usa comunque (enabled === true), pilota o meno.
        // ROLLOUT COMPLETO (31/07/2026, dopo verifica di Luca): lista VUOTA => 2FA
        // OBBLIGATORIA PER TUTTI gli account. Per tornare al pilota reinserire gli id.
        const PILOT_2FA_IDS: string[] = [];
        const required2fa = PILOT_2FA_IDS.length === 0 || PILOT_2FA_IDS.includes(row.id);

        if (!enabled) {
            // chi non e' (ancora) obbligato entra senza 2FA
            if (!required2fa) return NextResponse.json({ ok: true, user: row });
            // ── ISCRIZIONE OBBLIGATORIA ──
            if (!code || !enrolling) {
                // genera un nuovo segreto, lo salva cifrato (non ancora attivo) e manda il QR
                const secret = generaSegreto();
                await supabase.from("app_users").update({ totp_secret: cifraSegreto(secret), totp_enabled: false }).eq("id", row.id);
                const uri = otpauthUri(row.email, secret);
                const qr = await QRCode.toDataURL(uri);
                return NextResponse.json({ stage: "enroll", email: row.email, otpauth: uri, qr });
            }
            // conferma iscrizione: verifica il codice contro il segreto in sospeso
            let secret = "";
            try { secret = sec?.totp_secret ? decifraSegreto(sec.totp_secret) : ""; } catch { secret = ""; }
            if (!secret || !verificaCodice(code, secret)) {
                const uri = secret ? otpauthUri(row.email, secret) : "";
                const qr = uri ? await QRCode.toDataURL(uri) : "";
                return NextResponse.json({ stage: "enroll", email: row.email, otpauth: uri, qr, error: "Codice non valido, riprova." });
            }
            await supabase.from("app_users").update({ totp_enabled: true }).eq("id", row.id);
            return NextResponse.json({ ok: true, user: row });
        }

        // ── 2FA GIA' ATTIVA: serve il codice ──
        if (!code) return NextResponse.json({ stage: "totp", email: row.email });
        let secret = "";
        try { secret = sec?.totp_secret ? decifraSegreto(sec.totp_secret) : ""; } catch { secret = ""; }
        if (!secret || !verificaCodice(code, secret)) return NextResponse.json({ stage: "totp", email: row.email, error: "Codice non valido." });
        return NextResponse.json({ ok: true, user: row });
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Errore interno" }, { status: 500 });
    }
}
