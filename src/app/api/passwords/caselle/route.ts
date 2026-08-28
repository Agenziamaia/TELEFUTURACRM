import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { PROFILI_OTP } from "@/lib/otpProfili";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* LE CASELLE A CUI AGGANCIARE UN CODICE (Luca 28/08 sera).
   Serve al form della credenziale: «il codice di questa utenza arriva su…».
   Escono solo indirizzo e nome — nessuna impostazione, nessuna password. */
export async function GET(request: Request) {
    const _g = await accesso(request, "passwords/caselle");
    if (!_g.ok) return _g.risposta;

    const { data } = await supabase.from("email_accounts")
        .select("id, email_address, display_name, uso_sistema, status")
        .order("uso_sistema", { ascending: false })      // prima quelle dedicate
        .order("email_address");

    return NextResponse.json({
        caselle: (data || []).map((a) => ({
            id: a.id,
            email: a.email_address,
            nome: a.display_name || null,
            sistema: !!a.uso_sistema,
            attiva: a.status !== "disconnessa",
        })),
        profili: PROFILI_OTP.map((p) => ({ id: p.id, nome: p.nome, descrizione: p.descrizione })),
    });
}
