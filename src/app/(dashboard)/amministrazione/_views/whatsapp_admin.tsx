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
import { LinkModal } from "@/components/WhatsAppInbox";
import { SelectPersona, SelectOpzioni } from "@/components/SelectPersona";
import { QrCode, Loader2, Trash2, RefreshCw, User as UserIcon, Store } from "lucide-react";
import { cn } from "@/utils";

type Istanza = {
    id: string; instance_name: string; display_name: string | null; wa_number: string | null;
    status: string; owner_user_id: string | null; negozio: string | null; created_at?: string;
};
type Utente = { id: string; full_name: string };

const api = (body: unknown) => fetch("/api/whatsapp/instance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());

export function WhatsAppAdminView() {
    const [istanze, setIstanze] = useState<Istanza[] | null>(null);
    const [utenti, setUtenti] = useState<Utente[]>([]);
    const [negozi, setNegozi] = useState<string[]>([]);

    // ── collegamento nuovo: SELEZIONE utente o negozio, mai testo libero
    const [tipoNuovo, setTipoNuovo] = useState<"utente" | "negozio">("utente");
    const [selNome, setSelNome] = useState("");
    const [modal, setModal] = useState<{ presetName: string; ownerUserId?: string; negozio?: string } | null>(null);
    const [relink, setRelink] = useState<string | null>(null);

    // ── verifica live per riga: instance_name → esito ("open"/"close"/errore)
    const [verifiche, setVerifiche] = useState<Record<string, string>>({});
    const [verificando, setVerificando] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);

    const carica = async () => {
        const { data } = await supabase.from("wa_instances").select("*").order("created_at");
        setIstanze((data ?? []) as Istanza[]);
    };
    useEffect(() => {
        carica();
        const t = setInterval(carica, 5000);
        supabase.from("app_users").select("id, full_name").eq("attivo", true).order("full_name")
            .then(({ data }) => setUtenti((data ?? []) as Utente[]));
        supabase.from("stores").select("name").order("name")
            .then(({ data }) => setNegozi(((data ?? []) as { name: string }[]).map(s => s.name)));
        return () => clearInterval(t);
    }, []);

    const nomeTitolare = (id: string | null) => utenti.find(u => u.id === id)?.full_name || null;

    const collega = () => {
        if (!selNome.trim()) { alert("Scegli prima l'utente o il negozio dalla tendina."); return; }
        if (tipoNuovo === "utente") {
            const u = utenti.find(x => x.full_name === selNome);
            if (!u) { alert("Scegli un utente DALLA TENDINA: il nome scritto a mano non vale (niente errori di battitura)."); return; }
            setModal({ presetName: u.full_name, ownerUserId: u.id });
        } else {
            const n = negozi.find(x => x === selNome);
            if (!n) { alert("Scegli un negozio DALLA TENDINA: il nome scritto a mano non vale."); return; }
            // numero DI NEGOZIO: niente titolare — lo vedono in automatico
            // tutti quelli col negozio in visibilità (nome = assegnazione)
            setModal({ presetName: n, negozio: n });
        }
    };

    const verifica = async (i: Istanza) => {
        setVerificando(i.instance_name);
        try {
            const res = await api({ action: "state", instanceName: i.instance_name });
            setVerifiche(p => ({ ...p, [i.instance_name]: res?.state || res?.error || "sconosciuto" }));
        } catch {
            setVerifiche(p => ({ ...p, [i.instance_name]: "errore di rete" }));
        }
        setVerificando(null);
        carica();   // l'azione "state" riallinea anche lo status a DB
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
            {/* COLLEGA UN NUMERO NUOVO — solo da selezione */}
            <div className="glass-panel rounded-2xl p-5" style={{ borderLeft: "4px solid var(--tf-22c55e)" }}>
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-3">➕ Collega un numero nuovo — scegli a chi intestarlo (niente nomi a mano: così l&apos;associazione automatica non sbaglia)</div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => { setTipoNuovo("utente"); setSelNome(""); }}
                        className={cn("px-3 py-2 rounded-xl text-sm font-bold border flex items-center gap-1.5",
                            tipoNuovo === "utente" ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200" : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10")}>
                        <UserIcon className="w-4 h-4" /> Utente
                    </button>
                    <button onClick={() => { setTipoNuovo("negozio"); setSelNome(""); }}
                        className={cn("px-3 py-2 rounded-xl text-sm font-bold border flex items-center gap-1.5",
                            tipoNuovo === "negozio" ? "bg-sky-500/15 border-sky-500/40 text-sky-200" : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10")}>
                        <Store className="w-4 h-4" /> Negozio
                    </button>
                    <div className="min-w-[260px]">
                        {tipoNuovo === "utente"
                            ? <SelectPersona value={selNome} onChange={setSelNome} opzioni={utenti.map(u => u.full_name)} placeholder="Scegli il collaboratore…" />
                            : <SelectOpzioni value={selNome} onChange={setSelNome} opzioni={negozi} placeholder="Scegli il punto vendita…" />}
                    </div>
                    <button onClick={collega} className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold flex items-center gap-2">
                        <QrCode className="w-4 h-4" /> Genera QR e collega
                    </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-2.5">
                    👤 <b>Utente</b> (anche caller): il numero è personale — lo vede e lo gestisce solo lui, col suo pallino di notifiche.
                    🏪 <b>Negozio</b>: il numero è del punto vendita — lo vedono in automatico tutte le persone che hanno quel negozio in visibilità, senza altre assegnazioni.
                </p>
            </div>

            {/* TUTTI I NUMERI: stato, verifica, ricollega, riassegna, elimina */}
            <div className="glass-panel rounded-2xl overflow-hidden">
                <div className="px-4 pt-3 pb-2 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">📱 Numeri collegati <span className="text-slate-600">({istanze?.length ?? "…"})</span></div>
                {istanze === null ? (
                    <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
                ) : istanze.length === 0 ? (
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
                                {istanze.map(i => {
                                    const tit = nomeTitolare(i.owner_user_id);
                                    const ver = verifiche[i.instance_name];
                                    return (
                                        <tr key={i.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                                            <td className="px-4 py-2">
                                                <div className="font-semibold text-white">{i.display_name || i.instance_name}</div>
                                                <div className="text-[11px] text-slate-500">{i.wa_number ? `+${i.wa_number}` : "numero non ancora rilevato"}</div>
                                            </td>
                                            <td className="px-3 py-2">
                                                {i.negozio ? (
                                                    <span className="text-sky-300 text-[12px] font-semibold inline-flex items-center gap-1"><Store className="w-3.5 h-3.5" /> {i.negozio} <span className="text-slate-500 font-normal">(condiviso col negozio)</span></span>
                                                ) : tit ? (
                                                    <span className="text-emerald-300 text-[12px] font-semibold inline-flex items-center gap-1"><UserIcon className="w-3.5 h-3.5" /> {tit}</span>
                                                ) : (
                                                    <span className="text-slate-500 text-[12px]">— da intestare</span>
                                                )}
                                                {/* riassegnazione: SEMPRE dalle tendine */}
                                                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                                    <div className="min-w-[170px]"><SelectPersona value="" onChange={(v) => assegnaUtente(i, v)} opzioni={utenti.map(u => u.full_name)} placeholder="→ a un utente…" /></div>
                                                    <div className="min-w-[150px]"><SelectOpzioni value="" onChange={(v) => assegnaNegozio(i, v)} opzioni={negozi} placeholder="→ a un negozio…" /></div>
                                                </div>
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
                                                {i.status !== "connessa" && (
                                                    <button onClick={() => setRelink(i.instance_name)}
                                                        className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[12px] font-bold mr-1.5 inline-flex items-center gap-1">
                                                        <QrCode className="w-3.5 h-3.5" /> Ricollega
                                                    </button>
                                                )}
                                                <button onClick={() => elimina(i)} disabled={deleting === i.id}
                                                    title="Elimina il numero e tutto lo storico chat (irreversibile)"
                                                    className="p-1.5 rounded-lg text-slate-600 hover:text-rose-300 hover:bg-rose-500/10">
                                                    {deleting === i.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

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
