import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { buildRequestXml, type FiscalItem, type FiscalPayment } from "@/lib/fiscalprint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* RICOSTRUZIONE dell'XML di uno scontrino fiscale dai suoi stessi comandi ePOS.
   Serve alla ristampa: NON si ricopia l'XML vecchio alla lettera (poteva avere il
   bug del «non riscosso = servizi», index 00), ma si ri-passa dal costruttore
   attuale, che applica gli indici giusti (carta 02, non riscosso 01=BENI) e ribilancia
   i pagamenti al totale. Così un vecchio scontrino sbagliato si riemette CORRETTO. */
const attr = (tag: string, a: string) => (tag.match(new RegExp(`${a}="([^"]*)"`)) || [])[1];
// de-escape XML: le descrizioni salvate sono già escapate (&amp; ...); il costruttore
// le ri-escapa, quindi qui vanno riportate in chiaro per non raddoppiare gli escape.
const deEsc = (s: string) => (s ?? "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
function itemsDaXml(xml: string): FiscalItem[] {
    return (xml.match(/<printRecItem\b[^>]*\/>/g) || []).map((t) => ({
        description: deEsc(attr(t, "description") ?? ""),
        quantity: Number(attr(t, "quantity") ?? "1") || 1,
        unitPrice: Number(attr(t, "unitPrice") ?? "0"),
        department: Number(attr(t, "department") ?? "0"),
    }));
}
function pagamentiDaXml(xml: string): FiscalPayment[] {
    return (xml.match(/<printRecTotal\b[^>]*\/>/g) || []).map((t) => ({
        description: deEsc(attr(t, "description") ?? ""),
        amount: Number(attr(t, "payment") ?? "0"),
        paymentType: Number(attr(t, "paymentType") ?? "0"),
    }));
}
function scontoDaXml(xml: string): number {
    const m = xml.match(/<printRecSubtotalAdjustment\b[^>]*amount="([^"]*)"/);
    return m ? Number(m[1]) || 0 : 0;
}

// RISTAMPA / riemissione di un documento che NON è uscito (Luca 01/09 sera:
// «in Documenti, quando c'è scritto NON USCITO in rosso, un tasto per rifare lo
// scontrino se non è uscito»). Rimette in coda LA STESSA richiesta ePOS verso lo
// STESSO registratore, come NUOVO job — l'originale in errore RESTA come storico,
// così un'eventuale doppia emissione resta VISIBILE e correggibile (non si nasconde
// riscrivendo la riga vecchia).
//   POST { jobId }
// ⚠️ Solo su documenti in stato "error": un documento "done" è già uscito e NON si
// rifà da qui (si annulla). La responsabilità di «non è davvero uscito» resta di chi
// preme: sugli esiti ignoti / rimasti aperti la carta può essere uscita lo stesso —
// la UI lo avvisa.
export async function POST(req: Request) {
    {
        // 🔒 sessione firmata + permesso della sezione (come annullo/scontrino)
        const _g = await accesso(req, "vendita/scontrino");
        if (!_g.ok) return _g.risposta;
    }
    const b: any = await req.json().catch(() => ({}));
    if (!b.jobId) return NextResponse.json({ error: "jobId mancante" }, { status: 400 });

    const { data: orig, error } = await supabase.from("print_jobs")
        .select("negozio, device_url, kind, status, request_xml, meta").eq("id", b.jobId).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!orig) return NextResponse.json({ error: "documento non trovato" }, { status: 404 });
    if (!orig.request_xml) return NextResponse.json({ error: "questo documento non ha una richiesta da rifare" }, { status: 400 });
    if (orig.status !== "error") {
        return NextResponse.json({
            error: orig.status === "done"
                ? "questo documento è già uscito: se è sbagliato si annulla, non si rifà"
                : `il documento non è in errore (stato: ${orig.status}) — non c'è niente da rifare`,
        }, { status: 400 });
    }

    /* ⛔ UNA SOLA RISTAMPA PER DOCUMENTO (Luca 01/09 notte — INCIDENTE: gli
       scontrini «rimasti aperti» si stavano TRIPLICANDO perché il tasto si poteva
       premere all'infinito, e ogni pressione è un tentativo di documento fiscale →
       rischio di tasse doppie/triple). La difesa VERA sta qui sul server, non nella
       UI (un reload azzererebbe lo stato del browser): se di questo documento esiste
       già una ristampa, si RIFIUTA. Chi deve rifarlo ancora guarda prima l'esito
       della ristampa già fatta (e se la cassa è «rimasta aperta», la chiude DALLA
       CASSA — un secondo invio non la chiude). */
    const { data: giaRifatto } = await supabase.from("print_jobs")
        .select("id, status").eq("meta->>ristampaDi", b.jobId).limit(1);
    if (giaRifatto && giaRifatto.length) {
        return NextResponse.json({
            error: "Questo documento è già stato rimesso in coda una volta. Guarda in elenco com'è andata la ristampa prima di rifarlo. "
                + "Se la cassa è «rimasta aperta», chiudi o annulla il documento DALLA CASSA: un nuovo invio non la chiude.",
            jobId: giaRifatto[0].id,
        }, { status: 409 });
    }

    /* ── L'XML DA RIMETTERE IN CODA ──────────────────────────────────────────
       Per uno SCONTRINO FISCALE si RICOSTRUISCE dai suoi comandi, così passa dagli
       indici giusti di oggi (il vecchio bug «non riscosso = servizi/index 00» su un
       telefono faceva rifiutare il totale e restare aperta la cassa): un vecchio
       scontrino sbagliato si riemette CORRETTO. Per gli altri tipi (non fiscale,
       annullo, Z) si ricopia tale e quale — non hanno quel problema.
       ⚠️ Se la cassa è «rimasta aperta», l'XML corretto non basta: il documento
       aperto va chiuso DALLA CASSA prima (la UI lo avvisa). */
    let request_xml = orig.request_xml;
    if (orig.kind === "fiscal_receipt") {
        const items = itemsDaXml(orig.request_xml);
        if (items.length) {
            try {
                const rifatto = buildRequestXml("fiscal_receipt", {
                    items,
                    payment: pagamentiDaXml(orig.request_xml),
                    sconto: scontoDaXml(orig.request_xml),
                });
                if (rifatto) request_xml = rifatto;
            } catch (e: any) {
                return NextResponse.json({ error: "non riesco a ricostruire lo scontrino: " + (e?.message || "dati non validi") }, { status: 400 });
            }
        }
    }

    // nuovo job verso lo STESSO registratore, con il riferimento all'originale nel
    // meta (tracciabilità della ristampa; è anche la chiave del blocco «una sola volta»).
    const meta = { ...(orig.meta && typeof orig.meta === "object" ? orig.meta : {}), ristampaDi: b.jobId };
    const { data, error: e2 } = await supabase.from("print_jobs")
        .insert({
            negozio: orig.negozio,
            device_url: orig.device_url,
            kind: orig.kind,
            request_xml,
            status: "pending",
            meta,
        }).select("id").single();
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

    return NextResponse.json({ ok: true, jobId: data.id });
}
