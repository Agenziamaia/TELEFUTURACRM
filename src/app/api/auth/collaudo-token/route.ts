import { NextResponse } from "next/server";
import { firmaTokenTf } from "@/lib/jwtTf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// COLLAUDO (Blindatura fase B): il database accetta i lasciapassare che il
// server firma? Si prova un token VERO e uno FALSO: il vero deve passare, il
// falso deve essere respinto — se il falso passasse, il test non varrebbe
// nulla. Nessun dato viene esposto: si guardano solo i codici di risposta.
// Endpoint temporaneo, si smonta a cantiere chiuso.
export async function GET(request: Request) {
    // ?tabella=nome → prova la LETTURA di quella tabella in due modi: col
    // lasciapassare (deve vedere) e con la sola chiave pubblica (non deve)
    const tabella = new URL(request.url).searchParams.get("tabella") || "app_users";
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const claim = { uid: "00000000-0000-0000-0000-000000000000", role: "collaudo", admin: false, stores: [] };
    const vero = firmaTokenTf(claim);
    const falso = firmaTokenTf(claim, "questo-non-e-il-segreto-giusto-xxxxxxxxxxxxx");

    const prova = async (token: string | null, tab = "app_users") => {
        try {
            const r = await fetch(`${url}/rest/v1/${encodeURIComponent(tab)}?select=*&limit=3`, {
                headers: token ? { apikey: anon, Authorization: `Bearer ${token}` } : { apikey: anon },
                cache: "no-store",
            });
            let msg: string | null = null, righe: number | null = null;
            if (r.status === 200) { try { righe = (await r.json())?.length ?? null; } catch { /* non json */ } }
            else { try { msg = String((await r.json())?.message || "").slice(0, 90); } catch { /* non json */ } }
            return { http: r.status, righe, nota: msg };
        } catch (e) { return { http: -1, righe: null, nota: String((e as Error).message).slice(0, 90) }; }
    };

    const [v, f, conLasciapassare, soloChiavePubblica] = await Promise.all([
        prova(vero), prova(falso), prova(vero, tabella), prova(null, tabella),
    ]);
    return NextResponse.json({
        tabella,
        con_lasciapassare: conLasciapassare,
        solo_chiave_pubblica: soloChiavePubblica,
        serratura: conLasciapassare.http === 200 && soloChiavePubblica.http === 200 && (soloChiavePubblica.righe ?? 1) === 0 && (conLasciapassare.righe ?? 0) > 0
            ? "🔒 CHIUSA come deve: col lasciapassare si legge, con la sola chiave pubblica no"
            : (soloChiavePubblica.righe ?? 0) > 0
                ? "🔓 APERTA: la chiave pubblica legge ancora"
                : "⚠️ da guardare (vedi righe/http)",
        token_vero: v,
        token_falso: f,
        esito: v.http === 200 && f.http === 401
            ? "✅ I lasciapassare firmati dal server sono accettati, i falsi respinti: si può procedere"
            : v.http !== 200
                ? "❌ Il database NON accetta i nostri lasciapassare: serve il piano alternativo"
                : "⚠️ Il falso NON è stato respinto: il test non è affidabile, fermarsi",
    });
}
