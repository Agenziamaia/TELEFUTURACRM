import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { creaIstanza, statoConnessione, statoIstanza, eliminaIstanza } from "@/lib/evolution";

export const dynamic = "force-dynamic";

// Gestione istanze WhatsApp (un numero = un'istanza). Amministrazione:
//  POST   { action:"create", displayName, ownerUserId }  -> crea + registra
//  POST   { action:"qr", instanceName }                  -> QR/stato per collegare
//  POST   { action:"state", instanceName }               -> stato connessione
//  POST   { action:"delete", instanceName }              -> elimina

export async function GET() {
    // elenco istanze registrate nel CRM (per il pannello admin)
    const { data } = await supabase.from("wa_instances")
        .select("id, instance_name, display_name, owner_user_id, wa_number, status, created_at")
        .order("created_at", { ascending: false });
    return NextResponse.json({ instances: data ?? [] });
}

export async function POST(request: Request) {
    try {
        const b = await request.json();
        const action = b?.action;

        if (action === "create") {
            const display = String(b.displayName || "").trim() || "WhatsApp";
            // nome istanza tecnico: solo lettere/numeri, univoco
            const slug = display.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "wa";
            const instanceName = `tf-${slug}-${Math.random().toString(36).slice(2, 6)}`;
            const res = await creaIstanza(instanceName);
            await supabase.from("wa_instances").insert({
                instance_name: instanceName, display_name: display,
                owner_user_id: b.ownerUserId || null, status: "qr",
            });
            const qr = res?.qrcode?.base64 || res?.qrcode?.code || null;
            return NextResponse.json({ ok: true, instanceName, qr });
        }

        if (action === "qr") {
            const res = await statoConnessione(b.instanceName);
            const qr = res?.base64 || res?.qrcode?.base64 || res?.code || null;
            return NextResponse.json({ ok: true, qr, raw: res });
        }

        if (action === "state") {
            const res = await statoIstanza(b.instanceName);
            const state = res?.instance?.state || res?.state || null;
            if (state === "open") {
                await supabase.from("wa_instances").update({ status: "connessa" }).eq("instance_name", b.instanceName);
            }
            return NextResponse.json({ ok: true, state });
        }

        if (action === "delete") {
            try { await eliminaIstanza(b.instanceName); } catch { /* forse gia' via */ }
            await supabase.from("wa_instances").delete().eq("instance_name", b.instanceName);
            return NextResponse.json({ ok: true });
        }

        return NextResponse.json({ error: "action non valida" }, { status: 400 });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Internal Server Error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
