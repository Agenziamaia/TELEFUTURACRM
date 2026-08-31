/* L'INDIRIZZO DI UN FILE, che passa dal custode.
 *
 * Undici depositi su dodici erano pubblici: chiunque, da Internet, scaricava
 * contratti e allegati conoscendo l'indirizzo — e gli indirizzi stanno
 * scritti in chiaro dentro il database. Da qui in avanti si passa da
 * `/api/file/…`, che chiede chi sei prima di consegnare.
 *
 * ⚠️ ACCETTA ANCHE I VECCHI INDIRIZZI, e non è pigrizia: dentro
 * `email_messages.attachments` e `wa_messages.media_url` ce ne sono migliaia
 * salvati com'erano. Riscriverli tutti nel database sarebbe una migrazione
 * lunga, irreversibile e inutile — qui bastano due righe, e il giorno che si
 * cambia deposito non c'è niente da riscrivere.
 */

/** Da qualunque forma — indirizzo pubblico completo, indirizzo firmato, o
 *  «deposito/percorso» — all'indirizzo che passa dal custode.
 *  Restituisce la stringa originale se non riconosce niente: meglio un file
 *  che non si apre di un'immagine che sparisce senza dire perché. */
export function fileUrl(u: string | null | undefined): string {
    const s = String(u || "").trim();
    if (!s) return "";
    // già nostro
    if (s.startsWith("/api/file/")) return s;
    // «.../storage/v1/object/public/<deposito>/<percorso>» — anche `sign` e
    // `authenticated`, che compaiono negli indirizzi firmati
    const m = s.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/(.+?)(?:\?|#|$)/);
    if (m) return "/api/file/" + m[1] + "/" + m[2];
    // già un percorso relativo tipo «contracts/abc/def.pdf»
    if (!/^https?:/i.test(s) && s.includes("/")) return "/api/file/" + s.replace(/^\/+/, "");
    return s;
}

/** Comodo quando deposito e percorso sono già separati. */
export function fileUrlDa(deposito: string, percorso: string): string {
    const p = String(percorso || "").replace(/^\/+/, "");
    return p ? "/api/file/" + deposito + "/" + p : "";
}

/** La strada inversa: da un indirizzo — vecchio o nuovo — al percorso dentro
 *  il deposito. Serve a chi deve CANCELLARE un file, non a chi lo mostra.
 *  ⚠️ Deve conoscere tutte e due le forme: nel database ci sono migliaia di
 *  indirizzi vecchi, e continueranno a esserci. */
export function percorsoDaUrl(u: string | null | undefined, deposito: string): string {
    const s = String(u || "");
    for (const pre of [`/api/file/${deposito}/`, `/object/public/${deposito}/`,
                       `/object/sign/${deposito}/`, `/object/authenticated/${deposito}/`]) {
        const i = s.indexOf(pre);
        if (i >= 0) return decodeURIComponent(s.slice(i + pre.length).split("?")[0]);
    }
    return "";
}
