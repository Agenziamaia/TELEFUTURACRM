import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { sedeFisica } from "@/lib/negoziNomi";

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

const oggiYmd = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/* LE SEDI DI TURNO, RICALCOLATE QUI. Stessa regola della pagina Turni e di
   `src/lib/doveLavoro.ts`: scheda + negozi assegnati, meno le esclusioni del
   giorno, più le coperture. Sul server serve per una ragione precisa: decidere
   se una dichiarazione è «sono al mio posto» o «chiedo di andare altrove» non
   può dipendere da quello che racconta il browser. */
async function sediDiTurno(userId: string, nome: string): Promise<string[]> {
    const data = oggiYmd();
    const [u, links, cop] = await Promise.all([
        supabase.from("app_users").select("primary_store").eq("id", userId).maybeSingle(),
        supabase.from("user_stores").select("store_name").eq("user_id", userId),
        supabase.from("turni_negozio").select("store, tipo").eq("data", data).eq("persona", nome),
    ]);
    const sedi = new Set<string>();
    const agg = (n?: string | null) => { const k = sedeFisica(n || ""); if (k) sedi.add(k); };
    agg(u.data?.primary_store);
    (links.data ?? []).forEach((r: { store_name: string }) => agg(r.store_name));
    (cop.data ?? []).forEach((r: { store: string; tipo: string | null }) => {
        if (String(r.tipo || "") === "escluso") sedi.delete(sedeFisica(r.store));
        else agg(r.store);
    });
    return [...sedi];
}

/* ═══ DICHIARARE DOVE SI LAVORA ═══════════════════════════════════════════════
   Passa dal server perché il browser NON può fare `update` su
   `presenza_negozio` (revocato apposta: se no uno si approverebbe da solo la
   richiesta). E un update serve davvero: l'indice `presenza_una_attiva` ammette
   UNA sola riga attiva per persona al giorno, quindi chi cambia negozio a metà
   giornata — due turni, una sostituzione — deve prima veder chiusa la
   precedente. Fatto dal browser, quell'insert moriva con «duplicate key value
   violates unique constraint», scritto tale e quale sul monitor del negozio.
   ═══════════════════════════════════════════════════════════════════════════ */
