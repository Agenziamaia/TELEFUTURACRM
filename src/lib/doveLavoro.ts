/* ═══════════════════════════════════════════════════════════════════════════
   DOVE STO LAVORANDO OGGI

   Luca 31/08: «a ogni login dobbiamo chiedere il punto vendita in cui sta
   lavorando. La selezione preselezionata dev'essere quella dei turni, e ci
   mettiamo un pulsante "altro negozio": lo seleziona, ma uno
   dell'amministrazione deve approvargli l'accesso. Per i negozi doppi metti
   solo la selezione generale, tipo Magliana, Collatina. A quel punto abbiamo
   il dato certo su quale magazzino stanno lavorando.»

   LA REGOLA DEI TURNI NON SI RISCRIVE. Sta già dentro la sezione Turni
   (`collaboratori/page.tsx`, `TurniSection`) e dice:
     chi è a turno oggi in un negozio = chi ce l'ha in scheda (`primary_store`)
     + chi ce l'ha fra i negozi assegnati (`user_stores`), MENO ferie, malattie
     ed esclusioni del giorno, PIÙ le coperture (`turni_negozio`).
   Due copie della stessa regola divergono sempre: qui si ricalcola con le
   stesse fonti, e se un giorno la regola cambia va cambiata in tutti e due i
   posti — per questo il commento lo dice a voce alta invece di fingere che
   basti leggere il codice.

   LA SEDE, NON L'INSEGNA. Magliana W3 e Magliana Multi sono la stessa stanza:
   la pagina Turni le chiama «sede unica» e ne fonde le squadre. Qui vale lo
   stesso — si sceglie «Magliana», non una delle due insegne — perché la
   domanda a cui questo serve a rispondere è «da quale MAGAZZINO stai
   vendendo», e il magazzino è uno.
   ═══════════════════════════════════════════════════════════════════════════ */

import { supabase } from "@/lib/supabaseClient";
import { sedeFisica } from "@/lib/negoziNomi";

export type SedeLavoro = {
    /** la chiave: la prima parola del nome, minuscola — «magliana», «donna» */
    sede: string;
    /** come si scrive a schermo: «Magliana», «Donna» */
    etichetta: string;
    /** le insegne che stanno in quella sede: ["Magliana W3","Magliana Multi"] */
    insegne: string[];
    /** ci sono più insegne? allora è una sede doppia */
    doppia: boolean;
};

export type Presenza = {
    id: string;
    sede: string;
    origine: "turno" | "richiesta";
    stato: "attiva" | "in_attesa" | "rifiutata" | "chiusa";
    sede_turno: string | null;
};

const oggiYmd = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const bello = (nome: string) => nome.charAt(0).toUpperCase() + nome.slice(1);

/** Tutte le sedi del gruppo, con le loro insegne. Gli uffici restano fuori.
 *  ⚠️ E la ragione non è che da lì non si venda — ci vendono eccome, 57
 *  vendite in trenta giorni. È che da un ufficio non si SCONTRINA: non c'è
 *  un registratore di cassa, e la dichiarazione serve proprio a sapere da
 *  quale cassa esce lo scontrino. Chi è assegnato all'Agenzia o all'Ufficio
 *  Commerciale sta già dove deve stare, e chiedergli «in che negozio sei
 *  oggi?» non ha risposta (Luca 02/09). */
export async function sediDelGruppo(): Promise<SedeLavoro[]> {
    const { data } = await supabase.from("stores").select("name, is_ufficio").order("name");
    const per = new Map<string, string[]>();
    (data ?? []).forEach((r: { name: string; is_ufficio?: boolean | null }) => {
        if (r.is_ufficio) return;
        const k = sedeFisica(r.name);
        if (!k) return;
        const arr = per.get(k) || [];
        arr.push(r.name);
        per.set(k, arr);
    });
    return [...per.entries()]
        .map(([sede, insegne]) => ({
            sede,
            // l'etichetta è la parte comune del nome: «Magliana W3» → «Magliana»
            etichetta: bello(sede),
            insegne: insegne.sort(),
            doppia: insegne.length > 1,
        }))
        .sort((a, b) => a.etichetta.localeCompare(b.etichetta));
}

/** Dove questa persona risulta di turno OGGI. Può essere più di una sede (chi
 *  copre due negozi) o nessuna (chi è in ferie, o chi un negozio non ce l'ha). */
export async function sediDiTurnoOggi(userId: string, nome: string): Promise<string[]> {
    const data = oggiYmd();
    const [u, links, cop] = await Promise.all([
        supabase.from("app_users").select("primary_store").eq("id", userId).maybeSingle(),
        supabase.from("user_stores").select("store_name").eq("user_id", userId),
        // le coperture del giorno sono per NOME, com'è scritto in `turni_negozio`
        supabase.from("turni_negozio").select("store, tipo").eq("data", data).eq("persona", nome),
    ]);

    const sedi = new Set<string>();
    const aggiungi = (n: string | null | undefined) => { const k = sedeFisica(n || ""); if (k) sedi.add(k); };
    aggiungi(u.data?.primary_store);
    (links.data ?? []).forEach((r: { store_name: string }) => aggiungi(r.store_name));
    (cop.data ?? []).forEach((r: { store: string; tipo: string | null }) => {
        // «escluso» è il contrario di una copertura: quel giorno NON c'è
        if (String(r.tipo || "") === "escluso") sedi.delete(sedeFisica(r.store));
        else aggiungi(r.store);
    });
    return [...sedi];
}

