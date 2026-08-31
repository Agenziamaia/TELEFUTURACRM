"use client";

// QUANTE FERIE HANNO ANCORA (Luca 31/08).
//
// «Nella sezione ferie voglio un rendiconto del totale delle ferie di tutti i
// collaboratori: nel momento in cui ci fanno una richiesta, vedere subito
// quali sono i loro giorni residui. Un campo di ricerca libero per il nome, e
// poterli mettere in ordine crescente o decrescente per giorni residui.»
//
// COME SI FA IL NUMERO. Il residuo vero lo dice la busta paga, una volta al
// mese: quello è il punto fermo. Da lì in poi lo tiene il CRM, sottraendo le
// ferie APPROVATE dopo quella data. Così c'è un numero solo da mantenere — e
// resta sempre riconciliabile col cedolino, che è quello che conta se qualcuno
// contesta.
//
// Senza punto fermo non si inventa niente: la riga dice «manca il dato dalla
// busta paga» e mostra comunque i giorni presi, che è già qualcosa.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, ArrowUpDown, Loader2, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { arrotondaGiorni, giornateAssenza, nomeMese } from "@/lib/assenze";
import { cn } from "@/utils";

type Riga = {
    userId: string; nome: string; negozio: string;
    puntoFermo: { mese: string; giorni: number; fonte: string } | null;
    presiDopo: number;
    residuo: number | null;
};