async function dichiara(userId: string, nome: string, sede: string, motivo: string) {
    const data = oggiYmd();
    const mie = await sediDiTurno(userId, nome);
    const { data: righe } = await supabase.from("presenza_negozio")
        .select("id, sede, stato").eq("user_id", userId).eq("data", data)
        .in("stato", ["attiva", "in_attesa"]);
    const attiva = (righe ?? []).find((r) => r.stato === "attiva");

    // confermare dov'è già: non si scrive niente, ed è il caso più frequente
    if (attiva && attiva.sede === sede) return { ok: true, stato: "attiva", cambiato: false };

    /* ⚠️ CHI PUÒ APPROVARE NON CHIEDE IL PERMESSO A SÉ STESSO (Luca 02/09,
       parlando di Marta Perrotta: «essendo operativa dentro un negozio le
       serve la dichiarazione per fare gli scontrini, però è l'unica che, se
       sceglie un punto vendita diverso da quello in cui è in turno, dopo aver
       confermato può operare senza nessuna autorizzazione — perché
       l'amministrativo è lei stessa»).
       Scritto per RUOLO e non per persona: la regola vale per chiunque sieda
       dall'altra parte del bancone dell'approvazione, e domani vale ancora se
       Marta cambia ruolo o se qualcun altro entra in direzione. La conferma
       gliela chiede la schermata; qui si prende atto. */
    const io = await chiSei(userId);
    const siAutorizza = PUO_APPROVARE.includes(String((io as { role?: string } | null)?.role || ""));

    if (mie.includes(sede) || siAutorizza) {
        // è un suo turno — o è lei stessa a poter autorizzare: si sposta e basta
        if (attiva) {
            await supabase.from("presenza_negozio")
                .update({ stato: "chiusa", deciso_da: "cambio dichiarato", deciso_il: new Date().toISOString() })
                .eq("id", attiva.id);
        }
        const { error } = await supabase.from("presenza_negozio").insert({
            user_id: userId, data, sede, origine: "turno", stato: "attiva",
            sede_turno: mie.includes(sede) ? null : (mie[0] || null),
            motivo: mie.includes(sede) ? null : (motivo || "autorizzata da sé: ha il potere di approvare"),
            deciso_da: mie.includes(sede) ? null : nome,
            deciso_il: mie.includes(sede) ? null : new Date().toISOString(),
        });
        /* DOPPIO CLIC (revisore 31/08): due richieste partite nello stesso
           istante leggono entrambe «nessuna attiva» e provano a scrivere; la
           seconda sbatte sull'indice unico. Non è un errore da mostrare — è la
           stessa dichiarazione arrivata due volte. Si guarda com'è finita: se
           la presenza adesso è quella giusta, è andata bene. */
        if (error) {
            if (error.code !== "23505") return { ok: false, error: error.message };
            const { data: ora } = await supabase.from("presenza_negozio")
                .select("sede").eq("user_id", userId).eq("data", data).eq("stato", "attiva").maybeSingle();
            if (ora?.sede !== sede) return { ok: false, error: "un'altra dichiarazione è arrivata prima: ricarica la pagina" };
        }
        return { ok: true, stato: "attiva", cambiato: true };
    }

    /* FUORI TURNO: intanto lavora dove è di turno (Luca: «nessuno resta fermo
       davanti a un cliente»), e la richiesta nasce in attesa. */
    const sedeTurno = mie[0] || null;
    if (!attiva && sedeTurno) {
        /* SE QUESTA FALLISCE NON SI TIRA DRITTO (revisore 31/08). Prima
           l'errore non veniva guardato e la funzione rispondeva comunque
           «ok»: il browser si segnava la risposta, il modale non tornava più,
           e la persona restava senza NESSUNA presenza attiva — cioè senza il
           dato per cui tutta questa schermata esiste. */
        const { error } = await supabase.from("presenza_negozio").insert({
            user_id: userId, data, sede: sedeTurno, origine: "turno", stato: "attiva",
        });
        if (error && error.code !== "23505") return { ok: false, error: error.message };
    }
    const giaChiesta = (righe ?? []).find((r) => r.stato === "in_attesa" && r.sede === sede);
    if (giaChiesta) {
        /* ⚠️ LA RICHIESTA ORFANA (revisore 02/09). Chi premeva il vecchio
           «✓ Fatta» chiudeva la task e lasciava la richiesta in attesa: da
           quel momento non compariva più a nessuno, e uscire e rientrare non
           la rigenerava — restava bloccato senza che nessuno potesse vederlo.
           Se la richiesta c'è ancora ma nessuno ha più una task aperta, se ne
           rifà una. */
        const { data: aperte } = await supabase.from("admin_tasks")
            .select("id").eq("tipo", "accesso_negozio").eq("done", false)
            .like("link", `%presenza=${giaChiesta.id}%`).limit(1);
        if (!aperte || !aperte.length) {
            await supabase.from("admin_tasks").insert({
                tipo: "accesso_negozio",
                titolo: `🏪 ${nome} chiede di lavorare a ${sede}`,
                dettaglio: `Richiesta ancora in attesa. Oggi risulta di turno a ${sedeTurno || "nessun negozio"}. Fino all'autorizzazione non può registrare vendite né muovere merce.`,
                link: `/collaboratori?sezione=turni&presenza=${giaChiesta.id}`,
                target_role: "direzione",
                created_by: nome || null,
            });
        }
    }
    if (!giaChiesta) {
        const { data: nata, error } = await supabase.from("presenza_negozio").insert({
            user_id: userId, data, sede, origine: "richiesta", stato: "in_attesa",
            sede_turno: sedeTurno, motivo: motivo || null,
        }).select("id").single();
        if (error && error.code !== "23505") return { ok: false, error: error.message };
        const idRichiesta = (nata as { id?: string } | null)?.id || "";
        /* LA TASK ALL'AMMINISTRAZIONE la scrive il SERVER, non il browser: se
           la scrive il client, basta chiudere la scheda un attimo prima e la
           richiesta resta invisibile a chi la deve approvare. */
        await supabase.from("admin_tasks").insert({
            tipo: "accesso_negozio",
            titolo: `🏪 ${nome} chiede di lavorare a ${sede}`,
            dettaglio: `Oggi risulta di turno a ${sedeTurno || "nessun negozio"}. Ha chiesto di lavorare a ${sede}${motivo.trim() ? ` — «${motivo.trim()}»` : ""}. Fino all'approvazione continua a lavorare su ${sedeTurno || "nessun negozio"}. Si approva da Collaboratori → Turni.`,
            /* ⚠️ L'ID DELLA RICHIESTA VIAGGIA NEL LINK. Serve al fulmine per
               decidere da lì: prima la task portava solo alla sezione, e chi
               premeva «fatta» chiudeva la task lasciando la persona in attesa
               per sempre — misurato il 02/09: 5 task chiuse, 4 richieste
               ancora aperte. */
            link: idRichiesta ? `/collaboratori?sezione=turni&presenza=${idRichiesta}` : "/collaboratori?sezione=turni",
            /* TUTTO IL DIREZIONALE, non solo l'amministrazione (Luca 31/08:
               «abilita tutto il reparto… io, Claudia, Sandra, Franca e
               Marta»). La coda `direzione` è esattamente quella: la leggono
               admin, amministrativo e direttore generale. Diverso dal bonifico,
               che resta nella coda `amministrativo` perché quello lo devono
               vedere solo Claudia e Sandra — qui invece serve che qualcuno
               risponda in fretta, e più occhi ci sono meno si aspetta:
               finché nessuno approva, quella persona non può vendere. */
            target_role: "direzione",
            created_by: nome || null,
        });
    }
    return { ok: true, stato: "in_attesa", sedeTurno, cambiato: true };
}

