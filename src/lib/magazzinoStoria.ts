/* ═══════════════════════════════════════════════════════════════════════════
   LA STORIA DI UN PEZZO (Luca 31/08)

   «Dalla ricerca seriale devo poter verificare TUTTA la storia di quel
    seriale: se è stato trasferito da un negozio all'altro, quando è stato
    comprato, da quale utente è stato caricato, chi ha inviato il
    trasferimento, chi l'ha accettato e in quale punto vendita, e se è stato
    venduto qual è l'utente che ha fatto la vendita. E devo poter cliccare su
    ogni step: mi dà il dettaglio, ci clicco di nuovo e mi porta al documento.»

   Gli eventi li scrive un TRIGGER su `mag_unita` (migrazione
   20260831140000): qualunque strada tocchi il pezzo, l'evento esce. Qui non
   si registra niente — si LEGGE, e si arricchisce con quello che i documenti
   sanno e l'evento no: chi ha spedito un DDT e chi l'ha accettato stanno su
   `mag_ddt`, il cliente e il totale di una vendita stanno su `contracts`.
   ═══════════════════════════════════════════════════════════════════════════ */

import { supabase } from "@/lib/supabaseClient";

export type EventoPezzo = {
    id: string;
    quando: string;
    evento: string;
    negozio: string | null;
    negozioDa: string | null;
    azienda: string | null;
    operatore: string | null;
    /** a cosa porta il clic: "ddt" | "contratto" | "import" | null */
    documento: string | null;
    documentoId: string | null;
    note: string | null;
    /** quello che il documento aggiunge, quando c'è */
    dettaglio?: Record<string, string | number | null>;
    /** dove portare l'utente al secondo clic */
    vaiA?: string | null;
};

/** Come si chiama un evento quando lo legge una persona. */
export const NOME_EVENTO: Record<string, { et: string; ico: string }> = {
    carico: { et: "Entrato a magazzino", ico: "📥" },
    trasferimento_inviato: { et: "Partito con un DDT", ico: "🚚" },
    trasferimento_accettato: { et: "Arrivato e accettato", ico: "📦" },
    vendita: { et: "Venduto", ico: "🧾" },
    annullato: { et: "Tolto dal magazzino", ico: "🗑" },
    correzione: { et: "Correzione", ico: "✏️" },
    rientro: { et: "Tornato al mittente", ico: "↩️" },
    usato: { et: "Gestione Usati", ico: "♻️" },
};

