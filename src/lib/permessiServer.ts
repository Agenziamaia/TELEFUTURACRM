// I PERMESSI DEL PANNELLO VALGONO ANCHE SUL SERVER (Luca 28/08 sera).
//
// «Devi far sì che i permessi siano collegati TUTTI alla sezione permessi del
//  pannello amministrativo, altrimenti che senso ha? Non solo per le password
//  ma per tutto il resto.»
//
// Prima di oggi il pannello governava solo quello che si VEDE: le funzioni di
// server rispondevano a chiunque avesse fatto login, quindi bastava conoscere
// l'indirizzo per fare cose che nel menu non compaiono nemmeno. Da qui esiste
// UN SOLO posto che decide: `role_permissions`, la stessa tabella della
// rotellina. Chi spegne una sezione a un ruolo la spegne davvero, ovunque.
//
// ⚠️ Non scrivere MAI elenchi di ruoli dentro una route: sarebbero una seconda
// verità che si scorda di aggiornarsi (successo il 28/08 con le password, dove
// una lista fissa aveva tagliato fuori i venditori abilitati a mano).
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { routeBases, effectiveAllowed, groupKey, groupByLabel, type PermMap } from "@/lib/nav";
import { richiedeSessione, rispostaSessioneNonValida } from "@/lib/sessioneServer";

/* ── A QUALE SEZIONE APPARTIENE OGNI FUNZIONE DI SERVER ──────────────────
   La chiave è l'indirizzo della voce di menu: è quello che il pannello
   accende e spegne. Una funzione senza sezione qui NON è libera: è solo una
   funzione che non ha una sezione propria (e resta protetta dalla sessione). */
