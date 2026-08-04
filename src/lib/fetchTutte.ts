/**
 * Caricamento COMPLETO oltre il tetto server di PostgREST (max-rows = 1000).
 *
 * LEZIONE (04/08, caso Schmidinger): nessun .limit(5000)/.limit(10000) client
 * supera il tetto — il server tronca comunque a 1000 righe, IN SILENZIO. Con
 * contracts e clients oltre quota, le query "prendo tutto con un limit largo"
 * perdevano le righe piu' recenti: clienti creati e spariti alla vista di chi
 * li aveva creati, pratiche fuori dal Tracking, conteggi target monchi.
 *
 * Uso: passare una funzione che COSTRUISCE la query (gia' con select/filtri e
 * un ORDINAMENTO ESPLICITO — obbligatorio, senza ordine le pagine si
 * sovrappongono) e riceve l'intervallo .range da applicare:
 *
 *   const righe = await caricaTutte<Riga>((from, to) =>
 *       supabase.from("contracts").select("id, negozio").order("id").range(from, to));
 */

type EsitoPagina<T> = { data: T[] | null; error: { message?: string } | null };

const PAGINA = 1000;   // = max-rows del server: una richiesta per pagina piena

export async function caricaTutte<T>(
    query: (from: number, to: number) => PromiseLike<EsitoPagina<T>>,
    maxRighe = 50000,
): Promise<{ data: T[]; error: { message?: string } | null }> {
    const out: T[] = [];
    for (let from = 0; from < maxRighe; from += PAGINA) {
        const { data, error } = await query(from, from + PAGINA - 1);
        if (error) return { data: out, error };   // parziale: il chiamante decide
        const blocco = data ?? [];
        out.push(...blocco);
        if (blocco.length < PAGINA) break;   // pagina corta = finito
    }
    return { data: out, error: null };
}
