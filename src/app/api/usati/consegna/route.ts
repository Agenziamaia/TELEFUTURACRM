import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminOrAbove } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ UN TELEFONO CHE ESCE SENZA VENDITA ══════════════════════════════════
   Luca 02/09: «dobbiamo abilitare l'amministrativo a poter mettere un telefono
   in stato venduto selezionando il cliente, così da tenere traccia della
   consegna dentro la scheda del cliente. Però oggettivamente in questo modo
   non facciamo lo scontrino, non registriamo la vendita: se vogliamo dare un
   telefono a qualcuno, possiamo farlo così».

   ⚠️ QUESTA ROTTA NON È UNA VENDITA, ED È IMPORTANTE CHE RESTI EVIDENTE.
   Non batte scontrino, non scrive un contratto, non produce commissioning e
   non entra nei conteggi delle vendite. Sposta un telefono fuori dal magazzino
   e scrive a chi è andato — niente di più. La strada normale resta Registra
   Vendita, e questa serve ai casi che una vendita non sono: il telefono dato
   in omaggio, quello di cortesia che non torna, la sostituzione.

   Per questo:
   · il cancello è il RUOLO (amministrativo in su), come per la cancellazione
     di una pratica;
   · il motivo è OBBLIGATORIO — fra sei mesi, davanti a un telefono che manca
     dal magazzino senza uno scontrino, l'unica cosa che risponde «perché» è
     quello che si è scritto qui;
   · resta scritto nella storia del telefono che è uscito per questa strada, e
     non per una vendita: `forzato: true`. Un domani, chi conta i venduti sa
     quali togliere. */

export async function POST(req: Request) {
    const g = await accesso(req, "usati/consegna");
    if (!g.ok) return g.risposta;

    const b = await req.json().catch(() => ({})) as
        { id?: number; clientId?: string; motivo?: string; prezzo?: number };
    if (!b.id || !b.clientId) {
        return NextResponse.json({ error: "manca il telefono o il cliente" }, { status: 400 });
    }
    const motivo = (b.motivo || "").trim();
    if (motivo.length < 3) {
        return NextResponse.json({ error: "scrivi perché questo telefono esce senza vendita: è l'unica risposta che resta." }, { status: 400 });
    }

    const { data: me } = await supabaseAdmin.from("app_users")
        .select("role, full_name").eq("id", g.sess.id).maybeSingle();
    const chi = me as { role?: string; full_name?: string } | null;
    if (!isAdminOrAbove(String(chi?.role || ""))) {
        return NextResponse.json({ error: "solo la direzione può far uscire un telefono senza vendita." }, { status: 403 });
    }

    const { data: dev } = await supabaseAdmin.from("usati")
        .select("id, model, imei, status, status_history, store").eq("id", b.id).maybeSingle();
    if (!dev) return NextResponse.json({ error: "telefono non trovato" }, { status: 404 });
    const u = dev as { id: number; model: string; imei: string; status: string; status_history: unknown; store: string | null };
    if (u.status === "venduto") {
        return NextResponse.json({ error: "questo telefono risulta già venduto." }, { status: 400 });
    }

    /* il cliente deve esistere davvero: la scheda si crea prima, e senza
       cliente questa strada non ha senso — è tutta lì la tracciabilità */
    const { data: cli } = await supabaseAdmin.from("clients")
        .select("id, tipo, nome, cognome, ragione_sociale").eq("id", b.clientId).maybeSingle();
    if (!cli) return NextResponse.json({ error: "il cliente non risulta a sistema" }, { status: 404 });
    const c = cli as { tipo: string; nome: string | null; cognome: string | null; ragione_sociale: string | null };
    const nomeCli = c.tipo === "business" ? (c.ragione_sociale || "—") : `${c.nome || ""} ${c.cognome || ""}`.trim();

    const ora = new Date().toISOString();
    const storia = Array.isArray(u.status_history) ? u.status_history : [];
    const { error } = await supabaseAdmin.from("usati").update({
        status: "venduto",
        sold_date: ora,
        client_id: b.clientId,
        sold_price: Number(b.prezzo) > 0 ? Number(b.prezzo) : 0,
        status_history: [...storia, {
            status: "venduto", at: ora, by: chi?.full_name || "amministrazione",
            /* ⚠️ IL MARCHIO. Senza questo, fra un anno questa riga è
               indistinguibile da una vendita vera: stesso stato, stessa data,
               stesso cliente. Ma questa non ha scontrino né contratto. */
            forzato: true,
            note: `Uscito senza vendita registrata (niente scontrino, niente contratto, niente commissioning) — consegnato a ${nomeCli}. Motivo: ${motivo}`,
        }],
    }).eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, cliente: nomeCli });
}
