import { NextResponse } from "next/server";
import { generaCoupon, validaCoupon } from "@/lib/coupons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Coupon sconto (spec Francesco). La REDENZIONE avviene nel route dello scontrino
// (atomica con l'emissione + sconto). Qui:
//   POST { action:"genera", valore, negozio?, cliente?, usato_id?, origine?, createdBy? }
//   POST { action:"valida", code }
export async function POST(req: Request) {
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
