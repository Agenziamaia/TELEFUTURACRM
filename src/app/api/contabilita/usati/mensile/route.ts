import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminOrAbove } from "@/lib/roles";
import { eUnLavoroAutomatico } from "@/lib/cronParola";
import { parametriAutomatismo } from "@/lib/automatismiConfig";
import { inviaEmail } from "@/lib/email";
import { casellaMittente } from "@/lib/emailCredenziali";
import { usatiVenduti, usatiComprati, INTESTAZIONI, inRiga, NOME_SOCIETA } from "@/lib/contabilitaUsati";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ IL RESOCONTO MENSILE AL COMMERCIALISTA ═══════════════════════════════
   Luca 02/09: «al commercialista, i primi di ogni mese, dobbiamo inviargli il
   resoconto dei telefoni usati venduti e comprati nel mese precedente». E poi:
   «spostiamo l'automazione al 3 del mese, e dal 1° dai visibilità in questa
   sezione della preview».

   ⚠️ IL 3, NON IL 1°, E LA DIFFERENZA È IL LAVORO. Fra il 1° e il 3 il mese è
   chiuso ma il file non è ancora partito: sono i due giorni in cui
   l'amministrazione guarda le righe senza società e le completa. Mandarlo il 1°
   avrebbe voluto dire mandare sempre il file più incompleto possibile.

   ⚠️ UNA VOLTA SOLA. Il registro `contabilita_usati_inviati` con esito
   «inviato» è quello che impedisce a un secondo giro — o alla prova premuta per
   curiosità dall'hub — di far arrivare due volte lo stesso resoconto al
   commercialista.

   ⚠️ E SI MANDA ANCHE INCOMPLETO, DICENDOLO. Se restano righe senza società, il
   file parte lo stesso: aspettare vorrebbe dire non mandare niente. Ma il corpo
   dell'email lo scrive in cima, e il registro se ne ricorda. */

type Riga = ReturnType<typeof inRiga>;

async function destinatari(): Promise<{ a: string[]; scartati: string[]; errore?: string }> {
    const p = await parametriAutomatismo("contabilita-usati-mensile");
    const v = (p as { destinatari?: unknown }).destinatari;
    const grezzi = Array.isArray(v) ? v.map(String) : String(v || "").split(/[\n,;]+/);
    const puliti = grezzi.map((x) => x.trim()).filter(Boolean);
    const buoni = puliti.filter((x) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(x));
    const scartati = puliti.filter((x) => !buoni.includes(x));
    return {
        a: buoni, scartati,
        errore: buoni.length ? undefined
            : scartati.length
                ? `i destinatari impostati nell'hub non sono indirizzi validi (${scartati.join(", ")}): resoconto NON inviato`
                : "l'elenco dei destinatari nell'hub è vuoto: resoconto NON inviato",
    };
}

function meseScorso() {
    /* ⚠️ IL MESE SI CALCOLA SUL GIORNO DI ROMA. Il 1° alle 00:30 italiane è
       ancora il 31 in UTC: con `getUTCMonth()` il lavoro del 3 avrebbe potuto
       riferirsi al mese sbagliato al cambio dell'ora legale. */
    const oggiRoma = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
    const [y, m] = oggiRoma.split("-").map(Number);
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    const ultimo = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    const mm = String(pm).padStart(2, "0");
    return {
        da: `${py}-${mm}-01`, a: `${py}-${mm}-${String(ultimo).padStart(2, "0")}`,
        etichetta: new Date(Date.UTC(py, pm - 1, 1)).toLocaleDateString("it-IT", { month: "long", year: "numeric" }),
    };
}

