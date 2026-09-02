import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { eUnLavoroAutomatico } from "@/lib/cronParola";
import { parametriAutomatismo } from "@/lib/automatismiConfig";
import { eseguiRicarica } from "@/lib/paystoreEsegui";
import type { RigaRicarica } from "@/lib/paystoreEsegui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ IL MOTORE DELLE RICARICHE ════════════════════════════════════════════
   Prende le ricariche vendute e non ancora erogate e le esegue da sé, con la
   credenziale PayStore del negozio che le ha vendute.

   ⚠️ NASCE SPENTO, E DEVE RESTARE SPENTO FINCHÉ LUCA NON FA LA PROVA. Questo
   codice eroga denaro vero: il credito è caricato in anticipo sul plafond di
   ogni punto vendita, e una ricarica partita non torna indietro. L'interruttore
   sta nell'hub Automatismi ed è di fabbrica su NO.

   ⚠️ E NON EREDITA L'ARRETRATO. Misurato il 02/09, prima di scrivere una riga:
   37 ricariche in sospeso per 426 € su dieci negozi. Una parte è già stata
   caricata a mano al terminale PayStore senza che nessuno l'abbia segnata nel
   CRM — è il modo in cui si lavora oggi. Accendere il motore su quelle
   vorrebbe dire erogare il credito una SECONDA volta, a spese nostre.
   Per questo il motore guarda solo dentro una finestra di tempo (di fabbrica
   un'ora): quello che è più vecchio resta a chi lo stava già facendo, e
   continua a vedersi nel pannello come «da fare».

   ⚠️ E NON NE PRENDE DUE VOLTE LA STESSA. La presa avviene nel database, in
   transazione, con `for update skip locked` (`tf_paystore_prendi`): due corse
   sovrapposte non possono vedere la stessa riga. Senza, genererebbero due
   chiavi di idempotenza diverse sullo stesso numero — e l'idempotenza di
   PayStore protegge solo a parità di chiave.

   ⚠️ LE RICARICHE SI ESEGUONO UNA ALLA VOLTA. Il plafond è condiviso fra tutte
   le ricariche dello stesso negozio: lanciarle insieme vuol dire non sapere
   quale ha trovato il credito finito. E una risposta lenta di PayStore non
   deve trascinarsi dietro le altre.

   POST → una corsa. La fa il cron, o una persona dall'hub Automatismi.
   GET  → cosa farebbe adesso, senza fare niente. */

const DI_FABBRICA = { acceso: false, max: 10, finestra: 60, tetto: 50, lasso: 10 };

async function impostazioni() {
    const p = await parametriAutomatismo("paystore-motore");
    const num = (k: keyof typeof DI_FABBRICA, min: number, max: number) => {
        const v = Number(p[k]);
        return Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : (DI_FABBRICA[k] as number);
    };
    return {
        /* ⚠️ L'INTERRUTTORE È SPENTO SE NON DICE ESPLICITAMENTE «SÌ». Un
           parametro assente, illeggibile o scritto male non deve MAI risultare
           acceso: il verso sbagliato di questo `if` eroga denaro. */
        acceso: p.acceso === true || p.acceso === "true",
        max: num("max", 1, 50),
        finestra: num("finestra", 5, 1440),
        tetto: num("tetto", 1, 500),
        lasso: num("lasso", 2, 60),
    };
}

export async function GET(request: Request) {
    const g = await accesso(request, "paystore");
    if (!g.ok) return g.risposta;
    const imp = await impostazioni();

    /* la stessa selezione della presa, ma in sola lettura: dice cosa
       partirebbe senza far partire niente */
    const da = new Date(Date.now() - imp.finestra * 60000).toISOString();
    const { data } = await supabase.from("paystore_ricariche")
        .select("id, negozio, azienda, operatore_nome, importo, numero, creata_il")
        .eq("stato", "sospeso").eq("scontrino_stato", "emesso")
        .gte("creata_il", da).lte("importo", imp.tetto)
        .order("creata_il").limit(imp.max);

    const righe = (data || []) as { nota?: string | null; importo: number }[];
    return NextResponse.json({
        ok: true, impostazioni: imp,
        prenderebbe: righe.length,
        totale: righe.reduce((s, r) => s + Number(r.importo || 0), 0),
        elenco: data || [],
    });
}

export async function POST(request: Request) {
    /* ⚠️ O IL LAVORO AUTOMATICO, O UNA PERSONA CON I PERMESSI. Chiudere con la
       sola sessione spegnerebbe il cron; lasciare aperto vorrebbe dire che
       chiunque su Internet fa erogare credito. */
    let daPersona = false;
    if (!(await eUnLavoroAutomatico(request))) {
        const g = await accesso(request, "paystore");
        if (!g.ok) return g.risposta;
        daPersona = true;
    }

    const imp = await impostazioni();
    if (!imp.acceso) {
        return NextResponse.json({
            ok: true, spento: true, eseguite: 0,
            messaggio: "Il motore delle ricariche è SPENTO. Si accende dall'hub Automatismi, e prima va fatta una prova con una ricarica sola.",
        });
    }

    const { data, error } = await supabase.rpc("tf_paystore_prendi", {
        p_max: imp.max, p_finestra_minuti: imp.finestra, p_tetto: imp.tetto, p_lasso_minuti: imp.lasso,
    });
    if (error) return NextResponse.json({ error: `non riesco a prendere le ricariche: ${error.message}` }, { status: 500 });

    const prese = (data || []) as RigaRicarica[];
    const esiti: { id: string; negozio: string | null; importo: number; esito: string }[] = [];
    let fatte = 0, fallite = 0, ignote = 0;

    /* ⚠️ UNA ALLA VOLTA. Vedi sopra: il plafond è condiviso per negozio. */
    for (const r of prese) {
        const e = await eseguiRicarica(r);
        if (e.ok) { fatte++; esiti.push({ id: r.id, negozio: r.negozio, importo: r.importo, esito: e.collaudo ? "prova (collaudo)" : e.gia ? "risultava già fatta" : "eseguita" }); continue; }
        if (e.definitivo) { fallite++; esiti.push({ id: r.id, negozio: r.negozio, importo: r.importo, esito: "fallita: " + e.errore }); continue; }
        ignote++;
        esiti.push({ id: r.id, negozio: r.negozio, importo: r.importo, esito: "esito ignoto: resta in sospeso, si ritenta con la stessa chiave" });
        /* ⚠️ SU UN ESITO IGNOTO LA CORSA SI FERMA. Se PayStore non risponde,
           insistere sulle altre significa moltiplicare le ricariche di cui non
           si sa come sono andate — e ognuna va poi riconciliata a mano. */
        break;
    }

    return NextResponse.json({ ok: true, daPersona, prese: prese.length, fatte, fallite, ignote, esiti });
}
