import { NextResponse } from "next/server";
import { eUnLavoroAutomatico } from "@/lib/cronParola";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { inviaEmail } from "@/lib/email";
import { casellaMittente } from "@/lib/emailCredenziali";
import {
    fogliAssenze, giornateAssenza, mesePrecedente, nomeMese, ymd,
    type RigaAssenza, type FoglioExcel,
} from "@/lib/assenze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* IL REPORT DELLE ASSENZE, IL PRIMO DI OGNI MESE (Luca 31/08).
 *
 * «Al primo di ogni mese dobbiamo inviare un'email con l'export delle ferie e
 * quello della malattia a telefuturasrl@hotmail.com e a
 * studioandreavincioni@gmail.com. Nel testo dobbiamo dire di fare attenzione
 * che ci sono due tab per ogni foglio, uno di dettaglio e uno di riepilogo.»
 *
 * Il mese che si manda è quello APPENA CHIUSO: il primo settembre parte agosto,
 * intero. Il conto è lo stesso del bottone Excel — stessa libreria, stessi
 * numeri — perché due copie della stessa aritmetica divergono sempre.
 *
 * SI PUÒ CHIAMARE PIÙ VOLTE. Il cron può ripetere, la rete può cadere a metà:
 * di ogni mese resta una riga in `report_assenze_inviati`, e se c'è già la
 * chiamata non fa niente. `force` la scavalca, ma solo col token.
 */
/* I DESTINATARI SI CAMBIANO DALL'HUB, non qui (Luca 31/08: «voglio poter
   modificare tempistiche, destinatari e tutto ciò che è possibile
   modificare»). Questi restano il valore di partenza: valgono finché nessuno
   li ha toccati da Amministrazione → Automatismi. */
const DESTINATARI_DI_PARTENZA = ["telefuturasrl@hotmail.com", "studioandreavincioni@gmail.com"];

/* ⚠️ IL RIPIEGO VALE SOLO SE NESSUNO HA SCELTO (rilievo del revisore).
   Prima, una lista svuotata a mano o sbagliata tornava zitta ai due indirizzi
   di fabbrica: chi scriveva «mandalo solo a me» con un refuso si ritrovava il
   registro del personale spedito al commercialista esterno, e il pannello
   aveva risposto «✓ Salvato». Adesso: riga assente = valori di fabbrica;
   riga presente ma inservibile = NON si manda, e si scrive perché. */
async function destinatari(): Promise<{ a: string[]; scartati: string[]; errore?: string }> {
    try {
        const { data } = await supabase.from("automatismi_config")
            .select("parametri").eq("id", "assenze-report-mensile").maybeSingle();
        const v = (data?.parametri as { destinatari?: unknown })?.destinatari;
        if (!Array.isArray(v)) return { a: DESTINATARI_DI_PARTENZA, scartati: [] };
        const grezzi = v.map((x) => String(x || "").trim()).filter(Boolean);
        const buoni = grezzi.filter((x) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(x));
        const scartati = grezzi.filter((x) => !buoni.includes(x));
        if (!buoni.length) {
            return {
                a: [], scartati,
                errore: grezzi.length
                    ? `i destinatari impostati nell'hub non sono indirizzi validi (${scartati.join(", ")}): report NON inviato`
                    : "l'elenco dei destinatari nell'hub è vuoto: report NON inviato",
            };
        }
        return { a: buoni, scartati };
    } catch { return { a: DESTINATARI_DI_PARTENZA, scartati: [] }; }
}