export function DisponibilitaFerie() {
    const { user } = useAuth();
    const [righe, setRighe] = useState<Riga[] | null>(null);
    const [q, setQ] = useState("");
    const [ordine, setOrdine] = useState<"residuo-giu" | "residuo-su" | "nome">("residuo-giu");
    const [bozze, setBozze] = useState<Record<string, string>>({});
    const [salvo, setSalvo] = useState<string | null>(null);
    const [meseNuovo, setMeseNuovo] = useState(() => {
        const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    });

    const carica = useCallback(async () => {
        const [ut, res, fer, fes] = await Promise.all([
            supabase.from("app_users").select("id, full_name, primary_store, role").eq("active", true).order("full_name"),
            supabase.from("ferie_residue").select("user_id, mese, giorni, fonte").order("mese", { ascending: false }),
            supabase.from("vacation_requests").select("user_id, employee_name, date_from, date_to, half_day, tipo, status").eq("status", "approved"),
            supabase.from("giorni_festivi").select("giorno"),
        ]);
        const festivi = new Set(((fes.data ?? []) as { giorno: string }[]).map((f) => String(f.giorno).slice(0, 10)));
        // il punto fermo più recente per persona
        const fermo = new Map<string, { mese: string; giorni: number; fonte: string }>();
        for (const r of ((res.data ?? []) as { user_id: string; mese: string; giorni: number; fonte: string }[])) {
            const mese = String(r.mese).slice(0, 10);
            const cur = fermo.get(r.user_id);
            if (!cur || mese > cur.mese) fermo.set(r.user_id, { mese, giorni: Number(r.giorni), fonte: r.fonte });
        }
        const utenti = ((ut.data ?? []) as { id: string; full_name: string; primary_store: string | null }[]);
        const perNome = new Map(utenti.map((u) => [String(u.full_name || "").trim().toLowerCase(), u.id]));
        const oggi = new Date();
        const fineOggi = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, "0")}-${String(oggi.getDate()).padStart(2, "0")}`;

        const out: Riga[] = utenti.map((u) => {
            const pf = fermo.get(u.id) || null;
            /* LE FERIE PRESE DOPO IL PUNTO FERMO. Il cedolino di luglio conta
               fino al 31 luglio, quindi si parte dal primo agosto: i giorni di
               luglio sono già dentro il suo numero. */
            let presi = 0;
            if (pf) {
                const dopo = new Date(pf.mese + "T12:00"); dopo.setMonth(dopo.getMonth() + 1);
                const da = `${dopo.getFullYear()}-${String(dopo.getMonth() + 1).padStart(2, "0")}-01`;
                for (const r of ((fer.data ?? []) as Record<string, string>[])) {
                    if (r.tipo === "corso") continue;   // un corso non è ferie
                    const uid = r.user_id || perNome.get(String(r.employee_name || "").trim().toLowerCase());
                    if (uid !== u.id) continue;
                    presi += giornateAssenza(String(r.date_from).slice(0, 10), String(r.date_to).slice(0, 10), da, fineOggi, festivi, !!r.half_day)
                        .reduce((t, g) => t + g.quota, 0);
                }
            }
            return {
                userId: u.id, nome: u.full_name, negozio: u.primary_store || "",
                puntoFermo: pf, presiDopo: arrotondaGiorni(presi),
                residuo: pf ? arrotondaGiorni(pf.giorni - presi) : null,
            };
        });
        setRighe(out);
    }, []);
    useEffect(() => { carica(); }, [carica]);

    const salva = async (userId: string) => {
        const v = String(bozze[userId] ?? "").replace(",", ".").trim();
        if (!v || !Number.isFinite(Number(v))) return;
        setSalvo(userId);
        await supabase.from("ferie_residue").upsert({
            user_id: userId, mese: meseNuovo, giorni: Number(v),
            fonte: "manuale", inserito_da: user?.name || null,
        }, { onConflict: "user_id,mese" });
        setBozze((p) => ({ ...p, [userId]: "" }));
        setSalvo(null);
        carica();
    };

    const [leggo, setLeggo] = useState(false);
    const [esitoLettura, setEsitoLettura] = useState<string | null>(null);
    const leggiBuste = async () => {
        setLeggo(true); setEsitoLettura(null);
        try {
            const r = await fetch("/api/ferie/leggi-buste", {
                method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mese: meseNuovo }),
            }).then((x) => x.json());
            setEsitoLettura(r?.error ? `⛔ ${r.error}`
                : r.buste === 0 ? `Nessuna busta paga archiviata per ${nomeMese(meseNuovo)}: caricale dalla scheda della persona.`
                    : `📄 Lette ${r.letti} buste paga su ${r.buste}${r.nonLetti ? ` — ${r.nonLetti} non hanno il riquadro RATEI leggibile, quelle vanno scritte a mano` : ""}.`);
            await carica();
        } catch (e) {
            setEsitoLettura("⛔ " + (e instanceof Error ? e.message : "lettura non riuscita"));
        }
        setLeggo(false);
    };

    const viste = useMemo(() => {
        const s = q.trim().toLowerCase();
        const f = (righe || []).filter((r) => !s || r.nome.toLowerCase().includes(s) || r.negozio.toLowerCase().includes(s));
        const n = (x: number | null) => (x == null ? Number.NEGATIVE_INFINITY : x);
        if (ordine === "nome") return [...f].sort((a, b) => a.nome.localeCompare(b.nome));
        return [...f].sort((a, b) => (ordine === "residuo-giu" ? n(b.residuo) - n(a.residuo) : n(a.residuo) - n(b.residuo)) || a.nome.localeCompare(b.nome));
    }, [righe, q, ordine]);

    const senzaDato = (righe || []).filter((r) => !r.puntoFermo).length;

    return (
        <div className="space-y-3">
            <div className="glass-card p-3 rounded-xl flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px]">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca un collaboratore o un negozio…"
                        className="glass-input w-full text-sm !pl-9" />
                </div>
                <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
                    {([["residuo-giu", "Più ferie"], ["residuo-su", "Meno ferie"], ["nome", "A → Z"]] as const).map(([k, l]) => (
                        <button key={k} onClick={() => setOrdine(k)}
                            className={cn("px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap",
                                ordine === k ? "bg-indigo-500/25 text-indigo-200" : "text-slate-500 hover:text-slate-300")}>
                            <ArrowUpDown className="w-3 h-3 inline -mt-0.5 mr-1" />{l}
                        </button>
                    ))}
                </div>
                {/* IL NUMERO STA DENTRO LA BUSTA PAGA (Luca 31/08): «giù in basso
                    sulle buste paga hai sempre il saldo ferie». Infatti — riquadro
                    RATEI, riga FERIE, colonna Saldo, in giorni. Questo bottone le
                    apre tutte e lo scrive, invece di farlo battere a mano. */}
                <button onClick={leggiBuste} disabled={leggo}
                    title={`Apre le buste paga di ${nomeMese(meseNuovo)} e legge il saldo ferie dal riquadro RATEI`}
                    className="px-3 py-2 rounded-xl text-[11px] font-bold bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40 whitespace-nowrap flex items-center gap-1.5">
                    {leggo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "📄"} Leggi dalle buste paga
                </button>
                <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    mensilità
                    <input type="month" value={meseNuovo.slice(0, 7)} onChange={(e) => setMeseNuovo(e.target.value ? `${e.target.value}-01` : meseNuovo)}
                        title="Il mese del cedolino da cui viene il residuo che stai scrivendo"
                        className="glass-input !h-9 px-2 text-xs normal-case font-normal tracking-normal" />
                </label>
            </div>

            {esitoLettura && (
                <p className={`text-[11px] rounded-lg px-3 py-2 border ${esitoLettura.startsWith("⛔") ? "text-rose-200 bg-rose-500/10 border-rose-500/25" : "text-emerald-200 bg-emerald-500/10 border-emerald-500/25"}`}>{esitoLettura}</p>
            )}
            {senzaDato > 0 && (
                <p className="text-[11px] text-amber-100 bg-amber-500/10 border border-amber-400/30 rounded-lg px-3 py-2">
                    ⚠️ Per {senzaDato} {senzaDato === 1 ? "collaboratore manca" : "collaboratori manca"} il residuo di partenza. Premi <b>«Leggi dalle buste paga»</b>: il saldo sta nel riquadro RATEI del cedolino di <b>{nomeMese(meseNuovo)}</b>. Chi non ha la busta archiviata si scrive a mano qui a fianco.
                </p>
            )}

            {!righe ? (
                <div className="flex justify-center py-10 text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : (
                <div className="glass-card rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wider text-slate-500 text-left border-b border-white/5">
                                <th className="py-2.5 px-3">Collaboratore</th>
                                <th className="py-2.5 px-2">Negozio</th>
                                <th className="py-2.5 px-2 text-right">Da busta paga</th>
                                <th className="py-2.5 px-2 text-right">Prese dopo</th>
                                <th className="py-2.5 px-2 text-right">Residuo oggi</th>
                                <th className="py-2.5 px-2 w-[190px]">Aggiorna da cedolino</th>
                            </tr>
                        </thead>
                        <tbody>
                            {viste.map((r) => (
                                <tr key={r.userId} className="border-t border-white/5 hover:bg-white/[0.02]">
                                    <td className="py-2 px-3 font-semibold text-slate-100">{r.nome}</td>
                                    <td className="py-2 px-2 text-slate-400 text-xs">{r.negozio || "—"}</td>
                                    <td className="py-2 px-2 text-right text-slate-300 tabular-nums">
                                        {r.puntoFermo ? (
                                            <span title={`Residuo dichiarato dalla busta paga di ${nomeMese(r.puntoFermo.mese)}${r.puntoFermo.fonte === "manuale" ? " (scritto a mano)" : ""}`}>
                                                {r.puntoFermo.giorni}
                                                <span className="text-[10px] text-slate-600 ml-1">{nomeMese(r.puntoFermo.mese).slice(0, 3)}</span>
                                            </span>
                                        ) : <span className="text-amber-300/80 text-xs">manca</span>}
                                    </td>
                                    <td className="py-2 px-2 text-right text-slate-400 tabular-nums">{r.puntoFermo ? (r.presiDopo || "—") : "—"}</td>
                                    <td className={cn("py-2 px-2 text-right font-black tabular-nums",
                                        r.residuo == null ? "text-slate-600" : r.residuo <= 0 ? "text-rose-300" : r.residuo <= 5 ? "text-amber-300" : "text-emerald-300")}>
                                        {r.residuo == null ? "—" : r.residuo}
                                    </td>
                                    <td className="py-2 px-2">
                                        <div className="flex items-center gap-1">
                                            <input value={bozze[r.userId] ?? ""} onChange={(e) => setBozze((p) => ({ ...p, [r.userId]: e.target.value }))}
                                                onKeyDown={(e) => { if (e.key === "Enter") salva(r.userId); }}
                                                placeholder="giorni" inputMode="decimal"
                                                className="glass-input !h-7 !px-2 text-[11px] w-[80px]" />
                                            <button onClick={() => salva(r.userId)} disabled={!bozze[r.userId] || salvo === r.userId}
                                                title={`Salva il residuo di ${nomeMese(meseNuovo)}`}
                                                className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-30">
                                                {salvo === r.userId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!viste.length && <tr><td colSpan={6} className="py-8 text-center text-slate-600 text-xs">Nessun collaboratore trovato.</td></tr>}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="text-[10px] text-slate-600 px-1">
                Il residuo di oggi è quello della busta paga meno le ferie approvate dal mese successivo in poi (i corsi non contano). Ogni nuova busta paga ritara il conto.
            </p>
        </div>
    );
}
