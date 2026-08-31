import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ APPROVARE CHI LAVORA IN UN ALTRO NEGOZIO (Luca 31/08) ═══════════════════
   «Ci mettiamo un pulsante "altro negozio": a quel punto lo seleziona, ma uno
    dell'amministrazione deve approvargli l'accesso.»

   Passa dal server per un motivo solo: il ruolo si legge dal DATABASE con l'id
   della sessione firmata. Dal browser la tabella `presenza_negozio` non si può
   aggiornare affatto (solo select e insert), quindi nessuno può approvarsi la
   propria richiesta — provato in transazione: «permission denied».

   GET  → le richieste ancora in attesa (per la schermata Turni)
   POST { id, esito: "approva" | "rifiuta" }
   ═══════════════════════════════════════════════════════════════════════════ */

const PUO_APPROVARE = ["amministrativo", "direttore_generale", "admin", "dev"];

async function chiSei(id: string) {
    const { data } = await supabase.from("app_users")
        .select("role, full_name, active").eq("id", id).maybeSingle();
    return data;
}

export async function GET(req: Request) {
    let _s: { id: string; role: string; exp: number };
    {
        const _g = await accesso(req, "collaboratori");
        if (!_g.ok) return _g.risposta;
        _s = _g.sess;
    }
    const io_ = await chiSei(_s.id);
    if (!io_ || io_.active === false || !PUO_APPROVARE.includes(String(io_.role || "")))
        return NextResponse.json({ ok: true, richieste: [] });   // non è un errore: non ne vede

    const { data, error } = await supabase.from("presenza_negozio")
        .select("id, user_id, data, sede, sede_turno, motivo, created_at, app_users(full_name)")
        .eq("stato", "in_attesa").order("created_at", { ascending: false }).limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, richieste: data ?? [] });
}

export async function POST(req: Request) {
    let _s: { id: string; role: string; exp: number };
    {
        const _g = await accesso(req, "collaboratori");
        if (!_g.ok) return _g.risposta;
        _s = _g.sess;
    }
    const io_ = await chiSei(_s.id);
    if (!io_ || io_.active === false || !PUO_APPROVARE.includes(String(io_.role || "")))
        return NextResponse.json({ error: "solo l'amministrazione può approvare" }, { status: 403 });

    const b = await req.json().catch(() => ({})) as { id?: string; esito?: string };
    if (!b.id) return NextResponse.json({ error: "id richiesto" }, { status: 400 });
    const approva = b.esito !== "rifiuta";

    const { data: riga } = await supabase.from("presenza_negozio")
        .select("id, user_id, data, sede, stato").eq("id", b.id).maybeSingle();
    if (!riga) return NextResponse.json({ error: "richiesta non trovata" }, { status: 404 });
    if (riga.stato !== "in_attesa")
        return NextResponse.json({ error: "questa richiesta è già stata decisa" }, { status: 409 });

    /* APPROVARE VUOL DIRE SPOSTARLO. La presenza attiva di quel giorno — quella
       del turno, su cui ha lavorato mentre aspettava — si CHIUDE, e prende il
       suo posto quella richiesta. Non si cancella: resta scritto che stamattina
       era da un'altra parte, che è metà del valore di questa tabella. */
    if (approva) {
        await supabase.from("presenza_negozio")
            .update({ stato: "chiusa", deciso_da: io_.full_name || _s.id, deciso_il: new Date().toISOString() })
            .eq("user_id", riga.user_id).eq("data", riga.data).eq("stato", "attiva");
    }
    const { error } = await supabase.from("presenza_negozio")
        .update({
            stato: approva ? "attiva" : "rifiutata",
            deciso_da: io_.full_name || _s.id,
            deciso_il: new Date().toISOString(),
        })
        .eq("id", b.id).eq("stato", "in_attesa");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // la task dell'amministrazione si chiude da sola: è stata evasa
    await supabase.from("admin_tasks")
        .update({ done: true, done_by: io_.full_name || "—", done_at: new Date().toISOString() })
        .eq("tipo", "accesso_negozio").eq("done", false)
        .ilike("dettaglio", `%${riga.sede}%`);

    return NextResponse.json({ ok: true, stato: approva ? "attiva" : "rifiutata" });
}
