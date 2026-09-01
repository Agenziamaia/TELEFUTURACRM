/* ═══ CHI HA TENUTO IN MANO IL DISPOSITIVO ════════════════════════════════
   DocuSeal l'IP e il browser non li mette nell'API: stanno solo dentro il
   registro delle firme, che però ci portiamo a casa comunque. Da lì si legge
   la riga «User agent:» e si riduce a due parole leggibili.

   La distinzione che conta non è quale browser: è se la firma è stata
   raccolta da un TELEFONO o da un COMPUTER. Il link parte per SMS verso il
   telefono del cliente; se risulta firmato da un PC, quasi sempre vuol dire
   che l'ha aperto il negozio e si è fatto dettare il codice — e a quel punto
   la firma sul documento è di chi teneva il mouse. */

export type Dispositivo = { etichetta: string; daComputer: boolean };

export function dispositivoDaUA(ua: string): Dispositivo | null {
    const u = String(ua || "");
    if (!u) return null;
    const sistema =
        /iPhone/i.test(u) ? "iPhone" :
            /iPad/i.test(u) ? "iPad" :
                /Android/i.test(u) ? "Android" :
                    /Windows/i.test(u) ? "Windows" :
                        /Macintosh|Mac OS X/i.test(u) ? "Mac" :
                            /Linux/i.test(u) ? "Linux" : "";
    const browser =
        /Edg\//i.test(u) ? "Edge" :
            /OPR\/|Opera/i.test(u) ? "Opera" :
                /Chrome\//i.test(u) ? "Chrome" :
                    /Firefox\//i.test(u) ? "Firefox" :
                        /Safari\//i.test(u) ? "Safari" : "";
    if (!sistema && !browser) return null;
    return {
        etichetta: [sistema, browser].filter(Boolean).join(" · "),
        daComputer: sistema === "Windows" || sistema === "Mac" || sistema === "Linux",
    };
}

/** Pesca la riga «User agent:» e la riga «IP:» dal testo del registro. */
export function leggiRegistro(testo: string): { ua: string; ip: string } {
    const piatto = String(testo || "").replace(/\s+/g, " ");
    const ua = /User agent:\s*(Mozilla\/[^]*?)(?:\s+Time zone:|\s+DATA FIRMA|\s+Event Log|$)/i.exec(piatto);
    const ip = /\bIP:\s*([0-9a-fA-F.:]+)/.exec(piatto);
    return { ua: (ua ? ua[1] : "").trim(), ip: ip ? ip[1] : "" };
}
