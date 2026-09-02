import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin, serviceRolePresente } from "@/lib/supabaseAdmin";
import { isAdminOrAbove } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ I FILE DI TRANSITO RIMASTI INDIETRO ═════════════════════════════════
   Il deposito `qr-uploads` è di PASSAGGIO: il dipendente inquadra il codice
   col telefono, fotografa il documento, il file arriva qui, il computer del
   negozio se lo prende e lo mette dentro la vendita — e a quel punto la copia
   di passaggio va cancellata subito.

   ⚠️ DAL 31/08 QUELLA CANCELLAZIONE NON AVVENIVA PIÙ. Con i depositi chiusi al
   pubblico, una cancellazione dal browser pretende anche il permesso di
   lettura: senza, Postgres non protesta e cancella zero righe, e il client
   risponde «fatto». Misurato: prima ne restavano meno di sette al giorno, dal
   31/08 centinaia — 481 file per 516 MB.
   Il meccanismo è riparato (la cancellazione passa dal custode), ma i file già
   rimasti indietro nessuno li toglie: questa rotta serve a quello.

   ⚠️ SI CANCELLA SOLO QUELLO CHE HA FINITO. Una sessione ancora viva in
   `qr_uploads` vuol dire che qualcuno sta caricando proprio adesso: quei file
   non si toccano. Le sessioni chiuse invece sono la prova che il computer del
   negozio ha già preso i file e li ha messi al loro posto.

   GET  = conta e basta, non tocca niente.
   POST = cancella, e dice quanti. Solo direzione. */

const DEPOSITO = "qr-uploads";

/** Il conto, in una riga di SQL. Leggerlo dal deposito a pagine — cinquecento
 *  cartelle, cento per volta — era così lento da non rispondere, e il riquadro
 *  senza dati spariva del tutto invece di dire che non ce la faceva. */
async function conta() {
    const { data, error } = await supabaseAdmin.rpc("tf_transito_da_pulire");
    const r = ((data || []) as { tutti: number; da_togliere: number; byte: number; sessioni_vive: number }[])[0];
    if (error || !r) return null;
    return { tutti: Number(r.tutti), daTogliere: Number(r.da_togliere), mb: Math.round(Number(r.byte) / 104857.6) / 10, viveSessioni: Number(r.sessioni_vive) };
}

/** I percorsi da togliere davvero: qui il deposito si legge sul serio, ma solo
 *  quando si cancella — non a ogni apertura della schermata. */
async function elenca(): Promise<{ daTogliere: string[] }> {
    const { data: sess } = await supabaseAdmin.from("qr_uploads").select("token");
    const vivi = new Set(((sess || []) as { token: string }[]).map((s) => s.token));
    const cartelle: string[] = [];
    for (let da = 0; ; da += 100) {
        const { data } = await supabaseAdmin.storage.from(DEPOSITO).list("", { limit: 100, offset: da });
        const p = (data || []) as { name: string }[];
        cartelle.push(...p.map((x) => x.name));
        if (p.length < 100 || da > 5000) break;
    }
    const daTogliere: string[] = [];
    for (const c of cartelle) {
        if (vivi.has(c)) continue;
        const { data } = await supabaseAdmin.storage.from(DEPOSITO).list(c, { limit: 100 });
        for (const f of (data || []) as { name: string }[]) daTogliere.push(`${c}/${f.name}`);
    }
    return { daTogliere };
}

export async function GET(req: Request) {
    const g = await accesso(req, "file/transito");
    if (!g.ok) return g.risposta;
    if (!serviceRolePresente()) return NextResponse.json({ error: "chiave di servizio assente" }, { status: 500 });
    const r = await conta();
    if (!r) return NextResponse.json({ error: "non riesco a contare i file di transito" }, { status: 500 });
    return NextResponse.json({ ok: true, tutti: r.tutti, daTogliere: r.daTogliere, mb: r.mb, sessioniVive: r.viveSessioni });
}

export async function POST(req: Request) {
    const g = await accesso(req, "file/transito");
    if (!g.ok) return g.risposta;
    if (!serviceRolePresente()) return NextResponse.json({ error: "chiave di servizio assente" }, { status: 500 });

    const { data: me } = await supabaseAdmin.from("app_users").select("role").eq("id", g.sess.id).maybeSingle();
    if (!isAdminOrAbove(String((me as { role?: string } | null)?.role || ""))) {
        return NextResponse.json({ error: "solo la direzione può svuotare il deposito di transito." }, { status: 403 });
    }

    const quanti = await conta();
    const r = await elenca();
    if (!r.daTogliere.length) return NextResponse.json({ ok: true, tolti: 0, mb: 0 });

    /* a blocchi: una `remove` con cinquecento percorsi in un colpo è una
       richiesta che può cadere a metà, e non si saprebbe dove */
    let tolti = 0; const errori: string[] = [];
    for (let i = 0; i < r.daTogliere.length; i += 50) {
        const blocco = r.daTogliere.slice(i, i + 50);
        const { data, error } = await supabaseAdmin.storage.from(DEPOSITO).remove(blocco);
        if (error) errori.push(error.message);
        else tolti += (data || []).length;
    }
    return NextResponse.json({ ok: !errori.length, tolti, mb: quanti?.mb ?? 0, errori: errori.slice(0, 3) });
}