export const SEZIONE_DI: Record<string, string> = {
    "passwords": "/password-v2",
    "whatsapp": "/chat",
    "email": "/chat",
    "ai": "/assistente",
    /* ⚠️ PIÙ PRECISA di «ai»: la spesa non è l'assistente. Senza questa riga
       la rotta avrebbe ereditato «/assistente» — che nel menù è aperta ai
       manager — e i costi dell'azienda sarebbero usciti a chi apre una chat.
       Sta sotto la sezione del pannello, che Luca assegna dai Permessi. */
    "ai/spesa": "/amministrazione?sez=ai",
    /* ⚠️ PIÙ PRECISA di «ai»: leggere la lettera dell'operatore e proporre le
       regole del mese non è l'assistente. Senza questa riga la rotta ereditava
       «/assistente» — aperto ai manager — e chiunque avrebbe potuto far
       riscrivere all'AI le soglie che decidono i compensi. La sezione «/gare»
       nel menù è admin+dev e il pannello la governa: è quello il lucchetto. */
    "ai/gare-lettera": "/gare",
    /* i target per punto vendita di WindTre: stessa stanza della lettera. */
    "gare/w3-target": "/gare",
    "vendita": "/registra-vendita",
    /* ⚠️ PIÙ PRECISA di «vendita»: il registro delle ricariche non è la
       vendita. Chi sta in negozio deve poterne fare una (rotta
       `vendita/paystore`); vedere TUTTE quelle di tutti i negozi, con i
       numeri dei clienti, è un'altra cosa e sta sotto il pannello. */
    "paystore": "/amministrazione?sez=paystore",
    /* CONTABILITÀ (Luca 02/09): l'hub dei file che vanno al commercialista.
       ⚠️ La sola sezione non basta: le rotte ricontrollano che chi chiama sia
       amministrazione o sopra — qui dentro ci sono costi d'acquisto e margini. */
    "contabilita": "/amministrazione?sez=contabilita",
    "pos": "/registra-vendita",
    "aircall": "/chiamate",
    "usati": "/usati",
    "dispositivi": "/magazzino",
    "smartphones": "/magazzino",
    /* Il report serale è un pulsante DENTRO la Chiusura Negozio: chi può
       chiudere il negozio può mandarne il report, senza un secondo permesso.
       ⚠️ Le chiavi sono ESPLICITE, non il prefisso «report»: con quello,
       qualunque futura /api/report/mensile avrebbe ereditato in silenzio
       /chiusura, che nel menù è aperta a TUTTI. Una rotta nuova deve dire da
       sé a quale sezione appartiene. */
    "report/giornaliero": "/chiusura",
    "report/invia": "/chiusura",
    /* La Chiusura Cassa (Report Z) è un pulsante DENTRO la Chiusura Negozio,
       come il report serale: chi chiude il negozio deve poterla battere senza
       un permesso di Registra Vendita. ⚠️ Chiave ESPLICITA e non il prefisso
       «vendita»: se no erediterebbe «/registra-vendita» — che è un'altra
       sezione, aperta ad altri — e la chiusura fiscale della giornata
       dipenderebbe da chi può battere scontrini, non da chi chiude il punto. */
    "vendita/chiusura-z": "/chiusura",
    // eccezioni più precise del primo segmento: queste due servono le
    // schermate di Amministrazione (Reparti, Marginalità, Catalogo), non le
    // sezioni operative da cui prendono il nome
    "pos/reparti": "/amministrazione",
    "usati/sync-prices": "/amministrazione",
    // legge i cedolini degli altri: è roba da amministrazione, non da negozio
    "ferie/leggi-buste": "/amministrazione",
    // manda il registro assenze al consulente del lavoro: stessa stanza
    "assenze/report-mensile": "/amministrazione",
    // apre le caselle dei codici: roba da amministrazione, non da negozio
    "passwords/pulizia-otp": "/amministrazione",
    // manda al cliente il modulo da firmare: la apre chi apre le pratiche
    "pratiche/firma": "/ordini-clienti",
    // la stessa rotta firma anche i contratti dell'usato: chi sta in Usati
    // deve poter firmare senza avere anche Ordini Clienti
    "usati/firma": "/usati",
    /* ⚠️ CHIAVI VERE, NON UNA PAROLA A CASO. Le due rotte nuove chiedevano
       `accesso(req, "amministrazione")`, ma «amministrazione» non è una
       chiave di questa mappa: `sezioneDellaRoute` non la trova, torna null, e
       `accesso` si accontenta della sessione — cioè le apriva a TUTTI i 48
       utenti. Una riscrive l'anagrafica di cinquemila clienti, l'altra
       cancella seicento file. E il nome va scritto per intero: «email/…» da
       solo erediterebbe il prefisso `email` → `/chat`, che vede mezzo CRM. */
    "anagrafica/nomi": "/amministrazione",
    "email/pulizia-allegati": "/amministrazione",
    // la cancellazione di una pratica: la rotta controlla anche il RUOLO
    "pratiche/cancella": "/ordini-clienti",
    /* togliere un documento dal fascicolo di un cliente: la scheda cliente la
       aprono in tanti, e la rotta controlla anche il RUOLO */
    "clienti/documento": "/clienti",
    /* far uscire un telefono usato senza vendita registrata: sta in Usati, ma
       la rotta controlla anche il RUOLO */
    "usati/consegna": "/usati",
    /* svuotare il deposito di transito dei documenti: sta nel pannello, e la
       rotta controlla anche il RUOLO */
    "file/transito": "/amministrazione",
    /* le credenziali di pagamento: pannello, e la rotta controlla il RUOLO */
    "paystore/credenziali": "/amministrazione?sez=paystore",
    /* il documento di trasporto di un usato: sta in Usati */
    "usati/ddt": "/usati",
};

/** La sezione di una route: "passwords/credentials/[id]/reveal" → "/password-v2".
 *  Vince la chiave PIÙ SPECIFICA ("pos/reparti" prima di "pos"), così una
 *  singola route può appartenere a una sezione diversa dalle sue sorelle. */
