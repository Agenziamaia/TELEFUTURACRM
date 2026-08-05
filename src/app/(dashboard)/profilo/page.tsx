"use client";

// PROFILO PERSONALE (Luca 31/07): dall'icona in alto a destra ogni utente vede
// i propri dati (nome, CF, email, cellulare, residenza, IBAN).
// - campo VUOTO → "Completa": scrive SUBITO su app_users (prima compilazione,
//   nessuna approvazione) e il dato appare anche in Amministrazione → Utenti
// - campo GIA' VALORIZZATO → "Modifica": crea una RICHIESTA che
//   l'amministrazione approva dal pannello Utenti; fino ad allora resta il
//   valore vecchio (chip "in attesa")
// - cambio PASSWORD sempre libero (RPC change_password: verifica la vecchia)
// - FOTO PROFILO (Luca 05/08): l'iconcina a sinistra del nome e' cliccabile —
//   file picker → ridimensiona a max 512px (canvas) → bucket "avatars"
//   (<user_id>.jpg, upsert) → public URL in app_users.avatar_url (mig.
//   20260805020000). Senza migrazione tutto regge: si resta alle iniziali.
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { CAMPI_PROFILO, campiMancanti, caricaProfilo, type RigaProfilo } from "@/lib/profilo";
import { erroreIbanIT, normalizzaIban } from "@/lib/iban";
import { civicoMancante } from "@/components/IndirizzoAutocomplete";
import { AvatarUtente, notificaAvatarAggiornato } from "@/components/AvatarUtente";
import { Camera, Pencil, KeyRound, AlertTriangle, CheckCircle2, Type, Trash2, Loader2 } from "lucide-react";

type Richiesta = { id: number; campo: string; valore_nuovo: string; stato: string };

// Ridimensiona lato client (max ~512px sul lato lungo) e converte in JPEG:
// upload leggero e formato unico, qualunque cosa carichi l'utente.
async function ridimensionaImmagine(file: File, maxLato = 512): Promise<Blob> {
    const urlTmp = URL.createObjectURL(file);
    try {
        const img = await new Promise<HTMLImageElement>((res, rej) => {
            const i = new Image();
            i.onload = () => res(i);
            i.onerror = () => rej(new Error("file non leggibile come immagine"));
            i.src = urlTmp;
        });
        const scala = Math.min(1, maxLato / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round((img.width || 1) * scala));
        const h = Math.max(1, Math.round((img.height || 1) * scala));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas non disponibile su questo browser");
        // fondo bianco: i PNG trasparenti diventano JPEG puliti, senza aloni neri
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
        if (!blob) throw new Error("conversione dell'immagine non riuscita");
        return blob;
    } finally { URL.revokeObjectURL(urlTmp); }
}

