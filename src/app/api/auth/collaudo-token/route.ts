import { NextResponse } from "next/server";
import { firmaTokenTf } from "@/lib/jwtTf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// COLLAUDO (Blindatura fase B): il database accetta i lasciapassare che il
// server firma? Si prova un token VERO e uno FALSO: il vero deve passare, il
// falso deve essere respinto — se il falso passasse, il test non varrebbe
// nulla. Nessun dato viene esposto: si guardano solo i codici di risposta.
// Endpoint temporaneo, si smonta a cantiere chiuso.
export async function GET() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const claim = { uid: "00000000-0000-0000-0000-000000000000", role: "collaudo", admin: false, stores: [] };
    const vero = firmaTokenTf(claim);
    const falso = firmaTokenTf(claim, "questo-non-e-il-segreto-giusto-xxxxxxxxxxxxx");

    const prova = async (token: string | null) => {
        if (!token) return { http: 0, nota: "token non firmato" };
        try {
            const r = await fetch(`${url}/rest/v1/app_users?select=id&limit=1`, {
                headers: { apikey: anon, Authorization: `Bearer ${token}` },
                cache: "no-store",
            });
            let msg: string | null = null;
            if (r.status !== 200) { try { msg = String((await r.json())?.message || "").slice(0, 90); } catch { /* corpo non json */ } }
            return { http: r.status, nota: msg };
        } catch (e) { return { http: -1, nota: String((e as Error).message).slice(0, 90) }; }
    };

    const [v, f] = await Promise.all([prova(vero), prova(falso)]);
    return NextResponse.json({
        token_vero: v,
        token_falso: f,
        esito: v.http === 200 && f.http === 401
            ? "✅ I lasciapassare firmati dal server sono accettati, i falsi respinti: si può procedere"
            : v.http !== 200
                ? "❌ Il database NON accetta i nostri lasciapassare: serve il piano alternativo"
                : "⚠️ Il falso NON è stato respinto: il test non è affidabile, fermarsi",
    });
}
