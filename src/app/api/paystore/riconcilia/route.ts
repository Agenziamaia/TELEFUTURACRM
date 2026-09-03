import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminOrAbove } from "@/lib/roles";
import { elencoOperazioni } from "@/lib/paystore";
import { credenzialeDi } from "@/lib/paystoreCredenziali";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ CHIEDERE A PAYSTORE COSA HA FATTO DAVVERO ════════════════════════════
   Luca 03/09: «le ricariche che stanno scontrinando nei negozi come mai non
   stanno andando in automatico? Siamo sicuri che non sono state veramente
   fatte?»

   La prima domanda ha una risposta secca: il motore è SPENTO, quindi da solo
   non parte niente — è com'è stato lasciato, in attesa della prova.

   La seconda no, e sta qui il punto. Una riga «in sospeso» vuol dire «il CRM
   non l'ha fatta»: NON vuol dire «non è stata fatta». Fino a ieri il credito lo
   caricava una persona al terminale PayStore, e quel gesto nel CRM non lascia
   nessuna traccia. Dal registro, le due cose sono indistinguibili.

   ⚠️ E LA DIFFERENZA VALE DENARO. Premere «rifai» su una ricarica che il
   negozio ha già caricato a mano vuol dire erogare il credito una SECONDA
   volta: la chiave di idempotenza protegge solo fra due tentativi NOSTRI, non
   contro quello che è stato fatto dal loro pannello.

   Quindi non si indovina: si chiede a PayStore l'elenco delle sue operazioni e
   lo si incrocia con le nostre righe, per numero e importo, nello stesso
   giorno. Quello che combacia era già fatto e si marca; il resto è davvero da
   fare.

   ⚠️ SI GUARDA PRIMA, SI SCRIVE DOPO, come per il listino: senza `applica`
   questa rotta non tocca una riga. */

type Riga = {
    id: string; negozio: string | null; azienda: string | null;
    operatore: string; numero: string; importo: number; creata_il: string;
};

export async function POST(request: Request) {
    const _g = await accesso(request, "paystore/riconcilia");
    if (!_g.ok) return _g.risposta;
    const { data: me } = await supabaseAdmin.from("app_users").select("role, full_name").eq("id", _g.sess.id).maybeSingle();
    const chi = me as { role?: string; full_name?: string } | null;
    if (!isAdminOrAbove(String(chi?.role || ""))) {
        return NextResponse.json({ error: "la riconciliazione la fa l'amministrazione." }, { status: 403 });
    }

    const b = await request.json().catch(() => ({})) as { da?: string; a?: string; applica?: boolean };
    const oggi = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
    const da = b.da || oggi, a = b.a || oggi;

    /* le nostre righe ancora aperte in quel periodo */
    const { data: nostre } = await supabaseAdmin.from("paystore_ricariche")
        .select("id, negozio, azienda, operatore, numero, importo, creata_il")
        .eq("stato", "sospeso")
        .gte("creata_il", da + "T00:00:00Z").lte("creata_il", a + "T23:59:59Z")
        .order("creata_il");
    const righe = (nostre || []) as Riga[];
    if (!righe.length) return NextResponse.json({ ok: true, righe: 0, messaggio: "nessuna ricarica in sospeso in questo periodo." });

    /* ⚠️ UNA CHIAMATA PER PLAFOND. Le operazioni sono per credenziale: il
       negozio A non vede quelle del negozio B, e chiedere tutto con una terna
       sola darebbe un elenco parziale che sembra completo. */
    const coppie = [...new Set(righe.map((r) => `${r.negozio}|${r.azienda}`))]
        .map((k) => { const [negozio, azienda] = k.split("|"); return { negozio, azienda }; });

    const trovate = new Map<string, { operationId: number; quando: string; negozio: string }>();
    const problemi: string[] = [];
    for (const c of coppie) {
        const cr = await credenzialeDi(c.negozio, c.azienda);
        if (!cr.ok) { problemi.push(`${c.negozio}: ${cr.errore}`); continue; }
        const op = await elencoOperazioni(da, a, cr.cred);
        if (!op.ok) { problemi.push(`${c.negozio}: ${op.descrizione || op.errore}`); continue; }
        for (const o of (op.dati || [])) {
            if (String(o.status || "").toLowerCase() !== "success") continue;
            const num = String(o.phoneNumber || "").replace(/\D/g, "");
            const imp = Number(o.faceAmount || 0);
            if (!num || !(imp > 0)) continue;
            /* la chiave dell'incrocio: stesso numero, stesso importo, stesso
               giorno. Il giorno serve: lo stesso cliente può ricaricare 10 €
               oggi e 10 € domani, e sono due ricariche diverse. */
            const giorno = String(o.operationDateUtc || "").slice(0, 10);
            trovate.set(`${num}|${imp.toFixed(2)}|${giorno}`, {
                operationId: o.operationId, quando: o.operationDateUtc, negozio: c.negozio,
            });
        }
    }

    const esiti = righe.map((r) => {
        const num = String(r.numero || "").replace(/\D/g, "");
        const giorno = String(r.creata_il).slice(0, 10);
        const t = trovate.get(`${num}|${Number(r.importo).toFixed(2)}|${giorno}`);
        return { riga: r, gia: t || null };
    });
    const giaFatte = esiti.filter((e) => e.gia);

    if (!b.applica) {
        return NextResponse.json({
            ok: true, soloConfronto: true, da, a,
            inSospeso: righe.length,
            operazioniTrovate: trovate.size,
            giaFatte: giaFatte.map((e) => ({
                id: e.riga.id, negozio: e.riga.negozio, numero: e.riga.numero,
                importo: e.riga.importo, operationId: e.gia!.operationId, quando: e.gia!.quando,
            })),
            daFareDavvero: esiti.length - giaFatte.length,
            problemi,
        });
    }

    let segnate = 0;
    for (const e of giaFatte) {
        const { error } = await supabaseAdmin.from("paystore_ricariche").update({
            stato: "ok_manuale",
            rif_fornitore: String(e.gia!.operationId),
            inviata_il: e.gia!.quando,
            /* ⚠️ SI SCRIVE PERCHÉ, e che non l'abbiamo fatta noi: fra un mese
               questa riga verde deve saper dire da dove viene. */
            nota: `riconciliata il ${new Date().toLocaleDateString("it-IT")} da ${chi?.full_name || "amministrazione"}: PayStore l'aveva già eseguita (operazione ${e.gia!.operationId}). Non è partita dal CRM.`,
            stato_da: chi?.full_name || "riconciliazione",
            stato_il: new Date().toISOString(),
        }).eq("id", e.riga.id).eq("stato", "sospeso");
        if (!error) segnate++;
    }
    return NextResponse.json({ ok: true, segnate, daFareDavvero: esiti.length - giaFatte.length, problemi });
}