export default function ProfiloPage() {
    const { user } = useAuth();
    const [riga, setRiga] = useState<RigaProfilo | null>(null);
    // DIMENSIONE TESTI (Luca 02/08): preferenza per dispositivo, applicata
    // subito e al boot dallo script nel layout (chiave tf_fs = "sm,lg").
    const [fsPref, setFsPref] = useState<{ sm: string; lg: string }>({ sm: "0", lg: "0" });
    useEffect(() => {
        try {
            const v = (localStorage.getItem("tf_fs") || "0,0").split(",");
            setFsPref({ sm: v[0] || "0", lg: v[1] || "0" });
        } catch { /* localStorage assente */ }
    }, []);
    const applicaFs = (gruppo: "sm" | "lg", livello: string) => {
        const next = { ...fsPref, [gruppo]: livello };
        setFsPref(next);
        try { localStorage.setItem("tf_fs", next.sm + "," + next.lg); } catch { /* niente persistenza */ }
        const d = document.documentElement;
        if (next.sm === "0") d.removeAttribute("data-fs-sm"); else d.setAttribute("data-fs-sm", next.sm);
        if (next.lg === "0") d.removeAttribute("data-fs-lg"); else d.setAttribute("data-fs-lg", next.lg);
    };
    const [richieste, setRichieste] = useState<Richiesta[]>([]);
    const [editCampo, setEditCampo] = useState<string | null>(null);
    const [editVal, setEditVal] = useState("");
    const [msg, setMsg] = useState<string | null>(null);
    const [showPw, setShowPw] = useState(false);
    const [pwVecchia, setPwVecchia] = useState("");
    const [pwNuova, setPwNuova] = useState("");
    const [pwConferma, setPwConferma] = useState("");
    const [pwBusy, setPwBusy] = useState(false);
    // FOTO PROFILO: url attuale, upload in corso e input file nascosto
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [avatarBusy, setAvatarBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement | null>(null);

    const carica = useCallback(async () => {
        if (!user?.id) return;
        setRiga(await caricaProfilo(user.id));
        try {
            const { data } = await supabase.from("profilo_richieste").select("id, campo, valore_nuovo, stato").eq("user_id", user.id).eq("stato", "in_attesa");
            setRichieste((data ?? []) as Richiesta[]);
        } catch { /* mig. 120 non applicata */ }
        // select SEPARATA e tollerante: se la colonna avatar_url non esiste
        // (migrazione non ancora applicata) fallisce da sola senza rompere il resto
        try {
            const { data, error } = await supabase.from("app_users").select("avatar_url").eq("id", user.id).maybeSingle();
            if (!error) setAvatarUrl((data as { avatar_url?: string | null } | null)?.avatar_url ?? null);
        } catch { /* colonna assente: niente foto */ }
    }, [user?.id]);
    useEffect(() => { carica(); }, [carica]);

    // ─── FOTO PROFILO: upload (con ridimensionamento) e rimozione ───
    const caricaFoto = async (file: File | null | undefined) => {
        if (!file || !user?.id || avatarBusy) return;
        if (!/^image\//.test(file.type)) { setMsg("⚠ Scegli un file immagine (JPG, PNG…)."); return; }
        setAvatarBusy(true);
        try {
            const blob = await ridimensionaImmagine(file, 512);
            const path = `${user.id}.jpg`;
            const up = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
            if (up.error) {
                setMsg(/bucket/i.test(up.error.message)
                    ? "⚠ Manca la migrazione foto profilo (bucket \"avatars\"): chiedi all'amministrazione."
                    : "⚠ Caricamento non riuscito: " + up.error.message);
                return;
            }
            const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
            // ?v=timestamp: il path e' sempre lo stesso, cosi' la cache del browser non mostra la foto vecchia
            const nuovaUrl = `${pub.publicUrl}?v=${Date.now()}`;
            const { error } = await supabase.from("app_users").update({ avatar_url: nuovaUrl }).eq("id", user.id);
            if (error) {
                setMsg(/column|avatar_url/i.test(error.message)
                    ? "⚠ Manca la migrazione foto profilo (colonna avatar_url): chiedi all'amministrazione."
                    : "⚠ Salvataggio non riuscito: " + error.message);
                return;
            }
            setAvatarUrl(nuovaUrl);
            notificaAvatarAggiornato(user.id, nuovaUrl);   // header e chat si aggiornano subito
            setMsg("✅ Foto profilo aggiornata.");
        } catch (e) {
            setMsg("⚠ Foto non caricata: " + (e instanceof Error ? e.message : "errore imprevisto"));
        } finally {
            setAvatarBusy(false);
            if (fileRef.current) fileRef.current.value = "";  // ricaricare lo STESSO file rilancia onChange
        }
    };

    const rimuoviFoto = async () => {
        if (!user?.id || avatarBusy) return;
        setAvatarBusy(true);
        try {
            try { await supabase.storage.from("avatars").remove([`${user.id}.jpg`]); } catch { /* best-effort */ }
            const { error } = await supabase.from("app_users").update({ avatar_url: null }).eq("id", user.id);
            if (error) { setMsg("⚠ Rimozione non riuscita: " + error.message); return; }
            setAvatarUrl(null);
            notificaAvatarAggiornato(user.id, null);
            setMsg("✅ Foto profilo rimossa: tornano le iniziali.");
        } finally { setAvatarBusy(false); }
    };

    const mancanti = campiMancanti(riga);
    const inAttesa = (campo: string) => richieste.find((r) => r.campo === campo);

    const salva = async (campo: string, label: string) => {
        let nuovo = editVal.trim();
        if (!nuovo || !user?.id || !riga) { setEditCampo(null); return; }
        if (campo === "iban") {
            nuovo = normalizzaIban(nuovo);
            const e = erroreIbanIT(nuovo);
            if (e) { setMsg("⚠ IBAN non valido: " + e); return; }   // resta in modifica
        }
        // Bug indirizzo (Luca 04/08): se residenza/domicilio si compilano, il
        // numero civico è OBBLIGATORIO (resta in modifica finché non c'è)
        if ((campo === "address" || campo === "domicilio") && civicoMancante(nuovo)) {
            setMsg(`⚠ Ne${campo === "address" ? "ll'indirizzo di residenza" : "l domicilio"} manca il numero civico (es. "Via Roma 12"): aggiungilo.`);
            return;
        }
        setEditCampo(null);
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
                {/* FOTO PROFILO: avatar CLICCABILE — anello, matita/fotocamera
                    sempre visibili e overlay "Cambia foto" al passaggio, cosi'
                    si capisce al volo che ci si puo' cliccare (Luca 05/08) */}
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => caricaFoto(e.target.files?.[0])} />
                <div className="relative shrink-0">
                    <button type="button" onClick={() => !avatarBusy && fileRef.current?.click()} disabled={avatarBusy}
                        title={avatarUrl ? "Clicca per cambiare la foto profilo" : "Clicca per aggiungere la tua foto"}
                        className="group relative block w-20 h-20 rounded-full cursor-pointer ring-2 ring-indigo-500/40 ring-offset-2 ring-offset-transparent hover:ring-indigo-400 focus:outline-none focus:ring-indigo-400 transition-all disabled:cursor-wait">
                        <AvatarUtente url={avatarUrl} nome={user?.name} className="w-20 h-20 text-2xl" />
                        {/* overlay affordance: 📷 + "Cambia foto" in hover (e sempre su touch) */}
                        <span className={`absolute inset-0 rounded-full bg-black/55 flex flex-col items-center justify-center gap-0.5 text-white transition-opacity ${avatarBusy ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus:opacity-100"}`}>
                            {avatarBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                            <span className="text-[9px] font-bold uppercase tracking-wide">{avatarBusy ? "Carico…" : avatarUrl ? "Cambia foto" : "Aggiungi foto"}</span>
                        </span>
                    </button>
                    {/* badge fotocamera SEMPRE visibile: l'invito al click c'e' anche senza hover */}
                    <span className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-indigo-500 border-2 border-[#0f111a] flex items-center justify-center pointer-events-none shadow-lg">
                        <Camera className="w-3.5 h-3.5 text-white" />
                    </span>
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-white">{user?.name || "Il mio profilo"}</h2>
                    <p className="text-slate-400 text-sm">I tuoi dati a sistema. La prima compilazione è libera; la modifica di un dato già presente passa dall&apos;approvazione dell&apos;amministrazione.</p>
                    <div className="flex items-center gap-3 mt-1.5">
                        <button type="button" onClick={() => !avatarBusy && fileRef.current?.click()}
                            className="text-[11px] font-bold text-indigo-300 hover:text-indigo-200 flex items-center gap-1">
                            <Camera className="w-3.5 h-3.5" /> {avatarUrl ? "Cambia foto" : "Aggiungi una foto"}
                        </button>
                        {avatarUrl && (
                            <button type="button" onClick={rimuoviFoto} disabled={avatarBusy}
                                className="text-[11px] font-bold text-rose-300/90 hover:text-rose-300 flex items-center gap-1 disabled:opacity-40">
                                <Trash2 className="w-3.5 h-3.5" /> Rimuovi foto
                            </button>
                        )}
                    </div>
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

            {/* DIMENSIONE TESTI (Luca 02/08): due gruppi per posizionamento —
                i piccoli (contenuti) e i grandi (titoli/menu) — tre livelli
                ciascuno. La scelta vale sul dispositivo in uso. */}
            <div className="glass-card p-4">
                <p className="text-sm font-bold text-white flex items-center gap-2"><Type className="w-4 h-4 text-indigo-300" /> Dimensione testi</p>
                <p className="text-[11px] text-slate-500 mt-0.5 mb-2">Vale su questo dispositivo: la regolazione si applica subito, su tutto il CRM.</p>
                {([["sm", "Testi piccoli", "contenuti, tabelle, etichette"], ["lg", "Testi grandi", "titoli e menu"]] as const).map(([g, lab, hint]) => (
                    <div key={g} className="flex items-center justify-between gap-3 py-2.5 border-t border-white/5">
                        <div>
                            <p className="text-sm text-slate-200 font-semibold">{lab}</p>
                            <p className="text-[11px] text-slate-500">{hint}</p>
                        </div>
                        <div className="flex gap-1">
                            {[["0", "Normale"], ["1", "Grande"], ["2", "Molto grande"]].map(([lv, nome]) => (
                                <button key={lv} onClick={() => applicaFs(g, lv)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${fsPref[g] === lv ? "bg-indigo-500/25 border-indigo-400/60 text-indigo-200" : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-white"}`}>
                                    {nome}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div id="cambio-password" className="glass-card p-4 scroll-mt-24">
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
