import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SONDA temporanea per il cantiere BLINDATURA (Luca 28/08): dice SOLO quali
// chiavi server esistono sul VPS — mai i valori. Si smonta a cantiere chiuso.
export async function GET() {
    const c = (v: string | undefined) => !!(v && v.trim());
    return NextResponse.json({
        service_role: c(process.env.SUPABASE_SERVICE_ROLE_KEY) || c(process.env.SERVICE_ROLE_KEY),
        jwt_secret: c(process.env.SUPABASE_JWT_SECRET),
        db_password: c(process.env.SUPABASE_DB_PASSWORD),
        email_enc_key: c(process.env.EMAIL_ENC_KEY),
        sessione_secret: c(process.env.SESSIONE_SECRET),
    });
}