export function sezioneDellaRoute(nomeRoute: string): string | null {
    const n = String(nomeRoute || "");
    for (const k of Object.keys(SEZIONE_DI).sort((a, b) => b.length - a.length)) {
        if (n === k || n.startsWith(k + "/")) return SEZIONE_DI[k];
    }
    return null;
}

/** Il permesso EFFETTIVO di una persona su una sezione.
 *
 *  ⚠️ LA STESSA IDENTICA FUNZIONE DEL BROWSER (`effectiveAllowed` di nav.ts),
 *  sugli stessi dati. Non una seconda implementazione «equivalente»: il 28/08
 *  ne avevo scritta una a mano e sbagliava a leggere il menù (cercava le voci
 *  in `items`, che non esiste — sono in `children`). Risultato: chi non aveva
 *  una riga scritta a mano nel pannello — cioè chi eredita i valori di
 *  fabbrica, direttore generale e store manager compresi — si è visto negare
 *  le password per un'ora. Due copie della stessa regola divergono sempre:
 *  qui ne esiste una sola, e sta in nav.ts. */
export async function permessoSezione(userId: string, href: string): Promise<{ ok: boolean; role: string }> {
    try {
        const { data: u } = await supabaseAdmin.from("app_users")
            .select("role, grade, active").eq("id", userId).maybeSingle();
        const role = String(u?.role || "");
        if (!u || u.active === false) return { ok: false, role };
        if (role === "admin" || role === "dev") return { ok: true, role };

        // ruolo → grado → persona, l'ultimo strato vince (come useRolePermissions)
        const chiavi = [role, u.grade ? `${role}@${u.grade}` : null, `user:${userId}`]
            .filter(Boolean) as string[];
        const { data: righe } = await supabaseAdmin.from("role_permissions")
            .select("role, perm_key, allowed").in("role", chiavi);
        const perms: PermMap = new Map();
        for (const chiave of chiavi) {
            (righe || []).filter((x) => x.role === chiave).forEach((x) => perms.set(x.perm_key, !!x.allowed));
        }

        // la voce di menù vera, con il suo gruppo e i suoi ruoli di partenza
        const base = routeBases().find((r) => r.base === href.split("?")[0]);
        const voce = base?.items.find((i) => i.href === href) ?? base?.items[0];
        if (!voce) return { ok: false, role };    // sezione sconosciuta: chiusa

        // gerarchia: col gruppo spento la voce non conta nulla (come nel pannello)
        if (voce.group) {
            const gruppoOk = effectiveAllowed(role, groupKey(voce.group),
                groupByLabel(voce.group)?.roles ?? ["*"], perms, voce.group);
            if (!gruppoOk) return { ok: false, role };
        }
        return { ok: effectiveAllowed(role, voce.href, voce.roles, perms, voce.group), role };
    } catch {
        return { ok: false, role: "" };          // nel dubbio non si apre
    }
}

/** IL VARCO UNICO delle funzioni di server: sessione firmata + permesso della
 *  sezione. Restituisce la sessione, oppure la risposta da restituire subito.
 *
 *   const g = await accesso(request, "passwords");
 *   if (!g.ok) return g.risposta;
 *   … usa g.sess.id come identità (mai quella dichiarata dal browser)
 */
export async function accesso(request: Request, nomeRoute: string): Promise<
    { ok: true; sess: { id: string; role: string; exp: number }; risposta?: never } |
    { ok: false; sess?: never; risposta: Response }
> {
    const sess = richiedeSessione(request);
    if (!sess) return { ok: false, risposta: rispostaSessioneNonValida() };
    const href = sezioneDellaRoute(nomeRoute);
    if (!href) return { ok: true, sess };        // nessuna sezione propria: basta la sessione
    const p = await permessoSezione(sess.id, href);
    if (!p.ok) {
        return {
            ok: false,
            risposta: Response.json(
                { error: "Non hai i permessi per questa sezione. Se ti servono, chiedili all'amministrazione." },
                { status: 403 },
            ),
        };
    }
    return { ok: true, sess };
}
