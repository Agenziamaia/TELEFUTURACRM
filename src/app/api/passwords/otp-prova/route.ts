import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { generaCodice, secondiResidui, chiaveValida } from "@/lib/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* PROVA LA CHIAVE PRIMA DI SALVARLA (Luca 28/08 sera).
   Nessuna libreria al mondo può dire se una chiave dell'autenticatore è
   QUELLA GIUSTA: una stringa di lettere plausibile produce codici altrettanto
   plausibili, e il portale li rifiuterà sempre senza spiegare perché. Si
   cercherebbe il problema nella password, nella rete, nell'utenza — ovunque
   tranne che nella chiave.
   L'unica verifica vera è il confronto: qui si genera il codice di adesso, e
   chi sta configurando lo guarda accanto a quello che l'app o il portale gli
   mostrano in questo momento. Se coincidono, la chiave è giusta. Se no, si
   riprova subito invece di scoprirlo fra una settimana.

   La chiave arriva e se ne va: non si salva niente. */
export async function POST(request: Request) {
    const _g = await accesso(request, "passwords/otp-prova");
    if (!_g.ok) return _g.risposta;

    const b = await request.json().catch(() => ({}));
    const chiave = String(b?.chiave || "").replace(/\s+/g, "").toUpperCase();
    if (!chiave) return NextResponse.json({ error: "Manca la chiave." });
    if (!chiaveValida(chiave)) {
        return NextResponse.json({
            error: "Questa non ha la forma di una chiave: devono essere lettere A-Z e cifre da 2 a 7, almeno 16 caratteri. È quella testuale accanto al QR, non l'indirizzo del portale né l'utenza.",
        });
    }
    const codice = generaCodice(chiave);
    if (!codice) return NextResponse.json({ error: "Non riesco a calcolare il codice da questa chiave." });

    return NextResponse.json({ codice, secondi: secondiResidui() });
}
