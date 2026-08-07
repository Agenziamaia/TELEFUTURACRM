import { NextResponse } from "next/server";
import { computeContoEconomico } from "@/lib/contoEconomico";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ce/dataset?mese=YYYY-MM[&dettagli=1]
// Il conto economico per punto vendita del mese, calcolato LIVE dal motore
// condiviso (src/lib/contoEconomico.ts) — lo stesso che userà il deck builder
// delle riunioni. Con la fase snapshot (mig. 191) qui arriverà anche il
// congelato del mese (&live=1 forzerà il ricalcolo).
export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const oggi = new Date();
        const meseDefault = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, "0")}`;
        const mese = url.searchParams.get("mese") || meseDefault;
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mese)) {
            return NextResponse.json({ error: "mese non valido (atteso YYYY-MM)" }, { status: 400 });
        }
        const dettagli = url.searchParams.get("dettagli") === "1";
        const dataset = await computeContoEconomico(mese, { dettagli });
        return NextResponse.json(dataset);
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "errore" }, { status: 500 });
    }
}