/** Tutta la storia di un seriale, dal più vecchio al più recente. */
export async function storiaDelPezzo(seriale: string): Promise<EventoPezzo[]> {
    const s = String(seriale || "").trim().toUpperCase();
    if (!s) return [];

    const { data, error } = await supabase.from("mag_eventi")
        .select("id,quando,evento,negozio,negozio_da,azienda,operatore,documento,documento_id,note")
        .eq("seriale", s).order("quando", { ascending: true });
    if (error || !data) return [];

    const eventi: EventoPezzo[] = data.map((r) => ({
        id: r.id, quando: r.quando, evento: r.evento,
        negozio: r.negozio, negozioDa: r.negozio_da, azienda: r.azienda,
        operatore: r.operatore, documento: r.documento, documentoId: r.documento_id,
        note: r.note,
    }));

    /* I DOCUMENTI SANNO COSE CHE L'EVENTO NON SA. Un evento dice «partito con
       un DDT»; il DDT dice il numero, chi l'ha firmato e chi l'ha ricevuto.
       Si leggono in due query sole, non una per riga. */
    const ddtIds = [...new Set(eventi.filter(e => e.documento === "ddt" && e.documentoId).map(e => e.documentoId!))];
    const contrIds = [...new Set(eventi.filter(e => e.documento === "contratto" && e.documentoId).map(e => e.documentoId!))];

    if (ddtIds.length) {
        const { data: d } = await supabase.from("mag_ddt")
            .select("id,numero,da_negozio,a_negozio,stato,creato_da,creato_il,accettato_da,accettato_il,note")
            .in("id", ddtIds);
        const m = new Map((d || []).map((x) => [x.id, x]));
        eventi.forEach(e => {
            const x = e.documentoId && m.get(e.documentoId);
            if (!x) return;
            e.dettaglio = {
                "DDT n.": x.numero,
                "Da": x.da_negozio, "A": x.a_negozio,
                "Spedito da": x.creato_da, "Accettato da": x.accettato_da ?? "— non ancora",
                "Note": x.note ?? null,
            };
            // chi ha fatto QUESTO passo, non chi ha fatto il DDT in generale
            if (e.evento === "trasferimento_inviato") e.operatore = x.creato_da || e.operatore;
            if (e.evento === "trasferimento_accettato") e.operatore = x.accettato_da || e.operatore;
            // il NUMERO, non l'id: è quello che la sezione Trasferimenti sa cercare
            e.vaiA = `/magazzino?ddt=${x.numero ?? ""}`;
        });
    }

    if (contrIds.length) {
        /* `importo` e `margine` NON ESISTONO su `contracts` (verificato sullo
           schema il 31/08): chiederli faceva fallire tutta la query, e
           l'arricchimento delle vendite usciva vuoto in silenzio — la
           cronistoria mostrava «venduto» senza dire da chi né a chi. */
        const { data: c } = await supabase.from("contracts")
            .select("id,brand,prodotto,negozio,venditore,data,data_registrazione,client_id,codice_attivazione")
            .in("id", contrIds);
        const m = new Map((c || []).map((x) => [x.id, x]));
        eventi.forEach(e => {
            const x = e.documentoId && m.get(e.documentoId);
            if (!x) return;
            e.dettaglio = {
                "Brand": x.brand, "Prodotto": x.prodotto,
                "Negozio": x.negozio, "Venditore": x.venditore,
                "Data": x.data_registrazione ? String(x.data_registrazione).slice(0, 10) : x.data,
                "Codice attivazione": x.codice_attivazione,
            };
            e.operatore = x.venditore || e.operatore;
            // la pagina delle vendite legge `?id=`, non `?contratto=` (revisore 31/08)
            e.vaiA = `/ricerca-vendite?id=${x.id}`;
        });
    }

    return eventi;
}

/* ═══ QUELLO CHE SUCCEDE FUORI DAL MAGAZZINO ════════════════════════════
   `mag_eventi` conosce solo i pezzi che dal magazzino ci sono passati. Ma un
   IMEI può avere una vita anche altrove: un telefono ritirato in permuta vive
   in `usati`, e una vendita registrata prima che il magazzino esistesse — o
   un telefono a rate battuto senza pezzo a scaffale — vive solo dentro
   `contracts.dettagli`. Erano le due fonti della vecchia scheda «Ricerca
   seriale»: sparita quella, si sarebbero perse. Qui rientrano nella stessa
   linea del tempo, che è il posto dove uno le cerca. */
