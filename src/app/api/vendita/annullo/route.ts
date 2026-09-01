import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { buildRequestXml, VoidType } from "@/lib/fiscalprint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ANNULLO / RESO di uno scontrino fiscale già emesso dal CRM.
//   POST { jobId, type?: "VOID"|"REFUND" }
// Legge la RISPOSTA del registratore salvata sul job originale (print_jobs.result:
// zRepNumber, fiscalReceiptNumber, data, matricola) e mette in coda il documento di
// annullo verso LO STESSO registratore. Nessun numero va inserito a mano → niente
// errori di battitura sui dati fiscali. Comando verificato (printRecMessage type=4).
//
// In alternativa a jobId si possono passare i riferimenti espliciti:
//   { negozio, deviceUrl, zRep, docNum, date(ddMMyyyy o ISO), matricola, type? }
export async function POST(req: Request) {
    {
        // 🔒 sessione firmata + permesso della sezione, come nello scontrino
        const _g = await accesso(req, "vendita/scontrino");
        if (!_g.ok) return _g.risposta;
    }
    const b: any = await req.json().catch(() => ({}));
    const type: VoidType = b.type === "REFUND" ? "REFUND" : "VOID";

    let negozio: string | null = b.negozio ?? null;
    let deviceUrl: string | null = b.deviceUrl ?? null;
    let zRep = b.zRep, docNum = b.docNum, date = b.date, matricola = b.matricola;

    // Percorso principale: risalire i dati dal job originale.
    if (b.jobId) {
        const { data: orig, error } = await supabase.from("print_jobs")
            .select("negozio, device_url, kind, status, result").eq("id", b.jobId).maybeSingle();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!orig) return NextResponse.json({ error: "scontrino originale non trovato" }, { status: 404 });
        if (orig.status !== "done") return NextResponse.json({ error: `lo scontrino originale non risulta emesso (stato: ${orig.status})` }, { status: 400 });

        const r = String(orig.result || "");
        const get = (tag: string) => (r.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, "i")) || [])[1]?.trim();
        const succ = /success="true"/.test(r);
        const frn = get("fiscalReceiptNumber");
        const zrn = get("zRepNumber");
        const iso = get("receiptISODateTime"); // es. 20260831T232700
        const dataIt = get("fiscalReceiptDate"); // es. 31/8/2026
        const serial = get("serialNumber");
        if (!succ || !frn || !zrn) {
            return NextResponse.json({ error: "lo scontrino originale non ha i dati fiscali (numero/Z): impossibile annullare" }, { status: 400 });
        }
        negozio = negozio || orig.negozio;
        deviceUrl = deviceUrl || orig.device_url;
        zRep = zRep ?? zrn;
        docNum = docNum ?? frn;
        matricola = matricola || serial;
        // data → ddMMyyyy: preferisci l'ISO (YYYYMMDD), altrimenti d/m/yyyy italiano.
        if (!date) {
            if (iso && /^\d{8}/.test(iso)) date = iso.slice(6, 8) + iso.slice(4, 6) + iso.slice(0, 4);
            else if (dataIt) { const [d, m, y] = dataIt.split("/"); date = d.padStart(2, "0") + m.padStart(2, "0") + y; }
        }
    }

    if (!deviceUrl) return NextResponse.json({ error: "registratore (device_url) mancante" }, { status: 400 });
    if (zRep == null || docNum == null || !date || !matricola) {
        return NextResponse.json({ error: "dati per l'annullo incompleti (zRep, docNum, data, matricola)" }, { status: 400 });
    }
    if (!/^https?:\/\//i.test(String(deviceUrl))) {
        // I registratori Custom non hanno ancora il percorso di annullo fiscale.
        return NextResponse.json({ error: "annullo non disponibile su registratore Custom (solo Epson RT per ora)" }, { status: 400 });
    }

    const request_xml = buildRequestXml("fiscal_void", { voidRef: { zRep, docNum, date, matricola, type } });
    if (!request_xml) return NextResponse.json({ error: "impossibile costruire il comando di annullo" }, { status: 500 });

    const { data, error } = await supabase.from("print_jobs")
        .insert({ negozio, device_url: deviceUrl, kind: "fiscal_void", request_xml, status: "pending" })
        .select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, jobId: data.id, tipo: type, riferimento: { zRep: String(zRep), docNum: String(docNum), date, matricola } });
}
