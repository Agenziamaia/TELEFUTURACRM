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
       Luca 04/09: «non riesco a capire perché alcuni esiti sono utenza non
       corretta e altri hanno anche una scritta prima, recharge_rejected…
       unifica il perché con cellulare non valido». Sono le due frasi con cui
       PayStore dice la stessa cosa, più un prefisso tecnico che compare o no a
       seconda di quale pezzo del nostro codice ha scritto la riga: a schermo
       diventavano tre errori diversi per un problema solo.

       ⚠️ MA PRIMA SI VERIFICA, non si ripete. Misurato sulle cinque righe che
       ce l'hanno: tre hanno NOVE cifre — lì il numero è sbagliato e basta
       dirlo. Due ne hanno dieci, cioè la forma è giusta: quelle non sono state
       scritte male, è il gestore che rifiuta quella linea. Dire «numero
       sbagliato» a chi ha scritto il numero giusto lo manda a ricontrollare una
       cosa che è a posto. */
    if (/utenza non corretta|numero non valido|invalid.*(msisdn|phone)/i.test(t)) {
        if (n && n.length !== 10) {
            return `Cellulare non valido: ha ${n.length} cifre invece di 10. È il numero a essere stato scritto male — non il contratto del cliente. Correggilo e rimandala.`;
        }
        if (n && !n.startsWith("3")) {
            return "Cellulare non valido: un numero di cellulare italiano comincia per 3. Correggilo e rimandala.";
        }
        return "Cellulare non valido secondo l'operatore. Il numero ha la forma giusta (10 cifre), quindi non è un errore di battitura: o la linea è passata a un altro gestore, o non è più attiva. Controlla il gestore scelto prima di rimandarla.";
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