async function storiaFuoriMagazzino(s: string): Promise<EventoPezzo[]> {
    const out: EventoPezzo[] = [];
    const t = `%${s}%`;

    const us = await supabase.from("usati")
        .select("id, model, imei, status, store, created_at, sold_date, venditore, status_history")
        .ilike("imei", t).limit(10);
    // un errore letto è un errore che si può raccontare; ingoiarlo faceva dire
    // «non risulta nessun passaggio» su un pezzo che una storia ce l'ha
    if (us.error) console.warn("[storia] usati:", us.error.message);
    for (const u of (us.data ?? []) as Record<string, unknown>[]) {
        const sh = (u.status_history || {}) as Record<string, { date?: string; operatore?: string }>;
        const passaggi = Object.entries(sh);
        // se non ha passaggi, almeno il giorno del ritiro
        const righe = passaggi.length ? passaggi : [["ritirato", { date: String(u.created_at) }] as [string, { date?: string }]];
        righe.forEach(([k, v], i) => out.push({
            id: `usato-${u.id}-${i}`, quando: String(v?.date || u.created_at), evento: "usato",
            negozio: String(u.store || ""), negozioDa: null, azienda: null,
            operatore: (v as { operatore?: string })?.operatore || String(u.venditore || "") || null,
            documento: "usato", documentoId: String(u.id), note: `Gestione Usati · ${k}`,
            dettaglio: { "Modello": String(u.model || ""), "Stato": String(u.status || ""), "Scheda n.": String(u.id) },
            vaiA: `/usati?id=${u.id}`,
        }));
    }

    const ct = await supabase.from("contracts")
        .select("id, venditore, negozio, brand, prodotto, data_registrazione, codice_attivazione")
        .or([`dettagli->>IMEI.ilike.${t}`, `dettagli->>imei.ilike.${t}`,
        `dettagli->>"IMEI TNP".ilike.${t}`, `dettagli->>"IMEI CB".ilike.${t}`,
        `dettagli->units.cs."[{\\"imei\\":\\"${s}\\"}]"`].join(","))
        .limit(10);
    /* L'ESCAPE SI DIMEZZAVA DENTRO IL TEMPLATE (revisore 31/08): con una barra
       sola `\"` diventa `"`, il filtro parte come JSON non valido e PostgREST
       risponde 400 «Token imei is invalid». `data` restava vuoto e — siccome
       l'errore non veniva letto — a schermo usciva il messaggio tranquillo
       «non risulta nessun passaggio» su un pezzo che un contratto ce l'ha.
       È lo stesso guasto silenzioso di `contracts.importo`, rifatto due
       funzioni più sotto: per questo adesso l'errore si LEGGE. */
    if (ct.error) console.warn("[storia] vendite:", ct.error.message);
    for (const c of (ct.data ?? []) as Record<string, unknown>[]) {
        out.push({
            id: `contr-${c.id}`, quando: String(c.data_registrazione || ""), evento: "vendita",
            negozio: String(c.negozio || ""), negozioDa: null, azienda: null,
            operatore: String(c.venditore || "") || null,
            documento: "contratto", documentoId: String(c.id), note: "Registrata in Registra Vendita",
            dettaglio: {
                "Brand": String(c.brand || ""), "Prodotto": String(c.prodotto || ""),
                "Codice attivazione": String(c.codice_attivazione || ""), "Pratica": String(c.id),
            },
            vaiA: `/ricerca-vendite?id=${c.id}`,
        });
    }
    return out;
}

/** La storia completa: il magazzino più quello che gli è successo fuori. */
export async function storiaCompleta(seriale: string): Promise<EventoPezzo[]> {
    const s = String(seriale || "").trim().replace(/[\s./-]/g, "");
    if (!s) return [];
    const [dentro, fuori] = await Promise.all([storiaDelPezzo(seriale), storiaFuoriMagazzino(s)]);
    /* NIENTE DOPPIONI. Una vendita passata dal magazzino esce due volte: come
       evento (il trigger) e come contratto (la ricerca nei dettagli). Vince
       l'evento, che sa anche da quale pezzo è uscita. */
    const gia = new Set(dentro.filter(e => e.documento === "contratto").map(e => e.documentoId));
    const tutti = [...dentro, ...fuori.filter(e => !(e.documento === "contratto" && gia.has(e.documentoId)))];
    tutti.sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
    return tutti;
}

/** Il pezzo, com'è adesso: serve alla testata della scheda. */
export async function pezzoOra(seriale: string) {
    const s = String(seriale || "").trim().toUpperCase();
    if (!s) return null;
    const { data } = await supabase.from("mag_unita")
        .select("id,seriale,tipo_seriale,codice,descrizione,azienda,negozio,stato,valore,prezzo_vendita,caricato_il,caricato_da,venduto_il,venduto_da,contract_id")
        /* NON `maybeSingle()` (revisore 31/08): l'indice unico sul seriale è
           PARZIALE, vale solo per i pezzi vivi. Un telefono venduto e poi
           ricaricato — reso, permuta rimessa a scaffale — fa due righe con lo
           stesso seriale, e `maybeSingle` avrebbe restituito un ERRORE: la
           testata della scheda usciva vuota, senza negozio né stato. Vince la
           più recente. */
        .eq("seriale", s).order("caricato_il", { ascending: false }).limit(1);
    return data?.[0] ?? null;
}
