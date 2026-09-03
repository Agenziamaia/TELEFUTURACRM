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

    type Letto = {
        negozio: string; azienda: string; identificativo: string | null;
        saldo: number | null; borsellino: string | null; aggiornatoIl: string | null; errore: string | null;
    };
    const letti: Letto[] = await Promise.all(righe.map(async (r): Promise<Letto> => {
        const c = await credenzialeDi(r.negozio, r.azienda);
        if (!c.ok) return { ...r, errore: c.errore, saldo: null, borsellino: null, aggiornatoIl: null };
        const s = await saldo(c.cred);
        return s.ok
            ? {
                ...r, saldo: Number(s.dati?.balance ?? 0), aggiornatoIl: s.dati?.asOfUtc || null, errore: null,
                /* ⚠️ CHI POSSIEDE IL CREDITO, non chi lo chiede. È la chiave di
                   tutto quello che c'è sotto. */
                borsellino: String(s.dati?.customerId ?? s.dati?.wallet ?? ""),
            }
            : { ...r, saldo: null, borsellino: null, aggiornatoIl: null, errore: s.descrizione || s.errore || null };
    }));

    /* ═══ I BORSELLINI SONO CONDIVISI ══════════════════════════════════════
       Luca 03/09: «credo che il borsellino sia sbagliato, non mi torna che
       abbiamo quell'importo; tra l'altro i borsellini sono CONDIVISI tra
       società, quindi dovrebbero essercene 2».

       ⚠️ E IL TOTALE ERA FALSO. Sedici credenziali non sono sedici borsellini:
       PayStore risponde a ognuna col saldo del borsellino a cui è agganciata, e
       se dieci negozi ne condividono uno, sommare le dieci risposte conta
       quello stesso credito dieci volte. Il numero che usciva era gonfiato di
       quanto le credenziali sono più dei borsellini.
       Il saldo si raggruppa per `customerId`: un borsellino, una riga, e
       accanto i negozi che ci attingono. */
    const perBorsellino = new Map<string, { borsellino: string; saldo: number; aggiornatoIl: string | null; negozi: { negozio: string; azienda: string }[] }>();
    for (const l of letti) {
        if (l.saldo == null || !l.borsellino) continue;
        const v = perBorsellino.get(l.borsellino) || { borsellino: l.borsellino, saldo: l.saldo, aggiornatoIl: l.aggiornatoIl ?? null, negozi: [] };
        /* se due letture dello stesso borsellino danno cifre diverse (una è di
           un istante prima) si tiene la più bassa: su un plafond, sbagliare per
           difetto è l'unico verso che non fa erogare più di quanto c'è */
        v.saldo = Math.min(v.saldo, l.saldo);
        v.negozi.push({ negozio: l.negozio, azienda: l.azienda });
        perBorsellino.set(l.borsellino, v);
    }
    const borsellini = [...perBorsellino.values()].sort((a, b) => b.saldo - a.saldo);
    const muti = letti.filter((l) => l.saldo == null);

    return NextResponse.json({
        ok: true,
        borsellini,
        /* ⚠️ IL TOTALE SOMMA I BORSELLINI, NON LE CREDENZIALI. */
        totale: borsellini.reduce((t, b) => t + b.saldo, 0),
        /* chi non ha risposto si dice: un saldo mancante e un saldo vuoto sono
           due cose diverse, e il totale è il credito di chi ha risposto */
        muti: muti.map((m) => ({ negozio: m.negozio, azienda: m.azienda, errore: m.errore })),
    });
}
