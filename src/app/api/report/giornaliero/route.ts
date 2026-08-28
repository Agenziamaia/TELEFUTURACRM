import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { datiGiornata } from "@/lib/report/datiGiornata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* I NUMERI DEL REPORT SERALE (Luca 28/08).
   Il negozio preme «Report» nella Chiusura e vede la sua giornata. I dati si
   compongono qui, sul server: il report riguarda il punto vendita intero — non
   solo le vendite di chi sta guardando — e il conto dev'essere lo stesso per
   tutti quelli che lo aprono. */
export async function GET(request: Request) {
    const _g = await accesso(request, "report/giornaliero");
    if (!_g.ok) return _g.risposta;

    const url = new URL(request.url);
    const negozio = String(url.searchParams.get("negozio") || "").trim();
    const giorno = String(url.searchParams.get("giorno") || "").trim()
        || new Date().toISOString().slice(0, 10);
    if (!negozio) return NextResponse.json({ error: "Manca il negozio." });

    try {
        const dati = await datiGiornata(negozio, giorno);
        return NextResponse.json({ dati });
    } catch (e) {
        return NextResponse.json({ error: "Non riesco a comporre il report: " + ((e as Error)?.message || "errore") });
    }
}
