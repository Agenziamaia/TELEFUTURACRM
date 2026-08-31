import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { buildRequestXml } from "@/lib/fiscalprint";
import { formaPagamento } from "@/lib/pos";
import { validaCoupon, redimiCoupon } from "@/lib/coupons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RT di fallback se il negozio non ha una mappa pos_rt (negozio non multi-societario).
const DEFAULT_RT = process.env.RT_DEVICE_URL || "http://192.168.1.219";

// Emette lo/gli scontrino/i dal carrello di Registra Vendita → coda print_jobs.
// MULTI-SOCIETARIO (spec Francesco #1): ogni prodotto ha un'azienda (marg_items.azienda,
// default = azienda del negozio in pos_rt). Le voci si RAGGRUPPANO per azienda e ogni
// gruppo diventa uno scontrino inviato al RT di quell'azienda (P.IVA separate).
// TEST mode (default): stampa DOCUMENTO NON FISCALE, niente Agenzia Entrate.
//   POST { negozio?, deviceUrl?, items:[{productId?,description,unitPrice,qty?,reparto?}],
//          paymentType?, paymentDescription?, paidAmount?, dryRun? }
export async function POST(req: Request) {
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    {
        // 🔒 sessione firmata + permesso della sezione, come nel pannello
        const _g = await accesso(req, "vendita/scontrino");
        if (!_g.ok) return _g.risposta;
        const _s = _g.sess;
    }

    const b: any = await req.json().catch(() => ({}));
    const righe: any[] = Array.isArray(b.items) ? b.items : [];
    if (!righe.length) return NextResponse.json({ error: "carrello vuoto" }, { status: 400 });
    const negozio = b.negozio ?? null;

    // TEST mode per negozio — default TRUE (sicuro).
    let testMode = true;
    if (negozio) {
        const { data } = await supabase.from("pos_scontrino_negozi").select("test_mode").eq("negozio", negozio).maybeSingle();
        if (data && data.test_mode === false) testMode = false;
    }

    // Mappa azienda -> RT per il negozio (multi-societario).
    const aziende: Record<string, { rt_url: string }> = {};
    let defaultAzienda: string | null = null;
    if (negozio) {
        const { data } = await supabase.from("pos_rt").select("azienda, rt_url, is_default").eq("negozio", negozio);
        (data || []).forEach((r: any) => {
            aziende[r.azienda] = { rt_url: r.rt_url };
            if (r.is_default) defaultAzienda = r.azienda;
        });
    }
    /* MAI LA STAMPANTE DI UN ALTRO NEGOZIO (Luca 31/08, tre negozi in prova).
       `DEFAULT_RT` è un indirizzo vero — la cassa T1 di Donna — e serviva da
       ripiego quando la società della riga non ha un registratore in questo
       negozio. Ma Magliana è DUE negozi nello stesso locale con una società
       ciascuno: Magliana W3 ha solo T1, Magliana Multi solo T2, e chi lavora
       in uno può leggere l'IMEI di un pezzo dell'altro (stesso magazzino
       fisico). Bastava quello: lo scontrino di una vendita fatta a Magliana
       sarebbe uscito dalla stampante di Donna, in un altro quartiere.
       Il ripiego resta solo dove il negozio non ha proprio nessun
       registratore configurato — lì non c'è niente da confondere. */
    const rtFor = (az: string) => aziende[az]?.rt_url
        || (Object.keys(aziende).length === 0 ? (b.deviceUrl || DEFAULT_RT) : null);

    /* DI CHI È LA MERCE, QUANDO LA RIGA NON LO DICE (revisore 29/08).
       Una riga che arriva da una scorciatoia porta il codice articolo ma non
       la società: lasciarla al default del negozio significa scaricare
       l'inventario di una società e fatturare dall'altra — PLKasko ha 42
       pezzi a Telefutura 1, ma il default di Donna è Telefutura 2.
       Qui il negozio si sa, quindi la risposta si può leggere: la merce è di
       chi i pezzi ce li ha. Una query sola per scontrino. */
    const societaDelCodice: Record<string, string> = {};
    if (negozio) {
        const codici = [...new Set(righe.map((r) => String(r.codice || "")).filter(Boolean))];
        if (codici.length) {
            const { data } = await supabase.from("mag_giacenze")
                .select("codice,azienda,quantita").eq("negozio", negozio).in("codice", codici);
            (data || []).forEach((g: { codice: string; azienda: string; quantita: number }) => {
                if (!g.azienda) return;
                // fra due società vince quella che i pezzi ce li ha davvero
                if (!societaDelCodice[g.codice] || Number(g.quantita) > 0) societaDelCodice[g.codice] = g.azienda;
            });
        }
    }

    // reparto + va_in_scontrino + azienda AUTORITATIVI da marg_items (per UUID "mi_<id>" o per NOME).
    const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    const stripId = (pid: any) => { const s = String(pid || ""); return s.startsWith("mi_") ? s.slice(3) : s; };
    const ids = [...new Set(righe.map((r) => stripId(r.productId)).filter(isUuid))];
    const names = [...new Set(righe.map((r) => String(r.description || "").trim()).filter(Boolean))];
    type Meta = { reparto: number | null; va: boolean; azienda: string | null };
    const byId: Record<string, Meta> = {};
    const byName: Record<string, Meta> = {};
    if (ids.length) {
        const { data, error } = await supabase.from("marg_items").select("id, reparto, va_in_scontrino, azienda").in("id", ids);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        (data || []).forEach((m: any) => { byId[m.id] = { reparto: m.reparto ?? null, va: m.va_in_scontrino !== false, azienda: m.azienda ?? null }; });
    }
    if (names.length) {
        const { data } = await supabase.from("marg_items").select("name, reparto, va_in_scontrino, azienda").in("name", names);
        (data || []).forEach((m: any) => { byName[String(m.name).trim()] = { reparto: m.reparto ?? null, va: m.va_in_scontrino !== false, azienda: m.azienda ?? null }; });
    }

    // Costruisci le voci raggruppate per AZIENDA ("__def" = azienda di default / negozio non multi).
    type FI = { description: string; quantity: number; unitPrice: number; department: number };
    const gruppi: Record<string, FI[]> = {};
    const esclusi: { description: string; motivo: string }[] = [];
    for (const r of righe) {
        const meta = byId[stripId(r.productId)] || byName[String(r.description || "").trim()] || null;
        const va = meta ? meta.va : true;
        const reparto = meta && meta.reparto != null ? meta.reparto : (r.reparto ?? null);
        /* AZIENDA DELLA RIGA: prodotto (se fissato) > SOCIETÀ DELLA MERCE >
           scelta dell'operatore > default negozio.
           La società della merce (revisore 29/08) è il pezzo che mancava: un
           articolo di magazzino porta con sé di chi è (il Wind3 è di
           Telefutura, il Multi di Telefutura 2), e lo scontrino lo deve
           emettere QUELLA società — non quella che l'operatore ha lasciato
           selezionata. Le voci di un carrello misto finiscono già in gruppi
           separati qui sotto, quindi escono due scontrini, uno per società. */
        const az = (meta && meta.azienda) || r.azienda || societaDelCodice[String(r.codice || "")] || b.azienda || defaultAzienda || "__def";
        const desc = String(r.description || "ARTICOLO").slice(0, 38);
        const price = Number(r.unitPrice);
        const qty = Number(r.qty) > 0 ? Number(r.qty) : 1;
        if (!va) { esclusi.push({ description: desc, motivo: "esclusa dallo scontrino" }); continue; }
        if (!(price >= 0)) { esclusi.push({ description: desc, motivo: "prezzo non valido" }); continue; }
        if (!testMode && !(Number.isInteger(reparto) && reparto >= 1 && reparto <= 40)) {
            esclusi.push({ description: desc, motivo: "reparto IVA non assegnato" });
            continue;
        }
        // la società di questa riga ha un registratore QUI? Se no, la riga non
        // è stampabile in questo negozio: si dice, non si stampa altrove.
        if (az !== "__def" && Object.keys(aziende).length > 0 && !aziende[az]) {
            esclusi.push({ description: desc, motivo: `${az} non ha un registratore in questo negozio` });
            continue;
        }
        (gruppi[az] ||= []).push({ description: desc, quantity: qty, unitPrice: price, department: (reparto ?? 0) as number });
    }

    const totalPrintable = Object.values(gruppi).reduce((n, a) => n + a.length, 0);
    if (!totalPrintable) {
        return NextResponse.json({ error: "nessuna voce stampabile (reparto mancante o voci escluse)", esclusi }, { status: 400 });
    }

    /* Pre-check (dryRun): valida SENZA mettere in coda.
       BASTA UNA VOCE ESCLUSA PER FERMARE TUTTO (revisore 29/08). Prima il
       pre-check diceva «ok» se almeno UNA riga era stampabile: col carrello
       misto — una cover più una SIM senza reparto — si incassavano i contanti
       dell'intero totale, usciva lo scontrino della sola cover e la SIM
       finiva in una riga di coda che nessuno legge. Corrispettivo incassato e
       non certificato, cassa e registratore che non tornano più.
       Le voci volutamente fuori scontrino (`va_in_scontrino = false`) non
       contano: quelle è giusto che non si stampino. */
    const escluseVere = esclusi.filter((e) => e.motivo !== "esclusa dallo scontrino");
    if (b.dryRun) {
        if (escluseVere.length) {
            return NextResponse.json({
                error: escluseVere.map((e) => `«${e.description}»: ${e.motivo}`).join(" · "),
                esclusi, testMode,
            }, { status: 400 });
        }
        return NextResponse.json({ ok: true, stampabili: totalPrintable, aziende: Object.keys(gruppi).filter((a) => a !== "__def"), esclusi, testMode });
    }

    const paymentDescr = b.paymentDescription || (Number(b.paymentType) === 2 ? "CARTA" : "CONTANTE");
    const nGruppi = Object.keys(gruppi).length;
    const receipts: any[] = [];

    // PAGAMENTI multipli (spec #2, max 3): [{forma, importo}]. I codici RT sono
    // AUTORITATIVI lato server (formaPagamento), il client manda solo forma+importo.
    // Applicabile solo con UN unico scontrino (un'unica azienda): con più aziende
    // la ripartizione dei tender per società è ambigua → si torna al pagamento singolo.
    const pagamentiIn: any[] = Array.isArray(b.pagamenti) ? b.pagamenti.slice(0, 3) : [];
    const buildPayments = (defaultAmount?: number) => {
        if (pagamentiIn.length && nGruppi === 1) {
            return pagamentiIn
                .filter((p) => Number(p?.importo) > 0)
                .map((p) => {
                    const f = formaPagamento(String(p.forma));
                    return { description: (f?.short || "CONTANTE"), paymentType: f ? f.paymentType : 0, amount: Number(p.importo) };
                });
        }
        const single: any = { description: paymentDescr, paymentType: Number.isFinite(Number(b.paymentType)) ? Number(b.paymentType) : 0 };
        if (defaultAmount != null) single.amount = defaultAmount;
        else if (b.paidAmount != null && nGruppi === 1) single.amount = Number(b.paidAmount);
        return [single];
    };

    // COUPON (spec Francesco): sconto che ABBASSA l'imponibile. Solo con UN unico
    // scontrino (una società). Si VALIDA qui (senza consumare); si CONSUMA solo DOPO
    // aver messo in coda lo scontrino, così un errore non brucia il coupon. Monouso:
    // il residuo (valore - sconto) rigenera un nuovo coupon da dare al cliente.
    let couponSconto = 0;
    let couponCode: string | null = null;
    let nuovoCoupon: { code: string; valore: number } | null = null;
    if (b.coupon && b.coupon.code && nGruppi === 1 && Number(b.coupon.sconto) > 0) {
        const scontoReq = +Number(b.coupon.sconto).toFixed(2);
        const v = await validaCoupon(String(b.coupon.code));
        if (!v.valido) return NextResponse.json({ error: "Coupon: " + (v.motivo || "non valido") }, { status: 400 });
        if ((v.valore_residuo || 0) + 0.001 < scontoReq) return NextResponse.json({ error: `Coupon: valore cambiato (residuo ${(v.valore_residuo || 0).toFixed(2)}€), riprova` }, { status: 400 });
        couponSconto = scontoReq;
        couponCode = v.code || String(b.coupon.code);
    }

    for (const [az, items] of Object.entries(gruppi)) {
        const totale = +(items.reduce((t, i) => t + i.unitPrice * i.quantity, 0)).toFixed(2);
        // lo sconto coupon vale solo col singolo scontrino (nGruppi===1 → un solo giro).
        const scontoGruppo = nGruppi === 1 ? Math.min(couponSconto, totale) : 0;
        const netTotale = +(totale - scontoGruppo).toFixed(2);
        let request_xml: string | null;
        let kind: string;
        try {
            if (testMode) {
                const lines = [
                    "*** DOCUMENTO NON FISCALE ***",
                    "          (PROVA)",
                    ...(az !== "__def" ? [`Azienda: ${aziende[az] ? az : az}`] : []),
                    "",
                    ...items.map((i) => `${i.description}  x${i.quantity}   EUR ${(i.unitPrice * i.quantity).toFixed(2)}`),
                    "--------------------------------",
                    ...(scontoGruppo > 0 ? [`SCONTO COUPON  -EUR ${scontoGruppo.toFixed(2)}`] : []),
                    `TOTALE        EUR ${netTotale.toFixed(2)}`,
                    // Dettaglio pagamenti come nel fiscale (spec Francesco D): una riga per
                    // forma, con importo e "(non riscosso)" dove applicabile.
                    "Pagamenti:",
                    ...((pagamentiIn.length && nGruppi === 1)
                        ? pagamentiIn.filter((p: any) => Number(p?.importo) > 0).map((p: any) => {
                            const f = formaPagamento(String(p.forma));
                            return `  ${(f?.short || "CONTANTE")}${f && f.riscosso === false ? " (non riscosso)" : ""}   EUR ${Number(p.importo).toFixed(2)}`;
                        })
                        : [`  ${paymentDescr}   EUR ${netTotale.toFixed(2)}`]),
                    "",
                    "Non valido ai fini fiscali",
                ];
                request_xml = buildRequestXml("non_fiscal", { lines });
                kind = "non_fiscal";
            } else {
                request_xml = buildRequestXml("fiscal_receipt", { items, payment: buildPayments(netTotale), sconto: scontoGruppo });
                kind = "fiscal_receipt";
            }
        } catch (e: any) {
            return NextResponse.json({ error: e?.message || "dati non validi", receipts }, { status: 400 });
        }
        if (!request_xml) return NextResponse.json({ error: "impossibile costruire lo scontrino" }, { status: 400 });

        const { data, error } = await supabase.from("print_jobs").insert({
            negozio,
            device_url: rtFor(az) as string,
            kind,
            request_xml,
            status: "pending",
            meta: { total: netTotale, sconto: scontoGruppo || 0, azienda: az === "__def" ? null : az, items: items.length, testMode, coupon: couponCode || null },
        }).select("id").single();
        if (error) return NextResponse.json({ error: error.message, receipts }, { status: 500 });
        receipts.push({ azienda: az === "__def" ? null : az, rt: rtFor(az), jobId: data.id, stampate: items.length, totale: netTotale, sconto: scontoGruppo });
    }

    // Ora che lo scontrino è in coda, CONSUMA il coupon (monouso) e rigenera il residuo.
    let couponWarning: string | undefined;
    if (couponCode && couponSconto > 0) {
        const c = await redimiCoupon(couponCode, couponSconto, `scontrino:${negozio || ""}`, negozio, b.createdBy || null);
        if (c.ok) nuovoCoupon = c.nuovoCoupon || null;
        else couponWarning = c.error || "coupon non consumato";
    }

    return NextResponse.json({ ok: true, testMode, receipts, stampate: totalPrintable, esclusi, scontoCoupon: couponSconto, nuovoCoupon, couponWarning });
}
