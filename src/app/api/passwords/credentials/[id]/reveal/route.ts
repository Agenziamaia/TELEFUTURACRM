import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const numericId = parseInt(id, 10);
        if (isNaN(numericId)) {
            return NextResponse.json({ error: "Invalid credential ID" }, { status: 400 });
        }

        // SEC-02: chi rivela arriva dal body (pattern email/send) — prima il
        // log reveal restava anonimo (user_id sempre null). Parse difensivo:
        // il body puo' mancare nei chiamanti legacy.
        const body = await request.json().catch(() => ({}));
        const rawUserId = body?.userId;
        const userId = typeof rawUserId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawUserId) ? rawUserId : null;

        // 1. Fetch the encrypted password
        const { data, error } = await supabase
            .from("password_credentials")
            .select("password_encrypted")
            .eq("id", numericId)
            .single();

        if (error || !data) {
            return NextResponse.json({ error: "Credential not found" }, { status: 404 });
        }

        // 2. Decrypt (In a real app, use AES with PASSWORD_ENCRYPTION_KEY)
        // For now, mirroring the guide but assuming 'password_encrypted' currently stores the string 
        // or we're just returning what's there until encryption logic is fully established.
        // GUIDELINE NOTE: "Never log or expose raw passwords in API responses" except here where explicitly requested.

        // 3. Log the access (SEC-02: ora con l'utente che ha rivelato)
        await supabase.from("password_access_log").insert({
            credential_id: numericId,
            user_id: userId,
            action: "reveal"
        });

        return NextResponse.json({
            password: data.password_encrypted // Decryption should happen here if actually encrypted
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Internal Server Error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
