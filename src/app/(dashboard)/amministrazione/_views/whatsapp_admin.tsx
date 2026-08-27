"use client";

/* PANNELLO WHATSAPP (Luca 25/08 sera): il posto UNICO dove l'amministrazione
   governa i numeri WhatsApp del CRM — stato di tutti i numeri collegati,
   verifica live della connessione, ricollegamento col QR quando si
   scollegano, collegamento di numeri nuovi intestati a QUALSIASI utente
   (caller: ognuno il suo) o a un NEGOZIO. NIENTE testo libero (Luca: «così
   evitiamo errori di battitura»): il numero nasce da una SELEZIONE — utente
   dalla tendina persone, negozio dalla tendina punti vendita — e
   l'associazione automatica fa il resto (il numero di negozio lo vedono da
   soli tutti quelli col negozio in visibilità). */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { useRolePermissions } from "@/lib/usePermissions";
import { capAllowed, CAP_WHATSAPP_ADMIN, CAP_WA_UTENTI, CAP_WA_NEGOZI } from "@/lib/capabilities";
import { LinkModal } from "@/components/WhatsAppInbox";
import { AttivitaAI } from "@/components/AttivitaAI";
import { SelectPersona, SelectOpzioni, SelectMulti } from "@/components/SelectPersona";
import { sameStore } from "@/lib/visibleStores";
import { QrCode, Loader2, Trash2, RefreshCw, User as UserIcon, Store, LogOut } from "lucide-react";
import { cn } from "@/utils";

type Istanza = {
    id: string; instance_name: string; display_name: string | null; wa_number: string | null;
    status: string; owner_user_id: string | null; negozio: string | null; created_at?: string;
};
// ⚠️ le colonne vere sono `active` e `primary_store` (bug del primo giro:
// «attivo»/«negozio» non esistono — la query falliva in silenzio e la lista
// «lo vedono» usciva sempre vuota, caso Donna/Ben Aziza)
type Utente = { id: string; full_name: string; primary_store: string | null };

