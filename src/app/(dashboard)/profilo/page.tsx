"use client";

// PROFILO PERSONALE (Luca 31/07): dall'icona in alto a destra ogni utente vede
// i propri dati (nome, CF, email, cellulare, residenza, IBAN).
// - campo VUOTO → "Completa": scrive SUBITO su app_users (prima compilazione,
//   nessuna approvazione) e il dato appare anche in Amministrazione → Utenti
// - campo GIA' VALORIZZATO → "Modifica": crea una RICHIESTA che
//   l'amministrazione approva dal pannello Utenti; fino ad allora resta il
//   valore vecchio (chip "in attesa")
// - cambio PASSWORD sempre libero (RPC change_password: verifica la vecchia)
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { CAMPI_PROFILO, campiMancanti, caricaProfilo, type RigaProfilo } from "@/lib/profilo";
import { User as UserIcon, Pencil, KeyRound, AlertTriangle, CheckCircle2 } from "lucide-react";

type Richiesta = { id: number; campo: string; valore_nuovo: string; stato: string };

export default function ProfiloPage() {
    const { user } = useAuth();
    const [riga, setRiga] = useState<RigaProfilo | null>(null);
    const [richieste, setRichieste] = useState<Richiesta[]>([]);
    const [editCampo, setEditCampo] = useState<string | null>(null);
    const [editVal, setEditVal] = useState("");
    const [msg, setMsg] = useState<string | null>(null);
    const [showPw, setShowPw] = useState(false);
    const [pwVecchia, setPwVecchia] = useState("");
    const [pwNuova, setPwNuova] = useState("");
    const [pwConferma, setPwConferma] = useState("");
    const [pwBusy, setPwBusy] = useState(false);

    const carica = useCallback(async () => {
        if (!user?.id) return;
        setRiga(await caricaProfilo(user.id));
        try {
            const { data } = await supabase.from("profilo_richieste").select("id, campo, valore_nuovo, stato").eq("user_id", user.id).eq("stato", "in_attesa");
            setRichieste((data ?? []) as Richiesta[]);
        } catch { /* mig. 120 non applicata */ }
    }, [user?.id]);
    useEffect(() => { carica(); }, [carica]);

    const mancanti = campiMancanti(riga);
    const inAttesa = (campo: string) => richieste.find((r) => r.campo === campo);

    const salva = async (campo: string, label: string) => {
        const nuovo = editVal.trim();
        setEditCampo(null);
        if (!nuovo || !user?.id || !riga) return;
        const attuale = String((riga as Record<string, unknown>)[campo] ?? "").trim();
        if (nuovo === attuale) return;
        if (!attuale) {
            // PRIMA COMPILAZIONE: scrive subito, niente richiesta (Luca 31/07)
            const { error } = await supabase.from("app_users").update({ [campo]: nuovo }).eq("id", user.id);
            if (error) { setMsg(/column/i.test(error.message) ? "⚠ Manca la migrazione 120 (colonna cf): chiedi all'amministrazione." : "⚠ Salvataggio non riuscito: " + error.message); return; }
            setMsg(`✅ ${label} salvato.`);
        } else {
            const { error } = await supabase.from("profilo_richieste").insert({
                user_id: user.id, user_name: user.name || null, campo, etichetta: label,
                valore_attuale: attuale, valore_nuovo: nuovo,
            });
            if (error) { setMsg(/(relation|table)/i.test(error.message) ? "⚠ Manca la migrazione 120: chiedi all'amministrazione." : "⚠ Richiesta non inviata: " + error.message); return; }
            setMsg(`📨 Richiesta di modifica di "${label}" inviata all'amministrazione: vedrai il nuovo valore dopo l'approvazione.`);
        }
        carica();
    };

    const cambiaPassword = async () => {
        if (pwBusy) return;
        if (!pwVecchia || !pwNuova) { setMsg("⚠ Compila password attuale e nuova."); return; }
        if (pwNuova.length < 8) { setMsg("⚠ La nuova password deve avere almeno 8 caratteri."); return; }
        if (pwNuova !== pwConferma) { setMsg("⚠ La conferma non coincide con la nuova password."); return; }
        setPwBusy(true);
        const { data, error } = await supabase.rpc("change_password", {
            p_email: (user?.email || riga?.email || "").trim(), p_old: pwVecchia, p_new: pwNuova,
        });
        setPwBusy(false);
        if (error) { setMsg("⚠ Cambio password non riuscito: " + error.message); return; }
        if (data !== true) { setMsg("⚠ Password attuale non valida."); return; }
        setShowPw(false); setPwVecchia(""); setPwNuova(""); setPwConferma("");
        setMsg("✅ Password cambiata: al prossimo accesso usa quella nuova.");
    };

    return (
        <div className="w-full max-w-3xl mx-auto p-4 md:p-8 space-y-6">
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-indigo-500/20 text-indigo-300 border-2 border-indigo-500/40 flex items-center justify-center">
                    <UserIcon className="w-7 h-7" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-white">{user?.name || "Il mio profilo"}</h2>
                    <p className="text-slate-400 text-sm">I tuoi dati a sistema. La prima compilazione è libera; la modifica di un dato già presente passa dall&apos;approvazione dell&apos;amministrazione.</p>
                </div>
            </div>

            {mancanti.length > 0 && (
                <div className="glass-card p-4 border-l-4 border-l-amber-500 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-bold text-amber-300">Il tuo profilo non è completo</p>
                        <p className="text-xs text-slate-400 mt-0.5">Completa le informazioni mancanti: {mancanti.join(", ")}.</p>
                    </div>
                </div>
            )}
            {msg && (
                <div className="glass-card p-3.5 text-sm text-slate-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> {msg}
                </div>
            )}

            <div className="glass-card divide-y divide-white/5">
                {CAMPI_PROFILO.map(({ campo, label }) => {
                    const valore = String((riga as Record<string, unknown> | null)?.[campo] ?? "").trim();
                    const rich = inAttesa(campo);
                    const inEdit = editCampo === campo;
                    return (
                        <div key={campo} className="p-4 flex items-center gap-4 flex-wrap">
                            <div className="flex-1 min-w-[220px]">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
                                {inEdit ? (
                                    <input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") salva(campo, label); if (e.key === "Escape") setEditCampo(null); }}
                                        className="mt-1 w-full bg-black/40 border border-indigo-500/50 rounded-xl px-3 py-2 text-sm text-white outline-none" />
                                ) : (
                                    <p className={valore ? "text-sm text-white mt-0.5" : "text-sm text-amber-400/90 mt-0.5"}>{valore || "— da completare"}</p>
                                )}
                                {rich && !inEdit && (
                                    <p className="text-[11px] text-sky-300 mt-1">📨 Modifica richiesta: “{rich.valore_nuovo}” — in attesa di approvazione</p>
                                )}
                            </div>
                            {inEdit ? (
                                <div className="flex gap-2">
                                    <button onClick={() => salva(campo, label)} className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold hover:bg-emerald-500/30">Salva</button>
                                    <button onClick={() => setEditCampo(null)} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-xs font-bold hover:bg-white/10">Annulla</button>
                                </div>
                            ) : (
                                <button disabled={!!rich} onClick={() => { setEditCampo(campo); setEditVal(valore); }}
                                    title={rich ? "C'è già una richiesta in attesa per questo campo" : valore ? "Richiedi la modifica (passa dall'amministrazione)" : "Completa il dato (salvataggio immediato)"}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-xs font-bold hover:bg-white/10 disabled:opacity-40">
                                    <Pencil className="w-3.5 h-3.5" /> {valore ? "Modifica" : "Completa"}
                                </button>
                            )}
                        </div>
                    );
                })}

                {/* DOMICILIO (Luca 01/08, mig. 126): richiesto SOLO se diverso
                    dalla residenza — il flag lo dichiara l'utente e si salva
                    subito; il valore segue il flusso Completa/Modifica. */}
                <div className="p-4 space-y-3">
                    <label className="flex items-center gap-2.5 text-sm text-slate-200 cursor-pointer font-medium">
                        <input type="checkbox" checked={!!riga?.domicilio_diverso}
                            onChange={async (e) => {
                                if (!user?.id) return;
                                const { error } = await supabase.from("app_users").update({ domicilio_diverso: e.target.checked }).eq("id", user.id);
                                if (error) { setMsg(/column/i.test(error.message) ? "⚠ Manca la migrazione 126 (domicilio): chiedi all'amministrazione." : "⚠ Salvataggio non riuscito: " + error.message); return; }
                                carica();
                            }}
                            className="w-4 h-4 cursor-pointer" />
                        Il mio domicilio è diverso dalla residenza
                    </label>
                    {!!riga?.domicilio_diverso && (() => {
                        const valore = String(riga?.domicilio ?? "").trim();
                        const rich = inAttesa("domicilio");
                        const inEdit = editCampo === "domicilio";
                        return (
                            <div className="flex items-center gap-4 flex-wrap pl-6">
                                <div className="flex-1 min-w-[220px]">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Indirizzo di domicilio</p>
                                    {inEdit ? (
                                        <input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter") salva("domicilio", "Domicilio"); if (e.key === "Escape") setEditCampo(null); }}
                                            className="mt-1 w-full bg-black/40 border border-indigo-500/50 rounded-xl px-3 py-2 text-sm text-white outline-none" />
                                    ) : (
                                        <p className={valore ? "text-sm text-white mt-0.5" : "text-sm text-amber-400/90 mt-0.5"}>{valore || "— da completare"}</p>
                                    )}
                                    {rich && !inEdit && (
                                        <p className="text-[11px] text-sky-300 mt-1">📨 Modifica richiesta: “{rich.valore_nuovo}” — in attesa di approvazione</p>
                                    )}
                                </div>
                                {inEdit ? (
                                    <div className="flex gap-2">
                                        <button onClick={() => salva("domicilio", "Domicilio")} className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold hover:bg-emerald-500/30">Salva</button>
                                        <button onClick={() => setEditCampo(null)} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-xs font-bold hover:bg-white/10">Annulla</button>
                                    </div>
                                ) : (
                                    <button disabled={!!rich} onClick={() => { setEditCampo("domicilio"); setEditVal(valore); }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-xs font-bold hover:bg-white/10 disabled:opacity-40">
                                        <Pencil className="w-3.5 h-3.5" /> {valore ? "Modifica" : "Completa"}
                                    </button>
                                )}
                            </div>
                        );
                    })()}
                </div>
            </div>

            <div className="glass-card p-4">
                {!showPw ? (
                    <button onClick={() => setShowPw(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-sm font-bold hover:bg-indigo-500/25">
                        <KeyRound className="w-4 h-4" /> Cambia password
                    </button>
                ) : (
                    <div className="space-y-3 max-w-sm">
                        <p className="text-sm font-bold text-white flex items-center gap-2"><KeyRound className="w-4 h-4 text-indigo-300" /> Cambia password</p>
                        <input type="password" value={pwVecchia} onChange={(e) => setPwVecchia(e.target.value)} placeholder="Password attuale" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none" />
                        <input type="password" value={pwNuova} onChange={(e) => setPwNuova(e.target.value)} placeholder="Nuova password (min. 8 caratteri)" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none" />
                        <input type="password" value={pwConferma} onChange={(e) => setPwConferma(e.target.value)} placeholder="Ripeti la nuova password" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none" />
                        <div className="flex gap-2">
                            <button onClick={cambiaPassword} disabled={pwBusy} className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold disabled:opacity-50">{pwBusy ? "Cambio…" : "Conferma"}</button>
                            <button onClick={() => { setShowPw(false); setPwVecchia(""); setPwNuova(""); setPwConferma(""); }} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 text-sm font-bold hover:bg-white/10">Annulla</button>
                        </div>
                        <p className="text-[11px] text-slate-500">Il cambio password è libero: nessuna approvazione richiesta.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
