import { NextResponse } from "next/server";
import { richiedeSessione, rispostaSessioneNonValida } from "@/lib/sessioneServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reparti & IVA (spec Luca): mappa reparto -> aliquota/natura, editabile da Amministrazione.
// GET  → elenco reparti (1..40).
// PUT  { reparti:[{reparto,descrizione,aliquota,natura,attivo}] }  → upsert (uno o tutti).
export async function GET() {
    const { data, error } = await supabase.from("pos_reparti")
        .select("reparto, descrizione, aliquota, natura, attivo").order("reparto");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Quali prodotti (che vanno sullo scontrino) usano ciascun reparto — per l'audit.
    const { data: items } = await supabase.from("marg_items")
        .select("name, reparto, va_in_scontrino, active");
    const byReparto: Record<number, string[]> = {};
    const senzaReparto: string[] = [];
    (items || []).forEach((it: any) => {
        if (it.active === false || it.va_in_scontrino === false) return; // non attivo o escluso dallo scontrino
        const nome = String(it.name || "").trim() || "(senza nome)";
        if (it.reparto == null) senzaReparto.push(nome);
        else (byReparto[it.reparto] ||= []).push(nome);
    });
    const reparti = (data || []).map((r: any) => ({ ...r, prodotti: (byReparto[r.reparto] || []).sort() }));
    return NextResponse.json({ ok: true, reparti, senzaReparto: senzaReparto.sort() });
}

export async function PUT(req: Request) {
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    {
        const _s = richiedeSessione(req);
        if (!_s) return rispostaSessioneNonValida();
    }

    const b: any = await req.json().catch(() => ({}));
    const rows: any[] = Array.isArray(b.reparti) ? b.reparti : (b.reparto != null ? [b] : []);
    const payload = rows
        .filter((r) => Number.isInteger(Number(r.reparto)) && Number(r.reparto) >= 1 && Number(r.reparto) <= 40)
        .map((r) => ({
            reparto: Number(r.reparto),
            descrizione: (r.descrizione ?? "").toString().slice(0, 60) || null,
            aliquota: r.aliquota === "" || r.aliquota == null ? null : Number(r.aliquota),
            natura: (r.natura ?? "").toString().trim().toUpperCase().slice(0, 4) || null,
            attivo: r.attivo !== false,
            updated_at: new Date().toISOString(),
        }));
    if (!payload.length) return NextResponse.json({ error: "nessun reparto valido" }, { status: 400 });
    const { error } = await supabase.from("pos_reparti").upsert(payload, { onConflict: "reparto" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, saved: payload.length });
}
