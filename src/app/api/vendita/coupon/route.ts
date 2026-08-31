import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { generaCoupon, validaCoupon } from "@/lib/coupons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lista coupon per Amministrazione (emessi/riscattati/scaduti/annullati). Sola lettura.
// GET ?negozio=  (facoltativo) → tutti i coupon (max 500, recenti prima) con `scaduto`
// derivato (attivo + scadenza superata). Filtri/stat li fa la vista.
export async function GET(req: Request) {
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    {
        // 🔒 sessione firmata + permesso della sezione, come nel pannello
        const _g = await accesso(req, "vendita/coupon");
        if (!_g.ok) return _g.risposta;
        const _s = _g.sess;
    }

    const { searchParams } = new URL(req.url);
    const negozio = searchParams.get("negozio");
    let q = supabase.from("coupons")
        .select("code, valore, valore_residuo, stato, negozio, origine, cliente, parent_code, created_by, created_at, redeemed_at, redeemed_ref, scadenza, usato_id")
        .order("created_at", { ascending: false }).limit(500);
    if (negozio) q = q.eq("negozio", negozio);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const now = Date.now();
    const coupons = (data || []).map((r: any) => ({
        ...r,
        scaduto: r.stato === "attivo" && !!r.scadenza && new Date(r.scadenza).getTime() < now,
    }));
    return NextResponse.json({ ok: true, coupons });
}

// Coupon sconto (spec Francesco). La REDENZIONE avviene nel route dello scontrino
// (atomica con l'emissione + sconto). Qui:
//   POST { action:"genera", valore, negozio?, cliente?, usato_id?, origine?, createdBy? }
//   POST { action:"valida", code }
//   POST { action:"annulla", code }  → solo amministrativo in su
export async function POST(req: Request) {
    let _s: { id: string; role: string; exp: number };
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    {
        // 🔒 sessione firmata + permesso della sezione, come nel pannello
        const _g = await accesso(req, "vendita/coupon");
        if (!_g.ok) return _g.risposta;
        _s = _g.sess;
    }

    const b: any = await req.json().catch(() => ({}));
    const action = String(b.action || "");

    if (action === "genera") {
        const valore = Number(b.valore);
        if (!(valore > 0)) return NextResponse.json({ error: "valore coupon non valido" }, { status: 400 });
        try {
            const code = await generaCoupon({
                valore,
                negozio: b.negozio ?? null,
                cliente: b.cliente ?? null,
                usato_id: b.usato_id ?? null,
                origine: b.origine || "usato",
                created_by: b.createdBy ?? null,
            });
            return NextResponse.json({ ok: true, code, valore: +valore.toFixed(2) });
        } catch (e: any) {
            return NextResponse.json({ error: e?.message || "generazione fallita" }, { status: 500 });
        }
    }

    if (action === "valida") {
        if (!b.code) return NextResponse.json({ error: "codice richiesto" }, { status: 400 });
        const r = await validaCoupon(String(b.code));
        return NextResponse.json({ ok: true, ...r });
    }

    /* ANNULLARE UN COUPON (Luca 31/08: «dammi la possibilità, dall'amministrativo
       in su, di poter cancellare dei codici coupon»).
       Non si CANCELLA: si annulla. Un coupon è un impegno verso un cliente che
       ha lasciato un telefono — se un giorno si presenta col foglietto in mano,
       la riga deve poter dire che esisteva, quanto valeva e chi l'ha tolto.
       Il ruolo si legge dal DATABASE con l'id della sessione firmata, mai da
       quello che dichiara il browser. */
    if (action === "annulla") {
        const code = String(b.code || "").trim().toUpperCase();
        if (!code) return NextResponse.json({ error: "codice richiesto" }, { status: 400 });
        const { data: io_ } = await supabase.from("app_users")
            .select("role, full_name, active").eq("id", _s.id).maybeSingle();
        const ruolo = String(io_?.role || "");
        if (!io_ || io_.active === false || !["amministrativo", "direttore_generale", "admin", "dev"].includes(ruolo))
            return NextResponse.json({ error: "solo l'amministrazione può annullare un coupon" }, { status: 403 });
        const motivo = String(b.motivo || "").trim();
        // già usato: non si tocca — quei soldi sono già stati scontati a qualcuno
        const { data, error } = await supabase.from("coupons")
            .update({
                stato: "annullato", redeemed_at: new Date().toISOString(),
                redeemed_ref: `annullato da ${io_.full_name || _s.id}${motivo ? ": " + motivo : ""}`,
            })
            .eq("code", code).eq("stato", "attivo").select("code, valore_residuo");
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!data?.length) return NextResponse.json({ error: "coupon non trovato, o non è più attivo" }, { status: 409 });
        return NextResponse.json({ ok: true, code: data[0].code });
    }

    return NextResponse.json({ error: "azione non riconosciuta" }, { status: 400 });
}
