"use client";

/* PANNELLO EMAIL (Luca 26/08 — governance caselle): il posto UNICO dove
   l'amministrazione governa le caselle email del CRM, gemello del Pannello
   WhatsApp. Da qui si collegano caselle nuove intestate a un UTENTE (casella
   personale) o a un NEGOZIO (condivisa per visibilità), si riassegnano, si
   riprova la connessione con le credenziali salvate, si ri-collegano con la
   password nuova e si eliminano. Nell'Inbox i collaboratori le USANO e
   basta: niente più «Collega email» self-service (capacità CAP_EMAIL_ADMIN,
   rotellina Permessi → «Pannello Email»). NIENTE testo libero: utente e
   negozio nascono sempre da una selezione. */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { useRolePermissions } from "@/lib/usePermissions";
import { capAllowed, CAP_EMAIL_ADMIN, CAP_EM_UTENTI, CAP_EM_NEGOZI } from "@/lib/capabilities";
import { ConnectModal } from "@/components/EmailInbox";
import { SelectPersona, SelectOpzioni } from "@/components/SelectPersona";
import { sameStore } from "@/lib/visibleStores";
import { Mail, Loader2, Trash2, RefreshCw, User as UserIcon, Store, KeyRound, Plus } from "lucide-react";
import { cn } from "@/utils";

type Casella = {
    id: string; email_address: string; display_name: string | null;
    negozio: string | null; owner_user_id: string | null;
    status: string; last_error: string | null; created_at?: string;
};
type Utente = { id: string; full_name: string; primary_store: string | null };

