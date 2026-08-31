import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { saldoFerieDaTesto, testoPdf } from "@/lib/bustaPaga";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/* LEGGE IL SALDO FERIE DALLE BUSTE PAGA (Luca 31/08).
 *
 * «Il residuo di ferie sta dentro la busta paga»: infatti. In fondo al
 * cedolino c'è il riquadro RATEI e la riga FERIE, col saldo in giorni.
 *
 * POST { mese: "2026-07-01", dryRun?: true }
 *   dryRun → dice che cosa ha letto, senza scrivere niente. È il modo di
 *   guardare prima di fidarsi, e resta utile ogni volta che l'elaborazione
 *   paghe cambia il formato del cedolino.
 */
export async function POST(req: Request) {
    const _g = await accesso(req, "ferie/leggi-buste");
    if (!_g.ok) return _g.risposta;
    const b: Record<string, unknown> = await req.json().catch(() => ({}));
    const mese = typeof b?.mese === "string" && /^\d{4}-\d{2}-01$/.test(b.mese) ? b.mese : null;
    if (!mese) return NextResponse.json({ error: "serve il mese, nella forma AAAA-MM-01" }, { status: 400 });
    const prova = !!b?.dryRun;

    const { data: buste, error } = await supabase.from("user_attachments")
        .select("id, user_id, file_name, storage_path")
        .eq("category", "busta_paga").eq("mese", mese).not("storage_path", "is", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 503 });
    if (!buste?.length) return NextResponse.json({ ok: true, mese, buste: 0, esiti: [] });

    const { data: utenti } = await supabase.from("app_users").select("id, full_name");
    const nomeDi = new Map(((utenti ?? []) as { id: string; full_name: string }[]).map((u) => [u.id, u.full_name]));

    const esiti: { persona: string; file: string; giorni: number | null; riga: string | null; motivo?: string }[] = [];
    const daScrivere: { user_id: string; mese: string; giorni: number; fonte: string; note: string }[] = [];
    for (const busta of buste as { id: string; user_id: string; file_name: string; storage_path: string }[]) {
        const persona = nomeDi.get(busta.user_id) || busta.user_id;
        try {
            const { data: file, error: eF } = await supabase.storage.from("user-attachments").download(busta.storage_path);
            if (eF || !file) { esiti.push({ persona, file: busta.file_name, giorni: null, riga: null, motivo: "file non scaricabile" }); continue; }
            const testo = await testoPdf(new Uint8Array(await file.arrayBuffer()));
            const s = saldoFerieDaTesto(testo);
            esiti.push({ persona, file: busta.file_name, giorni: s.giorni, riga: s.riga, motivo: s.motivo });
            if (s.giorni != null) daScrivere.push({
                user_id: busta.user_id, mese, giorni: s.giorni, fonte: "busta_paga",
                note: `letto dalla busta paga «${busta.file_name}»`,
            });
        } catch (e) {
            esiti.push({ persona, file: busta.file_name, giorni: null, riga: null, motivo: e instanceof Error ? e.message : "PDF non leggibile" });
        }
    }

    if (!prova && daScrivere.length) {
        const { error: eW } = await supabase.from("ferie_residue").upsert(daScrivere, { onConflict: "user_id,mese" });
        if (eW) return NextResponse.json({ ok: false, errore: eW.message, esiti }, { status: 503 });
    }
    return NextResponse.json({
        ok: true, mese, prova, buste: buste.length,
        letti: esiti.filter((e) => e.giorni != null).length,
        nonLetti: esiti.filter((e) => e.giorni == null).length,
        esiti,
    });
}
