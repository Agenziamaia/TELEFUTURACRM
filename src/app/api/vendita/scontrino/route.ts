import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { buildRequestXml } from "@/lib/fiscalprint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RT del negozio con la cassa automatica (Telefutura 1 = 192.168.1.219).
// Sovrascrivibile per riga negozio via body.deviceUrl o env RT_DEVICE_URL.
const DEFAULT_RT = process.env.RT_DEVICE_URL || "http://192.168.1.219";

// Emette lo scontrino dal carrello di Registra Vendita → coda print_jobs (l'agente
// del negozio lo stampa). Se il negozio è in TEST (default), stampa un DOCUMENTO NON
// FISCALE (gestionale): i test NON trasmettono corrispettivi all'Agenzia delle Entrate
// (richiesta di Luca). In produzione (test_mode=false) emette lo scontrino fiscale
// VERO col REPARTO IVA autoritativo da marg_items.
//   POST { negozio?, deviceUrl?, items:[{productId?,description,unitPrice,qty?,reparto?}],
//          paymentType?, paymentDescription?, paidAmount?, dryRun? }
export async function POST(req: Request) {
    const b: any = await req.json().catch(() => ({}));
    const righe: any[] = Array.isArray(b.items) ? b.items : [];
    if (!righe.length) return NextResponse.json({ error: "carrello vuoto" }, { status: 400 });

    // TEST mode per negozio — default TRUE (sicuro: niente scontrino fiscale finché
    // Luca non mette il negozio in produzione con test_mode=false).
    let testMode = true;
    if (b.negozio) {
        const { data } = await supabase.from("pos_scontrino_negozi").select("test_mode").eq("negozio", b.negozio).maybeSingle();
        if (data && data.test_mode === false) testMode = false;
    }

    // reparto + va_in_scontrino AUTORITATIVI da marg_items. productId = "mi_<uuid>"
    // (voce marg_items) o id legacy/"auto": risolviamo per UUID o per NOME (=description).
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

    const fiscalItems: { description: string; quantity: number; unitPrice: number; department: number }[] = [];
    const testItems: { description: string; quantity: number; unitPrice: number }[] = [];
    const esclusi: { description: string; motivo: string }[] = [];
    for (const r of righe) {
        const meta = byId[stripId(r.productId)] || byName[String(r.description || "").trim()] || null;
        const va = meta ? meta.va : true;
        const reparto = meta && meta.reparto != null ? meta.reparto : (r.reparto ?? null);
        const desc = String(r.description || "ARTICOLO").slice(0, 38);
        const price = Number(r.unitPrice);
        const qty = Number(r.qty) > 0 ? Number(r.qty) : 1;
        if (!va) { esclusi.push({ description: desc, motivo: "esclusa dallo scontrino" }); continue; }
        if (!(price >= 0)) { esclusi.push({ description: desc, motivo: "prezzo non valido" }); continue; }
        if (testMode) {
            testItems.push({ description: desc, quantity: qty, unitPrice: price });
        } else {
            if (!(Number.isInteger(reparto) && reparto >= 1 && reparto <= 40)) {
                esclusi.push({ description: desc, motivo: "reparto IVA non assegnato" });
                continue;
            }
            fiscalItems.push({ description: desc, quantity: qty, unitPrice: price, department: reparto });
        }
    }

    const printableCount = testMode ? testItems.length : fiscalItems.length;
    if (!printableCount) {
        return NextResponse.json({ error: "nessuna voce stampabile (reparto mancante o voci escluse)", esclusi }, { status: 400 });
    }

    // Pre-check (dryRun): valida SENZA mettere in coda (il modale lo chiama prima di incassare).
    if (b.dryRun) return NextResponse.json({ ok: true, stampabili: printableCount, esclusi, testMode });

    const totale = +((testMode ? testItems : fiscalItems).reduce((t, i) => t + i.unitPrice * i.quantity, 0)).toFixed(2);
    const paymentDescr = b.paymentDescription || (Number(b.paymentType) === 0 ? "CONTANTE" : "CARTA");

    let request_xml: string | null;
    let kind: string;
    try {
        if (testMode) {
            const lines = [
                "*** DOCUMENTO NON FISCALE ***",
                "          (PROVA)",
                "",
                ...testItems.map((i) => `${i.description}  x${i.quantity}   EUR ${(i.unitPrice * i.quantity).toFixed(2)}`),
                "--------------------------------",
                `TOTALE        EUR ${totale.toFixed(2)}`,
                `Pagamento: ${paymentDescr}`,
                "",
                "Non valido ai fini fiscali",
            ];
            request_xml = buildRequestXml("non_fiscal", { lines });
            kind = "non_fiscal";
        } else {
            // Importo pagato: per contanti/carta = incassato (riscosso). Per il
            // "non riscosso" (finanziamento) il chiamante passa paidAmount = 0.
            const payment: any = { description: paymentDescr, paymentType: Number.isFinite(Number(b.paymentType)) ? Number(b.paymentType) : 0 };
            if (b.paidAmount != null) payment.amount = Number(b.paidAmount);
            request_xml = buildRequestXml("fiscal_receipt", { items: fiscalItems, payment });
            kind = "fiscal_receipt";
        }
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "dati non validi" }, { status: 400 });
    }
    if (!request_xml) return NextResponse.json({ error: "impossibile costruire lo scontrino" }, { status: 400 });

    const { data, error } = await supabase.from("print_jobs").insert({
        negozio: b.negozio ?? null,
        device_url: b.deviceUrl || DEFAULT_RT,
        kind,
        request_xml,
        status: "pending",
    }).select("id, kind, status, negozio, created_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, job: data, kind, testMode, stampate: printableCount, esclusi, totale });
}