const api = (body: unknown) => fetch("/api/email/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());

export function EmailAdminView() {
    const [caselle, setCaselle] = useState<Casella[] | null>(null);
    const [utenti, setUtenti] = useState<Utente[]>([]);
    const [negozi, setNegozi] = useState<string[]>([]);

    // capacità: cosa può GESTIRE chi vede il pannello (pattern WhatsApp) —
    // caselle personali, caselle dei punti vendita, o entrambe
    const { user } = useAuth();
    const { perms, loaded: permsLoaded } = useRolePermissions(user?.role, user?.grade, user?.id);
    const puoUtenti = capAllowed(user?.role, CAP_EMAIL_ADMIN.section, CAP_EM_UTENTI, perms);
    const puoNegozi = capAllowed(user?.role, CAP_EMAIL_ADMIN.section, CAP_EM_NEGOZI, perms);
    const puoGestire = (c: Casella) => c.owner_user_id ? puoUtenti : puoNegozi;
    const inElenco = (c: Casella) =>
        (puoUtenti && puoNegozi) || (!puoUtenti && !puoNegozi) || puoGestire(c);

    // collegamento nuovo: SELEZIONE utente o negozio, mai testo libero
    const [tipoNuovo, setTipoNuovo] = useState<"utente" | "negozio">("negozio");
    const [selNome, setSelNome] = useState("");
    const [selNegozio, setSelNegozio] = useState("");
    useEffect(() => {
        if (tipoNuovo === "utente" && !puoUtenti && puoNegozi) setTipoNuovo("negozio");
        if (tipoNuovo === "negozio" && !puoNegozi && puoUtenti) setTipoNuovo("utente");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [puoUtenti, puoNegozi]);
    const [modal, setModal] = useState<{ ownerUserId?: string; negozio?: string; presetEmail?: string; presetDisplay?: string } | null>(null);

    const [provando, setProvando] = useState<string | null>(null);
    const [esitiProva, setEsitiProva] = useState<Record<string, string>>({});
    const [deleting, setDeleting] = useState<string | null>(null);

    const carica = async () => {
        const { data } = await supabase.from("email_accounts")
            .select("id, email_address, display_name, negozio, owner_user_id, status, last_error, created_at")
            .order("created_at");
        setCaselle((data ?? []) as Casella[]);
    };
    // «LO VEDONO»: per le caselle di negozio, l'elenco vero delle persone —
    // stessa unione della visibilità del CRM (pattern Pannello WhatsApp)
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

    const nomeTitolare = (id: string | null) => utenti.find(u => u.id === id)?.full_name || null;
    const utentiCheVedono = (negozio: string): string[] =>
        utenti.filter(u => {
            const suoi = [...(visStores[u.id] || []), ...(u.primary_store ? [u.primary_store] : [])];
            return suoi.some(s => sameStore(s, negozio));
        }).map(u => u.full_name);

    const apriCollega = () => {
        if (tipoNuovo === "utente") {
            const u = utenti.find(x => x.full_name === selNome);
            if (!u) { alert("Scegli l'utente DALLA TENDINA: il nome scritto a mano non vale."); return; }
            setModal({ ownerUserId: u.id, presetDisplay: u.full_name });
        } else {
            if (!negozi.includes(selNegozio)) { alert("Scegli il punto vendita dalla tendina."); return; }
            setModal({ negozio: selNegozio, presetDisplay: selNegozio });
        }
    };

    // riprova la connessione con le credenziali GIÀ salvate (IMAP+SMTP):
    // per i «disconnessa/errore» senza dover reinserire la password
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
        // conteggi reali per la conferma esplicita (pattern ManageAccountsModal)
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

    // riassegnazione dalla riga: SEMPRE dalle tendine. La casella PERSONALE
    // resta senza negozio (parità col gemello WhatsApp, rilievo 25/08 là e
    // 26/08 qui): col negozio scritto il pallino Email della Chat contava la
    // sua posta anche ai colleghi del negozio, che però non possono aprirla
    const assegnaUtente = async (c: Casella, nome: string) => {
        const u = utenti.find(x => x.full_name === nome);
        if (!u) return;
        const { error } = await supabase.from("email_accounts")
            .update({ owner_user_id: u.id, display_name: u.full_name, negozio: null }).eq("id", c.id);
        if (error) { alert("Assegnazione non riuscita: " + error.message); return; }
        carica();
    };
    const assegnaNegozio = async (c: Casella, nome: string) => {
        if (!negozi.includes(nome)) return;
        const { error } = await supabase.from("email_accounts")
            .update({ negozio: nome, display_name: nome, owner_user_id: null }).eq("id", c.id);
        if (error) { alert("Assegnazione non riuscita: " + error.message); return; }
        carica();
    };

    return (
        <div className="space-y-5">
            {/* COLLEGA UNA CASELLA NUOVA — solo da selezione */}
            {(puoUtenti || puoNegozi) && (
            <div className="glass-panel rounded-2xl p-5" style={{ borderLeft: "4px solid var(--tf-38bdf8, #38bdf8)" }}>
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-3">➕ Collega una casella nuova — scegli a chi intestarla (niente nomi a mano: l&apos;associazione automatica non sbaglia)</div>
                <div className="flex items-center gap-2 flex-wrap">
                    {puoUtenti && (
                    <button onClick={() => { setTipoNuovo("utente"); setSelNegozio(""); }}
                        className={cn("px-3 py-2 rounded-xl text-sm font-bold border flex items-center gap-1.5",
                            tipoNuovo === "utente" ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200" : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10")}>
                        <UserIcon className="w-4 h-4" /> Utente
                    </button>
                    )}
                    {puoNegozi && (
                    <button onClick={() => { setTipoNuovo("negozio"); setSelNome(""); }}
                        className={cn("px-3 py-2 rounded-xl text-sm font-bold border flex items-center gap-1.5",
                            tipoNuovo === "negozio" ? "bg-sky-500/15 border-sky-500/40 text-sky-200" : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10")}>
                        <Store className="w-4 h-4" /> Negozio
                    </button>
                    )}
                    <div className="min-w-[260px]">
                        {tipoNuovo === "utente"
                            ? <SelectPersona value={selNome} onChange={setSelNome} opzioni={utenti.map(u => u.full_name)} placeholder="Scegli il collaboratore…" />
                            : <SelectOpzioni value={selNegozio} onChange={setSelNegozio} opzioni={negozi} placeholder="Scegli il punto vendita…" />}
                    </div>
                    <button onClick={apriCollega} className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Credenziali e collega
                    </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-2.5">
                    👤 <b>Utente</b>: casella personale — la vede solo lui nell&apos;Inbox.
                    🏪 <b>Negozio</b>: casella del punto vendita — la vedono in automatico tutte le persone col negozio in visibilità.
                    Le credenziali si verificano (lettura e invio) prima di salvare; la password resta cifrata e non torna mai al browser.
                </p>
            </div>
            )}
            {permsLoaded && !puoUtenti && !puoNegozi && (
                <p className="text-[12px] text-slate-500">Sei in sola consultazione: la gestione delle caselle si concede dalla rotellina Permessi → «Pannello Email».</p>
            )}

            {/* TUTTE LE CASELLE: stato, riprova, ricollega, riassegna, elimina */}
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
                                    <th className="px-3 py-1.5 w-64"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {caselle.filter(inElenco).map(c => {
                                    const tit = nomeTitolare(c.owner_user_id);
                                    const prova = esitiProva[c.id];
                                    return (
                                        <tr key={c.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                                            <td className="px-4 py-2">
                                                <div className="font-semibold text-white">{c.display_name || c.email_address}</div>
                                                <div className="text-[11px] text-slate-500">{c.email_address}</div>
                                            </td>
                                            <td className="px-3 py-2">
                                                {tit ? (
                                                    <span className="text-emerald-300 text-[12px] font-semibold inline-flex items-center gap-1"><UserIcon className="w-3.5 h-3.5" /> {tit} <span className="text-slate-500 font-normal">(personale{c.negozio ? ` · ${c.negozio}` : ""})</span></span>
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
                                                    {puoUtenti && <div className="min-w-[170px]"><SelectPersona value="" onChange={(v) => assegnaUtente(c, v)} opzioni={utenti.map(u => u.full_name)} placeholder="→ a un utente…" /></div>}
                                                    {puoNegozi && <div className="min-w-[150px]"><SelectOpzioni value="" onChange={(v) => assegnaNegozio(c, v)} opzioni={negozi} placeholder="→ a un negozio…" /></div>}
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
                                                {/* la route del retest è gated come il resto: senza capacità
                                                    il bottone darebbe sempre 403 — meglio non mostrarlo */}
                                                {puoGestire(c) && (
                                                <button onClick={() => riprova(c)} disabled={provando === c.id}
                                                    className="px-2.5 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/10 text-[12px] font-semibold mr-1.5 inline-flex items-center gap-1">
                                                    {provando === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Prova
                                                </button>
                                                )}
                                                {puoGestire(c) && (
                                                    <button onClick={() => setModal({ presetEmail: c.email_address, presetDisplay: c.display_name || "", ownerUserId: c.owner_user_id || undefined, negozio: !c.owner_user_id ? (c.negozio || undefined) : undefined })}
                                                        title="Ri-collega con la password nuova (es. credenziali cambiate): la posta già scaricata resta"
                                                        className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[12px] font-bold mr-1.5 inline-flex items-center gap-1">
                                                        <KeyRound className="w-3.5 h-3.5" /> Ricollega
                                                    </button>
                                                )}
                                                {puoGestire(c) && (
                                                <button onClick={() => elimina(c)} disabled={deleting === c.id}
                                                    title="Elimina la casella dal CRM con tutto lo storico scaricato (la casella sul server di posta non si tocca)"
                                                    className="p-1.5 rounded-lg text-slate-600 hover:text-rose-300 hover:bg-rose-500/10">
                                                    {deleting === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                </button>
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

            <p className="text-[11px] text-slate-500 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Nell&apos;Inbox i collaboratori le caselle le usano e basta: collegare, riassegnare ed eliminare si fa solo da qui.</p>

            {modal && (
                <ConnectModal ownerUserId={modal.ownerUserId} negozio={modal.negozio}
                    presetEmail={modal.presetEmail} presetDisplay={modal.presetDisplay} userId={user?.id}
                    onClose={() => { setModal(null); carica(); }} />
            )}
        </div>
    );
}
