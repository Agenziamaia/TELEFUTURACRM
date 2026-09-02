import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decifraSegreto } from "@/lib/totp";
import type { Credenziale } from "@/lib/paystore";
import { stessoMagazzino } from "@/lib/negoziNomi";

/* ═══ QUALE CREDENZIALE PARTE PER QUESTA RICARICA ══════════════════════════
   PayStore ha creato una terna per ogni punto vendita, divisa per società.
   Il plafond è separato: ogni terna consuma il credito del SUO negozio.

   ⚠️ SBAGLIARE QUI SIGNIFICA ADDEBITARE UN ALTRO. Non è un errore di
   visualizzazione: il credito è denaro caricato in anticipo, e una ricarica
   partita con la terna del negozio sbagliato lo toglie a quel negozio. Chi se
   ne accorge è l'amministrazione, a fine mese, quando i conti non tornano.
   Per questo, quando la credenziale non si trova, NON si ripiega: ci si ferma.

   ⚠️ LA SOCIETÀ È QUELLA DELLA CASSA, NON DEL NEGOZIO. Luca 02/09, sul caso
   Donna: «i negozi che hanno due casse devono selezionare qual è il
   registratore, tu di conseguenza puoi derogare la ricarica in virtù di questa
   selezione». Lo stesso bancone batte su due registratori di due società
   diverse — in archivio ci sono ricariche di Donna sia come Telefutura sia
   come Telefutura 2 — e la società la porta già la riga della ricarica.

   ⚠️ I SEGRETI SI DECIFRANO QUI E NON ESCONO DA QUI. Stanno cifrati a riposo
   con la stessa chiave delle caselle di posta (AES-256-GCM, `EMAIL_ENC_KEY`).
   Questo modulo è solo server: non lo importa nessuna schermata, e il valore
   in chiaro vive il tempo di una richiesta. */

export type EsitoCredenziale =
    | { ok: true; cred: Credenziale; negozio: string; azienda: string; identificativo: string }
    | { ok: false; errore: string };

/** La terna del negozio che ha venduto la ricarica.
 *  `azienda` è quella scritta sulla riga della ricarica: la società della cassa
 *  su cui è stato battuto lo scontrino. */
export async function credenzialeDi(negozio: string | null, azienda: string | null): Promise<EsitoCredenziale> {
    if (!negozio) return { ok: false, errore: "la ricarica non dice da quale punto vendita è partita: non so quale plafond usare" };
    if (!azienda) return { ok: false, errore: `la ricarica di ${negozio} non dice con quale società è stata battuta: non so quale plafond usare` };

    const { data, error } = await supabaseAdmin.from("paystore_credenziali")
        .select("negozio, azienda, identificativo, client_id, secret_cifrato, signing_cifrata, attivo")
        .eq("azienda", azienda);
    if (error) return { ok: false, errore: `non riesco a leggere le credenziali PayStore: ${error.message}` };

    type R = { negozio: string; azienda: string; identificativo: string; client_id: string; secret_cifrato: string; signing_cifrata: string; attivo: boolean | null };
    const righe = (data || []) as R[];

    /* ⚠️ «Magliana W3» e «Magliana Multi» sono lo STESSO bancone con due
       insegne: PayStore ne conosce una sola, e la ricarica può risultare
       battuta sull'altra. `stessoMagazzino` è la regola che il resto del CRM
       usa già per riconoscerli. */
    const cand = righe.filter((r) => r.negozio === negozio || stessoMagazzino(r.negozio, negozio));
    if (!cand.length) {
        return { ok: false, errore: `PayStore non ha credenziali per ${negozio} come ${azienda}. Caricale in Amministrazione → PayStore → Credenziali.` };
    }
    /* ⚠️ SE SONO DUE, CI SI FERMA. Scegliere «la prima» vorrebbe dire tirare a
       indovinare su quale plafond scaricare, ed è esattamente la cosa che non
       si può fare a occhio. */
    if (cand.length > 1) {
        return { ok: false, errore: `per ${negozio} come ${azienda} risultano ${cand.length} credenziali PayStore (${cand.map((c) => c.identificativo).join(", ")}): disattivane una prima di eseguire.` };
    }
    const r = cand[0];
    if (r.attivo === false) return { ok: false, errore: `la credenziale PayStore di ${r.identificativo} è disattivata.` };

    let clientSecret: string, signingKey: string;
    try {
        clientSecret = decifraSegreto(r.secret_cifrato);
        signingKey = decifraSegreto(r.signing_cifrata);
    } catch (e) {
        /* ⚠️ CHIAVE DI CIFRATURA CAMBIATA O ASSENTE. Non è un dettaglio: senza
           `EMAIL_ENC_KEY` le credenziali sul database restano illeggibili e
           vanno ricaricate dal pannello. Meglio dirlo che rispondere «401». */
        return { ok: false, errore: `la credenziale di ${r.identificativo} non è decifrabile (${(e as Error)?.message || "chiave assente o diversa"}): ricaricala dal pannello.` };
    }
    if (!r.client_id || !clientSecret || !signingKey) {
        return { ok: false, errore: `la credenziale di ${r.identificativo} è incompleta: ricaricala dal pannello.` };
    }
    return {
        ok: true, negozio: r.negozio, azienda: r.azienda, identificativo: r.identificativo,
        cred: { clientId: r.client_id, clientSecret, signingKey },
    };
}
