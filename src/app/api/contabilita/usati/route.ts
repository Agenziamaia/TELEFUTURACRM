import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminOrAbove } from "@/lib/roles";
import { usatiVenduti, usatiComprati, INTESTAZIONI, inRiga, meseAppenaChiuso, meseInCorso } from "@/lib/contabilitaUsati";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ CONTABILITÀ · USATI ══════════════════════════════════════════════════
   Il quadro dei telefoni usati che cambiano società fra l'acquisto e la
   vendita, e il file da portare al commercialista.

   ⚠️ SOLO AMMINISTRAZIONE. Qui dentro ci sono costi d'acquisto, margini e
   documenti fiscali: non è materiale da banco.

   GET            → l'elenco a schermo
   GET ?excel=1   → lo stesso, come file
   PATCH          → correggere a mano una società che manca o è sbagliata */

/** Il secondo cancello: il primo — `accesso` — sta scritto per esteso dentro
 *  ogni funzione, perché la guardia di sicurezza lo cerca lì e perché un
 *  lucchetto nascosto dentro un aiutante è un lucchetto che il prossimo si
 *  dimentica. Qui resta solo il controllo del ruolo. */
async function soloDirezione(g: { sess: { id: string } }) {
    const { data } = await supabaseAdmin.from("app_users").select("role, full_name").eq("id", g.sess.id).maybeSingle();
    const u = data as { role?: string; full_name?: string } | null;
    if (!isAdminOrAbove(String(u?.role || ""))) {
        return { ko: NextResponse.json({ error: "la contabilità la vede solo l'amministrazione." }, { status: 403 }) };
    }
    return { nome: u?.full_name || g.sess.id };
}


