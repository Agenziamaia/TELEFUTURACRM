/* ═══ TRADURRE UN ERRORE DI PAYSTORE IN ITALIANO ═══════════════════════════
   Luca 04/09, davanti a una riga rossa che diceva «Utenza non Corretta»:
   «però le utenze sono tutte corrette… ah, ma tu per utenza intendi il numero
   di cellulare — devi specificare numero cellulare non corretto».

   Ha ragione due volte. «Utenza» in bocca a un operatore telefonico vuol dire
   il numero, ma in negozio «utenza» è il contratto del cliente: chi legge va a
   controllare l'anagrafica invece di guardare le cifre del numero. E i
   messaggi arrivano come li scrive PayStore — a volte con un prefisso tecnico
   davanti («recharge_rejected:»), a volte no, con le maiuscole a caso.

   ⚠️ SI TRADUCE, NON SI NASCONDE. Il testo originale resta nel suggerimento:
   se un giorno bisogna aprire un ticket con PayStore, quella è la frase che
   loro riconoscono. Qui sopra ci va quella che dice cosa fare. */

/** Il messaggio da mostrare, e — quando si può — cosa c'è che non va davvero. */
export function erroreLeggibile(errore: string | null | undefined, numero?: string | null): string {
    const e = String(errore || "").trim();
    if (!e) return "";
    /* via il prefisso tecnico: al banco non aggiunge niente */
    const t = e.replace(/^recharge_rejected:\s*/i, "").trim();
    const n = String(numero || "").replace(/\D/g, "");

    /* ═══ «UTENZA NON CORRETTA» E «NUMERO NON VALIDO» SONO LA STESSA COSA ═══
       Luca 04/09: «unifica il perché con cellulare non valido». Sono le due
       frasi con cui PayStore dice lo stesso rifiuto, più un prefisso tecnico
       che compariva o no a seconda di quale pezzo del nostro codice aveva
       scritto la riga: tre errori diversi a schermo per un problema solo.

       ⚠️ E QUI C'ERA UN CONTROLLO SBAGLIATO, tolto il 04/09 la sera. Diceva
       «ha 9 cifre invece di 10, il numero è scritto male». È falso: i numeri
       storici italiani — le serie 33x e 36x — hanno NOVE cifre e sono
       validissimi. Misurato sul nostro archivio: di sei numeri a nove cifre,
       TRE sono stati ricaricati senza problemi (336744872 operazione 946506,
       360962988 fatta dal motore, 336765099 a mano) e tre rifiutati. La
       lunghezza non decide niente, e un messaggio che manda a «correggere» un
       numero giusto fa perdere tempo due volte — che è esattamente il difetto
       che questa traduzione doveva togliere.

       Quindi non si indovina il motivo: si dice cosa è successo e le due cose
       da guardare, il numero e il gestore scelto. Che sono le uniche due su cui
       si può intervenire. */
    if (/utenza non corretta|numero non valido|invalid.*(msisdn|phone)/i.test(t)) {
        return "Cellulare non valido per l'operatore: il gestore non riconosce questo numero. "
            + "Controlla le cifre e soprattutto il GESTORE scelto — se la linea è passata a un altro operatore, "
            + "la ricarica va fatta su quello. Poi rimandala.";
    }
    if (/non autorizzata dall'azienda|posizione cliente/i.test(t)) {
        return "Il gestore rifiuta la ricarica su questa linea (posizione del cliente): la linea può essere sospesa, bloccata o non più attiva. Non dipende da noi — il cliente deve sentire il suo operatore.";
    }
    if (/internal error/i.test(t)) {
        return "Errore interno di PayStore: non dipende dal numero né da noi. Si può rifare così com'è.";
    }
    if (/invalid_client|credenziali/i.test(t)) {
        return "PayStore non riconosce le credenziali di questo negozio: la ricarica non è partita e il numero non c'entra. Vanno ricaricate in Amministrazione → PayStore → Credenziali.";
    }
    if (/riga doppia/i.test(t)) {
        return "Ce n'è un'altra identica sullo stesso scontrino: il motore non le fa da solo, sarebbero due crediti. Controlla e fai partire a mano quella giusta.";
    }
    if (/saldo|plafond|insufficient/i.test(t)) {
        return "Plafond esaurito su questo punto vendita: va ricaricato prima di poter erogare.";
    }
    if (/taglio|price ?list/i.test(t)) {
        return `${t}. Il taglio va aggiunto a listino, o l'importo corretto.`;
    }
    /* uno che non conosciamo: si mostra com'è, senza fingere di saperlo */
    return t;
}
