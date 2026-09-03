import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminOrAbove } from "@/lib/roles";
import { annota, nomeDi } from "@/lib/paystoreEventi";
import { NOMI_OPERATORE, nomeOperatoreCorto } from "@/lib/paystore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ UNA RICARICA, PER INTERO ═════════════════════════════════════════════
   Luca 03/09: «la possibilità di cliccare su ogni riga e vedere tutte le
   informazioni: la vendita collegata nel caso non fosse una semplice ricarica,
   il cliente collegato coi suoi dati, eventuali cambiamenti, eventuali errori
   generati e risottomissioni, con l'utente, il giorno e l'orario».

   GET  → tutto quello che sta intorno a una ricarica
   PATCH → correggere operatore e numero, dall'amministrativo in su

   ⚠️ CORREGGERE L'OPERATORE È PIÙ SERIO DI CORREGGERE IL NUMERO. Il numero
   sbagliato manda il credito a una persona sbagliata; l'operatore sbagliato lo
   manda a un GESTORE sbagliato, e PayStore lo rifiuta o — peggio — lo accetta
   sul gestore giusto di quel numero e il taglio non esiste. Per questo si può
   toccare solo finché la ricarica NON è partita: su una già eseguita
   cambierebbe la storia di un movimento di denaro già avvenuto. */

/** Chi sta guardando: il lucchetto vero — `accesso` — sta scritto per esteso
 *  dentro ogni verbo, perché la guardia di sicurezza lo cerca lì e perché un
 *  lucchetto nascosto dentro un aiutante è un lucchetto che il prossimo si
 *  dimentica. Qui resta solo il ruolo. */
async function chiGuarda(userId: string) {
    const { data } = await supabaseAdmin.from("app_users").select("role, full_name").eq("id", userId).maybeSingle();
    const u = data as { role?: string; full_name?: string } | null;
    return { ruolo: String(u?.role || ""), nome: u?.full_name || userId };
}

export async function GET(request: Request) {
    const _g = await accesso(request, "paystore/ricarica");
    if (!_g.ok) return _g.risposta;
    const g = await chiGuarda(_g.sess.id);

    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 });

    const { data: r } = await supabaseAdmin.from("paystore_ricariche").select("*").eq("id", id).maybeSingle();
    if (!r) return NextResponse.json({ error: "ricarica non trovata" }, { status: 404 });
    const ric = r as Record<string, unknown>;

    /* ── LA VENDITA CHE L'HA GENERATA. Una ricarica quasi mai è sola: esce
          insieme a una SIM, a un telefono, a un accessorio, e capire cosa c'era
          intorno è metà del lavoro quando qualcosa non torna. */
    let vendita: unknown = null;
    let insieme: unknown[] = [];
    let cliente: unknown = null;
    const contractId = String(ric.contract_id || "");
    if (contractId) {
        const { data: c } = await supabaseAdmin.from("contracts")
            .select("id, data, brand, categoria, prodotto, stato, negozio, venditore, client_id, data_registrazione, dettagli")
            .eq("id", contractId).maybeSingle();
        vendita = c || null;
        const cli = (c as { client_id?: string } | null)?.client_id;
        if (cli) {
            /* ⚠️ SOLO I CAMPI CHE SERVONO A RICONOSCERE UNA PERSONA. Da qui non
               escono documenti, IBAN o note: chi guarda una ricarica non ha
               bisogno del fascicolo del cliente. */
            const { data: cl } = await supabaseAdmin.from("clients")
                .select("id, nome, cognome, ragione_sociale, cf_piva, cellulare, email")
                .eq("id", cli).maybeSingle();
            cliente = cl || null;
        }
        /* le altre righe della stessa vendita: è «venduta accompagnata» */
        const { data: altre } = await supabaseAdmin.from("contracts")
            .select("id, brand, categoria, prodotto, stato")
            .eq("client_id", (c as { client_id?: string } | null)?.client_id || "__nessuno__")
            .eq("data_registrazione", (c as { data_registrazione?: string } | null)?.data_registrazione || "1970-01-01")
            .neq("id", contractId).limit(20);
        insieme = altre || [];
    }

    /* le altre ricariche battute nello stesso scontrino */
    const { data: sorelle } = await supabaseAdmin.from("paystore_ricariche")
        .select("id, operatore, operatore_nome, numero, importo, stato")
        .eq("contract_id", contractId || "__nessuno__").neq("id", id).limit(20);

    const { data: eventi } = await supabaseAdmin.from("paystore_eventi")
        .select("quando, chi, tipo, testo").eq("ricarica_id", id).order("quando", { ascending: false }).limit(100);

    return NextResponse.json({
        ok: true, ricarica: ric, vendita, cliente,
        insieme, sorelle: sorelle || [], eventi: eventi || [],
        /* chi guarda deve sapere se può correggere, se no vede campi che non
           rispondono */
        puoCorreggere: isAdminOrAbove(g.ruolo),
    });
}

