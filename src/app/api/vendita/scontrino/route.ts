import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { stessoMagazzino } from "@/lib/negoziNomi";
import { buildRequestXml } from "@/lib/fiscalprint";
import { formaPagamento } from "@/lib/pos";
import { validaCoupon, redimiCoupon } from "@/lib/coupons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RT di fallback se il negozio non ha una mappa pos_rt (negozio non multi-societario).
/* NIENTE STAMPANTE DI RIPIEGO (Luca 31/08). Qui c'era `DEFAULT_RT`, cioè
   l'indirizzo VERO della cassa T1 di Donna: serviva da ultima spiaggia quando
   non si sapeva su quale registratore stampare. Ma «non so su quale
   stampante» non si risolve scegliendone una a caso in un altro negozio.
   Quando il CRM non sa, non dice niente e decide l'agente del punto vendita,
   che la sua stampante ce l'ha in configurazione. */

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

    /* LOG DETTAGLIATO (spec Rahib 31/08, test multi-negozio): ogni tentativo di
       scontrino scrive una riga in pos_log — successo o errore — col contesto
       per capire e correggere. Solo lato server (service key), SEMPRE in
       try/catch: il log non deve MAI bloccare o rompere una vendita. */
    const logPos = async (esito: string, extra: any = {}) => {
        try {
            await supabase.from("pos_log").insert({
                negozio,
                azienda: extra.azienda ?? (b.azienda ?? null),
                rt_url: extra.rt_url ?? null,
                esito,
                test_mode: testMode,
                totale: extra.totale ?? null,
                items: extra.items ?? righe.length,
                esclusi: extra.esclusi ?? null,
                errore: extra.errore ?? null,
                job_ids: extra.job_ids ?? null,
                operatore: b.createdBy ?? null,
                dettagli: extra.dettagli ?? null,
            });
        } catch { /* il log non deve mai fermare una vendita */ }
    };

    /* ═══ I DUE REGISTRATORI DI UN LOCALE SOLO (Luca 31/08) ══════════════════
       «Sono al Wind3, ho un cliente davanti, gli vendo un prodotto del Multi:
        devo poter fare lo scontrino senza mandare il cliente dall'altra parte.»
       A Magliana, Acilia e Collatina le due insegne sono la STESSA STANZA, con
       un registratore per società a pochi metri. Prima la mappa si fermava al
       negozio selezionato: da Magliana W3 una riga di Telefutura 2 non trovava
       nessun registratore e veniva scartata, anche se quello giusto è lì.
       Ora la mappa comprende i gemelli. La società resta quella della MERCE —
       questo non si tocca, sono due partite IVA — ma il registratore si trova.

       IL LAVORO VA ALL'AGENTE DEL NEGOZIO CHE POSSIEDE IL REGISTRATORE, non a
       chi ha battuto lo scontrino: Acilia VS e Collatina W3 hanno `rt_url =
       'custom'`, cioè l'agente usa il driver del SUO dispositivo locale. Un
       lavoro «custom» consegnato all'agente sbagliato stamperebbe sulla
       stampante sbagliata — e sarebbe uno scontrino fiscale emesso da chi non
       doveva. La carta esce comunque dalla macchina di quella società, perché
       è quella il misuratore fiscale: non c'è modo di aggirarlo, e infatti
       Luca chiede di scegliere solo dove vanno i SOLDI (la cash machine),
       non dove esce la carta. */
    const aziende: Record<string, { rt_url: string; negozio: string }> = {};
    let defaultAzienda: string | null = null;
    if (negozio) {
        const { data: tuttiRt } = await supabase.from("pos_rt").select("negozio, azienda, rt_url, is_default");
        const qui = (tuttiRt || []).filter((r: any) => r.negozio === negozio);
        const accanto = (tuttiRt || []).filter((r: any) => r.negozio !== negozio && stessoMagazzino(r.negozio, negozio));
        // prima il proprio, poi il gemello: se la stessa società avesse un
        // registratore da entrambe le parti, vince quello dove si sta lavorando
        [...qui, ...accanto].forEach((r: any) => {
            if (!aziende[r.azienda]) aziende[r.azienda] = { rt_url: r.rt_url, negozio: r.negozio };
        });
        qui.forEach((r: any) => { if (r.is_default) defaultAzienda = r.azienda; });
    }
    /* MAI LA STAMPANTE DI UN ALTRO NEGOZIO (Luca 31/08, tre negozi in prova).
       Il ripiego era un indirizzo VERO — la cassa T1 di Donna — e scattava
       quando la società della riga non ha un registratore in questo negozio. Ma Magliana è DUE negozi nello stesso locale con una società
       ciascuno: Magliana W3 ha solo T1, Magliana Multi solo T2, e chi lavora
       in uno può leggere l'IMEI di un pezzo dell'altro (stesso magazzino
       fisico). Bastava quello: lo scontrino di una vendita fatta a Magliana
       sarebbe uscito dalla stampante di Donna, in un altro quartiere.
       Il ripiego resta solo dove il negozio non ha proprio nessun
       registratore configurato — lì non c'è niente da confondere. */
    /* «CUSTOM» È UNA STAMPANTE, NON UN SEGNAPOSTO (Luca 31/08 — correzione
       di una mia lettura sbagliata di stamattina).
       Otto negozi su quindici hanno `rt_url = 'custom'`: Promontori, Acilia
       VS, Baleniere, Castani, Collatina W3, Libia, Mazzini, Merulana. Avevo
       letto quel valore come «campo da riempire» e l'avevo tradotto in `null`
       per lasciar decidere l'agente. È il contrario: `custom` è il MARCATORE
       che dice all'agente di parlare con un registratore Custom via OPOS
       locale invece che con un Epson via HTTP — sta scritto in
       `public/print-agent.ps1`, che tratta ogni device_url non-http proprio
       così, e lo conferma `pos_rt.ragione_sociale`, «Telefutura (Custom) - …».
       Mandare `null` avrebbe fatto due danni in fila: `print_jobs.device_url`
       è NOT NULL, quindi l'insert falliva DOPO che i contanti erano già stati
       incassati — e con lo scontrino non emesso la vendita non veniva
       nemmeno registrata, né scaricato il magazzino.
       Quello che andava tolto, e resta tolto, è `DEFAULT_RT`: un indirizzo
       vero — la cassa T1 di Donna — usato come ultima spiaggia. «Non so su
       quale stampante» non si risolve scegliendone una in un altro quartiere. */
    const rtFor = (az: string) => aziende[az]?.rt_url
        || (Object.keys(aziende).length === 0 ? (b.deviceUrl || "") : "");

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
            /* ANCHE NEL GEMELLO (revisore 01/09). Guardando solo il negozio
               corrente, un codice che sta sullo scaffale dell'altra insegna —
               stessa stanza, società diversa — non risultava di nessuno, e si
               ripiegava sulla società del negozio dove si batte: lo scontrino
               sarebbe uscito con la partita IVA sbagliata. È lo stesso
               allargamento già fatto qui sopra per i registratori. */
            const { data: negs } = await supabase.from("stores").select("name");
            const gemelli = (negs || []).map((x: { name: string }) => x.name)
                .filter((n: string) => stessoMagazzino(n, negozio));
            const { data } = await supabase.from("mag_giacenze")
                .select("codice,azienda,quantita,negozio").in("negozio", gemelli.length ? gemelli : [negozio]).in("codice", codici);
            /* IL PAREGGIO SI DECIDE, non lo decide l'ordine in cui il database
               restituisce le righe (revisore 01/09): chi ha pezzi vince su chi
               non ne ha, e a parità vince il negozio dove si sta battendo. È la
               stessa regola dello scarico — se le due divergessero, lo
               scontrino uscirebbe da una società e la merce da un'altra. */
            const vince: Record<string, { qta: number; negozio: string; azienda: string }> = {};
            (data || []).forEach((g: { codice: string; azienda: string; quantita: number; negozio: string }) => {
                if (!g.azienda) return;
                const a = vince[g.codice];
                const ha = Number(g.quantita) > 0, haA = a ? a.qta > 0 : false;
                const meglio = !a || (ha !== haA ? ha
                    : g.negozio === negozio ? true
                        : a.negozio === negozio ? false
                            : Number(g.quantita) > a.qta);
                if (meglio) vince[g.codice] = { qta: Number(g.quantita), negozio: g.negozio, azienda: g.azienda };
            });
            Object.entries(vince).forEach(([cod, v]) => { societaDelCodice[cod] = v.azienda; });
        }
    }

    // reparto + va_in_scontrino + azienda AUTORITATIVI da marg_items (per UUID "mi_<id>" o per NOME).
    const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    const stripId = (pid: any) => { const s = String(pid || ""); return s.startsWith("mi_") ? s.slice(3) : s; };
    const ids = [...new Set(righe.map((r) => stripId(r.productId)).filter(isUuid))];
    const names = [...new Set(righe.map((r) => String(r.description || "").trim()).filter(Boolean))];
    type Meta = { reparto: number | null; va: boolean; azienda: string | null; paystore: string | null };
    const byId: Record<string, Meta> = {};
    const byName: Record<string, Meta> = {};
    if (ids.length) {
        const { data, error } = await supabase.from("marg_items").select("id, reparto, va_in_scontrino, azienda, paystore_operatore").in("id", ids);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        (data || []).forEach((m: any) => { byId[m.id] = { reparto: m.reparto ?? null, va: m.va_in_scontrino !== false, azienda: m.azienda ?? null, paystore: m.paystore_operatore ?? null }; });
    }
    if (names.length) {
        const { data } = await supabase.from("marg_items").select("name, reparto, va_in_scontrino, azienda, paystore_operatore").in("name", names);
        (data || []).forEach((m: any) => { byName[String(m.name).trim()] = { reparto: m.reparto ?? null, va: m.va_in_scontrino !== false, azienda: m.azienda ?? null, paystore: m.paystore_operatore ?? null }; });
    }

    /* ═══ È LA MERCE A GUIDARE LA RAGIONE SOCIALE (Luca 31/08) ═══════════════
       «I servizi non hanno magazzino, per cui possono essere scaricati da tutti
       in qualsiasi cassa: usciranno dalla cassa insieme al prodotto che hanno
       selezionato, e sarà il prodotto a guidare la ragione sociale.»
       Prima non era così: una riga senza società — un'assistenza tecnica, un
       backup, un salva scontrino — cadeva sul DEFAULT del negozio. A Donna il
       default è Telefutura 2, quindi un telefono di Telefutura più
       un'assistenza uscivano come DUE scontrini, con due partite IVA, per una
       vendita sola. Il cliente ne riceveva due e la contabilità pure.
       Adesso si guarda prima chi ha una società (la merce) e, se è una sola,
       tutto il resto la segue. Il default resta solo per il carrello fatto di
       soli servizi, dove nessuno può dire di chi sia. Il carrello con DUE
       società non arriva qui: si ferma quando si aggiunge il secondo prodotto. */
    const societaDelleRighe = new Set<string>();
    for (const r of righe) {
        const meta = byId[stripId(r.productId)] || byName[String(r.description || "").trim()] || null;
        const suo = (meta && meta.azienda) || r.azienda || societaDelCodice[String(r.codice || "")] || null;
        if (suo) societaDelleRighe.add(String(suo));
    }
    const azDellaMerce = societaDelleRighe.size === 1 ? [...societaDelleRighe][0] : null;

    /* ═══ LE RICARICHE SCIOLTE, DOVE IL NEGOZIO HA DUE SOCIETÀ ═══════════
       Luca 01/09: «il contratto con PayStore lo abbiamo con tutte e due le
       società, e la maggior parte delle volte la ricarica segue
       l'attivazione. Nei negozi con due casse dentro lo stesso negozio ma
       senza reparti separati — che di fatto è solo Donna Olimpia, perché su
       Magliana, Collatina e Acilia i frazionamenti hanno già l'associazione
       della cassa — se non c'è nient'altro nel carrello, e quindi l'unica
       cosa da scontrinare è la ricarica, allora va su Telefutura SRL. In
       alternativa segue sempre la SIM.»

       ⚠️ LA REGOLA SI APPLICA SOLO DOVE LA DOMANDA ESISTE. In un negozio con
       una sola società non c'è niente da scegliere, e forzare T1 lì
       emetterebbe uno scontrino con la partita IVA sbagliata: si guarda
       quante società hanno un registratore QUI. Dove ce n'è una sola, o
       nessuna configurata, non si tocca niente.

       ⚠️ E SOLO SE IL CARRELLO È DI SOLE RICARICHE. Basta un'altra riga —
       una SIM, una cover — e la ricarica torna a seguire la merce, che è la
       regola normale. */
    const _ricarica = (r: typeof righe[number]) => {
        const meta = byId[stripId(r.productId)] || byName[String(r.description || "").trim()] || null;
        return !!(meta && meta.paystore);
    };
    const soloRicariche = righe.length > 0 && righe.every(_ricarica);
    const societaQui = Object.keys(aziende);
    const azRicaricheSciolte = soloRicariche && societaQui.length > 1
        ? (societaQui.includes("T1") ? "T1" : null)
        : null;

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
        /* l'ordine: quello che la voce dice di sé, poi la riga, poi la merce,
           poi — se è un carrello di sole ricariche in un negozio con due
           società — la regola PayStore, e per ultimo il default del negozio */
        const az = (meta && meta.azienda) || r.azienda || societaDelCodice[String(r.codice || "")]
            || azDellaMerce || azRicaricheSciolte || b.azienda || defaultAzienda || "__def";
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
        await logPos("errore", { errore: "nessuna voce stampabile (reparto mancante o voci escluse)", esclusi });
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
            await logPos("verifica-errore", { errore: escluseVere.map((e) => `«${e.description}»: ${e.motivo}`).join(" · "), esclusi, dettagli: { dryRun: true } });
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
            await logPos("errore", { azienda: az === "__def" ? null : az, errore: e?.message || "dati non validi", esclusi, dettagli: { fase: "costruzione-xml" } });
            return NextResponse.json({ error: e?.message || "dati non validi", receipts }, { status: 400 });
        }
        if (!request_xml) {
            await logPos("errore", { azienda: az === "__def" ? null : az, errore: "impossibile costruire lo scontrino", esclusi });
            return NextResponse.json({ error: "impossibile costruire lo scontrino" }, { status: 400 });
        }

        const { data, error } = await supabase.from("print_jobs").insert({
            // l'agente di CHI POSSIEDE il registratore (vedi sopra: «custom»)
            negozio: aziende[az]?.negozio || negozio,
            device_url: rtFor(az) || "",
            kind,
            request_xml,
            status: "pending",
            meta: { total: netTotale, sconto: scontoGruppo || 0, azienda: az === "__def" ? null : az, items: items.length, testMode, coupon: couponCode || null },
        }).select("id").single();
        if (error) {
            await logPos("errore", { azienda: az === "__def" ? null : az, rt_url: rtFor(az) as string, errore: error.message, totale: netTotale, esclusi, dettagli: { fase: "coda-print_jobs" } });
            return NextResponse.json({ error: error.message, receipts }, { status: 500 });
        }
        receipts.push({ azienda: az === "__def" ? null : az, rt: rtFor(az), jobId: data.id, stampate: items.length, totale: netTotale, sconto: scontoGruppo });
    }

    // Ora che lo scontrino è in coda, CONSUMA il coupon (monouso) e rigenera il residuo.
    let couponWarning: string | undefined;
    if (couponCode && couponSconto > 0) {
        const c = await redimiCoupon(couponCode, couponSconto, `scontrino:${negozio || ""}`, negozio, b.createdBy || null);
        if (c.ok) nuovoCoupon = c.nuovoCoupon || null;
        else couponWarning = c.error || "coupon non consumato";
    }

    /* IL BONIFICO VA DETTO ALL'AMMINISTRAZIONE (Luca 31/08). Uno scontrino
       chiuso a bonifico è una vendita incassata... forse: i soldi arrivano
       quando arrivano, e qualcuno deve andare a controllare che siano arrivati
       davvero. A Donna hanno chiuso 3 € a bonifico e all'amministrativo non è
       arrivato niente, perché questo avviso non esisteva.
       Sta QUI, sul server, dopo la stampa riuscita: dal browser si potrebbe
       saltare, e un avviso che si può saltare non è un avviso. Non blocca né
       ritarda la vendita — se la scrittura fallisce, pazienza. */
    try {
        const aBonifico = pagamentiIn.filter((p: any) => String(p?.forma || "").toUpperCase() === "BONIFICO" && Number(p?.importo) > 0);
        if (aBonifico.length) {
            const quanto = aBonifico.reduce((t: number, p: any) => t + Number(p.importo || 0), 0);
            const euro = quanto.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            await supabase.from("admin_tasks").insert({
                tipo: "scontrino_bonifico",
                titolo: `🏦 Scontrino a BONIFICO: ${euro} € — ${negozio || "negozio non indicato"}`,
                dettaglio: `${b.createdBy || "un operatore"} ha chiuso uno scontrino di ${euro} € con pagamento a bonifico${negozio ? ` a ${negozio}` : ""}${testMode ? " (documento NON fiscale: cassa in prova)" : ""}. Controlla che i soldi siano arrivati sul conto, poi premi «Bonifico verificato».`,
                /* AL DOCUMENTO, NON ALL'ELENCO (Luca 31/08: «cliccandoci sopra
                   li riporta direttamente allo scontrino che hanno
                   effettuato»). Senza l'id si atterrava sulla lista di tutte
                   le vendite, che è come non avere un link. */
                link: b.contrattoId ? `/ricerca-vendite?id=${encodeURIComponent(String(b.contrattoId))}` : "/ricerca-vendite",
                /* SOLO L'AMMINISTRAZIONE (Luca 31/08, correggendomi): «non deve
                   arrivare alla direzione generale, non al developer, nemmeno a
                   me che sono l'admin — solo a Claudia e Sandra». `direzione`
                   comprende admin, dev, amministrativo e direttore generale:
                   troppo. Qui la coda è del ruolo `amministrativo`, e se
                   domani sono cinque saranno cinque senza toccare niente.
                   Una riga SOLA e condivisa, non una per persona: appena una
                   delle due verifica il bonifico e la chiude, sparisce anche
                   all'altra — che è esattamente quello che serve, se no la
                   seconda va a ricontrollare un pagamento già controllato. */
                target_role: "amministrativo",
                created_by: b.createdBy || "Cassa",
            });
        }
    } catch { /* l'avviso non deve mai fermare una vendita */ }

    await logPos(escluseVere.length ? "ok-parziale" : "ok", {
        azienda: receipts.map((r) => r.azienda || "def").join(", "),
        rt_url: receipts.map((r) => r.rt).join(", "),
        totale: receipts.reduce((s, r) => s + (Number(r.totale) || 0), 0),
        items: totalPrintable,
        esclusi: esclusi.length ? esclusi : null,
        job_ids: receipts.map((r) => r.jobId),
        dettagli: { receipts, scontoCoupon: couponSconto, nGruppi: receipts.length },
    });
    return NextResponse.json({ ok: true, testMode, receipts, stampate: totalPrintable, esclusi, scontoCoupon: couponSconto, nuovoCoupon, couponWarning });
}
