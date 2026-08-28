"use client";

/* PANNELLO EMAIL (Luca 26/08 — governance caselle): il posto UNICO dove
   l'amministrazione governa le caselle email del CRM, gemello del Pannello
   WhatsApp. Caselle intestate a UNO O PIÙ utenti (multi-utente 26/08 sera:
   primo = titolare, gli altri = membri in email_account_users) o a UNO O PIÙ
   punti vendita gemelli (negozio virgola-separato come i numeri WhatsApp,
   caso Magliana W3+Multi — col NOME personalizzato quando sono più d'uno).
   Più il flag 🛡 «protetta»: su quelle caselle l'AI non cestina mai (lo
   spam va in quarantena) — seed su amministrazione@. In fondo il registro
   ATTIVITÀ AI: cosa ha classificato e cancellato il motore, col Ripristina.
   NIENTE testo libero: utenti e negozi nascono sempre da una selezione. */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { useRolePermissions } from "@/lib/usePermissions";
import { capAllowed, CAP_EMAIL_ADMIN, CAP_EM_UTENTI, CAP_EM_NEGOZI } from "@/lib/capabilities";
import { ConnectModal } from "@/components/EmailInbox";
import { AttivitaAI } from "@/components/AttivitaAI";
import { SelectMulti } from "@/components/SelectPersona";
import { splitNegozi, sameStore } from "@/lib/visibleStores";
import { Mail, Loader2, Trash2, RefreshCw, User as UserIcon, Store, KeyRound, Plus, Shield, ShieldOff, Check } from "lucide-react";
import { cn } from "@/utils";

type Casella = {
    // quali utenze prendono i codici da questa casella (solo per le caselle di
    // servizio: lo calcola il server, così si vede se sta lavorando davvero)
    serve?: { accesso: string; username: string }[];
    id: string; email_address: string; display_name: string | null;
    negozio: string | null; owner_user_id: string | null; ai_protetta: boolean | null;
    status: string; last_error: string | null; created_at?: string;
};
type Utente = { id: string; full_name: string; primary_store: string | null };