export async function GET(request: Request) {
    const _g = await accesso(request, "contabilita/usati");
    if (!_g.ok) return _g.risposta;
    const g = await soloDirezione(_g);
    if ("ko" in g) return g.ko;
    const req = request;

    const url = new URL(req.url);
    /* ⚠️ SI APRE SUL MESE IN CORSO. Il resoconto parla del mese chiuso, ma chi
       apre questa sezione durante il mese vuole vedere quello che sta
       succedendo — e le righe da completare prima che il file parta. Il mese da
       mandare ha il suo riquadro in cima. */
    const def = meseInCorso();
    const da = url.searchParams.get("da") || def.da;
    const a = url.searchParams.get("a") || def.a;

    let venduti, comprati;
    try {
        [venduti, comprati] = await Promise.all([usatiVenduti(da, a), usatiComprati(da, a)]);
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }

    if (url.searchParams.get("excel")) {
        const XLSX = await import("xlsx");
        const wb = XLSX.utils.book_new();
        for (const [nome, righe] of [["Venduti", venduti], ["Comprati", comprati]] as const) {
            const ws = XLSX.utils.aoa_to_sheet([INTESTAZIONI, ...righe.map(inRiga)]);
            ws["!cols"] = INTESTAZIONI.map((h) => ({ wch: Math.max(12, h.length + 2) }));
            XLSX.utils.book_append_sheet(wb, ws, nome);
        }
        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
        return new NextResponse(new Uint8Array(buf), {
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="usati_${da}_${a}.xlsx"`,
            },
        });
    }

    /* ═══ LA PREVIEW: COSA PARTIRÀ, E QUANDO ═══════════════════════════════
       Luca 02/09: «spostiamo l'automazione al 3 del mese, e dal 1° dai
       visibilità in questa sezione della preview, che sarebbe l'invio dei
       file». Fra il 1° e il 3 il mese è chiuso ma il file non è ancora partito:
       è la finestra in cui si sistemano le righe rosse. Dopo, la correzione
       arriva quando il commercialista ha già il file in mano. */
    const oggi = new Date();
    const gg = Number(oggi.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }).slice(8, 10));
    const scorso = meseAppenaChiuso();
    const { data: giaInviato } = await supabaseAdmin.from("contabilita_usati_inviati")
        .select("mese, esito, inviato_il, destinatari, da_confermare")
        .eq("mese", scorso.da).maybeSingle();
    /* ⚠️ NON SPARISCE QUANDO L'INVIO È FALLITO. Il controllo era «entro il 3,
       oppure se non risulta niente»: con una riga «fallito» in tabella, dal 4 in
       poi la preview svaniva — e l'amministrazione non aveva nessun segnale che
       il commercialista non avesse ricevuto niente. Adesso resta finché il mese
       non è partito DAVVERO. */
    const inviatoDavvero = (giaInviato as { esito?: string } | null)?.esito === "inviato";
    let preview: unknown = null;
    if (gg <= 3 || !inviatoDavvero) {
        const [v, c] = await Promise.all([usatiVenduti(scorso.da, scorso.a), usatiComprati(scorso.da, scorso.a)]);
        preview = {
            mese: scorso.da, da: scorso.da, a: scorso.a,
            venduti: v.length, comprati: c.length,
            daConfermare: v.filter((r) => r.daConfermare).length + c.filter((r) => r.daConfermare).length,
            daFatturare: v.filter((r) => r.daFatturare).length,
            parteIl: 3, giorniAllInvio: Math.max(0, 3 - gg),
            gia: giaInviato || null,
            fallito: !!giaInviato && !inviatoDavvero,
        };
    }

    /* ⚠️ QUANTI SONO «DA CONFERMARE» SI DICE SEMPRE, anche quando sono zero: è
       il numero che dice se il file che si sta per mandare è completo. */
    return NextResponse.json({
        ok: true, da, a, preview,
        venduti, comprati,
        riepilogo: {
            venduti: venduti.length,
            daFatturare: venduti.filter((r) => r.daFatturare).length,
            daConfermare: venduti.filter((r) => r.daConfermare).length,
            comprati: comprati.length,
            valoreVenduto: venduti.reduce((s, r) => s + (r.vendita || 0), 0),
            valoreAcquistoFile: venduti.reduce((s, r) => s + (r.acquistoFile || 0), 0),
            /* ⚠️ QUANTI NON HANNO UN COSTO REGISTRATO: è il numero che dice
               quanto del file è basato su un dato che non abbiamo. */
            senzaCosto: venduti.filter((r) => r.acquistoFile == null).length,
        },
    });
}

/** Scrivere a mano la società di un telefono: serve per i 74 che il file
 *  storico del vecchio gestionale non conosceva, e per correggere un errore.
 *  ⚠️ Resta scritto CHI l'ha messa e quando: è un dato che finisce su un
 *  documento fiscale, e fra sei mesi qualcuno chiederà da dove viene. */
export async function PATCH(request: Request) {
    const _g = await accesso(request, "contabilita/usati");
    if (!_g.ok) return _g.risposta;
    const g = await soloDirezione(_g);
    if ("ko" in g) return g.ko;
    const req = request;

    const b = await req.json().catch(() => ({})) as {
        id?: number; aziendaAcquisto?: string | null; aziendaVendita?: string | null;
        costoContabile?: number | string | null; venditaContabile?: number | string | null;
    };
    if (!b.id) return NextResponse.json({ error: "manca il telefono" }, { status: 400 });

    /** Un prezzo scritto a mano: numero o «vuoto» (= torna a valere la regola). */
    const prezzo = (v: unknown): { ok: true; val: number | null } | { ok: false } => {
        if (v === undefined) return { ok: true, val: undefined as unknown as null };
        if (v === null || v === "") return { ok: true, val: null };
        const n = Number(String(v).replace(",", "."));
        /* ⚠️ NIENTE NEGATIVI E NIENTE ASSURDI. Questa cifra finisce su una
           fattura fra due società: un segno meno o un ordine di grandezza
           sbagliato non si scopre più a valle. */
        return Number.isFinite(n) && n >= 0 && n <= 100000 ? { ok: true, val: n } : { ok: false };
    };
    const valida = (v: unknown) => v === "T1" || v === "T2" || v === null || v === "";
    if (!valida(b.aziendaAcquisto) || !valida(b.aziendaVendita)) {
        return NextResponse.json({ error: "la società può essere solo T1 o T2" }, { status: 400 });
    }

    const { data: prima } = await supabaseAdmin.from("usati")
        .select("id, imei, azienda_acquisto, azienda_vendita, status_history, purchase_price, sold_price").eq("id", b.id).maybeSingle();
    if (!prima) return NextResponse.json({ error: "telefono non trovato" }, { status: 404 });
    const p = prima as { azienda_acquisto: string | null; azienda_vendita: string | null; status_history: Record<string, unknown> | null };

    const campi: Record<string, unknown> = {};
    if (b.aziendaAcquisto !== undefined) campi.azienda_acquisto = b.aziendaAcquisto || null;
    if (b.aziendaVendita !== undefined) campi.azienda_vendita = b.aziendaVendita || null;

    /* ⚠️ I PREZZI CONTABILI NON TOCCANO L'ARCHIVIO. `purchase_price` e
       `sold_price` restano quello che è successo davvero: qui si scrive solo
       come va nel file. Sovrascrivere l'archivio vorrebbe dire perdere per
       sempre il margine vero del telefono. */
    let prezziToccati = false;
    for (const [chiave, colonna] of [["costoContabile", "costo_contabile"], ["venditaContabile", "vendita_contabile"]] as const) {
        const v = (b as Record<string, unknown>)[chiave];
        if (v === undefined) continue;
        const p = prezzo(v);
        if (!p.ok) return NextResponse.json({ error: `«${v}» non è un prezzo valido` }, { status: 400 });
        campi[colonna] = p.val; prezziToccati = true;
    }
    if (prezziToccati) {
        campi.prezzi_corretti_da = g.nome;
        campi.prezzi_corretti_il = new Date().toISOString();
    }
    if (!Object.keys(campi).length) return NextResponse.json({ error: "niente da cambiare" }, { status: 400 });

    /* ⚠️ `status_history` È UN OGGETTO CON CHIAVE LO STATO, non una lista: una
       spinta in coda lo distruggerebbe. Si aggiunge una chiave sua. */
    const storia = (p.status_history && typeof p.status_history === "object" && !Array.isArray(p.status_history)) ? p.status_history : {};
    campi.status_history = {
        ...storia,
        [`societa_${Date.now()}`]: {
            date: new Date().toISOString(),
            operatore: `${g.nome} — società corretta in Contabilità: acquisto ${p.azienda_acquisto || "—"}→${campi.azienda_acquisto ?? p.azienda_acquisto ?? "—"}, vendita ${p.azienda_vendita || "—"}→${campi.azienda_vendita ?? p.azienda_vendita ?? "—"}`,
        },
    };

    const { error } = await supabaseAdmin.from("usati").update(campi).eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
