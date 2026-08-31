import { NextResponse } from "next/server";
import { serviceRolePresente } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ⚠️ TEMPORANEA — DA CANCELLARE DOPO LA RISPOSTA (31/08).
   Serve a sapere UNA cosa sola: se sul server è configurata la chiave di
   servizio di Supabase. Senza, il custode dei file non può firmare gli
   indirizzi, e chiudere i depositi renderebbe illeggibile ogni allegato
   dell'azienda in un colpo solo — quindi la chiave non si gira al buio.
   Risponde solo sì o no, e solo a chi conosce la parola qui sotto: sapere
   che un server ha poteri elevati non serve a nessuno, ma non lo si regala. */
const PAROLA = "fdfda8f18ac624cf754b54968d4db04a";

export async function GET(request: Request) {
    if (new URL(request.url).searchParams.get("p") !== PAROLA) {
        return NextResponse.json({ error: "no" }, { status: 404 });
    }
    return NextResponse.json({ chiaveDiServizio: serviceRolePresente() });
}