const api = (body: unknown) => fetch("/api/whatsapp/instance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());

export function WhatsAppAdminView() {
    const [istanze, setIstanze] = useState<Istanza[] | null>(null);
    const [utenti, setUtenti] = useState<Utente[]>([]);
    const [negozi, setNegozi] = useState<string[]>([]);

    // CAPACITÀ (Luca 25/08 notte): dentro il pannello, cosa può GESTIRE chi
    // lo vede — numeri personali, numeri dei punti vendita, o entrambi.
    // Si concedono dalla rotellina Permessi («Pannello WhatsApp»).
    const { user } = useAuth();
    const { perms } = useRolePermissions(user?.role, user?.grade, user?.id);
    const puoUtenti = capAllowed(user?.role, CAP_WHATSAPP_ADMIN.section, CAP_WA_UTENTI, perms);
    const puoNegozi = capAllowed(user?.role, CAP_WHATSAPP_ADMIN.section, CAP_WA_NEGOZI, perms);
    /** può gestire QUESTO numero? personale → capacità utenti; senza titolare → negozi */
    const puoGestire = (i: Istanza) => i.owner_user_id ? puoUtenti : puoNegozi;
    /** in ELENCO solo il dominio concesso (Luca 25/08 notte, caso direttore
     *  call center: «se non può smanettarci, non deve neanche vederli») —
     *  con entrambe le capacità (o nessuna: sola consultazione) si vede tutto */
    const inElenco = (i: Istanza) =>
        (puoUtenti && puoNegozi) || (!puoUtenti && !puoNegozi) || puoGestire(i);

    // ── collegamento nuovo: SELEZIONE utente o negozio/i, mai testo libero.
    // NEGOZI GEMELLI (Luca 25/08 notte, Magliana/Acilia/Collatina): la
    // selezione punti vendita è MULTI — un solo numero per entrambi; con più
    // negozi scelti si chiede il NOME da mettere sul numero (è quello che i
    // ragazzi vedono in chat).
    const [tipoNuovo, setTipoNuovo] = useState<"utente" | "negozio">("utente");
    const [selNome, setSelNome] = useState("");
    const [selNegozi, setSelNegozi] = useState<string[]>([]);
    // il toggle parte da un tipo CONCESSO dalla rotellina
    useEffect(() => {
        if (tipoNuovo === "utente" && !puoUtenti && puoNegozi) setTipoNuovo("negozio");
        if (tipoNuovo === "negozio" && !puoNegozi && puoUtenti) setTipoNuovo("utente");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [puoUtenti, puoNegozi]);
    const [nomeMulti, setNomeMulti] = useState("");
    const [modal, setModal] = useState<{ presetName: string; ownerUserId?: string; negozio?: string } | null>(null);
    const [relink, setRelink] = useState<string | null>(null);
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

    // ── verifica live per riga: instance_name → esito ("open"/"close"/errore)
    const [verifiche, setVerifiche] = useState<Record<string, string>>({});
    const [verificando, setVerificando] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);

    const carica = async () => {
        const { data } = await supabase.from("wa_instances").select("*").order("created_at");
        setIstanze((data ?? []) as Istanza[]);
    };
    // «LO VEDONO» (Luca 25/08 notte, esempio Garbatella → Daniele e Michele):
    // per i numeri di NEGOZIO l'elenco vero delle persone che li vedono —
    // stessa unione della visibilità del CRM (negozi assegnati + negozi in
    // visibilità + negozio del login) e stessa sameStore dell'Inbox.
    const [visStores, setVisStores] = useState<Record<string, string[]>>({});
    useEffect(() => {
        carica();
        // BACKFILL numeri all'apertura (Luca 25/08 notte: «in arrivo…» ovunque):
        // il server chiede a Evolution l'ownerJid di ogni istanza → wa_number
        api({ action: "refresh-numbers" }).then(() => carica()).catch(() => {});
        // AUTO-VERIFICA dei numeri NON connessi (Luca 27/08): un numero può
        // restare fermo su «qr» perché l'ultimo «open» non è arrivato — e
        // nessuno lo saprebbe mai finché qualcuno non preme Verifica a mano.
        // All'apertura del pannello lo chiediamo a Evolution, solo per quelli
        // che risultano non collegati: i connessi non si toccano.
        (async () => {
            const { data } = await supabase.from("wa_instances").select("id, instance_name, status").neq("status", "connessa");
            for (const i of (data ?? []) as { id: string; instance_name: string; status: string }[]) {
                try {
                    const res = await api({ action: "state", instanceName: i.instance_name });
                    // «state» promuove da solo open→connessa; qui resta da
                    // sistemare il caso opposto, che la action non tocca
                    if (res?.state && res.state !== "open" && i.status === "connessa") {
                        await supabase.from("wa_instances").update({ status: "disconnessa" }).eq("id", i.id);
                    }
                } catch { /* il numero resta com'è: lo dirà il prossimo giro */ }
            }
            carica();
        })();
        const t = setInterval(carica, 5000);
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
    /** negozi CONDIVISI del numero (anche più d'uno, virgola-separati): solo
     *  per i numeri SENZA titolare — i personali hanno negozio=primary_store
     *  dal create ma restano personali (rilievo alto del revisore 25/08) */
    const storesDi = (i: Istanza): string[] => {
        if (i.owner_user_id) return [];
        const lista = String(i.negozio || "").split(",").map(s => s.trim()).filter(Boolean);
        if (lista.length) return lista;
        const match = negozi.find(n => sameStore(n, i.display_name || ""));
        return match ? [match] : [];
    };
    /** chi VEDE un numero condiviso: unione assegnati + visibilità + login,
     *  su QUALSIASI dei negozi del numero */
    const utentiCheVedono = (stores: string[]): string[] =>
        utenti.filter(u => {
            const suoi = [...(visStores[u.id] || []), ...(u.primary_store ? [u.primary_store] : [])];
            return stores.some(st => suoi.some(s => sameStore(s, st)));
        }).map(u => u.full_name);

    const disconnetti = async (i: Istanza) => {
        const nome = i.display_name || i.instance_name;
        if (!window.confirm(`Disconnettere «${nome}»?\nLe conversazioni vengono NASCOSTE (non cancellate): tornano quando ricolleghi il numero col QR.`)) return;
        const res = await api({ action: "logout", instanceName: i.instance_name });
        if (res?.error) alert("Disconnessione non riuscita: " + res.error);
        carica();
    };

    const collega = () => {
        if (tipoNuovo === "utente") {
            if (!selNome.trim()) { alert("Scegli prima l'utente dalla tendina."); return; }
            const u = utenti.find(x => x.full_name === selNome);
            if (!u) { alert("Scegli un utente DALLA TENDINA: il nome scritto a mano non vale (niente errori di battitura)."); return; }
            setModal({ presetName: u.full_name, ownerUserId: u.id });
        } else {
            const scelti = selNegozi.filter(n => negozi.includes(n));
            if (!scelti.length) { alert("Scegli almeno un punto vendita dalla tendina."); return; }
            // numero DI NEGOZIO/I: niente titolare — lo vedono in automatico
            // tutti quelli con UNO dei negozi in visibilità. Con più negozi il
            // nome lo decide Luca (campo qui sotto); con uno solo = il negozio.
            const nome = scelti.length === 1 ? scelti[0] : nomeMulti.trim();
            if (!nome) { alert("Con più punti vendita serve il nome del numero (es. «" + (radiceComune(scelti) || "Magliana") + "»)."); return; }
            setModal({ presetName: nome, negozio: scelti.join(", ") });
        }
    };

    const verifica = async (i: Istanza) => {
        setVerificando(i.instance_name);
        try {
            const res = await api({ action: "state", instanceName: i.instance_name });
            setVerifiche(p => ({ ...p, [i.instance_name]: res?.state || res?.error || "sconosciuto" }));
            // riallineo in ENTRAMBE le direzioni (revisore 25/08): l'action
            // "state" promuove solo open→connessa — se il webhook ha perso il
            // close il DB restava «connessa» e Ricollega non compariva mai
            if (res?.state && res.state !== "open" && i.status === "connessa") {
                await supabase.from("wa_instances").update({ status: "disconnessa" }).eq("id", i.id);
            }
        } catch {
            setVerifiche(p => ({ ...p, [i.instance_name]: "errore di rete" }));
        }
        setVerificando(null);
        carica();
    };

    const elimina = async (i: Istanza) => {
        const nome = i.display_name || i.instance_name;
        if (!window.confirm(`ELIMINARE DEFINITIVAMENTE «${nome}»?\n\nVia il numero dal CRM con TUTTO lo storico delle chat. Non è una disconnessione: non si può annullare.`)) return;
        if (!window.confirm(`Ultima conferma: eliminare «${nome}» con tutto lo storico?`)) return;
        setDeleting(i.id);
        const res = await api({ action: "delete", instanceName: i.instance_name });
        setDeleting(null);
        if (res?.error) alert("Eliminazione non riuscita: " + res.error);
        carica();
    };

    // riassegnazione dalla riga: SEMPRE dalle tendine (utente o negozio)
    const assegnaUtente = async (i: Istanza, nome: string) => {
        const u = utenti.find(x => x.full_name === nome);
        if (!u) return;
        const { error } = await supabase.from("wa_instances")
            .update({ owner_user_id: u.id, display_name: u.full_name, negozio: null }).eq("id", i.id);
        if (error) { alert("Assegnazione non riuscita: " + error.message); return; }
        carica();
    };
    const assegnaNegozio = async (i: Istanza, nome: string) => {
        if (!negozi.includes(nome)) return;
        const { error } = await supabase.from("wa_instances")
            .update({ negozio: nome, display_name: nome, owner_user_id: null }).eq("id", i.id);
        if (error) { alert("Assegnazione non riuscita: " + error.message); return; }
        carica();
    };

    const pallino = (s: string) => s === "connessa" ? "bg-emerald-400" : "bg-amber-400";

    return (
        <div className="space-y-5">
            {/* COLLEGA UN NUMERO NUOVO — solo da selezione, e solo per i tipi
                che la rotellina Permessi concede (utenti / negozi / entrambi) */}
            {(puoUtenti || puoNegozi) && (
            <div className="glass-panel rounded-2xl p-5" style={{ borderLeft: "4px solid var(--tf-22c55e)" }}>
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-3">➕ Collega un numero nuovo — scegli a chi intestarlo (niente nomi a mano: così l&apos;associazione automatica non sbaglia)</div>
                <div className="flex items-center gap-2 flex-wrap">
                    {puoUtenti && (
                    <button onClick={() => { setTipoNuovo("utente"); setSelNome(""); }}
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
                            : <SelectMulti values={selNegozi} onChange={(v) => { setSelNegozi(v); if (v.length > 1 && !nomeMulti) setNomeMulti(radiceComune(v)); }} opzioni={negozi} placeholder="Scegli uno o più punti vendita…" maxVoci={100} />}
                    </div>
                    {/* con più negozi (gemelli) il NOME lo scegli tu: è quello che
                        i ragazzi vedono in chat — proposto = la radice comune */}
                    {tipoNuovo === "negozio" && selNegozi.length > 1 && (
                        <label className="text-[11px] text-sky-300/90 inline-flex items-center gap-1.5">nome del numero
                            <input value={nomeMulti} onChange={e => setNomeMulti(e.target.value)}
                                className="bg-white/[0.05] border border-sky-500/30 rounded-lg px-2.5 py-2 text-sm text-white w-44" placeholder="es. Magliana" />
                        </label>
                    )}
                    <button onClick={collega} className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold flex items-center gap-2">
                        <QrCode className="w-4 h-4" /> Genera QR e collega
                    </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-2.5">
                    👤 <b>Utente</b> (anche caller): il numero è personale — lo vede e lo gestisce solo lui, col suo pallino di notifiche.
                    🏪 <b>Negozio</b>: il numero è del punto vendita — lo vedono in automatico tutte le persone che hanno quel negozio in visibilità, senza altre assegnazioni.
                </p>
            </div>
            )}
            {!puoUtenti && !puoNegozi && (
                <p className="text-[12px] text-slate-500">Sei in sola consultazione: la gestione dei numeri (personali o dei negozi) si concede dalla rotellina Permessi → «Pannello WhatsApp».</p>
            )}

            {/* TUTTI I NUMERI: stato, verifica, ricollega, riassegna, elimina */}
            <div className="glass-panel rounded-2xl overflow-hidden">
                <div className="px-4 pt-3 pb-2 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">📱 Numeri collegati <span className="text-slate-600">({istanze == null ? "…" : istanze.filter(inElenco).length})</span></div>
                {istanze === null ? (
                    <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
                ) : istanze.filter(inElenco).length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-sm">Nessun numero collegato: usa «Collega un numero nuovo» qui sopra.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                    <th className="text-left font-semibold px-4 py-1.5">Numero</th>
                                    <th className="text-left font-semibold px-3 py-1.5">Intestato a</th>
                                    <th className="text-left font-semibold px-3 py-1.5">Stato</th>
                                    <th className="text-left font-semibold px-3 py-1.5" title="Interroga WhatsApp adesso: open = sessione viva">Verifica live</th>
                                    <th className="px-3 py-1.5 w-56"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {istanze.filter(inElenco).map(i => {
                                    const tit = nomeTitolare(i.owner_user_id);
                                    const ver = verifiche[i.instance_name];
                                    return (
                                        <tr key={i.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                                            <td className="px-4 py-2">
                                                <div className="font-semibold text-white">{i.display_name || i.instance_name}</div>
                                                <div className="text-[11px] text-slate-500">{i.wa_number ? `+${i.wa_number}` : "numero non ancora rilevato"}</div>
                                            </td>
                                            <td className="px-3 py-2">
                                                {/* PRIMA il titolare: un numero con titolare è PERSONALE
                                                    anche se ha il negozio scritto (viene dal create) */}
                                                {tit ? (
                                                    <span className="text-emerald-300 text-[12px] font-semibold inline-flex items-center gap-1"><UserIcon className="w-3.5 h-3.5" /> {tit} <span className="text-slate-500 font-normal">(personale{i.negozio ? ` · ${i.negozio}` : ""})</span></span>
                                                ) : i.negozio ? (
                                                    <span className="text-sky-300 text-[12px] font-semibold inline-flex items-center gap-1"><Store className="w-3.5 h-3.5" /> {i.negozio} <span className="text-slate-500 font-normal">(condiviso col negozio)</span></span>
                                                ) : (
                                                    <span className="text-slate-500 text-[12px]">— da intestare</span>
                                                )}
                                                {/* chi lo VEDE davvero (Luca 25/08: «Garbatella è
                                                    collegato a Daniele e Michele ma non lo vediamo») */}
                                                {(() => {
                                                    const st = storesDi(i);
                                                    if (!st.length) return null;
                                                    const nomi = utentiCheVedono(st);
                                                    if (!nomi.length) return <div className="text-[11px] text-slate-500 mt-1">👥 nessun utente ha {st.join(" / ")} in visibilità</div>;
                                                    return (
                                                        <div className="text-[11px] text-slate-400 mt-1" title={nomi.join(", ")}>
                                                            👥 lo vedono: <span className="text-slate-300">{nomi.slice(0, 4).join(", ")}{nomi.length > 4 ? ` +${nomi.length - 4}` : ""}</span>
                                                        </div>
                                                    );
                                                })()}
                                                {/* riassegnazione: SEMPRE dalle tendine — e solo con le
                                                    capacità giuste (dominio di partenza + di arrivo) */}
                                                {puoGestire(i) && (
                                                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                                    {puoUtenti && <div className="min-w-[170px]"><SelectPersona value="" onChange={(v) => assegnaUtente(i, v)} opzioni={utenti.map(u => u.full_name)} placeholder="→ a un utente…" /></div>}
                                                    {puoNegozi && <div className="min-w-[150px]"><SelectOpzioni value="" onChange={(v) => assegnaNegozio(i, v)} opzioni={negozi} placeholder="→ a un negozio…" /></div>}
                                                </div>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-300"><span className={cn("w-2 h-2 rounded-full", pallino(i.status))} /> {i.status}</span>
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                {ver ? (
                                                    <span className={cn("text-[12px] font-semibold", ver === "open" ? "text-emerald-300" : "text-amber-300")}>{ver === "open" ? "✓ sessione viva" : ver}</span>
                                                ) : <span className="text-slate-600 text-[12px]">—</span>}
                                            </td>
                                            <td className="px-3 py-2 text-right whitespace-nowrap">
                                                <button onClick={() => verifica(i)} disabled={verificando === i.instance_name}
                                                    className="px-2.5 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/10 text-[12px] font-semibold mr-1.5 inline-flex items-center gap-1">
                                                    {verificando === i.instance_name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Verifica
                                                </button>
                                                {puoGestire(i) && i.status !== "connessa" && (
                                                    <button onClick={() => setRelink(i.instance_name)}
                                                        className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[12px] font-bold mr-1.5 inline-flex items-center gap-1">
                                                        <QrCode className="w-3.5 h-3.5" /> Ricollega
                                                    </button>
                                                )}
                                                {puoGestire(i) && i.status === "connessa" && (
                                                    <button onClick={() => disconnetti(i)}
                                                        title="Disconnetti la sessione: le chat si nascondono (non si cancellano) finché non ricolleghi col QR — dall'Inbox questo non si può più fare"
                                                        className="px-2.5 py-1.5 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 text-[12px] font-semibold mr-1.5 inline-flex items-center gap-1">
                                                        <LogOut className="w-3.5 h-3.5" /> Disconnetti
                                                    </button>
                                                )}
                                                {puoGestire(i) && (
                                                <button onClick={() => elimina(i)} disabled={deleting === i.id}
                                                    title="Elimina il numero e tutto lo storico chat (irreversibile)"
                                                    className="p-1.5 rounded-lg text-slate-600 hover:text-rose-300 hover:bg-rose-500/10">
                                                    {deleting === i.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
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

            {/* REGISTRO ATTIVITÀ AI (Luca 26/08): cosa classifica il triage
                delle chat — controllo dell'operato del motore, canale WhatsApp */}
            <AttivitaAI canale="wa" />

            {modal && (
                <LinkModal presetName={modal.presetName} ownerUserId={modal.ownerUserId} negozio={modal.negozio}
                    onClose={() => { setModal(null); carica(); }}
                    onLinked={(name) => { api({ action: "sync", instanceName: name }).catch(() => {}); }} />
            )}
            {relink && (
                <LinkModal reconnectName={relink}
                    onClose={() => { setRelink(null); carica(); }}
                    onLinked={(name) => { api({ action: "sync", instanceName: name }).catch(() => {}); }} />
            )}
        </div>
    );
}
