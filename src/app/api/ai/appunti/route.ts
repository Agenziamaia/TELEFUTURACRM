import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GLI APPUNTI, E IL LORO RITORNO (Luca 28/08 sera).
   «Lo useranno anche per cose extra-lavorative, per lasciarsi appunti in
   qualsiasi momento della giornata.»

   Il ciclo che rende insostituibile un assistente: lasci una cosa in due
   secondi → la ritrovi quando serve, senza averla cercata → e quindi lasci la
   prossima. Qui vivono i due capi del ciclo.

   L'identità viene SEMPRE dalla sessione firmata: un appunto è la cosa più
   personale che c'è dentro il CRM, e nessuno deve poterne scrivere o leggere
   uno a nome di un altro. */

const QUANDO: Record<string, () => Date> = {
    stasera: () => { const d = new Date(); d.setHours(20, 0, 0, 0); return d; },
    domani: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; },
    lunedi: () => {
        const d = new Date();
        d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
        d.setHours(9, 0, 0, 0);
        return d;
    },
    settimana: () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d; },
};

export async function GET(request: Request) {
    const _g = await accesso(request, "ai/appunti");
    if (!_g.ok) return _g.risposta;
    const s = _g.sess;

    const [tutti, daRestituire] = await Promise.all([
        supabase.from("ai_appunti").select("id, testo, ricorda_il, restituito_at, origine, created_at")
            .eq("user_id", s.id).order("created_at", { ascending: false }).limit(60),
        // quelli la cui ora è arrivata e che non gli ho ancora riportato davanti
        supabase.from("ai_appunti").select("id, testo, ricorda_il, created_at")
            .eq("user_id", s.id).is("restituito_at", null)
            .not("ricorda_il", "is", null).lte("ricorda_il", new Date().toISOString())
            .order("ricorda_il").limit(5),
    ]);

    return NextResponse.json({
        appunti: tutti.data || [],
        daRestituire: daRestituire.data || [],
    });
}

export async function POST(request: Request) {
    const _g = await accesso(request, "ai/appunti");
    if (!_g.ok) return _g.risposta;
    const s = _g.sess;
    const b = await request.json().catch(() => ({}));
    const azione = String(b?.azione || "nuovo");

    if (azione === "nuovo") {
        const testo = String(b.testo || "").trim();
        if (!testo) return NextResponse.json({ error: "L'appunto è vuoto." });
        // «ricordamelo stasera / domani / lunedì»: una promessa, non un allarme
        const quando = b.quando && QUANDO[String(b.quando)] ? QUANDO[String(b.quando)]() : null;
        const { data, error } = await supabase.from("ai_appunti").insert({
            user_id: s.id,
            testo: testo.slice(0, 4000),
            ricorda_il: quando ? quando.toISOString() : null,
            origine: String(b.origine || "").slice(0, 60) || null,
        }).select("id, testo, ricorda_il, created_at").single();
        return NextResponse.json(error ? { error: error.message } : { appunto: data });
    }

    if (azione === "visto") {
        // gliel'ho riportato davanti: non deve tornare una seconda volta
        const { error } = await supabase.from("ai_appunti")
            .update({ restituito_at: new Date().toISOString() })
            .eq("id", b.id).eq("user_id", s.id);
        return NextResponse.json(error ? { error: error.message } : { ok: true });
    }

    if (azione === "elimina") {
        const { error } = await supabase.from("ai_appunti").delete().eq("id", b.id).eq("user_id", s.id);
        return NextResponse.json(error ? { error: error.message } : { ok: true });
    }

    return NextResponse.json({ error: "Azione non riconosciuta" });
}