export async function PATCH(request: Request) {
    const _g = await accesso(request, "paystore/ricarica");
    if (!_g.ok) return _g.risposta;
    const g = await chiGuarda(_g.sess.id);
    if (!isAdminOrAbove(g.ruolo)) {
        return NextResponse.json({ error: "correggere una ricarica venduta è cosa dell'amministrazione." }, { status: 403 });
    }

    const b = await request.json().catch(() => ({})) as { id?: string; operatore?: string; numero?: string };
    if (!b.id) return NextResponse.json({ error: "id mancante" }, { status: 400 });

    const { data: prima } = await supabaseAdmin.from("paystore_ricariche")
        .select("id, stato, operatore, operatore_nome, numero").eq("id", b.id).maybeSingle();
    if (!prima) return NextResponse.json({ error: "ricarica non trovata" }, { status: 404 });
    const p = prima as { stato: string; operatore: string; operatore_nome: string | null; numero: string };

    /* ⚠️ SU UNA GIÀ PARTITA NON SI TOCCA NIENTE. Il credito è uscito su quel
       numero e su quel gestore: cambiarli qui non sposta il credito, cambia
       soltanto il racconto — e il racconto sbagliato è peggio del silenzio. */
    if (p.stato === "ok_automatico" || p.stato === "ok_manuale") {
        return NextResponse.json({
            error: "questa ricarica è già stata erogata: correggerla adesso cambierebbe il racconto, non il credito. Se serve rifarla, rimettila prima in sospeso.",
        }, { status: 409 });
    }

    const campi: Record<string, unknown> = {};
    const righe: string[] = [];

    if (b.operatore !== undefined && b.operatore !== p.operatore) {
        const noto = NOMI_OPERATORE.some(([, id]) => id === b.operatore);
        if (!noto) return NextResponse.json({ error: `«${b.operatore}» non è un operatore conosciuto` }, { status: 400 });
        campi.operatore = b.operatore;
        campi.operatore_nome = nomeOperatoreCorto(b.operatore);
        righe.push(`operatore: ${nomeOperatoreCorto(p.operatore)} → ${nomeOperatoreCorto(b.operatore)}`);
    }
    if (b.numero !== undefined) {
        const num = String(b.numero).replace(/\D/g, "");
        if (num.length < 7 || num.length > 11) return NextResponse.json({ error: "il numero deve avere da 7 a 11 cifre" }, { status: 400 });
        if (num !== String(p.numero || "")) {
            campi.numero = num;
            righe.push(`numero: ${p.numero || "—"} → ${num}`);
        }
    }
    if (!righe.length) return NextResponse.json({ error: "niente da cambiare" }, { status: 400 });

    /* ⚠️ E LA CHIAVE DI IDEMPOTENZA SI BUTTA VIA. È legata a QUELLA ricarica:
       tenendola, il tentativo dopo la correzione riceverebbe da PayStore
       l'esito del tentativo vecchio — quello sul numero sbagliato — e la riga
       direbbe «fatta» su una ricarica mai erogata al nuovo numero. */
    campi.idempotency_key = null;
    campi.errore = null;

    const { error } = await supabaseAdmin.from("paystore_ricariche").update(campi).eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await annota(b.id, "modifica", righe.join(" · "), g.nome, { prima: p, dopo: campi });
    return NextResponse.json({ ok: true, cambiato: righe });
}