async function xlsx(fogli: FoglioExcel[]): Promise<Buffer> {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    for (const f of fogli) {
        const ws = XLSX.utils.aoa_to_sheet([f.intestazioni, ...f.righe]);
        ws["!cols"] = f.intestazioni.map((h, i) => {
            let w = Math.max(h.length + 2, 8);
            for (const r of f.righe) w = Math.max(w, String(r[i] ?? "").length + 2);
            return { wch: Math.min(w, 60) };
        });
        XLSX.utils.book_append_sheet(wb, ws, f.nome);
    }
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function POST(req: Request) {
    /* ⚠️ O UNA PERSONA, O IL LAVORO AUTOMATICO (31/08 sera, rilievo del
       revisore). Questa rotta era rimasta l'unica aperta a chiunque su
       Internet quando le altre due hanno preso la parola d'ordine. E il danno
       peggiore non era la mail di troppo: una chiamata da fuori BRUCIA LO
       SLOT DEL MESE — il registro segna «inviato» e il giro vero del primo
       del mese salta, lasciando il consulente senza il file. */
    if (!(await eUnLavoroAutomatico(req))) {
        const _g = await accesso(req, "assenze/report-mensile");
        if (!_g.ok) return _g.risposta;
    }
    const body: Record<string, unknown> = await req.json().catch(() => ({}));
    const tokenOk = !!process.env.TRIAGE_ADMIN_TOKEN && req.headers.get("x-triage-token") === process.env.TRIAGE_ADMIN_TOKEN;
    const forza = !!body?.force && tokenOk;
    // `mese` (AAAA-MM-01) per rimandare un mese vecchio; senza, quello chiuso ieri
    const mese = typeof body?.mese === "string" && /^\d{4}-\d{2}-01$/.test(body.mese)
        ? { iso: body.mese, da: body.mese, a: ymd(new Date(Number(body.mese.slice(0, 4)), Number(body.mese.slice(5, 7)), 0)) }
        : mesePrecedente();
    const prova = !!body?.dryRun;
    /* PROVA VERA, MA IN CASA (Luca 31/08: «fai una verifica del processo che
       funziona»). `provaA` manda il report a un indirizzo NOSTRO invece che ai
       due veri: serve a vedere arrivare davvero gli allegati prima che il
       primo del mese li porti al consulente. Solo dominio telefuturasrl.com —
       da qui non si può spedire a nessun altro — e non tocca il registro,
       così il giro automatico parte lo stesso. */
    const provaA = typeof body?.provaA === "string" && /^[^@\s]+@telefuturasrl\.com$/i.test(body.provaA.trim())
        ? body.provaA.trim() : null;

    if (!forza && !prova && !provaA) {
        const { data: gia } = await supabase.from("report_assenze_inviati").select("mese, esito").eq("mese", mese.iso).maybeSingle();
        if (gia && gia.esito === "inviato") return NextResponse.json({ ok: true, saltato: "già inviato", mese: mese.iso });
    }

    const dest = await destinatari();
    const DEST = dest.a;
    if (dest.errore) {
        if (!provaA && !prova) {
            await supabase.from("report_assenze_inviati").upsert({
                mese: mese.iso, esito: "destinatari", errore: dest.errore,
                destinatari: "", righe_ferie: 0, righe_malattia: 0, inviato_il: new Date().toISOString(),
            }, { onConflict: "mese" });
        }
        return NextResponse.json({ ok: false, errore: dest.errore }, { status: 503 });
    }

    // ── i dati: le stesse fonti del bottone Excel ──────────────────────────
    const [fes, fer, mal] = await Promise.all([
        supabase.from("giorni_festivi").select("giorno"),
        supabase.from("vacation_requests").select("employee_name, store, date_from, date_to, half_day, tipo, reason, admin_note")
            .eq("status", "approved").lte("date_from", mese.a).gte("date_to", mese.da),
        supabase.from("sickness_absences").select("employee_name, store, date_from, date_to, certificate_number")
            .lte("date_from", mese.a).gte("date_to", mese.da),
    ]);
    /* SENZA I FESTIVI NON SI MANDA NIENTE: contarli come lavorativi gonfia le
       ore, e un file gonfiato che arriva al consulente è peggio di un file che
       non arriva (rilievo del revisore sull'export a mano). */
    if (fes.error) return NextResponse.json({ ok: false, errore: "non ho potuto leggere i giorni festivi: report non inviato" }, { status: 503 });
    const festivi = new Set(((fes.data ?? []) as { giorno: string }[]).map((f) => String(f.giorno).slice(0, 10)));
    if (fer.error || mal.error) return NextResponse.json({ ok: false, errore: (fer.error || mal.error)?.message }, { status: 503 });

    const g = (v: unknown) => String(v ?? "").slice(0, 10);
    const righeFerie: RigaAssenza[] = ((fer.data ?? []) as Record<string, string>[])
        // i CORSI sono tempo lavorato, non ferie: fuori, come nel bottone Excel
        .filter((r) => r.tipo !== "corso")
        .map((r) => {
            const giornate = giornateAssenza(g(r.date_from), g(r.date_to), mese.da, mese.a, festivi, !!r.half_day);
            return {
                persona: r.employee_name, negozio: r.store || "",
                dal: g(r.date_from), al: g(r.date_to),
                giorni: giornate.reduce((t, x) => t + x.quota, 0), giornate,
                extra: {
                    "Mezza giornata": r.half_day ? (r.half_day === "mattina" ? "Mattina" : "Pomeriggio") : "",
                    "Motivazione": r.reason || "", "Nota amministrazione": r.admin_note || "",
                },
            };
        }).filter((x) => x.giorni > 0);
    const righeMal: RigaAssenza[] = ((mal.data ?? []) as Record<string, string>[]).map((r) => {
        const giornate = giornateAssenza(g(r.date_from), g(r.date_to), mese.da, mese.a, festivi);
        return {
            persona: r.employee_name, negozio: r.store || "",
            dal: g(r.date_from), al: g(r.date_to),
            giorni: giornate.length, giornate,
            extra: { "Certificato": r.certificate_number || "" },
        };
    }).filter((x) => x.giorni > 0);

    const fogliF = fogliAssenze(righeFerie, ["Mezza giornata", "Motivazione", "Nota amministrazione"]);
    const fogliM = fogliAssenze(righeMal, ["Certificato"]);
    const etichetta = nomeMese(mese.iso);
    const nomeF = `ferie_${mese.iso.slice(0, 7)}.xlsx`;
    const nomeM = `malattia_${mese.iso.slice(0, 7)}.xlsx`;

    if (prova) {
        return NextResponse.json({
            ok: true, prova: true, mese: mese.iso, etichetta,
            ferie: { righe: righeFerie.length, persone: fogliF[1].righe.length },
            malattia: { righe: righeMal.length, persone: fogliM[1].righe.length },
            destinatari: DEST, scartati: dest.scartati,
        });
    }

    /* UN MESE VUOTO NON SI MANDA (rilievo del revisore). Se ferie e malattia
       sono entrambe a zero non è una bella notizia: in un'azienda con 48
       collaboratori un mese senza nemmeno un permesso vuol dire che il conto
       non ha trovato i dati — un cambio di stato, una query andata a vuoto
       senza errore. Meglio non spedire due fogli di sole intestazioni al
       consulente: si segna «vuoto» (che NON è «inviato», quindi il giro delle
       11:00 riprova) e si avvisa qui. */
    if (!righeFerie.length && !righeMal.length && !forza) {
        if (!provaA) {
            await supabase.from("report_assenze_inviati").upsert({
                mese: mese.iso, esito: "vuoto",
                errore: "nessuna ferie e nessuna malattia nel mese: non spedito, controllare i dati",
                destinatari: DEST.join(", "), righe_ferie: 0, righe_malattia: 0,
                inviato_il: new Date().toISOString(),
            }, { onConflict: "mese" });
        }
        return NextResponse.json({ ok: false, mese: mese.iso, saltato: "mese vuoto: niente da mandare, il file sarebbe di sole intestazioni" }, { status: 200 });
    }

    const mittente = await casellaMittente();
    if (!mittente) return NextResponse.json({ ok: false, errore: "la casella amministrazione@ non è collegata al CRM" }, { status: 503 });

    const testo = [
        `Buongiorno,`,
        ``,
        `in allegato il riepilogo delle assenze di ${etichetta}:`,
        ``,
        `• ${nomeF} — ferie e permessi approvati`,
        `• ${nomeM} — assenze per malattia`,
        ``,
        `ATTENZIONE: ogni file contiene DUE FOGLI.`,
        `  – «Dettaglio»: una riga per ogni assenza, con le date e i giorni che cadono nel mese.`,
        `  – «Riepilogo»: una riga per collaboratore, con il totale dei giorni e delle ore.`,
        ``,
        `I giorni sono quelli lavorativi (escluse domeniche e festività); il sabato è considerato lavorativo. Un giorno vale 8 ore. Le mezze giornate valgono 0,5. Nel riepilogo una giornata coperta da più assenze conta una volta sola.`,
        ``,
        `Questo messaggio è automatico e parte il primo di ogni mese.`,
        ``,
        `Telefutura`,
    ].join("\n");

    let esito = "inviato", errore: string | null = null;
    try {
        await inviaEmail(mittente as never, {
            to: provaA || DEST.join(", "),
            subject: `${provaA ? "[PROVA] " : ""}Telefutura — Ferie e malattia ${etichetta}`,
            text: testo,
            html: `<p>${testo.replace(/\n/g, "<br>")}</p>`,
            attachments: [
                { filename: nomeF, content: await xlsx(fogliF), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
                { filename: nomeM, content: await xlsx(fogliM), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
            ],
        });
    } catch (e) {
        esito = "errore"; errore = e instanceof Error ? e.message : "invio non riuscito";
    }
    // la prova non tocca il registro: il giro automatico deve partire lo stesso
    if (provaA) return NextResponse.json({ ok: esito === "inviato", prova: provaA, mese: mese.iso, ferie: righeFerie.length, malattia: righeMal.length, errore });
    await supabase.from("report_assenze_inviati").upsert({
        mese: mese.iso, esito, errore, destinatari: DEST.join(", "),
        righe_ferie: righeFerie.length, righe_malattia: righeMal.length, inviato_il: new Date().toISOString(),
    }, { onConflict: "mese" });

    return esito === "inviato"
        ? NextResponse.json({ ok: true, mese: mese.iso, ferie: righeFerie.length, malattia: righeMal.length, a: DEST })
        : NextResponse.json({ ok: false, errore }, { status: 502 });
}

/** GET: a che punto siamo, senza mandare niente. Chiuso lo stesso: dice a chi
 *  guarda quali mesi sono partiti e quando — non è roba da mostrare fuori. */
export async function GET(req: Request) {
    const _g = await accesso(req, "assenze/report-mensile");
    if (!_g.ok) return _g.risposta;
    const { data } = await supabase.from("report_assenze_inviati").select("*").order("mese", { ascending: false }).limit(6);
    return NextResponse.json({ prossimo: mesePrecedente().iso, storico: data ?? [] });
}
