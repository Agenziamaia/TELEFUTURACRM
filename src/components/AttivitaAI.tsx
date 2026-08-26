"use client";

/* REGISTRO ATTIVITÀ AI (Luca 26/08): dentro i pannelli amministrativi
   WhatsApp ed Email, il posto dove si CONTROLLA cosa fa l'AI sui due canali
   — ogni classificazione del triage (stato + perché + quando), le email
   CESTINATE o messe in quarantena in automatico (con «Ripristina»), lo
   stato dell'ultimo giro del motore e la spesa AI del giorno. */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Brain, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/utils";

type Canale = "wa" | "email";
type Riga = {
    conversation_id: string; stato: string; azione: string | null;
    azione_auto?: string | null; azione_auto_il?: string | null; ripristinata_il?: string | null;
    classificato_il: string; chi: string; dettaglio: string;
};

const STATI_WA: Record<string, { label: string; cls: string }> = {
    rispondere: { label: "🔴 rispondere", cls: "text-rose-300" },
    attesa_cliente: { label: "🔵 attesa cliente", cls: "text-sky-300" },
    programmata: { label: "🗓 programmata", cls: "text-amber-300" },
    niente: { label: "⚪ niente", cls: "text-slate-400" },
};
const STATI_EMAIL: Record<string, { label: string; cls: string }> = {
    rispondere: { label: "🔴 rispondere", cls: "text-rose-300" },
    da_leggere: { label: "🟠 da leggere", cls: "text-amber-300" },
    niente: { label: "⚪ niente", cls: "text-slate-400" },
    spazzatura: { label: "🗑 spazzatura", cls: "text-rose-400" },
};

