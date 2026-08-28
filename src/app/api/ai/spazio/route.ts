import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* LO SPAZIO PERSONALE DELL'ASSISTENTE (Luca 28/08 sera).
   Chat, progetti e preferenze di UNA persona: quella della sessione. L'id
   dell'utente non arriva mai dal browser — così nessuno può leggere o
   scrivere nello spazio di un altro nemmeno provandoci. */

const mio = (uid: string) => ({ user_id: uid });

export async function GET(request: Request) {
    // 🔒 sessione + permesso della sezione, come nel pannello
    const _g = await accesso(request, "ai/spazio");
    if (!_g.ok) return _g.risposta;
    const s = _g.sess;
    const url = new URL(request.url);
    const cosa = url.searchParams.get("cosa") || "tutto";

    if (cosa === "conversazione") {
        // i messaggi di una conversazione (solo se è mia)
        const id = url.searchParams.get("id") || "";
        const { data: conv } = await supabase.from("ai_conversazioni")
            .select("*").eq("id", id).eq("user_id", s.id).maybeSingle();
        if (!conv) return NextResponse.json({ error: "Conversazione non trovata" });
        const { data: messaggi } = await supabase.from("ai_messaggi")
            .select("id, ruolo, contenuto, allegati, meta, created_at")
            .eq("conversazione_id", id).eq("user_id", s.id).order("created_at");
        return NextResponse.json({ conversazione: conv, messaggi: messaggi || [] });
    }

    // il quadro completo: progetti, conversazioni recenti, preferenze
    const [prog, conv, pref] = await Promise.all([
        supabase.from("ai_progetti").select("*").eq("user_id", s.id).eq("archiviato", false).order("updated_at", { ascending: false }),
        supabase.from("ai_conversazioni").select("id, titolo, progetto_id, fissata, ultimo_messaggio_at")
            .eq("user_id", s.id).eq("archiviata", false).order("ultimo_messaggio_at", { ascending: false }).limit(120),
        supabase.from("ai_preferenze").select("*").eq("user_id", s.id).maybeSingle(),
    ]);
    return NextResponse.json({
        progetti: prog.data || [],
        conversazioni: conv.data || [],
        preferenze: pref.data || null,
    });
}

export async function POST(request: Request) {
    // 🔒 sessione + permesso della sezione, come nel pannello
    const _g = await accesso(request, "ai/spazio");
    if (!_g.ok) return _g.risposta;
    const s = _g.sess;
    const b = await request.json().catch(() => ({}));
    const azione = String(b?.azione || "");

    // ── PROGETTI ────────────────────────────────────────────────────────
    if (azione === "progetto_nuovo") {
        const { data, error } = await supabase.from("ai_progetti")
            .insert({ ...mio(s.id), nome: String(b.nome || "Nuovo progetto").slice(0, 80), emoji: b.emoji || null, colore: b.colore || null, istruzioni: b.istruzioni || null })
            .select().single();
        return NextResponse.json(error ? { error: error.message } : { progetto: data });
    }
    if (azione === "progetto_salva") {
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const k of ["nome", "emoji", "colore", "istruzioni", "archiviato"]) if (b[k] !== undefined) patch[k] = b[k];
        const { error } = await supabase.from("ai_progetti").update(patch).eq("id", b.id).eq("user_id", s.id);
        return NextResponse.json(error ? { error: error.message } : { ok: true });
    }
    if (azione === "progetto_elimina") {
        // le conversazioni non si perdono: restano, senza progetto
        await supabase.from("ai_conversazioni").update({ progetto_id: null }).eq("progetto_id", b.id).eq("user_id", s.id);
        const { error } = await supabase.from("ai_progetti").delete().eq("id", b.id).eq("user_id", s.id);
        return NextResponse.json(error ? { error: error.message } : { ok: true });
    }

    // ── CONVERSAZIONI ───────────────────────────────────────────────────
    if (azione === "chat_nuova") {
        const { data, error } = await supabase.from("ai_conversazioni")
            .insert({ ...mio(s.id), progetto_id: b.progettoId || null, titolo: b.titolo || null })
            .select().single();
        return NextResponse.json(error ? { error: error.message } : { conversazione: data });
    }
    if (azione === "chat_salva") {
        const patch: Record<string, unknown> = {};
        for (const k of ["titolo", "progetto_id", "archiviata", "fissata"]) if (b[k] !== undefined) patch[k] = b[k];
        const { error } = await supabase.from("ai_conversazioni").update(patch).eq("id", b.id).eq("user_id", s.id);
        return NextResponse.json(error ? { error: error.message } : { ok: true });
    }
    if (azione === "chat_elimina") {
        const { error } = await supabase.from("ai_conversazioni").delete().eq("id", b.id).eq("user_id", s.id);
        return NextResponse.json(error ? { error: error.message } : { ok: true });
    }

    // ── PREFERENZE (personalità, memorie) ───────────────────────────────
    if (azione === "preferenze_salva") {
        const riga = {
            user_id: s.id,
            personalita: b.personalita ?? null,
            memorie: b.memorie ?? null,
            nome_assistente: b.nomeAssistente ?? null,
            aggiornato_at: new Date().toISOString(),
        };
        const { error } = await supabase.from("ai_preferenze").upsert(riga, { onConflict: "user_id" });
        return NextResponse.json(error ? { error: error.message } : { ok: true });
    }

    return NextResponse.json({ error: "Azione non riconosciuta" });
}
