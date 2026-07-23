import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

// Segnalazione 73: modifica/eliminazione credenziale (Direttore Commerciale in su,
// gate lato UI, coerente con il resto dell'app che applica il RBAC nel client).

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const numericId = parseInt(id, 10);
        if (isNaN(numericId)) {
            return NextResponse.json({ error: "ID non valido" }, { status: 400 });
        }
        const body = await request.json();
        const patch: Record<string, unknown> = {};
        if (body.accessType !== undefined) patch.access_type = String(body.accessType);
        if (body.username !== undefined) patch.username = String(body.username);
        // La password si aggiorna solo se ne viene passata una nuova (non vuota).
        if (body.password !== undefined && body.password !== "") patch.password_encrypted = String(body.password);
        if (body.categoryId !== undefined) patch.category_id = String(body.categoryId);
        if (body.storeId !== undefined) patch.store_id = String(body.storeId);
        if (Object.keys(patch).length === 0) {
            return NextResponse.json({ error: "Nessun campo da aggiornare" }, { status: 400 });
        }
        patch.updated_at = new Date().toISOString();
        const { error } = await supabase.from("password_credentials").update(patch).eq("id", numericId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Internal Server Error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const numericId = parseInt(id, 10);
        if (isNaN(numericId)) {
            return NextResponse.json({ error: "ID non valido" }, { status: 400 });
        }
        // Rimuovo prima le righe di log agganciate (eventuale FK), poi la credenziale.
        await supabase.from("password_access_log").delete().eq("credential_id", numericId);
        const { error } = await supabase.from("password_credentials").delete().eq("id", numericId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Internal Server Error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
