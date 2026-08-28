import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Conti in sospeso (spec Francesco): la vendita è registrata ma lo scontrino si fa
// DOPO (il cliente torna a pagare). Qui si SALVA il conto (POST), si LISTA per negozio
// (GET) e si CHIUDE quando completato o annullato (PATCH). Lo scontrino/incasso vero
// avviene poi riaprendo il modale Incasso & Scontrino con questi items.

// POST { negozio, cliente?, items:[...], totale?, azienda?, note?, createdBy? }
export async function POST(req: Request) {
    const b: any = await req.json().catch(() => ({}));
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) return NextResponse.json({ error: "nessuna voce da sospendere" }, { status: 400 });
    const { data, error } = await supabase.from("vendite_sospese").insert({
        negozio: b.negozio ?? null,
        cliente: b.cliente ?? null,
        items,
        totale: b.totale != null ? Number(b.totale) : null,
        azienda: b.azienda ?? null,
        note: b.note ?? null,
        created_by: b.createdBy ?? null,
        stato: "in_sospeso",
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
}

// GET ?negozio=Donna → conti in sospeso aperti del negozio (per il pulsante rosso).
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const negozio = searchParams.get("negozio");
    let q = supabase.from("vendite_sospese")
        .select("id, negozio, cliente, items, totale, azienda, note, created_by, created_at")
        .eq("stato", "in_sospeso").order("created_at", { ascending: false }).limit(200);
    if (negozio) q = q.eq("negozio", negozio);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, sospesi: data || [] });
}

// PATCH { id, stato: "completata" | "annullata" } → chiude il conto in sospeso.
export async function PATCH(req: Request) {
    const b: any = await req.json().catch(() => ({}));
    if (!b.id) return NextResponse.json({ error: "id richiesto" }, { status: 400 });
    const stato = b.stato === "annullata" ? "annullata" : "completata";
    const { error } = await supabase.from("vendite_sospese")
        .update({ stato, completed_at: new Date().toISOString() }).eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
