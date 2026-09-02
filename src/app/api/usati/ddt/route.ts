import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stessoMagazzino, LABORATORIO, STATI_AL_LABORATORIO } from "@/lib/negoziNomi";
import { negoziVisibiliDi } from "@/lib/visibleStoresServer";
import { isAdminOrAbove } from "@/lib/roles";

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

/** La società di un luogo, e se quel luogo ne ospita più d'una.
 *
 *  ⚠️ UN USATO NON HA UNA SOCIETÀ SUA. In `usati` non c'è nessuna colonna che
 *  dica di chi è il telefono: la si deduce dal posto dove sta. E il posto, in
 *  quattro casi su otto, non basta — misurato: ad Acilia, Magliana, Donna e
 *  Collatina battono DUE registratori di due società diverse, e lì stanno 141
 *  telefoni su 281. `stores.azienda` dice «T1» per tutti e quattro, ma è un
 *  campo unico su un locale che ne ospita due: nessuno ha mai confermato che i
 *  telefoni usati siano di T1.
 *  Qui non si indovina. Si dice qual è la società più probabile E che il posto
 *  è ambiguo, e chi emette il documento se lo trova scritto sopra. */
async function aziendaDelNegozio(negozio: string): Promise<{ azienda: string | null; incerta: boolean }> {
    const { data: rt } = await supabaseAdmin.from("pos_rt")
        .select("azienda, is_default").eq("negozio", negozio);
    const casse = [...new Set(((rt || []) as { azienda: string }[]).map((r) => r.azienda))];
    const { data } = await supabaseAdmin.from("stores")
        .select("azienda").eq("name", negozio).maybeSingle();
    const anagrafica = (data as { azienda?: string | null } | null)?.azienda || null;
    const def = ((rt || []) as { azienda: string; is_default: boolean }[]).find((r) => r.is_default)?.azienda || casse[0] || null;
    return { azienda: anagrafica || def, incerta: casse.length > 1 };
}