/** la data di oggi come la scrive la tabella */
function oggi() { return new Date().toISOString().slice(0, 10); }

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
        .eq("stato", "in_attesa").eq("data", oggi()).order("created_at", { ascending: false }).limit(100);
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
    if (!io_ || io_.active === false)
        return NextResponse.json({ error: "utente non attivo" }, { status: 403 });

    const _b = await req.json().catch(() => ({})) as { id?: string; esito?: string; azione?: string; sede?: string; motivo?: string };

    /* DICHIARARE la propria presenza: lo può fare CHIUNQUE, ma solo per SÉ —
       `_s.id` viene dalla sessione firmata, non dal corpo della richiesta. */
    if (_b.azione === "dichiara") {
        const sede = String(_b.sede || "").trim().toLowerCase();
        if (!sede) return NextResponse.json({ error: "sede mancante" }, { status: 400 });
        const r = await dichiara(_s.id, io_.full_name || "", sede, String(_b.motivo || ""));
        return NextResponse.json(r, { status: r.ok ? 200 : 500 });
    }

    if (!PUO_APPROVARE.includes(String(io_.role || "")))
        return NextResponse.json({ error: "solo l'amministrazione può approvare" }, { status: 403 });

    const b = _b;
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

    /* ⚠️ SI CHIUDE LA SUA TASK, NON QUELLE DEGLI ALTRI. Prima si cercava con
       `ilike '%<sede>%'` sul testo: decidere una richiesta per «donna»
       chiudeva OGNI task aperta che nominasse «donna» — e il testo contiene
       sia la sede chiesta sia quella di turno, quindi con chiavi corte come
       «san» ci finiva dentro mezzo gruppo. Ora si va per id, che viaggia nel
       link della task. */
    await supabase.from("admin_tasks")
        .update({ done: true, done_by: io_.full_name || "—", done_at: new Date().toISOString() })
        .eq("tipo", "accesso_negozio").eq("done", false)
        .like("link", `%presenza=${riga.id}%`);

    return NextResponse.json({ ok: true, stato: approva ? "attiva" : "rifiutata" });
}
