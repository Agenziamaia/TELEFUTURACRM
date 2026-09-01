/* ═══ CHI HA TENUTO IN MANO IL DISPOSITIVO ════════════════════════════════
   DocuSeal l'IP e il browser non li mette nell'API: stanno solo dentro il
   registro delle firme, che però ci portiamo a casa comunque. Da lì si legge
   la riga «User agent:» e si riduce a due parole leggibili.

   La distinzione che conta non è quale browser: è se la firma è stata
   raccolta da un TELEFONO o da un COMPUTER. Il link parte per SMS verso il
   telefono del cliente; se risulta firmato da un PC, quasi sempre vuol dire
   che l'ha aperto il negozio e si è fatto dettare il codice — e a quel punto
   la firma sul documento è di chi teneva il mouse.

   ⚠️ TUTTI I DIFETTI QUI SOTTO SBAGLIAVANO NELLA STESSA DIREZIONE: quella
   che NASCONDE la firma raccolta al banco. Per una funzione che serve a
   scoprire, è il modo peggiore di sbagliare. */

export type Dispositivo = { etichetta: string; daComputer: boolean };

export function dispositivoDaUA(ua: string): Dispositivo | null {
    const u = String(ua || "");
    if (!u) return null;

    /* Il segnale vero è il gettone «Mobile»/«Tablet», non il nome del
       sistema: da iPadOS 13 Safari si presenta come «Macintosh; Intel Mac
       OS X», identico a un Mac. Prima l'iPad del cliente veniva accusato di
       essere il computer del negozio; e un Chromebook del negozio, che dice
       «CrOS» e non «Linux», non veniva segnalato affatto. */
    const mobile = /\bMobile\b|\bTablet\b|iPhone|iPod|Android/i.test(u);
    const sistema =
        /iPhone|iPod/i.test(u) ? "iPhone" :
            /iPad/i.test(u) ? "iPad" :
                /Android/i.test(u) ? "Android" :
                    /CrOS/i.test(u) ? "Chromebook" :
                        /Windows/i.test(u) ? "Windows" :
                            /Macintosh|Mac OS X/i.test(u) ? (mobile ? "iPad" : "Mac") :
                                /Linux/i.test(u) ? "Linux" : "";
    const browser =
        /Edg\//i.test(u) ? "Edge" :
            /OPR\/|Opera/i.test(u) ? "Opera" :
                /Chrome\//i.test(u) ? "Chrome" :
                    /Firefox\//i.test(u) ? "Firefox" :
                        /Safari\//i.test(u) ? "Safari" : "";
    if (!sistema && !browser) return null;

    const daComputer = !mobile && (sistema === "Windows" || sistema === "Mac" || sistema === "Linux" || sistema === "Chromebook");
    return {
        // il Mac senza gettone mobile può anche essere un iPad in modalità
        // desktop: si dice, invece di far finta di saperlo
        etichetta: [sistema === "Mac" ? "Mac (o iPad in modalità desktop)" : sistema, browser].filter(Boolean).join(" · "),
        daComputer,
    };
}

/** Pesca la riga «User agent:» e la riga «IP:» dal testo del registro.
 *  ⚠️ Legata ai marcatori: senza, la cattura si mangiava TUTTO il registro
 *  e bastava che «Android» comparisse una volta in un evento qualsiasi per
 *  far vincere il telefono sul computer. */
export function leggiRegistro(testo: string): { ua: string; ip: string } {
    const piatto = String(testo || "").replace(/\s+/g, " ");
    const ua = /User agent:\s*(Mozilla\/.{0,400}?)(?:\s+Time zone:|\s+DATA FIRMA|\s+Event Log|\s+Audit Log)/i.exec(piatto);
    const ip = /\bIP:\s*((?:\d{1,3}\.){3}\d{1,3}|[0-9a-fA-F:]{6,})/.exec(piatto);
    return { ua: (ua ? ua[1] : "").trim(), ip: ip ? ip[1] : "" };
}