export async function POST(req: Request) {
    const g = await accesso(req, "usati/ddt");
    if (!g.ok) return g.risposta;

    const b = await req.json().catch(() => ({})) as
        /* `proprietarioDa`: il negozio di cui è la MERCE quando parte da un
           luogo che non è un negozio. Il laboratorio è un posto, non una
           società: il telefono che ci passa resta di chi era. */
        { usatoId?: number; da?: string; a?: string; causale?: string; proprietarioDa?: string };
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
        .select("id, model, imei, purchase_price, sale_price, store, target_store, status").eq("id", b.usatoId).maybeSingle();
    if (!dev) return NextResponse.json({ error: "telefono non trovato" }, { status: 404 });
    const u = dev as {
        id: number; model: string; imei: string; purchase_price: number | null;
        sale_price: number | null; store: string | null; target_store: string | null; status: string | null;
    };

    /* ⚠️ PARTENZA E ARRIVO NON SI ACCETTANO SULLA PAROLA. La rotta è aperta a
       chiunque veda Gestione Usati — una quindicina di persone — e prendeva
       `da` e `a` così com'erano scritti nella richiesta. Da lì si poteva far
       nascere un documento di trasporto fra due punti vendita qualsiasi, anche
       di società diverse: cioè una CESSIONE fra soggetti giuridici, con la
       fattura che ne consegue, per un telefono che non si è mosso.
       Due controlli: i due posti devono esistere davvero in anagrafica, e la
       partenza dev'essere dove il telefono STA — non dove qualcuno dice. */
    const { data: luoghi, error: eLuoghi } = await supabaseAdmin.from("stores").select("name");
    if (eLuoghi || !luoghi) {
        /* ⚠️ SE L'ANAGRAFICA NON RISPONDE, NON SI INCOLPANO I NOMI. Con
           l'elenco vuoto ogni richiesta usciva «partenza o arrivo non sono un
           punto vendita valido», e nessuno sarebbe andato a cercare un guasto
           di rete dietro un messaggio che parla di negozi. */
        return NextResponse.json({ error: "non riesco a leggere l'anagrafica dei punti vendita: riprova fra poco" }, { status: 503 });
    }
    /* ⚠️ IL NOME SI RISOLVE, NON SI CONFRONTA A LETTERE. Nella schermata la
       tendina proponeva «Acilia Multi», «Collatina Multi», «Magliana Multi»:
       tre insegne che in anagrafica non esistono più — misurato, `stores` ha
       «Acilia», «Collatina», «Magliana». Con l'uguaglianza esatta il documento
       veniva RIFIUTATO proprio nei tre negozi dove stanno 106 telefoni su 281,
       e il telefono intanto si era già mosso.
       La tendina adesso legge l'anagrafica; qui si risolve lo stesso, con la
       tolleranza che il resto del CRM usa già per le doppie insegne. */
    const nomi = (luoghi as { name: string }[]).map((x) => x.name);
    const risolvi = (n: string) => nomi.find((x) => x === n) || nomi.find((x) => stessoMagazzino(x, n)) || null;
    const daR = risolvi(b.da), aR = risolvi(b.a);
    if (!daR || !aR) {
        return NextResponse.json({
            error: `«${!daR ? b.da : b.a}» non è un punto vendita dell'anagrafica: documento non emesso.`,
        }, { status: 400 });
    }
    b.da = daR; b.a = aR;
    /* risolti i nomi, il controllo di riga 69 va rifatto: «Magliana Multi» e
       «Magliana» diventano lo stesso posto solo adesso */
    if (b.da === b.a) {
        return NextResponse.json({ ok: true, saltato: "partenza e arrivo sono lo stesso punto vendita" });
    }
    /* ⚠️ E CHI LA CHIEDE DEVE POTER TOCCARE QUEL TELEFONO.
       Il solo `accesso(req, "usati/ddt")` apre la rotta a chiunque veda
       Gestione Usati: quaranta account, venti dei quali venditori. Uno di loro
       poteva mandare `{ usatoId: <telefono di Garbatella>, da: "Garbatella",
       a: "Acilia" }` e far nascere una CESSIONE T2→T1 — con la fattura da
       fare — su un telefono che non ha mai toccato. La schermata glielo
       impediva, il server no: e la schermata non è una difesa.
       La regola è quella del pannello: la direzione e chi lavora l'usato
       possono sempre; agli altri serve che il telefono sia dei loro negozi. */
    const { data: chi } = await supabaseAdmin.from("app_users")
        .select("role, full_name").eq("id", g.sess.id).maybeSingle();
    const persona = chi as { role?: string; full_name?: string } | null;
    const ruolo = String(persona?.role || "");
    if (!isAdminOrAbove(ruolo) && !ruolo.startsWith("tecnico")) {
        const { tutti, negozi } = await negoziVisibiliDi(g.sess.id);
        const suo = (n: string | null | undefined) => !!n && (tutti || negozi.some((m) => stessoMagazzino(n!, m)));
        /* ⚠️ ANCHE LA PARTENZA, NON SOLO DOVE STA IL TELEFONO. Guardando solo
           `store`/`target_store` questo controllo aveva ROTTO il trasferimento
           fra due punti vendita — la tratta più lunga e l'unica dove nascono
           davvero le cessioni fra società. Chi spedisce salva prima la
           destinazione dentro `store`, quindi al server il telefono risulta già
           dell'altro negozio: 27 account su 29 vedono un negozio solo, e per
           tutti loro il documento veniva rifiutato mentre il telefono partiva.
           Chi spedisce è la PARTENZA: è quella che deve essere sua. */
        if (!suo(u.store) && !suo(u.target_store) && !suo(b.da)) {
            return NextResponse.json({
                error: "questo telefono non parte da un tuo punto vendita: il documento lo emette chi lo sta spostando.",
            }, { status: 403 });
        }
    }

    /* ⚠️ SI ANCORA UN CAPO ALLA RIGA DEL TELEFONO, NON LA PARTENZA.
       Il primo tentativo pretendeva che la partenza fosse il negozio scritto in
       `usati.store` — e avrebbe RIFIUTATO il trasferimento fra due punti
       vendita, che è la tratta più lunga di tutte: chi lo fa scrive prima la
       destinazione in `store` e poi chiede il documento, quindi al server la
       partenza risulta già sostituita. Le tre tratte vere sono queste, e in
       ognuna almeno un capo è verificabile sulla riga:
         · negozio → laboratorio        la PARTENZA è `store`
         · laboratorio → negozio        l'ARRIVO è `store`/`target_store`
         · negozio → negozio            l'ARRIVO è `store`/`target_store`
       Chiedere che uno dei due capi combaci lascia passare tutte e tre e
       impedisce la cosa che fa danno: inventare una tratta fra due società fra
       cui questo telefono non sta viaggiando, cioè una cessione — con la
       fattura che ne consegue — dal nulla. */
    const suoi = [u.store, u.target_store].filter(Boolean) as string[];
    if (STATI_AL_LABORATORIO.includes(String(u.status || ""))) suoi.push(LABORATORIO);
    const ancorato = suoi.some((p) => stessoMagazzino(p, b.da!) || stessoMagazzino(p, b.a!));
    if (!ancorato) {
        return NextResponse.json({
            error: `questo telefono non sta viaggiando fra «${b.da}» e «${b.a}»: risulta a «${u.store || "—"}». Documento non emesso.`,
        }, { status: 409 });
    }

    const giorno = giornoRoma();

    /* ⚠️ IL LABORATORIO NON È UNA SOCIETÀ, È UN REPARTO. Non ha `azienda` in
       anagrafica, e la lasciava nulla: il trigger la deduceva dal magazzino di
       un negozio che non ha magazzino e ripiegava su «T1» fisso. Risultato
       misurato: l'andata Garbatella(T2)→Laboratorio usciva T2→T2, e il ritorno
       Laboratorio→Garbatella usciva T1→T2 — cioè una CESSIONE FRA SOCIETÀ
       inventata, con la fattura da fare, sullo stesso viaggio. Erano 64 i
       telefoni a un clic da lì.
       Il telefono che passa dal laboratorio resta di chi era: sulle tratte che
       lo toccano, la società è quella del negozio vero. */
    /* ⚠️ IL LUOGO DA CUI PARTE E LA SOCIETÀ DI CHI SPEDISCE SONO DUE COSE
       DIVERSE, e confonderle è l'errore che ha fatto sparire delle cessioni.
       Il laboratorio è un posto fisico senza società: se il telefono che ci sta
       è di un negozio T1 e va a un negozio T2, quella È una cessione — ma
       leggendo la società «del laboratorio» (nulla) si ereditava quella
       dell'arrivo e usciva un innocuo T2→T2.
       Chi chiama può dire di chi è la merce; se non lo dice, e il luogo non ha
       società, la si eredita come prima — ma allora è INCERTA, e si scrive. */
    const infoDa = await aziendaDelNegozio(b.da);
    const infoA = await aziendaDelNegozio(b.a);
    const infoProp = b.proprietarioDa && b.proprietarioDa !== b.da
        ? await aziendaDelNegozio(b.proprietarioDa) : null;
    let azDa = infoProp?.azienda || infoDa.azienda, azA = infoA.azienda;
    let ereditata = false;
    if (!azDa && azA) { azDa = azA; ereditata = true; }
    if (!azA && azDa) azA = azDa;
    const cessione = !!azDa && !!azA && azDa !== azA;

    /* ⚠️ SE IL POSTO OSPITA DUE SOCIETÀ, IL DOCUMENTO LO DICE. Un documento che
       afferma «T1 → T2» quando la partenza poteva essere T2 dichiara una
       cessione che forse non c'è (fattura da fare, ricavo e IVA inventati); uno
       che afferma «T1 → T1» quando la partenza era T2 ne nasconde una vera. Il
       CRM non ha il dato per scegliere, quindi non sceglie in silenzio: la
       nota lo scrive, e l'amministrazione decide prima di fatturare. */
    /* ⚠️ EREDITATA = INCERTA. Quando la società di partenza non si sa e si
       prende quella dell'arrivo, il documento dice «trasferimento interno» su
       un viaggio che potrebbe essere una cessione: è il caso dei telefoni fermi
       in laboratorio, che hanno perso il negozio d'origine. Prima usciva pulito
       e sbagliato; adesso almeno lo dichiara. */
    const incerta = infoDa.incerta || infoA.incerta || (infoProp?.incerta ?? false) || ereditata;
    const perche = ereditata
        ? `la partenza (${b.da}) non ha una società propria e il telefono non porta con sé il negozio da cui è arrivato`
        : `${[infoDa.incerta ? b.da : null, infoA.incerta ? b.a : null, infoProp?.incerta ? b.proprietarioDa : null].filter(Boolean).join(" e ")} ospita due società alla cassa, e il telefono usato non ha una società propria registrata`;
    const avvisoSocieta = incerta
        ? `\n⚠️ SOCIETÀ DA CONFERMARE: ${perche}. Qui è scritta «${azDa} → ${azA}»: verificarla prima di ${cessione ? "emettere la fattura" : "considerarlo un trasferimento interno"}.`
        : "";

    /* ⚠️ TESTATA E RIGA IN UNA TRANSAZIONE SOLA. Erano due chiamate separate:
       se la seconda falliva restava un documento numerato, chiuso e VUOTO —
       senza descrizione, senza IMEI, senza quantità — e l'indice unico lo
       rendeva pure irrecuperabile, perché al tentativo dopo veniva restituito
       quello. Adesso lo fa `tf_ddt_usato_crea`, che gestisce anche il doppio
       clic restituendo il documento già fatto invece di un errore. */
    const { data: creato, error } = await supabaseAdmin.rpc("tf_ddt_usato_crea", {
        p_usato_id: b.usatoId, p_da: b.da, p_a: b.a,
        p_azienda_da: azDa, p_azienda_a: azA,
        p_tipo: cessione ? "cessione" : "trasferimento",
        p_causale: b.causale || (cessione ? "Cessione tra società del gruppo — telefono usato" : "Trasferimento tra sedi — telefono usato"),
        p_descrizione: `${u.model} — usato · IMEI ${u.imei}`,
        p_seriale: u.imei,
        p_valore: Number(u.sale_price) > 0 ? Number(u.sale_price) : (Number(u.purchase_price) || null),
        p_giorno: giorno,
        /* ⚠️ IL NOME, NON L'UUID. Tutti gli altri documenti portano il nome di
           chi li ha fatti: un identificativo tecnico finisce nel filtro
           «Persone» e stampato sul PDF. */
        p_creato_da: persona?.full_name || g.sess.id,
        p_note: "Documento emesso in automatico da Gestione Usati. Non si accetta qui: il telefono si prende in carico nella sua scheda, seguendo la timeline dell'usato." + avvisoSocieta,
    });
    const d = ((creato || []) as { id: string; numero: number; anno: number; azienda_da: string | null; azienda_a: string | null; gia: boolean }[])[0];
    if (error || !d) {
        return NextResponse.json({ error: error?.message || "il documento non è stato creato" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, gia: d.gia, ddt: d, cessione, societaIncerta: incerta });
}
