"use client";

/**
 * TASK URGENTI (⚡ accanto alla campanella): le cose DA FARE, distinte dalle
 * Comunicazioni. FULMINE PER TUTTI (Luca 04/08): il componente si monta per
 * OGNI utente loggato. Due rami di lettura su admin_tasks (mig. 085):
 *  - task PERSONALI (target_user_id = io) → per tutti, qualunque target_role:
 *    prima amministrativo/direzione generale non vedevano le task inserite con
 *    target_role "admin" a loro indirizzate (chiusura linea, ordine merce);
 *  - task DI PACK (senza destinatario) → solo pack direzionale, come prima.
 * In piu' la task SINTETICA dei rigetti disdetta: conteggio live delle proprie
 * richieste in da_integrare — non dismissibile, resta finche' il reintegro
 * non riporta la richiesta in_attesa (richiesta esplicita di Luca).
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { useRolePermissions } from "@/lib/usePermissions";
import { capChoice, CAP_RICERCA_MODIFICA } from "@/lib/capabilities";

interface Task { id: string; titolo: string; dettaglio: string | null; link: string | null; created_at: string; synthetic?: boolean }

export function UrgentTasks() {
    const { user } = useAuth();
    const router = useRouter();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [open, setOpen] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);
    // PACK DIREZIONALE (regola Luca): admin, amministrazione e direzione generale.
    // Le richieste condivise le vede tutto il pack: il PRIMO che approva la
    // toglie a tutti (sono conteggi live sulle code, non copie per persona).
    const isAdmin = !!user && ["admin", "dev"].includes(user.role);
    const isDirezione = !!user && ["admin", "dev", "amministrativo", "direttore_generale"].includes(user.role);
    // Richieste di modifica contratto: il contatore segue la ROTELLINA di
    // Ricerca Vendite (chi ha la modifica "diretta" approva — 04/08), non più
    // la sola lista direzionale.
    const { perms: capPerms } = useRolePermissions(user?.role, user?.grade, user?.id);
    const vedeRichiesteModifica = !!user && capChoice(user.role, CAP_RICERCA_MODIFICA, capPerms) === "diretta";

    useEffect(() => {
        if (!user) return;
        let vivo = true;
        const load = async () => {
            const targets = isAdmin ? ["admin", "direzione"] : ["direzione"];
            /* ══ UNA FONTE CHE CADE NON DEVE SPEGNERE IL FULMINE ═══════════
               Con Promise.all bastava che UNA delle sei letture fallisse — un
               errore di rete, un permesso — perché l'intero blocco saltasse e
               `setTasks` non venisse mai chiamato: il fulmine restava fermo a
               quello che c'era, senza dire niente. Sintomo tipico: «queste mi
               sono uscite ora ma prima non le vedevo» (Luca 28/08 sera).
               Con allSettled ogni fonte risponde per sé: quelle che arrivano
               si vedono, quella che cade lascia solo un buco. */
            const esiti = await Promise.allSettled([
                // (1) task personali: le vede il destinatario, chiunque sia
                supabase.from("admin_tasks").select("id,titolo,dettaglio,link,created_at")
                    .eq("target_user_id", user.id).eq("done", false).order("created_at", { ascending: false }),
                // (2) rigetti chiusura linea: conteggio live per chi ha sottomesso
                supabase.from("richieste_disdette").select("id", { count: "exact", head: true })
                    .eq("status", "da_integrare").eq("consulente", user.name || "—"),
                // (3) code condivise: solo pack direzionale
                isDirezione ? supabase.from("admin_tasks").select("id,titolo,dettaglio,link,created_at")
                    .in("target_role", targets).is("target_user_id", null).eq("done", false).order("created_at", { ascending: false }) : null,
                vedeRichiesteModifica ? supabase.from("contract_change_requests").select("id", { count: "exact", head: true }).eq("status", "pending") : null,
                isDirezione ? supabase.from("client_access_requests").select("id", { count: "exact", head: true }).eq("status", "pending") : null,
                /* ══ LE TASK CHE MI HANNO ASSEGNATO (Luca 28/08 sera) ═══════
                   Prima nessuno ti avvisava, e intanto il patto dei due giorni
                   correva. Niente pop-up — «sarebbe troppo invadente, e il
                   widget in home basta»: il fulmine resta ACCESO finché la
                   task non ha uno stato definitivo.
                   Definitivo = gli stessi stati che il calendario considera
                   LAVORATE: fatta, rimandata al mittente, abbandonata. Non ne
                   invento una seconda lista: due copie della stessa regola
                   divergono sempre.
                   E «assegnata» vuol dire DA UN ALTRO: se me la sono scritta
                   da solo non c'è nessuno che aspetta una risposta. */
                supabase.from("calendar_tasks")
                    .select("id, title, notes, date, created_by, created_by_user_id, assegnata_il, created_at")
                    .eq("assigned_user_id", user.id)
                    .not("status", "in", "(fatta,problema,abbandonata)")
                    .neq("created_by_user_id", user.id)
                    .order("created_at", { ascending: false }),
            ]);
            if (!vivo) return;
            const val = <T,>(i: number): T | null =>
                esiti[i].status === "fulfilled" ? ((esiti[i] as PromiseFulfilledResult<T>).value) : null;
            const pers = val<{ data: Task[] | null }>(0) || { data: [] };
            const rig = val<{ count: number | null }>(1) || { count: 0 };
            const pack = val<{ data: Task[] | null }>(2);
            const ccr = val<{ count: number | null }>(3);
            const car = val<{ count: number | null }>(4);
            const mie = val<{ data: unknown[] | null }>(5);
            // se qualcosa non ha risposto lo si scrive: un fulmine che mente
            // è peggio di un fulmine spento
            const caduti = esiti.filter((e) => e.status === "rejected").length;
            if (caduti) console.warn(`[fulmine] ${caduti} fonti su ${esiti.length} non hanno risposto: l'elenco potrebbe essere incompleto.`);

            const list: Task[] = ([...((pers.data ?? []) as Task[]), ...((pack?.data ?? []) as Task[])])
                .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
            const nRig = rig.count ?? 0;
            if (nRig > 0) list.push({
                id: "__disdette_rigettate", synthetic: true, created_at: new Date().toISOString(), link: "/chiusura-linea",
                titolo: `${nRig} disdett${nRig === 1 ? "a" : "e"} respint${nRig === 1 ? "a" : "e"} da reintegrare`,
                dettaglio: "La Direzione ha chiesto di correggere i documenti: apri Chiusura Linea e reinoltra. La task resta finché non risolvi.",
            });
            if ((ccr?.count ?? 0) > 0) list.push({
                id: "__ccr", synthetic: true, created_at: new Date().toISOString(), link: "/ricerca-vendite",
                titolo: `${ccr!.count} richiest${ccr!.count === 1 ? "a" : "e"} di modifica contratto da approvare`,
                dettaglio: "Si approvano da Ricerca Vendite: il primo del pack direzionale che decide la chiude per tutti.",
            });
            if ((car?.count ?? 0) > 0) list.push({
                id: "__car", synthetic: true, created_at: new Date().toISOString(), link: "/clienti",
                titolo: `${car!.count} richiest${car!.count === 1 ? "a" : "e"} di accesso ai dati cliente`,
                dettaglio: "Si approvano dalla pagina Clienti: il primo che decide la chiude per tutti.",
            });
            /* una riga per ciascuna, non un contatore: chi l'ha assegnata e da
               quanto aspetta sono l'informazione che serve per decidere. */
            for (const t of (mie?.data ?? []) as { id: string; title: string; notes: string | null; date: string | null; created_by: string | null; assegnata_il: string | null; created_at: string }[]) {
                const da = t.assegnata_il || t.created_at;
                const giorni = Math.floor((Date.now() - new Date(da).getTime()) / 864e5);
                const quando = giorni <= 0 ? "oggi" : giorni === 1 ? "da ieri" : `da ${giorni} giorni`;
                list.push({
                    id: `cal-${t.id}`,
                    synthetic: true,
                    created_at: da,
                    link: "/calendario",
                    titolo: `📋 ${t.title}`,
                    dettaglio: `Assegnata da ${t.created_by || "un collega"}, ${quando}.${t.notes ? " " + t.notes : ""} Resta qui finché non la segni fatta o la rimandi al mittente.`,
                });
            }
            setTasks(list);
        };
        load();
        // Luca 04/08: "il pallino si toglie dopo due minuti" — il solo polling
        // a 60s rendeva il fulmine lento. Ora: REALTIME sulle tabelle task
        // (mig. 177 le aggiunge alla publication) + refresh al ritorno sul tab;
        // il polling resta come rete di sicurezza.
        const t = setInterval(load, 60000);
        let deb: ReturnType<typeof setTimeout> | null = null;
        const ricarica = () => { if (deb) clearTimeout(deb); deb = setTimeout(load, 400); };
        const ch = supabase.channel("urgent-tasks-" + user?.id)
            .on("postgres_changes", { event: "*", schema: "public", table: "admin_tasks" }, ricarica)
            .on("postgres_changes", { event: "*", schema: "public", table: "richieste_disdette" }, ricarica)
            // Luca 05/08: i contatori sintetici leggono anche queste due code —
            // senza ascoltarle il pallino si muoveva solo col polling (mig. 180
            // le aggiunge alla publication)
            .on("postgres_changes", { event: "*", schema: "public", table: "contract_change_requests" }, ricarica)
            .on("postgres_changes", { event: "*", schema: "public", table: "client_access_requests" }, ricarica)
            // e quando qualcuno mi assegna una task, o io la chiudo
            .on("postgres_changes", { event: "*", schema: "public", table: "calendar_tasks" }, ricarica)
            .subscribe();
        const onVis = () => { if (document.visibilityState === "visible") ricarica(); };
        document.addEventListener("visibilitychange", onVis);
        return () => { vivo = false; clearInterval(t); if (deb) clearTimeout(deb); supabase.removeChannel(ch); document.removeEventListener("visibilitychange", onVis); };
    }, [user?.id, user?.name, isDirezione, isAdmin, vedeRichiesteModifica]);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const fatta = async (id: string) => {
        await supabase.from("admin_tasks").update({ done: true, done_by: user?.name || "—", done_at: new Date().toISOString() }).eq("id", id);
        setTasks((p) => p.filter((t) => t.id !== id));
    };

    // Sempre visibile (anche a zero task: altrimenti non si scopre); il colore
    // ambra e il contatore compaiono solo quando c'e' qualcosa da fare.
    if (!user) return null;
    return (
        <div className="relative" ref={boxRef}>
            <button onClick={() => setOpen((o) => !o)} title={tasks.length ? `${tasks.length} task urgenti da fare` : "Task urgenti (vuoto)"}
                className={`relative p-2 rounded-lg hover:bg-white/5 transition-colors ${tasks.length ? "text-amber-400 hover:text-amber-300" : "text-slate-400 hover:text-white"}`}>
                <Zap className="h-5 w-5" />
                {tasks.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center">{tasks.length}</span>
                )}
            </button>
            {open && (
                <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-white/10 bg-[#0f1420] shadow-2xl z-[200] p-2 space-y-1">
                    <div className="px-2 py-1.5 text-xs font-bold text-amber-300 uppercase tracking-wider">⚡ Task urgenti</div>
                    {tasks.length === 0 && (
                        <div className="p-3 text-sm text-slate-500">{isDirezione
                            ? "Nessuna task urgente. Qui arrivano le cose DA FARE — ad esempio un nuovo utente creato dall'amministrazione da completare con costo, visibilità e brand."
                            : "Nessuna task urgente. Qui arrivano le cose DA FARE che ti riguardano — ad esempio una disdetta respinta dalla Direzione da correggere e reinoltrare."}</div>
                    )}
                    {tasks.map((t) => (
                        <div key={t.id} className="p-2.5 rounded-lg bg-white/[0.03] border border-white/8">
                            <button onClick={() => { if (t.link) {
                                // nonce sul link (Luca 04/08, video Claudia): ricliccare la
                                // STESSA task non cambiava l'URL → il deep-link non riscattava
                                // e la scheda non si apriva più. Col nonce ogni click conta.
                                router.push(t.link + (t.link.includes("?") ? "&" : "?") + "t=" + Date.now());
                                setOpen(false);
                            } }} className="text-left w-full">
                                <div className="text-sm font-semibold text-white leading-snug">{t.titolo}</div>
                                {t.dettaglio && <div className="text-xs text-slate-400 mt-0.5">{t.dettaglio}</div>}
                                {!t.synthetic && <div className="text-[10px] text-slate-600 mt-1">{new Date(t.created_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>}
                            </button>
                            {!t.synthetic && <button onClick={() => fatta(t.id)} className="mt-1.5 text-[11px] px-2 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 font-bold">✓ Fatta</button>}
                        </div>
                    ))}
                    {isDirezione && (
                        <button onClick={() => { router.push("/storico-approvazioni"); setOpen(false); }}
                            className="w-full text-left px-2.5 py-2 rounded-lg text-xs font-bold text-indigo-300 hover:bg-white/[0.05] border border-transparent hover:border-white/10">
                            📜 Storico approvazioni →
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
