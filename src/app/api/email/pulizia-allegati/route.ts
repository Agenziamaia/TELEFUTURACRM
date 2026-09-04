import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { eUnLavoroAutomatico } from "@/lib/cronParola";
import { accesso } from "@/lib/permessiServer";

/* ═══ GLI ALLEGATI CHE NON APPARTENGONO PIÙ A NESSUNO ════════════════════
   Nel deposito della posta ci sono file che nessun messaggio nomina più:
   allegati riletti due volte quando una casella si risincronizzava (il
   difetto è chiuso dal 02/09, ma le copie sono rimaste), e file caricati in
   una composizione poi abbandonata.

   ⚠️ SI CANCELLA SOLO CIÒ CHE NESSUNO NOMINA, E SOLO SE HA PIÙ DI TRE
   GIORNI. La finestra non è prudenza generica: un allegato appena caricato
   in una mail non ancora spedita è orfano per definizione — nessun
   messaggio lo cita — e cancellarlo vorrebbe dire togliere il file dalle
   mani di chi sta scrivendo.

   GET = conta e basta. POST = cancella. */

const GIORNI_GRAZIA = 3;

async function autorizzato(req: Request): Promise<boolean> {
    if (await eUnLavoroAutomatico(req)) return true;
    const g = await accesso(req, "amministrazione");
    return g.ok;
}

/** I nomi degli oggetti che nessun messaggio cita più, più vecchi della grazia. */
async function orfani(): Promise<{ nome: string; peso: number }[]> {
    const { data, error } = await supabaseAdmin.rpc("tf_allegati_orfani", { p_giorni: GIORNI_GRAZIA });
    if (error) throw new Error(error.message);
    return ((data ?? []) as { nome: string; peso: string | number }[])
        .map((r) => ({ nome: r.nome, peso: Number(r.peso || 0) }));
}

export async function GET(req: Request) {
    if (!await autorizzato(req)) return NextResponse.json({ error: "non autorizzato" }, { status: 401 });
    try {
        const o = await orfani();
        const mb = o.reduce((n, x) => n + x.peso, 0) / 1048576;
        return NextResponse.json({
            ok: true, prova: true, quanti: o.length, mb: Math.round(mb),
            detto: o.length
                ? `Ci sono ${o.length} allegati che nessun messaggio nomina più, per ${Math.round(mb)} MB. Hanno tutti più di ${GIORNI_GRAZIA} giorni.`
                : "Nel deposito della posta non c'è niente da buttare.",
        });
    } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "errore" }, { status: 500 }); }
}

export async function POST(req: Request) {
    if (!await autorizzato(req)) return NextResponse.json({ error: "non autorizzato" }, { status: 401 });
    try {
        const o = await orfani();
        let tolti = 0;
        /* a lotti di cento: una `remove` con seicento nomi è una richiesta che
           può morire a metà, e a metà non si sa più cosa è stato tolto */
        for (let i = 0; i < o.length; i += 100) {
            const lotto = o.slice(i, i + 100).map((x) => x.nome);
            const { error } = await supabaseAdmin.storage.from("email-attachments").remove(lotto);
            if (error) return NextResponse.json({ error: `dopo ${tolti} file: ${error.message}` }, { status: 500 });
            tolti += lotto.length;
        }
        const mb = Math.round(o.reduce((n, x) => n + x.peso, 0) / 1048576);
        try {
            await supabaseAdmin.from("automatismi_eventi").insert({
                azione: "pulizia-allegati", bersaglio: "email-attachments",
                dettaglio: tolti ? `${tolti} allegati orfani tolti (${mb} MB)` : "niente da buttare",
            });
        } catch { /* il registro è un di più */ }
        return NextResponse.json({ ok: true, tolti, mb });
    } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "errore" }, { status: 500 }); }
}
