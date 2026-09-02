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
    /* ⚠️ `status_history` È UN OGGETTO PER STATO, non una lista: tutte le righe
       in archivio hanno la forma `{ venduto: { date, operatore }, … }`, e la
       pagina la scrive così. Trattandola come una lista si sarebbe cancellata
       la cronologia di tutti gli stati precedenti. */
    const storia = (u.status_history && typeof u.status_history === "object" && !Array.isArray(u.status_history)
        ? u.status_history : {}) as Record<string, unknown>;
    /* ⚠️ IL MARCHIO STA IN COLONNE VERE, non dentro `status_history`. La pagina
       degli Usati rilegge e riscrive quel JSON tenendo solo `{date, operatore}`
       (`parseHistory` / `deviceToRow`): un marchio scritto lì spariva al primo
       salvataggio del pannello — bastava scrivere una nota sul telefono. Le
       colonne invece `deviceToRow` non le elenca, quindi non le tocca.
       ⚠️ E IL DESTINATARIO NON VA IN `client_id`: quello è il cliente DA CUI
       il telefono è stato comprato, e la sua Timeline lo rende come «♻️
       Ritirato usato». Scrivendoci il destinatario, chi riceve il telefono se
       lo ritroverebbe in scheda come se ce l'avesse venduto, e il venditore
       vero sparirebbe. */
    const { data: toccate, error } = await supabaseAdmin.from("usati").update({
        status: "venduto",
        sold_date: ora,
        sold_price: Number(b.prezzo) > 0 ? Number(b.prezzo) : 0,
        consegnato_a: b.clientId,
        uscita_forzata: true,
        uscita_motivo: motivo,
        uscita_da: chi?.full_name || "amministrazione",
        uscita_il: ora,
        status_history: {
            ...storia,
            venduto: { date: ora, operatore: `${chi?.full_name || "amministrazione"} — uscita SENZA vendita registrata` },
        },
    /* ⚠️ E LO STATO SI RILEGGE NELLA CONDIZIONE. Fra la lettura di prima e
       questa scrittura ci può stare un'altra scheda aperta: senza questo, la
       seconda consegna sovrascriveva data, motivo e destinatario della prima
       senza che nessuno se ne accorgesse. */
    }).eq("id", b.id).neq("status", "venduto").select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!toccate || !toccate.length) {
        return NextResponse.json({ error: "qualcuno l'ha appena portato in venduto: ricarica la pagina e guarda com'è andata." }, { status: 409 });
    }

    return NextResponse.json({ ok: true, cliente: nomeCli });
}
