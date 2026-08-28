import { NextResponse } from "next/server";
import { richiedeSessione, rispostaSessioneNonValida } from "@/lib/sessioneServer";
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
        const _s = richiedeSessione(req);
        if (!_s) return rispostaSessioneNonValida();
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
export async function POST(req: Request) {
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    {
        const _s = richiedeSessione(req);
        if (!_s) return rispostaSessioneNonValida();
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

    return NextResponse.json({ error: "azione non riconosciuta" }, { status: 400 });
}
