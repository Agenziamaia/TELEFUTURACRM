import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminOrAbove } from "@/lib/roles";
import { servizi, prodotti, listini, NOMI_OPERATORE } from "@/lib/paystore";
import { credenzialeDi } from "@/lib/paystoreCredenziali";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ I TAGLI VERI, CHIESTI A PAYSTORE ═════════════════════════════════════
   Luca 02/09: «dall'API di PayStore riesci a prenderti tutti i tagli VERI e
   verificare che la nostra sezione di Registra Vendita li stia riportando
   correttamente?»

   Il listino che il negozio vede è una tabella nostra, compilata a mano. Se non
   combacia col catalogo di PayStore succedono due cose, e nessuna si vede
   subito: un taglio che loro hanno e noi no non si può vendere; un taglio che
   noi mostriamo e loro non hanno si vende e poi non parte, e il cliente ha già
   pagato.

   ⚠️ MISURATO SENZA API, sul solo archivio: due operatori — ho. e Very — hanno
   ricariche vendute e ZERO tagli a listino, e ci sono due importi che a listino
   non esistono (Vodafone 23 €, WindTre 26 €). Erano già lì.

   ⚠️ SI GUARDA PRIMA, SI SCRIVE DOPO. Di default questa rotta CONFRONTA e
   basta: dice cosa manca, cosa avanza e cosa cambia di prezzo. Applica solo se
   glielo si chiede, perché un listino riscritto male toglie dalle mani dei
   negozi tagli che vendono ogni giorno.

   ⚠️ E IL CATALOGO SI CHIEDE CON UNA CREDENZIALE VERA. I listini possono
   essere diversi da cliente a cliente — lo dice il loro manuale — quindi si
   usa la terna di un negozio, non una qualunque. */

/** Dal nome del prodotto PayStore al nostro codice operatore. */
function operatoreDi(nome: string): string | null {
    const N = String(nome || "").toUpperCase();
    /* dal più lungo al più corto: «TIM» è dentro «OPTIMA» */
    const t = NOMI_OPERATORE.find(([n]) => N.includes(n));
    return t ? t[1] : null;
}

export async function POST(request: Request) {
    const _g = await accesso(request, "paystore/tagli/sync");
    if (!_g.ok) return _g.risposta;
    const { data: me } = await supabaseAdmin.from("app_users").select("role").eq("id", _g.sess.id).maybeSingle();
    if (!isAdminOrAbove(String((me as { role?: string } | null)?.role || ""))) {
        return NextResponse.json({ error: "il listino lo allinea l'amministrazione." }, { status: 403 });
    }

    const b = await request.json().catch(() => ({})) as { negozio?: string; azienda?: string; applica?: boolean };

    /* la credenziale con cui chiedere: quella indicata, o la prima che c'è */
    let cred;
    if (b.negozio && b.azienda) {
        const c = await credenzialeDi(b.negozio, b.azienda);
        if (!c.ok) return NextResponse.json({ error: c.errore }, { status: 400 });
        cred = c.cred;
    } else {
        const { data } = await supabaseAdmin.from("paystore_credenziali")
            .select("negozio, azienda").eq("attivo", true).limit(1);
        const r = ((data || []) as { negozio: string; azienda: string }[])[0];
        if (!r) {
            return NextResponse.json({
                error: "non c'è nessuna credenziale PayStore caricata: senza, il catalogo non si può chiedere. Caricale in Amministrazione → PayStore → Credenziali.",
            }, { status: 503 });
        }
        const c = await credenzialeDi(r.negozio, r.azienda);
        if (!c.ok) return NextResponse.json({ error: c.errore }, { status: 400 });
        cred = c.cred;
    }

    const sv = await servizi(cred);
    if (!sv.ok) return NextResponse.json({ error: `PayStore non risponde: ${sv.descrizione || sv.errore}` }, { status: 502 });

    /* il catalogo intero, appiattito su (operatore, importo) */
    const veri = new Map<string, { operatore: string; valore: number; prodotto: string; priceListId: number }>();
    const senzaOperatore: string[] = [];
    for (const s of (sv.dati || [])) {
        const pr = await prodotti(s.serviceId, cred);
        if (!pr.ok) continue;
        for (const p of (pr.dati || [])) {
            const op = operatoreDi(String(p.name || ""));
            if (!op) { senzaOperatore.push(String(p.name || "")); continue; }
            const li = await listini(p.productId, cred);
            if (!li.ok) continue;
            for (const t of (li.dati || [])) {
                const v = Number(t.faceAmount);
                if (!(v > 0)) continue;
                veri.set(`${op}|${v.toFixed(2)}`, { operatore: op, valore: v, prodotto: String(p.name || ""), priceListId: t.priceListId });
            }
        }
    }

    const { data: nostri } = await supabaseAdmin.from("paystore_tagli")
        .select("id, operatore, valore, attivo, etichetta");
    type T = { id: string; operatore: string; valore: number; attivo: boolean; etichetta: string | null };
    const miei = new Map<string, T>();
    for (const t of ((nostri || []) as T[])) miei.set(`${t.operatore}|${Number(t.valore).toFixed(2)}`, t);

    const daAggiungere = [...veri.values()].filter((v) => !miei.has(`${v.operatore}|${v.valore.toFixed(2)}`));
    /* ⚠️ QUELLO CHE AVANZA NON SI CANCELLA: si SPEGNE. Un taglio tolto dal
       listino sparisce anche dalle ricariche già vendute che lo citano, e in un
       controllo quella riga diventa inspiegabile. */
    const daSpegnere = [...miei.values()]
        .filter((t) => t.attivo && !veri.has(`${t.operatore}|${Number(t.valore).toFixed(2)}`));

    if (!b.applica) {
        return NextResponse.json({
            ok: true, soloConfronto: true,
            catalogo: veri.size, nostri: miei.size,
            daAggiungere: daAggiungere.map((v) => ({ operatore: v.operatore, valore: v.valore, prodotto: v.prodotto })),
            daSpegnere: daSpegnere.map((t) => ({ operatore: t.operatore, valore: Number(t.valore) })),
            prodottiNonRiconosciuti: [...new Set(senzaOperatore)],
        });
    }

    let aggiunti = 0, spenti = 0;
    for (const v of daAggiungere) {
        const { error } = await supabaseAdmin.from("paystore_tagli").insert({
            operatore: v.operatore, valore: v.valore,
            etichetta: `${v.valore.toFixed(2).replace(".00", "")} €`,
            ordine: Math.round(v.valore * 100), attivo: true, origine: "api",
        });
        if (!error) aggiunti++;
    }
    for (const t of daSpegnere) {
        const { error } = await supabaseAdmin.from("paystore_tagli").update({ attivo: false }).eq("id", t.id);
        if (!error) spenti++;
    }
    return NextResponse.json({ ok: true, aggiunti, spenti, catalogo: veri.size });
}
