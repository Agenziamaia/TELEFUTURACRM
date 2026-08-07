import { NextResponse } from "next/server";
import { computeContoEconomico } from "@/lib/contoEconomico";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/riunione/dataset?mese=YYYY-MM — il PACCHETTO dati della riunione
 * mensile (deck builder fase 0, docs/PIANO_DECK_BUILDER_RIUNIONI.md).
 * Calcolato con le STESSE funzioni delle pagine: oggi conto economico PV
 * (ricavi per brand a listino compensi, marginalità, costi, riparto
 * telefonico, utile) + produzione a pezzi per negozio×brand; le prossime
 * anime (target gare, caller, classifiche) si AGGIUNGONO qui, mai nei prompt.
 *
 * REGOLE STRUTTURALI (vivono nell'endpoint, non nei prompt di regia):
 *  - esclusioni dalle classifiche di venditori (persone che NON devono MAI
 *    comparire in graduatorie o analisi paletto) — vedi ESCLUSI_CLASSIFICHE;
 *  - i gap riservati sulle soglie comunicate NON passano MAI da qui.
 *
 * Il dataset si CONGELA nel deck (tabella riunione_deck): questo endpoint
 * serve il live per la creazione e per l'azione esplicita "🔄 Aggiorna dati".
 */

// Venditori mai in classifica (regola permanente di Luca, GUIDA_Riunione §5).
// Il confronto è per nome ESATTO sul punto vendita: gli omonimi di altri
// negozi (es. "Marta3" di Castani) restano regolarmente in graduatoria.
const ESCLUSI_CLASSIFICHE = [{ nome: "Marta", negozio: "Promontori" }];

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const oggi = new Date();
        const meseDefault = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, "0")}`;
        const mese = url.searchParams.get("mese") || meseDefault;
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mese)) {
            return NextResponse.json({ error: "mese non valido (atteso YYYY-MM)" }, { status: 400 });
        }
        const ce = await computeContoEconomico(mese, { dettagli: false });
        return NextResponse.json({
            mese,
            generato_il: new Date().toISOString(),
            regole: { esclusi_classifiche: ESCLUSI_CLASSIFICHE },
            ce,
        });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "errore" }, { status: 500 });
    }
}
