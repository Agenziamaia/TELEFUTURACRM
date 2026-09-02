import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminOrAbove } from "@/lib/roles";
import { saldo } from "@/lib/paystore";
import { credenzialeDi } from "@/lib/paystoreCredenziali";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ QUANTO CREDITO C'È, NEGOZIO PER NEGOZIO ══════════════════════════════
   Il plafond PayStore è denaro caricato in anticipo, e ogni punto vendita ha
   il suo. Quando finisce, le ricariche di quel negozio smettono di partire —
   e senza questa schermata la prima cosa che qualcuno nota è un cliente al
   banco che non riceve il credito.

   ⚠️ UNA CHIAMATA PER CREDENZIALE, e sono sedici: si fanno tutte insieme ma
   con un tetto di tempo, perché una sola lenta non deve tenere ferma la
   pagina. Chi non risponde si dice, non si finge a zero — un saldo mancante e
   un saldo vuoto sono due cose diverse.

   ⚠️ SOLO DIREZIONE. È l'informazione con cui si decide quando ricaricare il
   plafond: non è materiale da banco. */

export async function GET(request: Request) {
    const _g = await accesso(request, "paystore/saldo");
    if (!_g.ok) return _g.risposta;
    const { data: me } = await supabaseAdmin.from("app_users").select("role").eq("id", _g.sess.id).maybeSingle();
    if (!isAdminOrAbove(String((me as { role?: string } | null)?.role || ""))) {
        return NextResponse.json({ error: "il plafond lo vede la direzione." }, { status: 403 });
    }

    const { data } = await supabaseAdmin.from("paystore_credenziali")
        .select("negozio, azienda, identificativo").eq("attivo", true).order("negozio");
    const righe = (data || []) as { negozio: string; azienda: string; identificativo: string | null }[];
    if (!righe.length) return NextResponse.json({ ok: true, saldi: [], nessunaCredenziale: true });

    const saldi = await Promise.all(righe.map(async (r) => {
        const c = await credenzialeDi(r.negozio, r.azienda);
        if (!c.ok) return { ...r, errore: c.errore, saldo: null as number | null };
        const s = await saldo(c.cred);
        return s.ok
            ? { ...r, saldo: Number(s.dati?.balance ?? 0), aggiornatoIl: s.dati?.asOfUtc || null, errore: null }
            : { ...r, saldo: null, errore: s.descrizione || s.errore };
    }));

    const conSaldo = saldi.filter((s) => s.saldo != null);
    return NextResponse.json({
        ok: true, saldi,
        totale: conSaldo.reduce((t, s) => t + (s.saldo || 0), 0),
        /* ⚠️ QUANTI NON HANNO RISPOSTO: senza questo numero il totale sembra
           il credito di tutti, mentre è il credito di quelli che hanno
           risposto. */
        muti: saldi.length - conSaldo.length,
    });
}
