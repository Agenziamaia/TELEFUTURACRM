import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { puoVederePassword } from "@/lib/passwordPermessi";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// Segnalazione 73: modifica/eliminazione credenziale (Direttore Commerciale in su,
// gate lato UI, coerente con il resto dell'app che applica il RBAC nel client).

// SEC-02: identita' dell'agente dichiarata dal client nel body (stesso pattern
// di email/send). Attendibile solo quanto il client, finche' non esiste una
// sessione server (SEC-01b); uuid valido o niente.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asUserId = (v: unknown): string | null => (typeof v === "string" && UUID_RE.test(v) ? v : null);

// SEC-02: riga di audit su password_access_log. Se la colonna `details` non
// esiste ancora (migrazione 20260804130000 non applicata) si ritenta senza,
// per non perdere il log; l'audit non deve MAI far fallire l'operazione.
async function logAudit(credentialId: number | null, userId: string | null, action: string, details: Record<string, unknown>) {
    const { error } = await supabase.from("password_access_log").insert({ credential_id: credentialId, user_id: userId, action, details });
    if (error) await supabase.from("password_access_log").insert({ credential_id: credentialId, user_id: userId, action });
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    {
        // 🔒 sessione firmata + permesso della sezione, come nel pannello
        const _g = await accesso(request, "passwords/credentials/[id]");
        if (!_g.ok) return _g.risposta;
        const _s = _g.sess;
        // 🔒 il caveau è riservato ai ruoli previsti, non a tutti i loggati
        const _p = await puoVederePassword(_s.id);
        if (!_p.ok) return NextResponse.json({ error: "Non hai i permessi per le password aziendali" }, { status: 403 });
    }

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
        const userId = asUserId(body?.userId);
        // SEC-02: fotografia PRIMA della modifica per il diff dei campi non
        // segreti (la password non si legge nemmeno qui).
        const { data: prev } = await supabase
            .from("password_credentials")
            .select("brand_id, category_id, store_id, access_type, username")
            .eq("id", numericId)
            .single();
        patch.updated_at = new Date().toISOString();
        if (userId) patch.updated_by = userId; // colonna verificata a DB il 04/08
        const { error } = await supabase.from("password_credentials").update(patch).eq("id", numericId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        // SEC-02: storico — diff vecchio→nuovo dei campi NON segreti; della
        // password SOLO il marcatore 'modificata', mai il valore.
        if (prev) {
            const modifiche: Record<string, unknown> = {};
            if (patch.access_type !== undefined && patch.access_type !== prev.access_type) modifiche.access_type = { da: prev.access_type, a: patch.access_type };
            if (patch.username !== undefined && patch.username !== prev.username) modifiche.username = { da: prev.username, a: patch.username };
            if (patch.category_id !== undefined && patch.category_id !== prev.category_id) modifiche.category = { da: prev.category_id, a: patch.category_id };
            if (patch.store_id !== undefined && patch.store_id !== prev.store_id) modifiche.store = { da: prev.store_id, a: patch.store_id };
            if (patch.password_encrypted !== undefined) modifiche.password = "modificata";
            // Salvataggio senza cambiamenti reali (form riaperto e richiuso): niente riga.
            if (Object.keys(modifiche).length > 0) {
                await logAudit(numericId, userId, "update", {
                    brand: prev.brand_id,
                    category: (patch.category_id as string) ?? prev.category_id,
                    store: (patch.store_id as string) ?? prev.store_id,
                    access_type: (patch.access_type as string) ?? prev.access_type,
                    username: (patch.username as string) ?? prev.username,
                    modifiche,
                });
            }
        }
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
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    {
        // 🔒 sessione firmata + permesso della sezione, come nel pannello
        const _g = await accesso(request, "passwords/credentials/[id]");
        if (!_g.ok) return _g.risposta;
        const _s = _g.sess;
        // 🔒 il caveau è riservato ai ruoli previsti, non a tutti i loggati
        const _p = await puoVederePassword(_s.id);
        if (!_p.ok) return NextResponse.json({ error: "Non hai i permessi per le password aziendali" }, { status: 403 });
    }

    try {
        const { id } = await params;
        const numericId = parseInt(id, 10);
        if (isNaN(numericId)) {
            return NextResponse.json({ error: "ID non valido" }, { status: 400 });
        }
        // SEC-02: il body puo' mancare (chiamanti legacy) — parse difensivo.
        const body = await request.json().catch(() => ({}));
        const userId = asUserId(body?.userId);
        // Fotografia della credenziale: dopo il DELETE non esiste piu' e lo
        // storico deve poter dire COSA e' stato eliminato.
        const { data: prev } = await supabase
            .from("password_credentials")
            .select("brand_id, category_id, store_id, access_type, username")
            .eq("id", numericId)
            .single();
        // Audit PRIMA dell'eliminazione: se la FK ad hoc sul log e' ancora in
        // piedi (mig. 20260804130000 non applicata) la riga deve riferire una
        // credenziale viva.
        if (prev) {
            await logAudit(numericId, userId, "delete", {
                brand: prev.brand_id,
                category: prev.category_id,
                store: prev.store_id,
                access_type: prev.access_type,
                username: prev.username,
            });
        }
        const { error } = await supabase.from("password_credentials").delete().eq("id", numericId);
        if (error) {
            // FK ad hoc ancora presente: ripiego legacy — si purga il log della
            // credenziale e si riprova (lo storico si perde SOLO finche' la
            // migrazione non e' applicata; dopo, il primo delete riesce).
            await supabase.from("password_access_log").delete().eq("credential_id", numericId);
            const retry = await supabase.from("password_credentials").delete().eq("id", numericId);
            if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 500 });
        }
        return NextResponse.json({ ok: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Internal Server Error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
