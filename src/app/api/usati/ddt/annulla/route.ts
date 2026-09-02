import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminOrAbove } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ ANNULLARE IL DOCUMENTO DI UN USATO ═══════════════════════════════════
   Rilievo della revisione del 02/09: il documento di un telefono usato nasce
   nello stato `usato` — chiuso, perché nessuno lo deve accettare — e
   l'annullamento del magazzino guarda solo i documenti `in_transito`. Cioè:
   un documento emesso per sbaglio non si poteva togliere in nessun modo.

   Le conseguenze non erano teoriche. Il numero è consumato nel registro
   annuale di quella società e non si può riusare; e se le due società erano
   diverse, il documento restava per sempre nell'elenco «da fatturare», con
   l'amministrazione a inseguire una fattura per un viaggio mai avvenuto.

   ⚠️ NON SI CANCELLA. Resta col suo numero, marcato annullato, col motivo
   scritto e con chi l'ha annullato. È la stessa regola degli altri documenti
   di trasporto: un buco in una numerazione, in un controllo, è peggio di un
   documento annullato.

   ⚠️ E LO FA SOLO LA DIREZIONE. Emettere un documento è un gesto di lavoro;
   annullarne uno è una correzione sul registro fiscale. */

export async function POST(req: Request) {
    const g = await accesso(req, "usati/ddt");
    if (!g.ok) return g.risposta;

    const { data: chi } = await supabaseAdmin.from("app_users")
        .select("role").eq("id", g.sess.id).maybeSingle();
    if (!isAdminOrAbove(String((chi as { role?: string } | null)?.role || ""))) {
        return NextResponse.json({ error: "annullare un documento di trasporto è una correzione sul registro: la fa l'amministrazione." }, { status: 403 });
    }

    const b = await req.json().catch(() => ({})) as { ddtId?: string; motivo?: string };
    if (!b.ddtId) return NextResponse.json({ error: "manca il documento" }, { status: 400 });
    const motivo = String(b.motivo || "").trim();
    /* ⚠️ IL MOTIVO È OBBLIGATORIO. Un documento annullato senza motivo, fra sei
       mesi, non lo sa spiegare più nessuno. */
    if (motivo.length < 5) return NextResponse.json({ error: "scrivi perché lo stai annullando: resta sul documento." }, { status: 400 });

    const { data: d } = await supabaseAdmin.from("mag_ddt")
        .select("id, numero, anno, stato, usato_id").eq("id", b.ddtId).maybeSingle();
    if (!d) return NextResponse.json({ error: "documento non trovato" }, { status: 404 });
    const doc = d as { numero: number; anno: number; stato: string; usato_id: number | null };
    if (!doc.usato_id) return NextResponse.json({ error: "questo non è il documento di un telefono usato: si annulla dal magazzino." }, { status: 400 });
    if (doc.stato === "annullato") return NextResponse.json({ ok: true, gia: true, numero: doc.numero, anno: doc.anno });

    const { error } = await supabaseAdmin.rpc("tf_ddt_usato_annulla", {
        p_ddt_id: b.ddtId, p_motivo: motivo, p_chi: g.sess.id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, numero: doc.numero, anno: doc.anno });
}
