import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stessoMagazzino } from "@/lib/negoziNomi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ IL DOCUMENTO DI TRASPORTO DI UN TELEFONO USATO ══════════════════════
   Luca 02/09: «un telefono che transita dal negozio all'altro deve essere
   accompagnato da un documento di trasporto, così come quando trasferiamo
   merce da un magazzino all'altro. Quando lo metto in transito, e quando
   l'amministrativo lo trasferisce da pronto a un altro punto vendita. Poi, a
   differenza degli altri, questo è un documento che MUORE: non deve essere
   accettato, perché il negozio prende in carico il telefono dentro la gestione
   usati, seguendo quella timeline.»

   ⚠️ QUATTRO COSE CHE NON SI POSSONO SBAGLIARE:

   1. UN USATO NON È IN MAGAZZINO. Non ha una riga in `mag_unita` né una
      giacenza in `mag_giacenze`: il documento porta una riga descrittiva, con
      `unita_id` nullo, e NON deve muovere nessuno stock. Il codice del
      magazzino, quando trasferisce, scrive anche i movimenti — qui no, se no
      si creerebbe merce dal nulla su un codice che non esiste.

   2. NASCE CHIUSO. Stato `usato`: non `in_transito`, se no finirebbe fra i
      documenti «da accettare» e dopo tre giorni risulterebbe in ritardo per
      una consegna che nessuno deve confermare; e non `accettato`, che sarebbe
      una bugia — nessuno l'ha accettato.

   3. UNO SOLO PER VIAGGIO. Il documento nasce dentro il cambio di stato: un
      doppio clic o una correzione «torna indietro e rimanda» ne creerebbero
      due, e due documenti di trasporto per un telefono solo, in un controllo,
      sono un problema. L'indice unico è su (telefono, partenza, arrivo,
      giorno); qui si guarda prima e, se c'è già, si restituisce quello.

   4. LA SOCIETÀ SEGUE IL TELEFONO. Da un negozio di Telefutura a uno di
      Telefutura 2 non è un trasferimento: è una CESSIONE fra due soggetti
      giuridici, e la fattura serve come per qualunque altra merce. Le società
      si passano esplicite, se no il trigger le dedurrebbe dal magazzino del
      negozio — che per un usato non c'entra niente. */

/** Il giorno di Roma: lo stesso che finisce nell'indice unico. */
const giornoRoma = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

async function aziendaDelNegozio(negozio: string): Promise<string | null> {
    const { data } = await supabaseAdmin.from("stores")
        .select("azienda").eq("name", negozio).maybeSingle();
    const a = (data as { azienda?: string | null } | null)?.azienda;
    if (a) return a;
    const { data: rt } = await supabaseAdmin.from("pos_rt")
        .select("azienda").eq("negozio", negozio).order("is_default", { ascending: false }).limit(1);
    return ((rt || [])[0] as { azienda?: string | null } | undefined)?.azienda || null;
}

export async function POST(req: Request) {
    const g = await accesso(req, "usati/ddt");
    if (!g.ok) return g.risposta;

    const b = await req.json().catch(() => ({})) as
        { usatoId?: number; da?: string; a?: string; causale?: string };
    if (!b.usatoId || !b.da || !b.a) {
        return NextResponse.json({ error: "manca il telefono, la partenza o l'arrivo" }, { status: 400 });
    }
    /* ⚠️ PARTENZA E ARRIVO NELLO STESSO LOCALE NON SONO UN TRASPORTO. «Magliana
       W3» e «Magliana Multi» sono due insegne dello stesso bancone: il telefono
       non fa un metro, e un documento di trasporto per zero metri è carta che
       confonde chi la legge. */
    if (stessoMagazzino(b.da, b.a)) {
        return NextResponse.json({ ok: true, saltato: "partenza e arrivo sono lo stesso punto vendita" });
    }

    const { data: dev } = await supabaseAdmin.from("usati")
        .select("id, model, imei, purchase_price, sale_price, store").eq("id", b.usatoId).maybeSingle();
    if (!dev) return NextResponse.json({ error: "telefono non trovato" }, { status: 404 });
    const u = dev as { id: number; model: string; imei: string; purchase_price: number | null; sale_price: number | null };

    const giorno = giornoRoma();
    /* già emesso oggi per questo viaggio? si restituisce quello, non se ne fa
       un secondo */
    const { data: gia } = await supabaseAdmin.from("mag_ddt")
        .select("id, numero, anno").eq("usato_id", b.usatoId)
        .eq("da_negozio", b.da).eq("a_negozio", b.a).eq("viaggio_giorno", giorno).maybeSingle();
    if (gia) return NextResponse.json({ ok: true, gia: true, ddt: gia });

    const azDa = await aziendaDelNegozio(b.da);
    const azA = await aziendaDelNegozio(b.a);
    const cessione = !!azDa && !!azA && azDa !== azA;

    const { data: creato, error } = await supabaseAdmin.from("mag_ddt").insert({
        da_negozio: b.da, a_negozio: b.a,
        azienda_da: azDa, azienda_a: azA,
        tipo: cessione ? "cessione" : "trasferimento",
        stato: "usato",
        usato_id: b.usatoId, viaggio_giorno: giorno,
        causale: b.causale || (cessione ? "Cessione tra società del gruppo — telefono usato" : "Trasferimento tra sedi — telefono usato"),
        aspetto: "Telefono usato", trasporto: "Mittente", colli: 1,
        creato_da: g.sess.id,
        /* nasce chiuso: il negozio lo prende in carico in Gestione Usati */
        chiuso_da: "gestione usati", chiuso_il: new Date().toISOString(),
        note: "Documento emesso in automatico da Gestione Usati. Non si accetta qui: il telefono si prende in carico nella sua scheda, seguendo la timeline dell'usato.",
    }).select("id, numero, anno, azienda_da, azienda_a").single();
    if (error || !creato) {
        return NextResponse.json({ error: error?.message || "il documento non è stato creato" }, { status: 500 });
    }
    const d = creato as { id: string; numero: number; anno: number; azienda_da: string | null; azienda_a: string | null };

    const { error: eRiga } = await supabaseAdmin.from("mag_ddt_righe").insert({
        ddt_id: d.id, riga: 1,
        codice: null, descrizione: `${u.model} — usato · IMEI ${u.imei}`,
        /* ⚠️ `unita_id` NULLO: questo telefono non è un pezzo di magazzino, e
           agganciarlo a un'unità che non esiste romperebbe ogni conto che
           parte da lì. Il seriale invece è l'IMEI, ed è il modo di ritrovarlo. */
        unita_id: null, seriale: u.imei, quantita: 1,
        valore_unitario: Number(u.sale_price) > 0 ? Number(u.sale_price) : (Number(u.purchase_price) || null),
        negozio_da: b.da, negozio_a: b.a, azienda_da: d.azienda_da, azienda_a: d.azienda_a,
        stato: "in_viaggio",
    });
    if (eRiga) return NextResponse.json({ error: eRiga.message, ddt: d }, { status: 500 });

    return NextResponse.json({ ok: true, ddt: d, cessione });
}