/* ═══ CHI DEVE DICHIARARE DOVE LAVORA ════════════════════════════════════
   Questa lista viveva dentro `_DoveLavoro.tsx`, cioè dentro il popup. Ma dal
   02/09 la stessa regola decide anche CHI VIENE BLOCCATO senza dichiarazione:
   se le due liste stanno in due file, il giorno che se ne aggiunge un ruolo
   in una sola, qualcuno si ritrova bloccato senza che nessuno gli abbia mai
   chiesto niente — oppure il contrario, e il blocco non serve a nulla.
   Una lista sola, qui. */
export const RUOLI_DI_NEGOZIO = [
    /* Luca, 02/09, elencandoli: «le persone che lavorano all'interno di un
       punto vendita, che di fatto sono i ruoli di consulente, di store
       manager, di direttore commerciale». Consulente qui si chiama
       `venditore`.
       ⚠️ I TECNICI CI SONO (Luca 02/09, correggendosi): «i tecnici non stanno
       in laboratorio, ce n'è solo uno — Fadel — che ci lavora anche, ma il
       laboratorio è dentro un punto vendita». Quindi stanno a bancone come
       gli altri, e la domanda gliela si fa.
       ⚠️ FUORI `agente`: l'agente gira, non ha un negozio in scheda e non
       batte scontrini. Con lui dentro restava bloccato ogni santo giorno
       senza che ci fosse una risposta giusta da dargli. */
    "venditore", "store_manager", "tecnico",
    /* IL DIRETTORE COMMERCIALE (Luca 31/08): «sta sui negozi tutti i giorni,
       per cui anche a lui bisogna chiedere in che punto vendita lavora». */
    "direttore_commerciale",
];
/* LE ECCEZIONI PER PERSONA (Luca 31/08). Il ruolo non basta sempre: Marta
   Perrotta è direttore generale ma «fa molte coperture», quindi la domanda la
   riguarda eccome. Si va per id, non per nome: i nomi si riscrivono.
   Franca Arduini ha lo stesso ruolo e resta fuori — lei in negozio non ci sta. */
export const ANCHE_LORO = ["7e3f04f6-f30b-4b4b-aea8-f732c45e1861"];   // Marta Perrotta

/** Vero se a questa persona il CRM chiede dove sta lavorando — e quindi se,
 *  senza una dichiarazione APPROVATA, non può vendere né muovere magazzino. */
export function serveDichiarazione(ruolo?: string | null, id?: string | null): boolean {
    return RUOLI_DI_NEGOZIO.includes(String(ruolo || "")) || ANCHE_LORO.includes(String(id || ""));
}

/** Vero se questa persona lavora in un UFFICIO e non in un punto vendita:
 *  lì non c'è cassa, non si scontrina, e la domanda «in che negozio sei
 *  oggi?» non ha risposta. Vale anche per chi ha il ruolo giusto ma è
 *  assegnato all'Agenzia o al Call Center. */
export async function stoInUfficio(userId: string, primario?: string | null): Promise<boolean> {
    const { data: st } = await supabase.from("stores").select("name, is_ufficio");
    const uffici = new Set(((st ?? []) as { name: string; is_ufficio?: boolean | null }[])
        .filter((r) => r.is_ufficio).map((r) => r.name));
    if (!uffici.size) return false;
    const suoi = new Set<string>();
    if (primario) suoi.add(primario);
    const { data: us } = await supabase.from("user_stores").select("store_name").eq("user_id", userId);
    (us ?? []).forEach((r: { store_name?: string | null }) => { if (r.store_name) suoi.add(String(r.store_name)); });
    if (!suoi.size) return false;                    // senza assegnazioni non si deduce niente
    return [...suoi].every((n) => uffici.has(n));    // TUTTE le sue sedi sono uffici
}

/** La presenza dichiarata oggi: quella ATTIVA (dove sta lavorando davvero) e
 *  l'eventuale richiesta ancora in attesa di approvazione. */
export async function presenzaOggi(userId: string): Promise<{ attiva: Presenza | null; inAttesa: Presenza | null; rifiutata: Presenza | null; errore: string | null }> {
    /* ⚠️ L'ERRORE ESCE DA QUI (revisore 02/09). Prima si destrutturava solo
       `data`: una select fallita — un blip di rete, un token scaduto —
       tornava «nessuna dichiarazione», identica a chi non l'ha fatta. Con la
       dichiarazione diventata un cancello, quello vuol dire fermare un
       negozio per un pacchetto perso. Chi chiama deve poter distinguere
       «non ha dichiarato» da «non sono riuscito a leggerlo», e sul secondo
       caso lasciare passare con un avviso. */
    const { data, error } = await supabase.from("presenza_negozio")
        .select("id, sede, origine, stato, sede_turno")
        .eq("user_id", userId).eq("data", oggiYmd())
        .in("stato", ["attiva", "in_attesa", "rifiutata"]);
    const righe = (data ?? []) as Presenza[];
    return {
        attiva: righe.find((r) => r.stato === "attiva") ?? null,
        inAttesa: righe.find((r) => r.stato === "in_attesa") ?? null,
        rifiutata: righe.find((r) => r.stato === "rifiutata") ?? null,
        errore: error ? error.message : null,
    };
}

/* ⚠️ `dichiaraPresenza` NON ESISTE PIÙ, ed è voluto. Scriveva la riga
   direttamente dal browser, e dal 02/09 la tabella non accetta più scritture
   da lì: la presenza la crea SOLO il server (`/api/turni/presenza`), che è
   l'unico che può decidere se nasce «attiva» o «in attesa di
   autorizzazione». Finché quella funzione restava qui, bastava richiamarla
   per saltare l'approvazione — e il codice per farlo era già scritto. */

