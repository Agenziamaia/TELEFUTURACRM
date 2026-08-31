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
};

const eur = (v: unknown) => v == null ? null : Number(v).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

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
            e.vaiA = `/magazzino?ddt=${x.id}`;
        });
    }

    if (contrIds.length) {
        const { data: c } = await supabase.from("contracts")
            .select("id,brand,prodotto,negozio,venditore,data,client_id,importo,margine")
            .in("id", contrIds);
        const m = new Map((c || []).map((x) => [x.id, x]));
        eventi.forEach(e => {
            const x = e.documentoId && m.get(e.documentoId);
            if (!x) return;
            e.dettaglio = {
                "Brand": x.brand, "Prodotto": x.prodotto,
                "Negozio": x.negozio, "Venditore": x.venditore,
                "Data": x.data, "Importo": eur(x.importo),
            };
            e.operatore = x.venditore || e.operatore;
            e.vaiA = `/ricerca-vendite?contratto=${x.id}`;
        });
    }

    return eventi;
}

/** Il pezzo, com'è adesso: serve alla testata della scheda. */
export async function pezzoOra(seriale: string) {
    const s = String(seriale || "").trim().toUpperCase();
    if (!s) return null;
    const { data } = await supabase.from("mag_unita")
        .select("id,seriale,tipo_seriale,codice,descrizione,azienda,negozio,stato,valore,caricato_il,caricato_da,venduto_il,venduto_da,contract_id")
        .eq("seriale", s).maybeSingle();
    return data ?? null;
}
