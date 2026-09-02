import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminOrAbove } from "@/lib/roles";
import { cifraSegreto } from "@/lib/totp";
import { credenzialeDi } from "@/lib/paystoreCredenziali";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ CARICARE LE CREDENZIALI PAYSTORE ════════════════════════════════════
   Sedici terne — client id, client secret, signing key — una per negozio e per
   società. Vengono da un foglio che PayStore manda, e che rimanderanno ogni
   volta che le rigenerano.

   ⚠️ PERCHÉ PASSANO DA QUI E NON DA UN FILE DEL PROGETTO. In un file del
   progetto finirebbero nel repository, e da lì non si tolgono più. In una
   variabile d'ambiente non ci stanno (sono quarantotto valori). Qui il browser
   le manda una volta, il SERVER le cifra con la stessa chiave che protegge le
   password delle caselle di posta, e da quel momento non escono più: la
   schermata mostra «configurata», mai il valore.

   ⚠️ E IL FOGLIO NON LO LEGGO IO. Il browser lo apre, ne ricava le righe e le
   manda qui. Un segreto che passa da una chat o da un file di lavoro è un
   segreto bruciato — è già successo oggi con una terna, e va rigenerata.

   ── COME SI SCEGLIE LA CREDENZIALE DI UNA RICARICA ────────────────────────
   La coppia (negozio, società della CASSA). Non la società del negozio: a
   Donna lo stesso bancone batte su due registratori di due società diverse, e
   in archivio ci sono 14 ricariche come Telefutura e 15 come Telefutura 2. */

/** Dal nome che usa PayStore al nostro negozio. Il foglio dice «Collatina» e
 *  la società; da noi ci sono «Collatina W3» (T1) e «Collatina Multi» (T2).
 *
 *  ⚠️ LA SOCIETÀ SI CHIEDE ALLE CASSE, NON ALL'ANAGRAFICA. «Donna» in
 *  anagrafica è un negozio solo, di Telefutura — ma ha DUE registratori, uno
 *  per società, e infatti batte ricariche su tutt'e due. Filtrando per
 *  `stores.azienda` la credenziale Telefutura 2 di Donna restava fuori, cioè
 *  proprio quella che serve per metà delle sue ricariche.
 *  E funziona anche al contrario: Garbatella ha solo la cassa Telefutura 2,
 *  quindi la sua vecchia credenziale Telefutura non trova a chi attaccarsi e
 *  resta fuori da sola — che è quello che Luca ha chiesto («è una
 *  configurazione vecchia, adesso è migrato tutto sotto Telefutura 2»). */
async function risolviNegozio(identificativo: string, azienda: string): Promise<string | null> {
    const chiave = identificativo.trim().split(/\s+/)[0].toLowerCase();
    if (!chiave) return null;
    const [{ data: st }, { data: rt }] = await Promise.all([
        supabaseAdmin.from("stores").select("name, azienda, is_ufficio"),
        supabaseAdmin.from("pos_rt").select("negozio, azienda"),
    ]);
    const casse = new Set(((rt || []) as { negozio: string; azienda: string }[]).map((r) => `${r.negozio}|${r.azienda}`));
    const cand = ((st || []) as { name: string; azienda: string | null; is_ufficio: boolean | null }[])
        .filter((s) => !s.is_ufficio && s.name.toLowerCase().startsWith(chiave))
        /* ha una cassa di quella società, oppure è tutta di quella società */
        .filter((s) => casse.has(`${s.name}|${azienda}`) || s.azienda === azienda);
    return cand.length === 1 ? cand[0].name : null;
}

const SOCIETA: Record<string, string> = { "telefutura": "T1", "telefutura 2": "T2" };

/* ═══ CHI FIRMEREBBE COSA ══════════════════════════════════════════════════
   La prova da fare PRIMA di erogare un euro, e non costa niente: per ogni
   coppia (negozio, società) che esiste davvero nel registro delle ricariche,
   si chiede al CRM quale credenziale userebbe.

   ⚠️ PERCHÉ È LA PRIMA. Firmare con la terna di un altro punto vendita addebita
   il suo plafond, e non c'è nessun errore a schermo: ce ne si accorge a fine
   mese, quando i conti non tornano, su ricariche già erogate. È l'unico errore
   che dopo non si scopre più — quindi si guarda prima. */
async function chiFirmerebbe() {
    const { data } = await supabaseAdmin.from("paystore_ricariche")
        .select("negozio, azienda").not("negozio", "is", null).limit(20000);
    const coppie = new Map<string, { negozio: string; azienda: string | null; quante: number }>();
    for (const r of ((data || []) as { negozio: string; azienda: string | null }[])) {
        const k = `${r.negozio}|${r.azienda || ""}`;
        const v = coppie.get(k) || { negozio: r.negozio, azienda: r.azienda, quante: 0 };
        v.quante++; coppie.set(k, v);
    }
    const righe = [];
    for (const c of [...coppie.values()].sort((a, b) => a.negozio.localeCompare(b.negozio))) {
        const e = await credenzialeDi(c.negozio, c.azienda);
        righe.push({
            negozio: c.negozio, azienda: c.azienda, ricariche: c.quante,
            ok: e.ok,
            /* ⚠️ MAI IL SEGRETO, nemmeno un pezzo: solo il nome che PayStore ha
               dato alla terna, che è quello che si confronta col loro foglio. */
            firmerebbe: e.ok ? e.identificativo : null,
            perche: e.ok ? null : e.errore,
        });
    }
    return righe;
}

