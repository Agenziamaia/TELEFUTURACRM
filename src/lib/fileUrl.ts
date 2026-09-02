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

/* ═══ CANCELLARE UN FILE, DAL BROWSER ═════════════════════════════════════
   ⚠️ NON SI USA PIÙ `supabase.storage.remove()` DA QUI. Dal 31/08, con i
   depositi chiusi al pubblico, quella chiamata non cancella niente: una DELETE
   con un `where` pretende anche una policy di lettura, e senza nessuna il
   controllo diventa un «falso» fisso. Postgres non protesta — cancella zero
   righe — e il client risponde `200 []`, quindi il codice crede di aver
   fatto e va avanti. Sedici punti del CRM ci sono cascati in silenzio per
   giorni, e nel deposito di transito dei documenti dei clienti sono rimasti
   477 file per 512,7 MB che dovevano sparire subito.

   La cancellazione passa dal custode, come la lettura: stesse regole, stessa
   porta, e un esito che si può guardare. */
export async function eliminaFile(deposito: string, percorso: string): Promise<{ ok: boolean; errore?: string }> {
    const p = String(percorso || "").replace(/^\/+/, "");
    if (!deposito || !p) return { ok: false, errore: "percorso mancante" };
    try {
        const r = await fetch(fileUrlDa(deposito, p), { method: "DELETE" });
        if (r.ok) return { ok: true };
        const j = await r.json().catch(() => ({}));
        return { ok: false, errore: (j as { error?: string })?.error || `errore ${r.status}` };
    } catch (e) {
        return { ok: false, errore: (e as Error)?.message || "cancellazione non riuscita" };
    }
}

/** Come sopra, partendo dall'indirizzo salvato invece che dal percorso. */
export async function eliminaFileDaUrl(url: string | null | undefined, deposito: string) {
    return eliminaFile(deposito, percorsoDaUrl(url, deposito));
}

/** Più file in un colpo, con la stessa forma di `supabase.storage.remove()`
 *  così i punti che la usavano cambiano una parola e basta.
 *  ⚠️ Restituisce `{ error }` come faceva quella — ma stavolta un errore vero
 *  ci arriva davvero, invece di un `200 []` che sembra un successo. */
export async function eliminaFileMulti(deposito: string, percorsi: string[]): Promise<{ error: { message: string } | null }> {
    const esiti = await Promise.all((percorsi || []).map((x) => eliminaFile(deposito, x)));
    const ko = esiti.filter((e) => !e.ok);
    return { error: ko.length ? { message: ko.map((e) => e.errore).join(" · ") } : null };
}