export function AttivitaAI({ canale }: { canale: Canale }) {
    const [righe, setRighe] = useState<Riga[] | null>(null);
    const [conteggi, setConteggi] = useState<Record<string, number>>({});
    const [esito, setEsito] = useState<string | null>(null);
    const [costoOggi, setCostoOggi] = useState<number | null>(null);
    const [soloAuto, setSoloAuto] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const STATI = canale === "wa" ? STATI_WA : STATI_EMAIL;

    const carica = useCallback(async () => {
        if (canale === "wa") {
            const [{ data: tri }, { data: st }] = await Promise.all([
                supabase.from("wa_triage").select("conversation_id, stato, azione, classificato_il")
                    .order("classificato_il", { ascending: false }).limit(40),
                supabase.from("wa_triage_stato").select("ultimo_esito").eq("id", 1).maybeSingle(),
            ]);
            setEsito(st?.ultimo_esito || null);
            const ids = (tri || []).map((r) => r.conversation_id);
            const { data: convs } = ids.length
                ? await supabase.from("wa_conversations").select("id, customer_name, customer_number").in("id", ids)
                : { data: [] as any[] };
            const m = new Map((convs || []).map((c: any) => [c.id, c]));
            setRighe((tri || []).map((r: any) => {
                const c = m.get(r.conversation_id);
                return { ...r, chi: c?.customer_name || (c?.customer_number ? `+${c.customer_number}` : "chat"), dettaglio: "" };
            }));
            const cnt: Record<string, number> = {};
            await Promise.all(Object.keys(STATI_WA).map(async (s) => {
                const { count } = await supabase.from("wa_triage").select("*", { count: "exact", head: true }).eq("stato", s);
                cnt[s] = count || 0;
            }));
            setConteggi(cnt);
        } else {
            // «solo cancellate» = query DEDICATA per azione_auto_il (rilievo
            // revisore: filtrare le ultime 40 classificazioni faceva sparire
            // le cestinate in pochi giri, proprio quando il controllo serve)
            const qTri = soloAuto
                ? supabase.from("email_triage").select("conversation_id, stato, azione, azione_auto, azione_auto_il, ripristinata_il, classificato_il")
                    .not("azione_auto", "is", null).order("azione_auto_il", { ascending: false }).limit(40)
                : supabase.from("email_triage").select("conversation_id, stato, azione, azione_auto, azione_auto_il, ripristinata_il, classificato_il")
                    .order("classificato_il", { ascending: false }).limit(40);
            const [{ data: tri }, { data: st }] = await Promise.all([
                qTri,
                supabase.from("email_triage_stato").select("ultimo_esito").eq("id", 1).maybeSingle(),
            ]);
            setEsito(st?.ultimo_esito || null);
            const ids = (tri || []).map((r) => r.conversation_id);
            const { data: convs } = ids.length
                ? await supabase.from("email_conversations").select("id, customer_name, customer_email, subject").in("id", ids)
                : { data: [] as any[] };
            const m = new Map((convs || []).map((c: any) => [c.id, c]));
            setRighe((tri || []).map((r: any) => {
                const c = m.get(r.conversation_id);
                return { ...r, chi: c?.customer_name || c?.customer_email || "email", dettaglio: c?.subject || "" };
            }));
            const cnt: Record<string, number> = {};
            await Promise.all(Object.keys(STATI_EMAIL).map(async (s) => {
                const { count } = await supabase.from("email_triage").select("*", { count: "exact", head: true }).eq("stato", s);
                cnt[s] = count || 0;
            }));
            setConteggi(cnt);
        }
        // spesa AI del giorno (registro comune dei motori: user_id null)
        const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
        const { data: usi } = await supabase.from("ai_usage").select("cost_usd")
            .is("user_id", null).gte("created_at", oggi.toISOString());
        setCostoOggi((usi || []).reduce((s: number, r: any) => s + Number(r.cost_usd || 0), 0));
    }, [canale, soloAuto]);
    useEffect(() => { carica(); const t = setInterval(carica, 30000); return () => clearInterval(t); }, [carica]);

    // Ripristina una email cestinata/quarantenata dall'AI: torna in inbox e
    // resta a registro con la data del ripristino (il triage non la ritocca
    // finché non arrivano messaggi nuovi: il fingerprint è già aggiornato)
    const ripristina = async (r: Riga) => {
        setBusy(r.conversation_id);
        try {
            const { error } = await supabase.from("email_conversations")
                .update(r.azione_auto === "quarantena" ? { spam: false } : { trashed: false }).eq("id", r.conversation_id);
            if (error) { alert("Ripristino non riuscito: " + error.message); return; }
            await supabase.from("email_triage").update({ ripristinata_il: new Date().toISOString() }).eq("conversation_id", r.conversation_id);
            carica();
        } finally { setBusy(null); }
    };

    const visibili = (righe || []).filter((r) => !soloAuto || r.azione_auto);
    return (
        <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="px-4 pt-3 pb-2 flex items-center gap-2 flex-wrap">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold inline-flex items-center gap-1.5"><Brain className="w-3.5 h-3.5 text-violet-300" /> Attività AI {canale === "wa" ? "· chat WhatsApp" : "· email"}</span>
                <span className="text-[11px] text-slate-600">{Object.entries(conteggi).map(([s, n]) => `${STATI[s]?.label || s} ${n}`).join(" · ")}</span>
                {costoOggi != null && <span className="text-[11px] text-slate-600">· spesa AI oggi (tutti i motori) ${costoOggi.toFixed(3)}</span>}
                {canale === "email" && (
                    <button onClick={() => setSoloAuto(v => !v)}
                        className={cn("ml-auto px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors",
                            soloAuto ? "bg-rose-500/15 border-rose-500/40 text-rose-200" : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10")}>
                        <Trash2 className="w-3 h-3 inline -mt-0.5 mr-1" />solo cancellate
                    </button>
                )}
            </div>
            {esito && <div className="px-4 pb-1 text-[11px] text-slate-500">Ultimo giro: {esito}</div>}
            {righe === null ? (
                <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
            ) : visibili.length === 0 ? (
                <div className="p-5 text-center text-slate-500 text-sm">{soloAuto ? "Nessuna email cancellata dall'AI." : "Ancora nessuna attività registrata."}</div>
            ) : (
                <div className="max-h-[380px] overflow-y-auto divide-y divide-white/5">
                    {visibili.map((r) => (
                        <div key={r.conversation_id} className="px-4 py-2 flex items-start gap-3">
                            <span className={cn("shrink-0 text-[11px] font-bold w-28", STATI[r.stato]?.cls || "text-slate-400")}>{STATI[r.stato]?.label || r.stato}</span>
                            <div className="min-w-0 flex-1">
                                <div className="text-[12px] font-semibold text-slate-200 truncate">{r.chi}{r.dettaglio ? <span className="text-slate-500 font-normal"> · {r.dettaglio}</span> : null}</div>
                                {r.azione && <div className="text-[11px] text-slate-500 truncate">{r.azione}</div>}
                                {r.azione_auto && (
                                    <div className="text-[11px] mt-0.5">
                                        <span className={r.ripristinata_il ? "text-emerald-300" : "text-rose-300"}>
                                            {r.azione_auto === "cestinata" ? "🗑 cestinata dall'AI" : "🛡 in quarantena (casella protetta)"}
                                            {r.ripristinata_il ? " · ripristinata ✓" : ""}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <span className="shrink-0 text-[10px] text-slate-600">{new Date(r.classificato_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                            {canale === "email" && r.azione_auto && !r.ripristinata_il && (
                                <button onClick={() => ripristina(r)} disabled={busy === r.conversation_id}
                                    title="Rimetti la conversazione nella Posta in arrivo"
                                    className="shrink-0 px-2 py-1 rounded-lg border border-white/10 text-[11px] font-bold text-slate-300 hover:bg-white/10 inline-flex items-center gap-1">
                                    {busy === r.conversation_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />} Ripristina
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
