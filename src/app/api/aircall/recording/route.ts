import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { aircallGet, puoAscoltareRegistrazioniServer } from "@/lib/aircall";
import { capKey, capAllowed, CAP_CLIENTI_REGISTRAZIONI, CAP_CALLER_REG_STORICO } from "@/lib/capabilities";
import type { PermMap } from "@/lib/nav";

export const dynamic = "force-dynamic";

// REGISTRAZIONI: gli URL che Aircall manda col webhook sono link S3 FIRMATI che
// scadono dopo ~45-55 minuti — il recording_url salvato in call_events smette
// di suonare entro un'ora (S3 risponde 403 e il player resta muto: segnalazione
// Luca 31/07). Qui si chiede ad Aircall un URL fresco AD OGNI ascolto e si fa
// redirect: il player <audio> lo segue da solo. Credenziali SOLO server.
export async function GET(request: Request) {
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    {
        // 🔒 sessione firmata + permesso della sezione, come nel pannello
        const _g = await accesso(request, "aircall/recording");
        if (!_g.ok) return _g.risposta;
        const _s = _g.sess;
    }

    try {
        if (!process.env.AIRCALL_API_ID || !process.env.AIRCALL_API_TOKEN) {
            return NextResponse.json({ error: "Credenziali Aircall non configurate sul server" }, { status: 500 });
        }
        const params = new URL(request.url).searchParams;
        const id = params.get("call");
        if (!id || !/^\d+$/.test(id)) {
            return NextResponse.json({ error: "id chiamata Aircall mancante o non valido" }, { status: 400 });
        }
        // GATE A CAPABILITY (Luca 04/08, seconda passata): serve ?u=<app_users.id>
        // e si verifica A DB (pattern del progetto, come /api/aircall/dial) la
        // capability cap:/clienti:ascolta_registrazioni — righe role e role@grade
        // di role_permissions con la stessa semantica di capAllowed (eccezione di
        // grado vince, nessuna riga = default della capability). Amministrabile
        // dalla rotellina Clienti in Permessi, senza codice.
        const uid = params.get("u");
        if (!uid) return NextResponse.json({ error: "Utente non riconosciuto" }, { status: 401 });
        const { data: u } = await supabase.from("app_users").select("role, grade, active").eq("id", uid).maybeSingle();
        if (!u || u.active === false) {
            return NextResponse.json({ error: "Utente non riconosciuto o disattivato" }, { status: 403 });
        }
        // ruolo + eccezione di grado + eccezione PERSONALE (user:<id>, MOD-29)
        const chiavi = [u.role, `user:${uid}`];
        if (u.grade) chiavi.push(`${u.role}@${u.grade}`);
        const { data: righe } = await supabase.from("role_permissions")
            .select("role, perm_key, allowed").in("role", chiavi)
            .in("perm_key", [capKey("/clienti", CAP_CLIENTI_REGISTRAZIONI.id), capKey("/caller", CAP_CALLER_REG_STORICO.id)]);
        const righeArr = (righe ?? []) as { role: string; perm_key: string; allowed: boolean }[];
        // seconda strada (Luca 24/08): la capability DEDICATA dello storico
        // lavorazioni Caller (default solo admin) apre il proxy anche a chi
        // NON ha la cap Clienti. Bypass righe solo per admin: cosi' un dev o
        // qualsiasi ruolo si governa davvero dalla rotellina.
        const okCallerStorico = (() => {
            const m: PermMap = new Map();
            const chiave = capKey("/caller", CAP_CALLER_REG_STORICO.id);
            if (u.role !== "admin") {
                righeArr.filter((r) => r.role === u.role && r.perm_key === chiave).forEach((r) => m.set(r.perm_key, r.allowed));
                if (u.grade) righeArr.filter((r) => r.role === `${u.role}@${u.grade}` && r.perm_key === chiave).forEach((r) => m.set(r.perm_key, r.allowed));
                righeArr.filter((r) => r.role === `user:${uid}` && r.perm_key === chiave).forEach((r) => m.set(r.perm_key, r.allowed));
            }
            return capAllowed(u.role, "/caller", CAP_CALLER_REG_STORICO, m);
        })();
        if (!puoAscoltareRegistrazioniServer(u.role, u.grade, righeArr, uid) && !okCallerStorico) {
            return NextResponse.json({ error: "Non hai il permesso di ascoltare le registrazioni (si abilita da Amministrazione → Permessi)" }, { status: 403 });
        }
        const info = await aircallGet(`/calls/${id}`);
        const url: string | null = info?.call?.recording || info?.call?.asset || null;
        if (!url) return NextResponse.json({ error: "Nessuna registrazione disponibile per questa chiamata" }, { status: 404 });
        return NextResponse.redirect(url, 302);
    } catch (err) {
        const message = err instanceof Error ? err.message : "Errore";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