export async function GET(req: Request) {
    const g = await accesso(req, "paystore/credenziali");
    if (!g.ok) return g.risposta;
    const { data: me } = await supabaseAdmin.from("app_users").select("role").eq("id", g.sess.id).maybeSingle();
    if (!isAdminOrAbove(String((me as { role?: string } | null)?.role || ""))) {
        return NextResponse.json({ error: "solo la direzione vede le credenziali" }, { status: 403 });
    }
    /* ⚠️ MAI I VALORI. Si dice CHE c'è, non COS'È: le colonne cifrate non
       compaiono nemmeno nella select, così non possono uscire per sbaglio. */
    const { data } = await supabaseAdmin.from("paystore_credenziali")
        .select("negozio, azienda, identificativo, attivo, aggiornato_il")
        .order("azienda").order("negozio");
    /* la verifica è sempre inclusa: è la cosa che si guarda aprendo la scheda,
       non un pulsante nascosto */
    const verifica = await chiFirmerebbe();
    return NextResponse.json({
        ok: true, righe: data || [], verifica,
        scoperte: verifica.filter((v) => !v.ok).length,
    });
}

export async function POST(req: Request) {
    const g = await accesso(req, "paystore/credenziali");
    if (!g.ok) return g.risposta;
    const { data: me } = await supabaseAdmin.from("app_users").select("role").eq("id", g.sess.id).maybeSingle();
    if (!isAdminOrAbove(String((me as { role?: string } | null)?.role || ""))) {
        return NextResponse.json({ error: "solo la direzione può caricare le credenziali" }, { status: 403 });
    }
    if (!(process.env.EMAIL_ENC_KEY || "").trim()) {
        return NextResponse.json({ error: "manca la chiave di cifratura sul server: non salvo niente in chiaro." }, { status: 500 });
    }

    const b = await req.json().catch(() => ({})) as {
        righe?: { societa?: string; identificativo?: string; clientId?: string; secret?: string; signingKey?: string }[];
        prova?: boolean;
    };
    const righe = (b.righe || []).filter((r) => r.societa && r.identificativo && r.clientId && r.secret && r.signingKey);
    if (!righe.length) return NextResponse.json({ error: "nessuna riga completa nel foglio" }, { status: 400 });

    const esiti: { societa: string; identificativo: string; negozio: string | null; esito: string }[] = [];
    for (const r of righe) {
        const az = SOCIETA[String(r.societa).trim().toLowerCase()];
        if (!az) { esiti.push({ societa: r.societa!, identificativo: r.identificativo!, negozio: null, esito: "società sconosciuta" }); continue; }
        const negozio = await risolviNegozio(r.identificativo!, az);
        if (!negozio) {
            /* ⚠️ NON SI TIRA A INDOVINARE. Una credenziale agganciata al negozio
               sbagliato vuol dire far partire una ricarica sul conto di
               un'altra società: si lascia fuori e lo si dice. */
            esiti.push({ societa: r.societa!, identificativo: r.identificativo!, negozio: null, esito: "nessun negozio corrisponde: lasciata fuori" });
            continue;
        }
        if (b.prova) { esiti.push({ societa: r.societa!, identificativo: r.identificativo!, negozio, esito: "pronta" }); continue; }
        const { error } = await supabaseAdmin.from("paystore_credenziali").upsert({
            negozio, azienda: az, identificativo: r.identificativo!.trim(),
            client_id: r.clientId!.trim(),
            secret_cifrato: cifraSegreto(r.secret!.trim()),
            signing_cifrata: cifraSegreto(r.signingKey!.trim()),
            attivo: true, creato_da: g.sess.id, aggiornato_il: new Date().toISOString(),
        }, { onConflict: "negozio,azienda" });
        /* ⚠️ L'ERRORE GREZZO DI POSTGRES NON LO CAPISCE NESSUNO. «there is no
           unique or exclusion constraint matching the ON CONFLICT
           specification» vuol dire che manca un vincolo sul database: chi
           legge il pannello deve sapere che non è colpa del suo foglio. */
        const spiegato = !error ? "salvata"
            : /ON CONFLICT/i.test(error.message)
                ? "NON salvata: manca un vincolo sul database — non dipende dal foglio, va sistemato lato server"
                : "NON salvata: " + error.message;
        esiti.push({ societa: r.societa!, identificativo: r.identificativo!, negozio, esito: spiegato });
    }
    const salvate = esiti.filter((e) => e.esito === "salvata" || e.esito === "pronta").length;
    return NextResponse.json({
        ok: true, prova: !!b.prova, esiti,
        salvate, fallite: esiti.length - salvate,
    });
}
