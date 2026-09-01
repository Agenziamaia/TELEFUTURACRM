import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ CANCELLARE UNA COMUNICAZIONE ═══════════════════════════════════════════
   Luca 01/09, dopo che tre comunicazioni sono sparite fra ieri sera e oggi:
   «lascia questi permessi solo all'admin; per quanto riguarda gli altri,
   ognuno deve potersi cancellare le sue SOLO ENTRO 10 MINUTI dalla
   comunicazione; l'admin può cancellarle tutte in qualsiasi momento».

   PERCHÉ PASSA DAL SERVER, e non è una formalità: fino a stamattina su
   `comunicazioni` c'era una sola policy — «basta essere loggati» — su ALL.
   Cioè chiunque, dalla console del browser con la chiave anon che viaggia nel
   bundle, poteva cancellare le comunicazioni di chiunque. Il ruolo si legge
   QUI, dal database, con l'id della sessione firmata: dal browser non si può
   mentire su chi si è, né su quando è stata scritta una comunicazione.

   E RESTA SCRITTO CHI FA COSA: ogni cancellazione lascia una riga in
   `comunicazioni_log` con dentro titolo, testo, destinatari e letture — una
   fotografia, non un rimando. Un registro che punta a una riga cancellata non
   servirebbe a niente.

   POST { id, motivo? }
   ═══════════════════════════════════════════════════════════════════════════ */

/** Chi può cancellare TUTTO, sempre. Volutamente stretto: il danno di oggi
 *  l'ha fatto un cestino visibile a quattro ruoli su ogni comunicazione. */
const PUO_TUTTO = ["admin"];

/** Chi annulla una riunione porta via anche il suo invito: è la stessa mano
 *  che ha creato la riunione, ed è la regola che il Calendario applica già
 *  nella sua schermata. Vale SOLO per gli inviti (`meeting_id` valorizzato). */
const PUO_ANNULLARE_RIUNIONI = ["amministrativo", "admin", "dev", "direttore_generale"];

const MINUTI_DI_RIPENSAMENTO = 10;

export async function POST(req: Request) {
    let _s: { id: string; role: string; exp: number };
    {
        const _g = await accesso(req, "comunicazioni");
        if (!_g.ok) return _g.risposta;
        _s = _g.sess;
    }
    const { data: io_ } = await supabase.from("app_users")
        .select("id, role, full_name, active").eq("id", _s.id).maybeSingle();
    if (!io_ || io_.active === false)
        return NextResponse.json({ error: "utente non attivo" }, { status: 403 });

    const b = await req.json().catch(() => ({})) as { id?: number | string; motivo?: string };
    const id = Number(b.id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "id mancante" }, { status: 400 });

    const { data: com } = await supabase.from("comunicazioni")
        .select("id, title, content, kind, created_at, created_by, created_by_name, meeting_id, target_users")
        .eq("id", id).maybeSingle();
    if (!com) return NextResponse.json({ error: "questa comunicazione non c'è più" }, { status: 404 });

    const ruolo = String(io_.role || "");
    const mia = com.created_by === io_.id;
    const eta = (Date.now() - new Date(com.created_at as string).getTime()) / 60000;
    const inTempo = eta <= MINUTI_DI_RIPENSAMENTO;
    const invito = com.meeting_id != null;

    /* CHI HA INDETTO LA RIUNIONE PUÒ ANNULLARLA, e non entro dieci minuti
       (regressione trovata dalla revisione, 01/09 sera). Il Calendario mostra
       «Annulla riunione» a chi l'ha creata: con la sola finestra dei dieci
       minuti, uno store manager che indice una riunione lunedì e la annulla
       martedì prendeva 403 — e da quel momento la riunione NON veniva più
       cancellata affatto, perché la pagina si ferma se l'invito non si toglie.
       Prima funzionava solo perché chiunque poteva cancellare dal browser: la
       porta l'ho chiusa io, e questa è la chiave che serviva restasse. */
    let creatoreRiunione = false;
    if (invito) {
        const { data: m } = await supabase.from("calendar_meetings")
            .select("created_by").eq("id", com.meeting_id).maybeSingle();
        const chi = String((m as { created_by?: string } | null)?.created_by || "");
        creatoreRiunione = !!chi && (chi === io_.id || chi === (io_.full_name || ""));
    }

    /* LE PORTE, in ordine di larghezza. */
    const puoi = PUO_TUTTO.includes(ruolo)
        || (mia && inTempo)
        || (invito && (creatoreRiunione || PUO_ANNULLARE_RIUNIONI.includes(ruolo)));

    if (!puoi) {
        /* IL MESSAGGIO DICE PERCHÉ, e non «non autorizzato»: la differenza fra
           «non è tua» e «sono passati venti minuti» è tutta la differenza fra
           capire e riprovare a caso. */
        const perche = invito
            ? "questo è l'invito di una riunione che non hai indetto tu: la può annullare chi l'ha indetta, o l'amministrazione"
            : !mia
            ? "questa comunicazione non l'hai scritta tu: solo l'amministratore può togliere quelle degli altri"
            : `sono passati ${Math.round(eta)} minuti dall'invio, e le proprie si possono togliere solo entro ${MINUTI_DI_RIPENSAMENTO}. Chiedi all'amministratore.`;
        return NextResponse.json({ error: perche }, { status: 403 });
    }

    /* QUANTE L'AVEVANO GIÀ LETTA: si conta PRIMA di cancellare le ricevute, se
       no il numero è sempre zero e il registro non dice niente di utile. */
    const { count: letture } = await supabase.from("comunicazioni_ricevute")
        .select("id", { count: "exact", head: true }).eq("comunicazione_id", id).not("letto_il", "is", null);

    const { error: eRic } = await supabase.from("comunicazioni_ricevute").delete().eq("comunicazione_id", id);
    if (eRic) return NextResponse.json({ error: "ricevute: " + eRic.message }, { status: 500 });

    const { error } = await supabase.from("comunicazioni").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    /* IL REGISTRO SI SCRIVE DOPO, ma se fallisce non si finge che vada bene:
       si dice, perché una cancellazione senza traccia è esattamente il
       problema da cui nasce tutto questo. */
    const { error: eLog } = await supabase.from("comunicazioni_log").insert({
        comunicazione_id: id,
        azione: "eliminata",
        chi: io_.id,
        chi_nome: io_.full_name || null,
        titolo: com.title || null,
        kind: com.kind || null,
        autore_nome: com.created_by_name || null,
        creata_il: com.created_at || null,
        destinatari: Array.isArray(com.target_users) ? com.target_users.length : null,
        letture: letture ?? null,
        contenuto: com.content || null,
        motivo: String(b.motivo || "") || (invito ? "riunione annullata" : null),
    });

    return NextResponse.json({
        ok: true, eliminata: id, titolo: com.title,
        ...(eLog ? { avviso: "eliminata, ma il registro non ha preso nota: " + eLog.message } : {}),
    });
}