const api = (body: unknown) => fetch("/api/email/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());

/** radice comune di più nomi negozio ("Magliana W3"+"Magliana Multi" → "Magliana") */
const radiceComune = (nomi: string[]): string => {
    if (!nomi.length) return "";
    const parole = nomi.map(n => n.trim().split(/\s+/));
    const out: string[] = [];
    for (let k = 0; k < parole[0].length; k++) {
        const w = parole[0][k];
        if (parole.every(p => (p[k] || "").toLowerCase() === w.toLowerCase())) out.push(w);
        else break;
    }
    return out.join(" ");
};

export function EmailAdminView() {
    const [caselle, setCaselle] = useState<Casella[] | null>(null);
    const [utenti, setUtenti] = useState<Utente[]>([]);
    const [negozi, setNegozi] = useState<string[]>([]);
    // membri per casella (multi-utente): account_id → [user_id]
    const [membri, setMembri] = useState<Record<string, string[]>>({});

    const { user } = useAuth();
    const { perms, loaded: permsLoaded } = useRolePermissions(user?.role, user?.grade, user?.id);
    // i controlli compaiono solo a permessi CARICATI (rilievo revisore: nel
    // pre-load capAllowed risponde col default del ruolo — un revocato per
    // persona vedeva i bottoni per un attimo)
    const puoUtenti = permsLoaded && capAllowed(user?.role, CAP_EMAIL_ADMIN.section, CAP_EM_UTENTI, perms);
    const puoNegozi = permsLoaded && capAllowed(user?.role, CAP_EMAIL_ADMIN.section, CAP_EM_NEGOZI, perms);
    const puoGestire = (c: Casella) => c.owner_user_id ? puoUtenti : puoNegozi;
    const inElenco = (c: Casella) =>
        (puoUtenti && puoNegozi) || (!puoUtenti && !puoNegozi) || puoGestire(c);

    // ── collega casella nuova: selezione MULTI di utenti o negozi ──
    const [tipoNuovo, setTipoNuovo] = useState<"utente" | "negozio">("negozio");
    const [selUtenti, setSelUtenti] = useState<string[]>([]);
    const [selNegozi, setSelNegozi] = useState<string[]>([]);
    const [nomeMulti, setNomeMulti] = useState("");
    useEffect(() => {
        if (tipoNuovo === "utente" && !puoUtenti && puoNegozi) setTipoNuovo("negozio");
        if (tipoNuovo === "negozio" && !puoNegozi && puoUtenti) setTipoNuovo("utente");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [puoUtenti, puoNegozi]);
    const [modal, setModal] = useState<{ ownerUserId?: string; extraUserIds?: string[]; negozio?: string; presetEmail?: string; presetDisplay?: string } | null>(null);

    const [provando, setProvando] = useState<string | null>(null);
    const [esitiProva, setEsitiProva] = useState<Record<string, string>>({});
    const [deleting, setDeleting] = useState<string | null>(null);

    const carica = async () => {
        const [{ data }, { data: memb }] = await Promise.all([
            supabase.from("email_accounts")
                .select("id, email_address, display_name, negozio, owner_user_id, ai_protetta, status, last_error, created_at")
                .order("created_at"),
            supabase.from("email_account_users").select("account_id, user_id"),
        ]);
        setCaselle((data ?? []) as Casella[]);
        const m: Record<string, string[]> = {};
        (memb || []).forEach((r: any) => { (m[r.account_id] = m[r.account_id] || []).push(r.user_id); });
        setMembri(m);
    };
    const [visStores, setVisStores] = useState<Record<string, string[]>>({});
    useEffect(() => {
        carica();
        const t = setInterval(carica, 8000);
        supabase.from("app_users").select("id, full_name, primary_store").eq("active", true).order("full_name")
            .then(({ data }) => setUtenti((data ?? []) as Utente[]));
        supabase.from("stores").select("name").order("name")
            .then(({ data }) => setNegozi(((data ?? []) as { name: string }[]).map(s => s.name)));
        (async () => {
            const [ass, vis] = await Promise.all([
                supabase.from("user_stores").select("user_id, store_name").limit(3000),
                supabase.from("user_store_visibility").select("user_id, store_name").limit(3000),
            ]);
            const m: Record<string, string[]> = {};
            [...(ass.data ?? []), ...(vis.data ?? [])].forEach((r: { user_id: string; store_name: string }) => {
                (m[r.user_id] = m[r.user_id] || []).push(r.store_name);
            });
            setVisStores(m);
        })();
        return () => clearInterval(t);
    }, []);

    const nomeDi = (id: string | null | undefined) => utenti.find(u => u.id === id)?.full_name || null;
    /** chi VEDE una casella di negozio (anche multi): unione visibilità CRM */
    const utentiCheVedono = (negozioCsv: string): string[] => {
        const stores = splitNegozi(negozioCsv);
        return utenti.filter(u => {
            const suoi = [...(visStores[u.id] || []), ...(u.primary_store ? [u.primary_store] : [])];
            return stores.some(st => suoi.some(s => sameStore(s, st)));
        }).map(u => u.full_name);
    };

    const apriCollega = () => {
        if (tipoNuovo === "utente") {
            const scelti = selUtenti.map(n => utenti.find(x => x.full_name === n)).filter(Boolean) as Utente[];
            if (!scelti.length) { alert("Scegli almeno un collaboratore dalla tendina."); return; }
            const nome = scelti.length === 1 ? scelti[0].full_name : nomeMulti.trim();
            if (!nome) { alert("Con più persone serve il nome della casella (es. «Store Manager»)."); return; }
            setModal({ ownerUserId: scelti[0].id, extraUserIds: scelti.slice(1).map(u => u.id), presetDisplay: nome });
        } else {
            const scelti = selNegozi.filter(n => negozi.includes(n));
            if (!scelti.length) { alert("Scegli almeno un punto vendita dalla tendina."); return; }
            const nome = scelti.length === 1 ? scelti[0] : nomeMulti.trim();
            if (!nome) { alert("Con più punti vendita serve il nome della casella (es. «" + (radiceComune(scelti) || "Magliana") + "»)."); return; }
            setModal({ negozio: scelti.join(", "), presetDisplay: nome });
        }
    };

    const riprova = async (c: Casella) => {
        setProvando(c.id);
        try {
            const res = await api({ action: "retest", id: c.id, userId: user?.id });
            setEsitiProva(p => ({ ...p, [c.id]: res?.ok ? "ok" : (res?.error || "errore") }));
        } catch { setEsitiProva(p => ({ ...p, [c.id]: "errore di rete" })); }
        setProvando(null);
        carica();
    };

    const elimina = async (c: Casella) => {
        const nome = c.display_name || c.email_address;
        const [conv, msg] = await Promise.all([
            supabase.from("email_conversations").select("id", { count: "exact", head: true }).eq("account_id", c.id),
            supabase.from("email_messages").select("id", { count: "exact", head: true }).eq("account_id", c.id),
        ]);
        if (!window.confirm(`Eliminare la casella «${nome}» dal CRM?\n\nVia ${msg.count ?? 0} messaggi di ${conv.count ?? 0} conversazioni (bozze comprese). Non si può annullare.\n\nLa casella reale sul server di posta NON viene toccata.`)) return;
        if (!window.confirm(`Ultima conferma: eliminare «${nome}» con tutto lo storico scaricato?`)) return;
        setDeleting(c.id);
        try {
            const res = await api({ action: "delete", id: c.id, userId: user?.id });
            if (res?.error) { alert("Eliminazione non riuscita: " + res.error); return; }
        } catch { alert("Eliminazione non riuscita: errore di rete"); }
        finally { setDeleting(null); }
        carica();
    };

    // 🛡 esclusa dall'AI: il triage non la legge, non la classifica, non la
    // conteggia (direttiva Luca 26/08 sera, caso amministrazione@)
    const toggleProtetta = async (c: Casella) => {
        const { error } = await supabase.from("email_accounts").update({ ai_protetta: !c.ai_protetta }).eq("id", c.id);
        if (error) { alert("Cambio non riuscito: " + error.message); return; }
        carica();
    };

    // ── 🚫 MITTENTI BLOCCATI (Luca 26/08: «Verisure cancellale sempre», poi
    // allarmi.payprint): pattern = pezzo dell'indirizzo mittente; il motore
    // cestina d'ufficio senza interpellare l'AI, guardie dure comprese
    const [bloccati, setBloccati] = useState<{ id: string; pattern: string; oggetto: string | null; note: string | null }[]>([]);
    const [nuovoPattern, setNuovoPattern] = useState("");
    const [nuovoOggetto, setNuovoOggetto] = useState("");
    const [nuovaNota, setNuovaNota] = useState("");
    const caricaBloccati = () => supabase.from("email_mittenti_bloccati").select("id, pattern, oggetto, note").order("pattern")
        .then(({ data }) => setBloccati((data ?? []) as any));
    useEffect(() => { caricaBloccati(); }, []);
    const aggiungiBloccato = async () => {
        const p = nuovoPattern.trim().toLowerCase();
        if (p.length < 4) { alert("Il pattern deve avere almeno 4 caratteri (es. «verisure», «allarmi.payprint») — troppo corto cestinerebbe mezzo mondo."); return; }
        const { error } = await supabase.from("email_mittenti_bloccati")
            .insert({ pattern: p, oggetto: nuovoOggetto.trim().toLowerCase() || null, note: nuovaNota.trim() || null, creato_da: user?.name || user?.id || null });
        if (error) { alert("Non aggiunto: " + error.message); return; }
        setNuovoPattern(""); setNuovoOggetto(""); setNuovaNota("");
        caricaBloccati();
    };
    const rimuoviBloccato = async (id: string, pattern: string) => {
        if (!window.confirm(`Sbloccare «${pattern}»? Le email future di quel mittente torneranno a passare dal triage normale (quelle già cestinate restano nel cestino).`)) return;
        const { error } = await supabase.from("email_mittenti_bloccati").delete().eq("id", id);
        if (error) { alert("Non rimosso: " + error.message); return; }
        caricaBloccati();
    };

    // ── riassegnazione dalla riga: MULTI, con nome quando serve ──
    const [riass, setRiass] = useState<Record<string, { utenti: string[]; negozi: string[]; nome: string }>>({});
    const riassDi = (id: string) => riass[id] || { utenti: [], negozi: [], nome: "" };
    const setRiassDi = (id: string, patch: Partial<{ utenti: string[]; negozi: string[]; nome: string }>) =>
        setRiass(p => ({ ...p, [id]: { ...riassDi(id), ...patch } }));
    const applicaRiass = async (c: Casella) => {
        const r = riassDi(c.id);
        const utentiScelti = r.utenti.map(n => utenti.find(x => x.full_name === n)).filter(Boolean) as Utente[];
        const negoziScelti = r.negozi.filter(n => negozi.includes(n));
        if (utentiScelti.length && negoziScelti.length) { alert("O persone O punti vendita: la casella è personale oppure di negozio."); return; }
        if (!utentiScelti.length && !negoziScelti.length) { alert("Scegli almeno una persona o un punto vendita."); return; }
        const multi = (utentiScelti.length || negoziScelti.length) > 1;
        const nome = multi ? r.nome.trim() : (utentiScelti[0]?.full_name || negoziScelti[0]);
        if (!nome) { alert("Con più selezioni serve il nome della casella."); return; }
        if (utentiScelti.length) {
            // personale (anche condivisa tra più persone): SENZA negozio
            const { error } = await supabase.from("email_accounts")
                .update({ owner_user_id: utentiScelti[0].id, display_name: nome, negozio: null }).eq("id", c.id);
            if (error) { alert("Assegnazione non riuscita: " + error.message); return; }
            await supabase.from("email_account_users").delete().eq("account_id", c.id);
            if (utentiScelti.length > 1) {
                await supabase.from("email_account_users")
                    .insert(utentiScelti.slice(1).map(u => ({ account_id: c.id, user_id: u.id })));
            }
        } else {
            const { error } = await supabase.from("email_accounts")
                .update({ negozio: negoziScelti.join(", "), display_name: nome, owner_user_id: null }).eq("id", c.id);
            if (error) { alert("Assegnazione non riuscita: " + error.message); return; }
            await supabase.from("email_account_users").delete().eq("account_id", c.id);
        }
        setRiass(p => { const n = { ...p }; delete n[c.id]; return n; });
        carica();
    };

    return (
        <div className="space-y-5">
            {/* COLLEGA UNA CASELLA NUOVA — selezione MULTI, mai testo libero */}
            {(puoUtenti || puoNegozi) && (
            <div className="glass-panel rounded-2xl p-5" style={{ borderLeft: "4px solid var(--tf-38bdf8, #38bdf8)" }}>
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-3">➕ Collega una casella nuova — scegli a chi intestarla (anche più persone o più punti vendita gemelli)</div>
                <div className="flex items-center gap-2 flex-wrap">
                    {puoUtenti && (
                    <button onClick={() => { setTipoNuovo("utente"); setSelNegozi([]); setNomeMulti(""); }}
                        className={cn("px-3 py-2 rounded-xl text-sm font-bold border flex items-center gap-1.5",
                            tipoNuovo === "utente" ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200" : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10")}>
                        <UserIcon className="w-4 h-4" /> Utenti
                    </button>
                    )}
                    {puoNegozi && (
                    <button onClick={() => { setTipoNuovo("negozio"); setSelUtenti([]); setNomeMulti(""); }}
                        className={cn("px-3 py-2 rounded-xl text-sm font-bold border flex items-center gap-1.5",
                            tipoNuovo === "negozio" ? "bg-sky-500/15 border-sky-500/40 text-sky-200" : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10")}>
                        <Store className="w-4 h-4" /> Negozi
                    </button>
                    )}
                    <div className="min-w-[260px]">
                        {tipoNuovo === "utente"
                            ? <SelectMulti values={selUtenti} onChange={setSelUtenti} opzioni={utenti.map(u => u.full_name)} placeholder="Scegli uno o più collaboratori…" />
                            : <SelectMulti values={selNegozi} onChange={(v) => { setSelNegozi(v); if (v.length > 1 && !nomeMulti) setNomeMulti(radiceComune(v)); }} opzioni={negozi} placeholder="Scegli uno o più punti vendita…" maxVoci={100} />}
                    </div>
                    {((tipoNuovo === "utente" && selUtenti.length > 1) || (tipoNuovo === "negozio" && selNegozi.length > 1)) && (
                        <label className="text-[11px] text-sky-300/90 inline-flex items-center gap-1.5">nome della casella
                            <input value={nomeMulti} onChange={e => setNomeMulti(e.target.value)}
                                className="bg-white/[0.05] border border-sky-500/30 rounded-lg px-2.5 py-2 text-sm text-white w-44" placeholder={tipoNuovo === "negozio" ? "es. Magliana" : "es. Store Manager"} />
                        </label>
                    )}
                    <button onClick={apriCollega} className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Credenziali e collega
                    </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-2.5">
                    👤 <b>Utenti</b>: casella personale — la vedono solo gli intestatari (uno o più).
                    🏪 <b>Negozi</b>: casella del punto vendita (anche gemelli, es. Magliana W3+Multi) — la vedono tutte le persone con uno dei negozi in visibilità.
                    Le credenziali si verificano prima di salvare; la password resta cifrata e non torna mai al browser.
                </p>
            </div>
            )}
            {permsLoaded && !puoUtenti && !puoNegozi && (
                <p className="text-[12px] text-slate-500">Sei in sola consultazione: la gestione delle caselle si concede dalla rotellina Permessi → «Pannello Email».</p>
            )}

            {/* CASELLE DI SERVIZIO — dove arrivano i codici usa e getta */}
            <CaselleDiServizio userId={user?.id} puoGestire={puoUtenti || puoNegozi} />

            {/* TUTTE LE CASELLE */}
            <div className="glass-panel rounded-2xl overflow-hidden">
                <div className="px-4 pt-3 pb-2 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">📬 Caselle collegate <span className="text-slate-600">({caselle == null ? "…" : caselle.filter(inElenco).length})</span></div>
                {caselle === null ? (
                    <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
                ) : caselle.filter(inElenco).length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-sm">Nessuna casella collegata: usa «Collega una casella nuova» qui sopra.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                    <th className="text-left font-semibold px-4 py-1.5">Casella</th>
                                    <th className="text-left font-semibold px-3 py-1.5">Intestata a</th>
                                    <th className="text-left font-semibold px-3 py-1.5">Stato</th>
                                    <th className="text-left font-semibold px-3 py-1.5" title="Riprova login IMAP e SMTP con le credenziali salvate">Prova connessione</th>
                                    <th className="px-3 py-1.5 w-72"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {caselle.filter(inElenco).map(c => {
                                    const tit = nomeDi(c.owner_user_id);
                                    const nomiMembri = (membri[c.id] || []).map(id => nomeDi(id)).filter(Boolean) as string[];
                                    const prova = esitiProva[c.id];
                                    const r = riassDi(c.id);
                                    const multiSel = (r.utenti.length + r.negozi.length) > 1;
                                    return (
                                        <tr key={c.id} className="border-t border-white/5 hover:bg-white/[0.03] align-top">
                                            <td className="px-4 py-2">
                                                <div className="font-semibold text-white flex items-center gap-1.5">
                                                    {c.display_name || c.email_address}
                                                    {c.ai_protetta && <Shield className="w-3.5 h-3.5 text-emerald-300" aria-label="Esclusa dall'AI" />}
                                                </div>
                                                <div className="text-[11px] text-slate-500">{c.email_address}</div>
                                            </td>
                                            <td className="px-3 py-2">
                                                {tit ? (
                                                    <span className="text-emerald-300 text-[12px] font-semibold inline-flex items-center gap-1"><UserIcon className="w-3.5 h-3.5" /> {tit}{nomiMembri.length ? ` + ${nomiMembri.join(", ")}` : ""} <span className="text-slate-500 font-normal">(personale{nomiMembri.length ? " condivisa" : ""})</span></span>
                                                ) : c.negozio ? (
                                                    <span className="text-sky-300 text-[12px] font-semibold inline-flex items-center gap-1"><Store className="w-3.5 h-3.5" /> {c.negozio} <span className="text-slate-500 font-normal">(condivisa col negozio)</span></span>
                                                ) : (
                                                    <span className="text-slate-500 text-[12px]">— da intestare</span>
                                                )}
                                                {!c.owner_user_id && c.negozio && (() => {
                                                    const nomi = utentiCheVedono(c.negozio);
                                                    if (!nomi.length) return <div className="text-[11px] text-slate-500 mt-1">👥 nessun utente ha {c.negozio} in visibilità</div>;
                                                    return (
                                                        <div className="text-[11px] text-slate-400 mt-1" title={nomi.join(", ")}>
                                                            👥 la vedono: <span className="text-slate-300">{nomi.slice(0, 4).join(", ")}{nomi.length > 4 ? ` +${nomi.length - 4}` : ""}</span>
                                                        </div>
                                                    );
                                                })()}
                                                {puoGestire(c) && (
                                                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                                    {puoUtenti && <div className="min-w-[170px]"><SelectMulti values={r.utenti} onChange={(v) => setRiassDi(c.id, { utenti: v, negozi: [] })} opzioni={utenti.map(u => u.full_name)} placeholder="→ a persone…" /></div>}
                                                    {puoNegozi && <div className="min-w-[150px]"><SelectMulti values={r.negozi} onChange={(v) => setRiassDi(c.id, { negozi: v, utenti: [], nome: v.length > 1 && !r.nome ? radiceComune(v) : r.nome })} opzioni={negozi} maxVoci={100} placeholder="→ a negozi…" /></div>}
                                                    {multiSel && <input value={r.nome} onChange={e => setRiassDi(c.id, { nome: e.target.value })} placeholder="nome casella" className="bg-white/[0.05] border border-sky-500/30 rounded-lg px-2 py-1.5 text-[12px] text-white w-32" />}
                                                    {(r.utenti.length > 0 || r.negozi.length > 0) && (
                                                        <button onClick={() => applicaRiass(c)} title="Applica la nuova intestazione"
                                                            className="px-2 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[12px] font-bold inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Applica</button>
                                                    )}
                                                </div>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-300"><span className={cn("w-2 h-2 rounded-full", c.status === "attiva" ? "bg-emerald-400" : "bg-rose-400")} /> {c.status}</span>
                                                {c.status !== "attiva" && c.last_error && <div className="text-[10px] text-rose-300/80 max-w-[180px] truncate" title={c.last_error}>{c.last_error}</div>}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                {prova ? (
                                                    <span className={cn("text-[12px] font-semibold max-w-[180px] truncate inline-block align-middle", prova === "ok" ? "text-emerald-300" : "text-amber-300")} title={prova}>{prova === "ok" ? "✓ login riuscito" : prova}</span>
                                                ) : <span className="text-slate-600 text-[12px]">—</span>}
                                            </td>
                                            <td className="px-3 py-2 text-right whitespace-nowrap">
                                                {puoGestire(c) && (
                                                <>
                                                <button onClick={() => toggleProtetta(c)}
                                                    title={c.ai_protetta ? "Esclusa dall'AI: il triage non la legge, non la classifica, non la conteggia nel widget (resta normale nell'Inbox). Clicca per includerla." : "Inclusa nell'AI: il triage la smista e cestina spam/phishing in automatico. Clicca per escluderla del tutto."}
                                                    className={cn("px-2 py-1.5 rounded-lg border text-[12px] font-semibold mr-1.5 inline-flex items-center gap-1",
                                                        c.ai_protetta ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10" : "border-white/10 text-slate-400 hover:bg-white/10")}>
                                                    {c.ai_protetta ? <Shield className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />}
                                                </button>
                                                <button onClick={() => riprova(c)} disabled={provando === c.id}
                                                    className="px-2.5 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/10 text-[12px] font-semibold mr-1.5 inline-flex items-center gap-1">
                                                    {provando === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Prova
                                                </button>
                                                <button onClick={() => setModal({ presetEmail: c.email_address, presetDisplay: c.display_name || "", ownerUserId: c.owner_user_id || undefined, extraUserIds: membri[c.id] || [], negozio: !c.owner_user_id ? (c.negozio || undefined) : undefined })}
                                                    title="Ri-collega con la password nuova (es. credenziali cambiate): la posta già scaricata resta"
                                                    className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[12px] font-bold mr-1.5 inline-flex items-center gap-1">
                                                    <KeyRound className="w-3.5 h-3.5" /> Ricollega
                                                </button>
                                                <button onClick={() => elimina(c)} disabled={deleting === c.id}
                                                    title="Elimina la casella dal CRM con tutto lo storico scaricato (la casella sul server di posta non si tocca)"
                                                    className="p-1.5 rounded-lg text-slate-600 hover:text-rose-300 hover:bg-rose-500/10">
                                                    {deleting === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                </button>
                                                </>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* 🚫 MITTENTI BLOCCATI — cestino d'ufficio, governabile da qui */}
            {(puoUtenti || puoNegozi) && (
            <div className="glass-panel rounded-2xl p-5" style={{ borderLeft: "4px solid var(--tf-f43f5e, #f43f5e)" }}>
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">🚫 Regole di cestinazione — dicono all&apos;AI cosa cestinare con certezza</div>
                <p className="text-[11px] text-slate-500 mb-3">Il pattern è un pezzo dell&apos;indirizzo del mittente (es. «verisure»), con filtro facoltativo sull&apos;oggetto. L&apos;AI le tratta come certezze ma resta il giudice: se in mezzo arriva qualcosa di davvero importante (una disdetta, un problema di pagamento) la salva e spiega perché. Valgono sempre i paracadute: mai cestinata una conversazione con nostre risposte, di un cliente censito, stellata o ripristinata.</p>
                <div className="flex items-center gap-2 flex-wrap mb-3">
                    <input value={nuovoPattern} onChange={e => setNuovoPattern(e.target.value)} placeholder="pezzo dell'indirizzo (es. verisure)"
                        className="glass-input text-sm px-3 py-2 w-56" />
                    <input value={nuovoOggetto} onChange={e => setNuovoOggetto(e.target.value)} placeholder="solo se l'oggetto contiene… (facoltativo)"
                        className="glass-input text-sm px-3 py-2 w-64" title="Vuoto = blocca tutto del mittente. Compilato = cestina solo le email il cui oggetto contiene questo testo (es. «trasferimento merce»)" />
                    <input value={nuovaNota} onChange={e => setNuovaNota(e.target.value)} placeholder="nota (perché lo blocchiamo)"
                        className="glass-input text-sm px-3 py-2 flex-1 min-w-[180px]" />
                    <button onClick={aggiungiBloccato} className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Blocca
                    </button>
                </div>
                {bloccati.length === 0 ? (
                    <p className="text-[12px] text-slate-500">Nessun mittente bloccato.</p>
                ) : (
                    <div className="space-y-1.5">
                        {bloccati.map(b => (
                            <div key={b.id} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.03]">
                                <span className="font-mono text-[13px] font-bold text-rose-200">{b.pattern}</span>
                                {b.oggetto && <span className="text-[11px] text-amber-300/90 shrink-0">solo oggetto: «{b.oggetto}»</span>}
                                <span className="text-[11px] text-slate-500 truncate flex-1">{b.note || ""}</span>
                                <button onClick={() => rimuoviBloccato(b.id, b.pattern)} title="Sblocca questo mittente"
                                    className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-rose-300 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            )}

            {/* REGISTRO ATTIVITÀ AI — cosa classifica e cancella il motore */}
            <AttivitaAI canale="email" />

            <p className="text-[11px] text-slate-500 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Nell&apos;Inbox i collaboratori le caselle le usano e basta: collegare, riassegnare ed eliminare si fa solo da qui. 🛡 = casella esclusa dall&apos;AI (niente triage, niente cancellazioni, fuori dalle statistiche).</p>

            {modal && (
                <ConnectModal ownerUserId={modal.ownerUserId} extraUserIds={modal.extraUserIds} negozio={modal.negozio}
                    presetEmail={modal.presetEmail} presetDisplay={modal.presetDisplay} userId={user?.id}
                    onClose={() => { setModal(null); setSelUtenti([]); setSelNegozi([]); setNomeMulti(""); carica(); }} />
            )}
        </div>
    );
}

/* ── LE CASELLE DEI CODICI (Luca 28/08 sera) ────────────────────────────
   Fastweb non si accontenta di utente e password: manda un codice via mail, e
   ogni utenza ha la sua casella. Metterle qui significa che il CRM può andare
   a prendere il codice per conto del collaboratore, senza dargli in mano la
   casella — che riceve anche tutto il resto.

   Non sono posta: non compaiono in nessuna Inbox, non si scaricano, non
   contano nei pallini. Il database non le consegna nemmeno al browser (vedi
   tf_mie_caselle), perciò questo elenco arriva dal server. */
function CaselleDiServizio({ userId, puoGestire }: { userId?: string; puoGestire: boolean }) {
    const [righe, setRighe] = useState<Casella[] | null>(null);
    const [attese, setAttese] = useState<{ email: string; utenze: { accesso: string; username: string }[] }[]>([]);
    const [apri, setApri] = useState(false);
    const [tolgo, setTolgo] = useState<string | null>(null);
    /* Il nome è un'etichetta per gli occhi: sbagliarlo scrivendo è normale, e
       correggerlo non deve costare scollegare e ricollegare con la password. */
    const [rinomino, setRinomino] = useState<string | null>(null);
    const [nomeNuovo, setNomeNuovo] = useState("");
    const salvaNome = async (c: Casella) => {
        const nome = nomeNuovo.trim();
        setRinomino(null);
        if (!nome || nome === (c.display_name || "")) return;
        const r = await fetch("/api/email/account", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "rinomina", id: c.id, displayName: nome, userId }),
        }).then((x) => x.json()).catch(() => ({ error: "rete" }));
        if (r?.error) { alert("Non sono riuscito a rinominarla: " + r.error); return; }
        carica();
    };

    const carica = async () => {
        try {
            const r = await fetch("/api/email/account?sistema=1", { cache: "no-store" });
            const j = await r.json();
            setRighe(j?.error ? [] : ((j.accounts ?? []) as Casella[]));
            setAttese(j?.attese ?? []);
        } catch { setRighe([]); }
    };
    useEffect(() => { carica(); }, []);

    const elimina = async (c: Casella) => {
        if (!confirm(`Scollegare «${c.email_address}»?\n\nLe utenze agganciate a questa casella resteranno senza codice finché non ne colleghi un'altra.`)) return;
        setTolgo(c.id);
        const r = await fetch("/api/email/account", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete", id: c.id, userId }),
        }).then((x) => x.json()).catch(() => ({ error: "rete" }));
        setTolgo(null);
        if (r?.error) { alert("Non è stato possibile scollegarla: " + r.error); return; }
        carica();
    };

    return (
        <div className="glass-panel rounded-2xl overflow-hidden" style={{ borderLeft: "4px solid #f59e0b" }}>
            <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <div className="text-[11px] uppercase tracking-wider text-amber-300/90 font-semibold">
                        🔑 Caselle dei codici <span className="text-slate-600">({righe === null ? "…" : righe.length})</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                        Dove arrivano i codici usa e getta (Fastweb). Non entrano nella posta di nessuno: il CRM ci pesca il codice solo quando qualcuno lo chiede dalla sezione Password.
                    </div>
                </div>
                {puoGestire && (
                    <button onClick={() => setApri(true)}
                        className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center gap-1.5 shrink-0">
                        <Plus className="w-4 h-4" /> Aggiungi casella dei codici
                    </button>
                )}
            </div>
            {righe === null ? (
                <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
            ) : righe.length === 0 ? (
                <div className="px-4 pb-4 pt-1 text-sm text-slate-500">
                    Nessuna casella dei codici. Aggiungi quelle su cui Fastweb manda gli OTP, poi in <b className="text-slate-400">Password</b> collega ogni utenza alla sua.
                </div>
            ) : (
                <div className="divide-y divide-white/5">
                    {righe.map((c) => (
                        <div key={c.id} className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
                            <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
                            <div className="min-w-0 flex-1">
                                {rinomino === c.id ? (
                                    <input autoFocus value={nomeNuovo} onChange={(e) => setNomeNuovo(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") salvaNome(c); if (e.key === "Escape") setRinomino(null); }}
                                        onBlur={() => salvaNome(c)}
                                        className="w-full max-w-xs bg-black/40 border border-amber-400/50 rounded-lg px-2 py-1 text-sm text-white outline-none" />
                                ) : (
                                    <button onClick={() => { setRinomino(c.id); setNomeNuovo(c.display_name || ""); }}
                                        title="Clicca per rinominarla"
                                        className="block max-w-full text-left text-sm text-white font-medium truncate hover:text-amber-200 transition-colors">
                                        {c.display_name || c.email_address}
                                    </button>
                                )}
                                {c.display_name && <div className="text-[11px] text-slate-500 font-mono truncate">{c.email_address}</div>}
                                {c.serve?.length ? (
                                    <div className="text-[11px] text-emerald-300/80 truncate mt-0.5">
                                        serve: {c.serve.map((u) => `${u.accesso} (${u.username})`).join(" · ")}
                                    </div>
                                ) : (
                                    <div className="text-[11px] text-slate-600 mt-0.5">nessuna utenza agganciata</div>
                                )}
                            </div>
                            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0",
                                c.status === "disconnessa" || c.status === "errore"
                                    ? "bg-rose-500/15 border-rose-500/40 text-rose-300"
                                    : "bg-emerald-500/15 border-emerald-500/40 text-emerald-300")}>
                                {c.status === "disconnessa" || c.status === "errore" ? "da ricollegare" : "attiva"}
                            </span>
                            {c.last_error && <span className="text-[10px] text-rose-300/80 truncate max-w-[280px]" title={c.last_error}>{c.last_error}</span>}
                            {puoGestire && (
                                <button onClick={() => elimina(c)} disabled={tolgo === c.id}
                                    title="Scollega questa casella"
                                    className="p-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400 shrink-0">
                                    {tolgo === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
            {/* CHI ASPETTA COSA: le utenze sanno già su quale indirizzo arriva
                il loro codice; appena colleghi quella casella si agganciano da sole */}
            {attese.length > 0 && (
                <div className="px-4 pb-4 pt-2 border-t border-white/5">
                    <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
                        ⏳ Utenze in attesa della loro casella
                    </div>
                    <div className="space-y-1.5">
                        {attese.map((a) => (
                            <div key={a.email} className="flex items-start gap-2 flex-wrap text-[12px]">
                                <span className="font-mono text-amber-200/90">{a.email}</span>
                                <span className="text-slate-600">←</span>
                                <span className="text-slate-400">
                                    {a.utenze.map((u) => `${u.accesso} (${u.username})`).join(" · ")}
                                </span>
                            </div>
                        ))}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2">
                        Collega questi indirizzi qui sopra: le utenze si agganciano da sole e il pulsante «Chiedi il codice» comincia a funzionare.
                    </p>
                </div>
            )}
            {apri && (
                <ConnectModal usoSistema userId={userId} onClose={() => { setApri(false); carica(); }} />
            )}
        </div>
    );
}
