import { NextResponse } from "next/server";
import { richiedeSessione, rispostaSessioneNonValida } from "@/lib/sessioneServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// SEC-02: identita' dell'agente dichiarata dal client nel body (stesso pattern
// di email/send: sent_by_user_id dal body). Attendibile solo quanto il client,
// finche' non esiste una sessione server (SEC-01b); uuid valido o niente.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asUserId = (v: unknown): string | null => (typeof v === "string" && UUID_RE.test(v) ? v : null);

// SEC-02: riga di audit su password_access_log. Se la colonna `details` non
// esiste ancora (migrazione 20260804130000 non applicata) si ritenta senza,
// per non perdere il log; l'audit non deve MAI far fallire l'operazione.
async function logAudit(credentialId: number | null, userId: string | null, action: string, details: Record<string, unknown>) {
    const { error } = await supabase.from("password_access_log").insert({ credential_id: credentialId, user_id: userId, action, details });
    if (error) await supabase.from("password_access_log").insert({ credential_id: credentialId, user_id: userId, action });
}

export async function GET(request: Request) {
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    {
        const _s = richiedeSessione(request);
        if (!_s) return rispostaSessioneNonValida();
    }

    try {
        const { searchParams } = new URL(request.url);
        const brandId = searchParams.get("brandId");
        const categoryId = searchParams.get("categoryId");
        const storeId = searchParams.get("storeId");

        let query = supabase.from("password_credentials").select("id, brand_id, category_id, store_id, access_type, username");

        if (brandId) query = query.eq("brand_id", brandId);
        if (categoryId) query = query.eq("category_id", categoryId);
        if (storeId && storeId !== "tutti") query = query.eq("store_id", storeId);

        const { data, error } = await query.order("access_type");

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Map to camelCase and ensure passwords are NOT included (already ensured by select)
        const credentials = (data || []).map((c: any) => ({
            id: c.id,
            brandId: c.brand_id,
            categoryId: c.category_id,
            storeId: c.store_id,
            accessType: c.access_type,
            username: c.username,
            passwordMasked: "••••••••••" // Default placeholder for UI
        }));

        return NextResponse.json(credentials);
    } catch (err) {
        const message = err instanceof Error ? err.message : "Internal Server Error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// Segnalazione 73: creazione credenziale (Direttore Commerciale in su, gate lato UI).
export async function POST(request: Request) {
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    {
        const _s = richiedeSessione(request);
        if (!_s) return rispostaSessioneNonValida();
    }

    try {
        const body = await request.json();
        const { brandId, categoryId, storeId, accessType, username, password } = body ?? {};
        if (!brandId || !categoryId || !storeId || !accessType || !username || password == null || password === "") {
            return NextResponse.json({ error: "Campi obbligatori mancanti" }, { status: 400 });
        }
        const userId = asUserId(body?.userId);
        const { data, error } = await supabase
            .from("password_credentials")
            .insert({
                brand_id: String(brandId),
                category_id: String(categoryId),
                store_id: String(storeId),
                access_type: String(accessType),
                username: String(username),
                password_encrypted: String(password),
                created_by: userId, // colonna verificata a DB il 04/08
            })
            .select("id")
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        // SEC-02: storico — solo campi NON segreti, mai il valore della password.
        await logAudit(data.id, userId, "create", {
            brand: String(brandId),
            category: String(categoryId),
            store: String(storeId),
            access_type: String(accessType),
            username: String(username),
        });
        return NextResponse.json({ id: data.id });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Internal Server Error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
