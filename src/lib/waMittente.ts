/* ═══ DA QUALE NUMERO ESCE UN MESSAGGIO ══════════════════════════════════
   Luca, 05/09: «ogni punto vendita deve inviare i messaggi tramite il
   proprio numero WhatsApp. Se ho fatto un'assistenza a Donna Olimpia devo
   partire dal numero di Donna Olimpia; se l'ho fatta a Libia, uguale. Se il
   numero è scollegato deve uscire un popup di errore, perché va sistemato il
   problema — la soluzione NON è far partire il messaggio da un altro numero,
   perché poi il cliente risponde là e chi ha fatto il lavoro non vede la
   risposta, mentre l'altro negozio si ritrova una chat che non è sua».

   ⚠️ NON È UNA QUESTIONE DI INTESTAZIONE. Il numero da cui esce il messaggio
   decide su QUALE ISTANZA nasce la conversazione, e l'istanza è la chiave del
   perimetro: chi non ha quel negozio in visibilità non vedrà mai né il
   messaggio né la risposta. Sbagliare mittente vuol dire consegnare la
   risposta del cliente a un negozio che non c'entra.

   Perciò qui NON c'è ripiego. Se il numero del negozio non è collegato la
   funzione dice di no, e chi ha chiamato lo deve mostrare. */

type Istanza = {
    id: string; instance_name: string; display_name?: string | null;
    status?: string | null; negozio?: string | null; owner_user_id?: string | null;
    mittente_notifiche?: boolean | null;
};

/** «Magliana W3» e «Magliana Multi» sono lo stesso bancone: si confronta la
 *  prima parola, come fa `tf_wa_istanze` nel database. */
const radice = (n: string) => String(n || "").trim().toLowerCase().split(" ")[0];

/** Il numero CONDIVISO di quel punto vendita: `owner_user_id` vuoto vuol dire
 *  «numero del negozio», non di una persona. */
export function istanzaDelNegozio(insts: Istanza[], negozio: string): Istanza | null {
    const r = radice(negozio);
    if (!r) return null;
    const suoi = (insts || []).filter((i) => !i.owner_user_id).filter((i) => {
        const etichette = String(i.negozio || "").split(",").map((x) => radice(x));
        etichette.push(radice(i.display_name || ""));
        return etichette.includes(r);
    });
    return suoi[0] || null;
}

export const connessa = (i: { status?: string | null } | null) =>
    String(i?.status || "").toLowerCase() === "connessa";

/** Il mittente giusto, o il motivo per cui non si manda.
 *  `negozio` vuoto = messaggio che non appartiene a un punto vendita (avvisi
 *  interni, allarmi delle casse): lì vale ancora il designato. */
export function scegliMittente(insts: Istanza[], negozio?: string | null):
    { inst: Istanza } | { errore: string } {
    if (negozio && String(negozio).trim()) {
        const mio = istanzaDelNegozio(insts, negozio);
        if (!mio) {
            return { errore: `Il punto vendita «${negozio}» non ha un numero WhatsApp collegato al CRM. Il messaggio non è partito: va collegato dal pannello WhatsApp.` };
        }
        if (!connessa(mio)) {
            return { errore: `Il numero WhatsApp di «${negozio}» (${mio.display_name || mio.instance_name}) risulta SCOLLEGATO. Il messaggio non è partito — e non lo mando da un altro numero, perché la risposta del cliente arriverebbe a un negozio che non c'entra. Riconnetti il numero dal pannello WhatsApp.` };
        }
        return { inst: mio };
    }
    const designato = (insts || []).find((i) => i.mittente_notifiche);
    if (designato && connessa(designato)) return { inst: designato };
    return {
        errore: designato
            ? `Il numero designato per le notifiche («${designato.display_name || designato.instance_name}») non è collegato.`
            : "Nessun numero designato per le notifiche: si sceglie dal pannello WhatsApp.",
    };
}
