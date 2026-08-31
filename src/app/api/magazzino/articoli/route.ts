import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ DEFINIRE UN ARTICOLO ═══════════════════════════════════════════════════
   Luca 01/09: «dall'amministrativo in su avranno una tabella completa, possono
   settare il costo dei prodotti, il prezzo di vendita, aggiungere nuovi
   articoli e modificare i vecchi, mentre tutti gli altri possono consultarli».

   PERCHÉ PASSA DAL SERVER, e non è una formalità: fino a stanotte
   `mag_articoli` aveva una sola policy — «basta essere loggati» — su INSERT e
   UPDATE. Cioè qualunque venditore, dal browser, poteva cambiare il prezzo di
   vendita di qualsiasi articolo. E quel prezzo è quello che la cassa stampa
   sullo scontrino. Il ruolo si legge QUI, dal database, con l'id della
   sessione firmata: dal browser non si può mentire su chi si è.

   POST { azione: "salva", codice, prezzo?, costo_ultimo?, prezzo_modificabile?,
          descrizione?, marca?, gruppo?, sottogruppo?, barcode?, attivo? }
   POST { azione: "crea", codice, descrizione, prezzo, ... }
   ═══════════════════════════════════════════════════════════════════════════ */

const PUO_DEFINIRE = ["amministrativo", "direttore_generale", "admin", "dev"];

/** I soli campi che si possono toccare da qui. Una lista bianca, non nera:
 *  quello che non è nominato non si scrive, e aggiungere una colonna al
 *  database non apre per sbaglio un varco. */
const CAMPI = ["descrizione", "barcode", "gruppo", "sottogruppo", "marca", "prezzo", "costo_ultimo", "prezzo_modificabile", "attivo", "reparto"] as const;

type Corpo = { azione?: string; codice?: string } & Record<string, unknown>;

/** Un numero, o null. Rifiuta ciò che numero non è invece di scrivere NaN. */
function numeroONulla(v: unknown): number | null | undefined {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}

function patchDa(b: Corpo): { patch: Record<string, unknown>; errore?: string } {
    const patch: Record<string, unknown> = {};
    for (const k of CAMPI) {
        if (!(k in b)) continue;
        if (k === "prezzo" || k === "costo_ultimo") {
            const n = numeroONulla(b[k]);
            if (n === undefined) return { patch, errore: `${k}: non è un numero` };
            if (n !== null && (n < 0 || n > 100000)) return { patch, errore: `${k}: fuori scala (0–100.000 €)` };
            patch[k] = n;
        } else if (k === "reparto") {
            /* IL REPARTO È QUELLO CHE IL REGISTRATORE STAMPA. Non un numero
               qualunque: dev'essere un reparto ACCESO nella tabella, se no lo
               scontrino esce con un'IVA che non esiste — o non esce. */
            const n = numeroONulla(b[k]);
            if (n === undefined) return { patch, errore: "reparto: non è un numero" };
            if (n !== null && !(Number.isInteger(n) && n >= 1 && n <= 40))
                return { patch, errore: "reparto: fuori dai 40 del registratore" };
            patch[k] = n;
        } else if (k === "prezzo_modificabile" || k === "attivo") {
            patch[k] = !!b[k];
        } else {
            const t = String(b[k] ?? "").trim();
            patch[k] = t || null;
        }
    }
    return { patch };
}

export async function POST(req: Request) {
    let _s: { id: string; role: string; exp: number };
    {
        const _g = await accesso(req, "magazzino");
        if (!_g.ok) return _g.risposta;
        _s = _g.sess;
    }
    const { data: io_ } = await supabase.from("app_users")
        .select("role, full_name, active").eq("id", _s.id).maybeSingle();
    if (!io_ || io_.active === false || !PUO_DEFINIRE.includes(String(io_.role || "")))
        return NextResponse.json({ error: "solo dall'amministrativo in su si definiscono gli articoli" }, { status: 403 });

    const b = await req.json().catch(() => ({})) as Corpo;
    const codice = String(b.codice || "").trim();
    if (!codice) return NextResponse.json({ error: "codice mancante" }, { status: 400 });

    const { patch, errore } = patchDa(b);
    if (errore) return NextResponse.json({ error: errore }, { status: 400 });

    if (patch.reparto != null) {
        const { data: rep } = await supabase.from("pos_reparti")
            .select("reparto, attivo, descrizione").eq("reparto", patch.reparto).maybeSingle();
        if (!rep || rep.attivo === false)
            return NextResponse.json({ error: `il reparto ${patch.reparto} non è acceso sul registratore` }, { status: 400 });
    }

    if (b.azione === "crea") {
        /* IL CODICE È LA CHIAVE, e un codice già preso non si sovrascrive di
           nascosto: si dice. Sovrascrivere vorrebbe dire cambiare il prezzo di
           un articolo che qualcuno sta vendendo, credendo di crearne uno nuovo. */
        const { data: gia } = await supabase.from("mag_articoli")
            .select("codice, descrizione").eq("codice", codice).maybeSingle();
        if (gia) return NextResponse.json({ error: `il codice ${codice} è già di «${gia.descrizione}»` }, { status: 409 });

        if (!String(patch.descrizione || "").trim())
            return NextResponse.json({ error: "la descrizione è obbligatoria" }, { status: 400 });
        /* IL PREZZO DI VENDITA È OBBLIGATORIO (Luca 29/08): senza, in cassa
           quell'articolo non si può vendere — e un articolo che non si vende
           non è un articolo, è una riga. */
        if (patch.prezzo == null)
            return NextResponse.json({ error: "il prezzo di vendita è obbligatorio" }, { status: 400 });

        const { error } = await supabase.from("mag_articoli").insert({
            codice, attivo: true, fonte: "crm",
            ...patch,
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, creato: codice });
    }

    if (!Object.keys(patch).length)
        return NextResponse.json({ error: "niente da salvare" }, { status: 400 });
    const { error } = await supabase.from("mag_articoli").update(patch).eq("codice", codice);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, salvato: codice, campi: Object.keys(patch) });
}
