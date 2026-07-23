import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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
    try {
        const body = await request.json();
        const { brandId, categoryId, storeId, accessType, username, password } = body ?? {};
        if (!brandId || !categoryId || !storeId || !accessType || !username || password == null || password === "") {
            return NextResponse.json({ error: "Campi obbligatori mancanti" }, { status: 400 });
        }
        const { data, error } = await supabase
            .from("password_credentials")
            .insert({
                brand_id: String(brandId),
                category_id: String(categoryId),
                store_id: String(storeId),
                access_type: String(accessType),
                username: String(username),
                password_encrypted: String(password),
            })
            .select("id")
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ id: data.id });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Internal Server Error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