async function excel(venduti: Riga[], comprati: Riga[]): Promise<Buffer> {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    for (const [nome, righe] of [["Venduti", venduti], ["Comprati", comprati]] as const) {
        const ws = XLSX.utils.aoa_to_sheet([INTESTAZIONI, ...righe]);
        ws["!cols"] = INTESTAZIONI.map((h) => ({ wch: Math.max(12, h.length + 2) }));
        XLSX.utils.book_append_sheet(wb, ws, nome);
    }
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function POST(request: Request) {
    const req = request;
    /* o il lavoro automatico, o una persona della direzione dall'hub */
    let daPersona = false;
    if (!(await eUnLavoroAutomatico(request))) {
        const _g = await accesso(request, "contabilita/usati/mensile");
        if (!_g.ok) return _g.risposta;
        const g = _g;
        const { data } = await supabaseAdmin.from("app_users").select("role").eq("id", g.sess.id).maybeSingle();
        if (!isAdminOrAbove(String((data as { role?: string } | null)?.role || ""))) {
            return NextResponse.json({ error: "solo l'amministrazione può mandare il resoconto." }, { status: 403 });
        }
        daPersona = true;
    }

    const b = await req.json().catch(() => ({})) as { forza?: boolean; prova?: boolean };
    const mese = meseScorso();

    const { data: gia } = await supabaseAdmin.from("contabilita_usati_inviati")
        .select("mese, esito, inviato_il").eq("mese", mese.da).maybeSingle();
    if (gia && (gia as { esito: string }).esito === "inviato" && !b.forza) {
        return NextResponse.json({ ok: true, saltato: "già inviato", mese: mese.da, quando: (gia as { inviato_il: string }).inviato_il });
    }

    const dest = await destinatari();
    if (dest.errore && !b.prova) {
        await supabaseAdmin.from("contabilita_usati_inviati").upsert({
            mese: mese.da, esito: "fallito", errore: dest.errore, inviato_da: daPersona ? "a mano" : "automatico",
        }, { onConflict: "mese" });
        return NextResponse.json({ error: dest.errore }, { status: 400 });
    }

    let venduti, comprati;
    try {
        [venduti, comprati] = await Promise.all([usatiVenduti(mese.da, mese.a), usatiComprati(mese.da, mese.a)]);
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }

    const daConfermare = [...venduti, ...comprati].filter((r) => r.daConfermare).length;
    const daFatturare = venduti.filter((r) => r.daFatturare);

    if (b.prova) {
        return NextResponse.json({
            ok: true, prova: true, mese: mese.etichetta,
            destinatari: dest.a, venduti: venduti.length, comprati: comprati.length,
            daFatturare: daFatturare.length, daConfermare,
        });
    }

    /* il riassunto delle fatture da fare, per società: è la prima cosa che il
       commercialista cerca, e leggerla dal file richiede di aprirlo */
    const perCoppia = new Map<string, { quante: number; valore: number }>();
    for (const r of daFatturare) {
        const k = `${r.aziendaAcquisto}→${r.aziendaVendita}`;
        const v = perCoppia.get(k) || { quante: 0, valore: 0 };
        v.quante++; v.valore += r.acquistoFile; perCoppia.set(k, v);
    }
    const righeCoppie = [...perCoppia.entries()].map(([k, v]) => {
        const [da, a] = k.split("→");
        return `<li><b>${NOME_SOCIETA[da] || da} → ${NOME_SOCIETA[a] || a}</b>: ${v.quante} telefon${v.quante === 1 ? "o" : "i"}, ${v.valore.toLocaleString("it-IT", { style: "currency", currency: "EUR" })} di costo</li>`;
    }).join("");

    const corpo = `
        <p>Buongiorno,</p>
        <p>in allegato il resoconto dei telefoni usati di <b>${mese.etichetta}</b>:
        ${venduti.length} vendut${venduti.length === 1 ? "o" : "i"} e ${comprati.length} comprat${comprati.length === 1 ? "o" : "i"}.</p>
        ${daFatturare.length ? `<p><b>Da fatturare fra società — ${daFatturare.length} telefon${daFatturare.length === 1 ? "o" : "i"}:</b></p><ul>${righeCoppie}</ul>` : "<p>Nessun telefono è stato comprato da una società e venduto dall'altra in questo mese.</p>"}
        ${daConfermare ? `<p style="color:#b45309"><b>Attenzione:</b> ${daConfermare} rig${daConfermare === 1 ? "a" : "he"} non ${daConfermare === 1 ? "ha" : "hanno"} ancora la società indicata: nel file ${daConfermare === 1 ? "è" : "sono"} segnat${daConfermare === 1 ? "a" : "e"} come «da confermare».</p>` : ""}
        <p style="color:#64748b;font-size:12px">Nel file il costo d'acquisto non scende mai sotto 100 €, come concordato: accanto c'è comunque il costo reale.</p>
        <p style="color:#64748b;font-size:12px">Messaggio automatico del CRM Telefutura.</p>`;

    /* ⚠️ PARTE DALLA CASELLA DELL'AMMINISTRAZIONE, come il report delle ferie:
       una mail al commercialista che arriva da un indirizzo di servizio non la
       riconosce nessuno, e la risposta si perde. */
    const mittente = await casellaMittente();
    if (!mittente) {
        const msg = "la casella amministrazione@ non è collegata al CRM: resoconto NON inviato";
        await supabaseAdmin.from("contabilita_usati_inviati").upsert({
            mese: mese.da, esito: "fallito", errore: msg, inviato_da: daPersona ? "a mano" : "automatico",
        }, { onConflict: "mese" });
        return NextResponse.json({ error: msg }, { status: 503 });
    }

    let esito = "inviato", errore: string | null = null;
    try {
        await inviaEmail(mittente as never, {
            to: dest.a.join(", "),
            subject: `Telefutura — Telefoni usati ${mese.etichetta}`,
            html: corpo,
            text: corpo.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
            attachments: [{
                filename: `usati_${mese.da.slice(0, 7)}.xlsx`,
                content: await excel(venduti.map(inRiga), comprati.map(inRiga)),
                contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            }],
        });
    } catch (e) {
        esito = "fallito"; errore = (e as Error)?.message || "invio non riuscito";
    }

    await supabaseAdmin.from("contabilita_usati_inviati").upsert({
        mese: mese.da, esito, destinatari: dest.a,
        quanti_venduti: venduti.length, quanti_comprati: comprati.length,
        da_confermare: daConfermare, errore,
        inviato_il: new Date().toISOString(),
        inviato_da: daPersona ? "a mano" : "automatico",
    }, { onConflict: "mese" });

    if (esito === "fallito") return NextResponse.json({ error: errore }, { status: 500 });
    return NextResponse.json({
        ok: true, mese: mese.etichetta, destinatari: dest.a,
        venduti: venduti.length, comprati: comprati.length, daFatturare: daFatturare.length, daConfermare,
    });
}
