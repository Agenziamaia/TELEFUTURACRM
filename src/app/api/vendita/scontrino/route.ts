import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { buildRequestXml } from "@/lib/fiscalprint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RT del negozio con la cassa automatica (Telefutura 1 = 192.168.1.219).
// Sovrascrivibile per riga negozio via body.deviceUrl o env RT_DEVICE_URL.
const DEFAULT_RT = process.env.RT_DEVICE_URL || "http://192.168.1.219";

// Emette lo scontrino fiscale dal carrello di Registra Vendita mettendolo in
// coda a print_jobs (lo ritira l'agente del negozio → RT Epson).
// Il REPARTO IVA per voce è AUTORITATIVO da marg_items (impostato dalla direzione
// nel Catalogo Marginalità): il client non può forzare un'IVA sbagliata. Le voci
// senza reparto o escluse dallo scontrino NON vengono stampate (riportate in `esclusi`).
//   POST { negozio?, deviceUrl?, items:[{productId?,description,unitPrice,qty?,reparto?}],
//          paymentType?, paymentDescription?, paidAmount? }
export async function POST(req: Request) {
    const b: any = await req.json().catch(() => ({}));
    const righe: any[] = Array.isArray(b.items) ? b.items : [];
    if (!righe.length) return NextResponse.json({ error: "carrello vuoto" }, { status: 400 });

    // reparto + va_in_scontrino AUTORITATIVI da marg_items. Il productId del carrello
    // è "mi_<uuid>" (voce marg_items) oppure un id legacy/"auto"/"vendita_usato":
    // risolviamo per UUID (togliendo il prefisso) o, in fallback, per NOME (=description).
    const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    const stripId = (pid: any) => { const s = String(pid || ""); return s.startsWith("mi_") ? s.slice(3) : s; };
    const ids = [...new Set(righe.map((r) => stripId(r.productId)).filter(isUuid))];
    const names = [...new Set(righe.map((r) => String(r.description || "").trim()).filter(Boolean))];
    const byId: Record<string, { reparto: number | null; va: boolean }> = {};
    const byName: Record<string, { reparto: number | null; va: boolean }> = {};
    if (ids.length) {
        const { data, error } = await supabase.from("marg_items").select("id, reparto, va_in_scontrino").in("id", ids);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        (data || []).forEach((m: any) => { byId[m.id] = { reparto: m.reparto ?? null, va: m.va_in_scontrino !== false }; });
    }
    if (names.length) {
        const { data } = await supabase.from("marg_items").select("name, reparto, va_in_scontrino").in("name", names);
        (data || []).forEach((m: any) => { byName[String(m.name).trim()] = { reparto: m.reparto ?? null, va: m.va_in_scontrino !== false }; });
    }

    const items: { description: string; quantity: number; unitPrice: number; department: number }[] = [];
    const esclusi: { description: string; motivo: string }[] = [];
    for (const r of righe) {
        const meta = byId[stripId(r.productId)] || byName[String(r.description || "").trim()] || null;
        const va = meta ? meta.va : true; // voci senza corrispondenza: default sì (poi serve il reparto)
        const reparto = meta && meta.reparto != null ? meta.reparto : (r.reparto ?? null);
        const desc = String(r.description || "ARTICOLO").slice(0, 38);
        const price = Number(r.unitPrice);
        const qty = Number(r.qty) > 0 ? Number(r.qty) : 1;
        if (!va) { esclusi.push({ description: desc, motivo: "esclusa dallo scontrino" }); continue; }
        if (!(Number.isInteger(reparto) && reparto >= 1 && reparto <= 40)) {
            esclusi.push({ description: desc, motivo: "reparto IVA non assegnato" });
            continue;
        }
        if (!(price >= 0)) { esclusi.push({ description: desc, motivo: "prezzo non valido" }); continue; }
        items.push({ description: desc, quantity: qty, unitPrice: price, department: reparto });
    }

    if (!items.length) {
        return NextResponse.json({ error: "nessuna voce stampabile (reparto mancante o voci escluse)", esclusi }, { status: 400 });
    }

    // Pre-check (dryRun): conferma che lo scontrino è emettibile SENZA metterlo in
    // coda. Il modale lo chiama PRIMA di incassare i contanti, così NON prende soldi
    // se lo scontrino non potrebbe uscire.
    if (b.dryRun) return NextResponse.json({ ok: true, stampabili: items.length, esclusi });

    const totale = +(items.reduce((t, i) => t + i.unitPrice * i.quantity, 0)).toFixed(2);
    const payment: any = {
        description: b.paymentDescription || (Number(b.paymentType) === 0 ? "CONTANTE" : "CARTA"),
        paymentType: Number.isFinite(Number(b.paymentType)) ? Number(b.paymentType) : 0,
    };
    if (b.paidAmount != null) payment.amount = Number(b.paidAmount);

    let request_xml: string | null;
    try {
        // buildRequestXml LANCIA se un reparto è mancante/non valido (sicurezza fiscale)
        request_xml = buildRequestXml("fiscal_receipt", { items, payment });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "dati non validi" }, { status: 400 });
    }
    if (!request_xml) return NextResponse.json({ error: "impossibile costruire lo scontrino" }, { status: 400 });

    const { data, error } = await supabase.from("print_jobs").insert({
        negozio: b.negozio ?? null,
        device_url: b.deviceUrl || DEFAULT_RT,
        kind: "fiscal_receipt",
        request_xml,
        status: "pending",
    }).select("id, kind, status, negozio, created_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, job: data, stampate: items.length, esclusi, totale });
}
