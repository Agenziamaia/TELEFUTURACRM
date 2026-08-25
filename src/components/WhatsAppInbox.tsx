"use client";

// Inbox WhatsApp riusabile. Collega i numeri (QR) e chatta coi clienti. I dati
// stanno nel modello wa_* (separato dalla chat interna); le chiamate a Evolution
// passano dalle route /api/whatsapp/* (URL e chiave restano lato server).
//   embedded=true -> pensato per stare DENTRO la pagina Chat (riempie l'altezza,
//                    niente titolone/margini di pagina).
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { useVisibleStores, sameStore } from "@/lib/visibleStores";
import { waScopeDi } from "@/lib/waVisibilita";
import { areaOf } from "@/lib/roles";
import { SelectOpzioni } from "@/components/SelectPersona";
import { RicercaCliente, etichettaCliente, type ClienteTrovato } from "@/components/RicercaCliente";
import { MessageCircle, Plus, Phone, Send, X, RefreshCw, Check, CheckCheck, Loader2, QrCode, Users, Paperclip, FileText, Trash2, ChevronLeft, Pencil, Ban } from "lucide-react";
import { cn } from "@/utils";

type Instance = { id: string; instance_name: string; display_name: string | null; wa_number: string | null; status: string; owner_user_id: string | null; negozio: string | null };
type Conv = { id: string; instance_id: string; customer_number: string; customer_name: string | null; client_id: string | null; last_preview: string | null; last_message_at: string | null; unread: number; is_group?: boolean; chat_jid?: string | null };
type Msg = { id: string; direction: string; body: string | null; status: string | null; sender_name: string | null; wa_timestamp: string | null; created_at: string; media_url?: string | null; media_mime?: string | null; wa_message_id?: string | null; sent_by_user_id?: string | null; edited_at?: string | null; deleted_at?: string | null };

const api = (body: unknown) => fetch("/api/whatsapp/instance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());

// CHT-02: finestre imposte da WhatsApp (stesse guardie server in
// /api/whatsapp/message): modifica entro 14 min (buffer sotto i 15 dell'app),
// elimina-per-tutti entro 48h. Fuori finestra i bottoni non compaiono.
const FIN_MODIFICA_WA_MS = 14 * 60 * 1000;
const FIN_CANCELLA_WA_MS = 48 * 60 * 60 * 1000;

export function WhatsAppInbox({ embedded = false, apriNumero = null, testoIniziale = null, apriConvId = null }: { embedded?: boolean; apriNumero?: string | null; testoIniziale?: string | null; apriConvId?: string | null }) {
    const { user } = useAuth();
    const [instances, setInstances] = useState<Instance[]>([]);
    const [selInst, setSelInst] = useState<string | null>(null);
    const [convs, setConvs] = useState<Conv[]>([]);
    const [selConv, setSelConv] = useState<Conv | null>(null);
    const [msgs, setMsgs] = useState<Msg[]>([]);
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    // CHT-02: messaggio in MODIFICA nel composer (pattern della chat interna)
    const [editMsg, setEditMsg] = useState<Msg | null>(null);
    const [linkModal, setLinkModal] = useState(false);
    const [nuovaChat, setNuovaChat] = useState(false);   // modale «Nuova chat a un numero»
    const [emojiOpen, setEmojiOpen] = useState(false);   // picker emoji del composer (25/08)
    const [relinkName, setRelinkName] = useState<string | null>(null);   // ri-scansione di un numero disconnesso
    const [syncing, setSyncing] = useState(false);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const historyLoaded = useRef<Set<string>>(new Set());   // conversazioni gia' backfillate
    const { stores: myStores } = useVisibleStores();

    // ETICHETTA per NOME (Luca 31/07): il numero collegato si mostra col nome
    // del titolare (dipendente) o del negozio, non col cellulare — utile a
    // colpo d'occhio e per le analisi (tasso di risposta per caller/negozio).
    const [nomiTitolari, setNomiTitolari] = useState<Record<string, string>>({});
    const [ruoliTitolari, setRuoliTitolari] = useState<Record<string, string>>({});
    useEffect(() => {
        const ids = [...new Set(instances.map(i => i.owner_user_id).filter(Boolean))] as string[];
        if (!ids.length) return;
        supabase.from("app_users").select("id, full_name, role").in("id", ids)
            .then(({ data }) => {
                setNomiTitolari(Object.fromEntries((data ?? []).map((u: { id: string; full_name: string }) => [u.id, u.full_name])));
                setRuoliTitolari(Object.fromEntries((data ?? []).map((u: { id: string; role: string }) => [u.id, u.role])));
            });
    }, [instances]);
    const etichettaIstanza = (i: Instance) =>
        i.display_name || (i.owner_user_id && nomiTitolari[i.owner_user_id]) || i.negozio || (i.wa_number ? `+${i.wa_number}` : i.instance_name);

    // MITTENTE INTERNO (Luca 25/08 notte): sui numeri condivisi più persone
    // scrivono dallo stesso numero — sopra ogni bolla in USCITA il nome CRM
    // di chi l'ha scritta (sent_by_user_id, salvato da sempre all'invio).
    // Solo lato nostro: al cliente non arriva nulla. Vale anche sullo storico.
    const [nomiMittenti, setNomiMittenti] = useState<Record<string, string>>({});
    useEffect(() => {
        const ids = [...new Set(msgs.map(m => m.sent_by_user_id).filter(Boolean))] as string[];
        const mancanti = ids.filter(id => !nomiMittenti[id]);
        if (!mancanti.length) return;
        supabase.from("app_users").select("id, full_name").in("id", mancanti)
            .then(({ data }) => setNomiMittenti(p => ({ ...p, ...Object.fromEntries((data ?? []).map((u: { id: string; full_name: string }) => [u.id, u.full_name])) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [msgs]);

    // Modello "un numero per caller": ognuno vede i PROPRI numeri. Eccezioni:
    //  - admin/dev/amministrativo -> tutti i numeri
    //  - store_manager            -> i numeri del proprio negozio
    // SICUREZZA (deciso 28/07): SOLO Luca vede tutti i numeri — non un ruolo
    // generico (un secondo admin non vedrebbe tutto), non il dev, non l'amministrativo.
    // I numeri WhatsApp possono essere personali. Legato all'ID reale, cosi' con il
    // "guarda come" Luca vede comunque la vista ristretta dell'utente simulato.
    // regola estratta in lib condivisa (Sheekel 11/08): inbox e BADGE della
    // voce Chat devono usare la stessa identica visibilità
    const waScope: "all" | "store" | "own" = useMemo(() => waScopeDi(user?.id, user?.role), [user?.id, user?.role]);
    // NUMERI DI NEGOZIO AUTOMATICI (Luca 25/08 sera): un numero NOMINATO col
    // nome del punto vendita (o con la colonna negozio valorizzata) è a
    // disposizione di CHIUNQUE abbia quel negozio in visibilità — nessuna
    // assegnazione manuale: il nome È l'assegnazione. Il numero personale
    // resta visibile solo al titolare (e il badge in sidebar conta solo quello).
    // ⚠️ SOLO i numeri SENZA titolare sono «di negozio» (revisore 25/08 notte,
    // rilievo alto): i personali hanno negozio = primary_store scritto dal
    // create fin dalla mig 094 — senza questo gate i colleghi dello stesso
    // negozio si vedevano le chat personali a vicenda. Personale = ha un
    // titolare, e lo vede solo lui; condiviso = senza titolare, nominato
    // come (o assegnato a) un punto vendita.
    // NEGOZI GEMELLI (25/08 notte): la colonna negozio può portare PIÙ punti
    // vendita separati da virgola («Magliana W3, Magliana Multi») — basta
    // averne UNO in visibilità
    const negoziIstanza = (i: Instance) => String(i.negozio || "").split(",").map(s => s.trim()).filter(Boolean);
    const condivisoNegozio = (i: Instance) =>
        !i.owner_user_id && (
            negoziIstanza(i).some(n => myStores.some(s => sameStore(n, s)))
            || (!!i.display_name && myStores.some(s => sameStore(i.display_name, s))));
    // DIRETTORE CALL CENTER (Luca 25/08 notte-6): supervisiona gli operatori →
    // vede anche i numeri PERSONALI del reparto cc (caller e back office).
    // Solo il suo ruolo: la regola «personale = solo il titolare» resta per
    // tutti gli altri.
    const supervisioneCC = (i: Instance) =>
        user?.role === "direttore_cc" && !!i.owner_user_id
        && areaOf((ruoliTitolari[i.owner_user_id] || "") as never) === "cc";
    const visibleInstances = useMemo(() => {
        if (waScope === "all") return instances;
        if (waScope === "own") return instances.filter(i => i.owner_user_id === user?.id || condivisoNegozio(i) || supervisioneCC(i));
        // store manager: come da sempre TUTTI i numeri del suo negozio (anche
        // personali dei suoi), più i condivisi per nome e il suo personale
        return instances.filter(i =>
            negoziIstanza(i).some(n => myStores.some(s => sameStore(n, s)))
            || condivisoNegozio(i) || i.owner_user_id === user?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [instances, waScope, user?.id, myStores, ruoliTitolari]);

    // FILTRO PER PERSONA/NUMERO (Luca 25/08 notte-6): con tanti numeri in
    // visibilità i chip esplodono — la tendina restringe a un solo titolare
    const [filtroNum, setFiltroNum] = useState("");
    const chipsVisibili = useMemo(() => {
        if (!filtroNum) return visibleInstances;
        const out = visibleInstances.filter(i => etichettaIstanza(i) === filtroNum);
        return out.length ? out : visibleInstances;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibleInstances, filtroNum, nomiTitolari]);

    // tieni selInst sempre dentro i numeri visibili — preferendo il PROPRIO
    // numero: chi ha anche quello del negozio parte comunque dal suo
    useEffect(() => {
        if (visibleInstances.length === 0) { if (selInst) setSelInst(null); return; }
        if (!selInst || !visibleInstances.some(i => i.id === selInst)) {
            const mio = visibleInstances.find(i => i.owner_user_id === user?.id);
            setSelInst((mio || visibleInstances[0]).id); setSelConv(null);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibleInstances, selInst]);

    // NON LETTI per NUMERO (Luca 11/08): il pallino della sidebar riguarda solo
    // il numero personale — qui dentro ogni chip di numero mostra i SUOI non
    // letti, così chi gestisce più utenze vede dove serve intervenire
    const [unreadPerInst, setUnreadPerInst] = useState<Record<string, number>>({});
    useEffect(() => {
        const ids = visibleInstances.filter(i => i.status === "connessa").map(i => i.id);
        if (!ids.length) { setUnreadPerInst({}); return; }
        let alive = true;
        const load = async () => {
            const { data } = await supabase.from("wa_conversations").select("instance_id, unread").in("instance_id", ids);
            if (!alive) return;
            const m: Record<string, number> = {};
            (data || []).forEach((c: any) => { m[c.instance_id] = (m[c.instance_id] || 0) + (c.unread || 0); });
            setUnreadPerInst(m);
        };
        load();
        const t = setInterval(load, 10000);
        return () => { alive = false; clearInterval(t); };
    }, [visibleInstances.map(i => i.id + i.status).join("|")]);

    // importa le conversazioni gia' esistenti dal telefono (history-sync).
    // silent=true -> in background dopo la connessione: niente spinner ne' avvisi
    // (le conversazioni compaiono da sole). Timeout + finally: non resta mai
    // appeso (es. se salta la connessione), lo spinner si ferma comunque.
    const sincronizza = async (instanceName?: string, opts?: { silent?: boolean }) => {
        const inst = instances.find(i => i.id === selInst);
        const name = instanceName || inst?.instance_name;
        if (!name) return;
        const silent = !!opts?.silent;
        if (!silent && syncing) return;
        if (!silent) setSyncing(true);
        try {
            const res = await fetch("/api/whatsapp/instance", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "sync", instanceName: name }),
                signal: AbortSignal.timeout(90000),
            }).then(r => r.json());
            if (!silent) {
                if (res?.error) alert("Sincronizzazione non riuscita: " + res.error);
                else if (typeof res?.importate === "number") alert(`Importate ${res.importate} conversazioni (${res.saltate} saltate).`);
            }
        } catch {
            if (!silent) alert("Sincronizzazione interrotta (connessione lenta o assente). Riprova.");
        } finally {
            if (!silent) setSyncing(false);
        }
    };

    // disconnetti/elimina: SOLO dal pannello Amministrazione → WhatsApp (25/08)


    const loadInstances = async () => {
        const { data } = await supabase.from("wa_instances").select("*").order("created_at");
        setInstances((data ?? []) as Instance[]);   // selInst lo gestisce l'effect sui visibili
    };
    useEffect(() => { loadInstances(); const t = setInterval(loadInstances, 5000); return () => clearInterval(t); }, []);

    // conversazioni dell'istanza selezionata (polling leggero). Se il numero NON
    // e' connesso (disconnesso o sessione scaduta) le chat NON si mostrano: restano
    // nel DB (non cancellate) ma nascoste finche' non si ricollega il numero.
    const selInstStatus = instances.find(i => i.id === selInst)?.status;
    useEffect(() => {
        if (selInstStatus && selInstStatus !== "connessa") setSelConv(null);   // chiude una chat aperta alla disconnessione
        if (!selInst || selInstStatus !== "connessa") { setConvs([]); return; }
        let alive = true;
        const load = async () => {
            const { data } = await supabase.from("wa_conversations").select("*").eq("instance_id", selInst).order("last_message_at", { ascending: false, nullsFirst: false });
            if (alive) setConvs((data ?? []) as Conv[]);
        };
        load(); const t = setInterval(load, 3000);
        return () => { alive = false; clearInterval(t); };
    }, [selInst, selInstStatus]);

    // messaggi della conversazione (polling)
    useEffect(() => {
        setEditMsg(null);   // cambiando chat una modifica a meta' si annulla
        setEmojiOpen(false);
        if (!selConv) { setMsgs([]); return; }
        let alive = true;
        // backfill dello storico recente la prima volta che si apre la conversazione
        if (!historyLoaded.current.has(selConv.id)) {
            historyLoaded.current.add(selConv.id);
            const inst = instances.find(i => i.id === selConv.instance_id);
            if (inst) api({ action: "history", instanceName: inst.instance_name, conversationId: selConv.id }).catch(() => {});
        }
        const load = async () => {
            const { data } = await supabase.from("wa_messages").select("*").eq("conversation_id", selConv.id).order("wa_timestamp", { ascending: true, nullsFirst: true });
            if (alive) setMsgs((data ?? []) as Msg[]);
        };
        load(); const t = setInterval(load, 2500);
        // azzera i non letti aprendo la conversazione
        supabase.from("wa_conversations").update({ unread: 0 }).eq("id", selConv.id).then(() => {});
        return () => { alive = false; clearInterval(t); };
    }, [selConv?.id]);

    useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs]);

    // ── APERTURA PER NUMERO: usata dal deep-link E dal bottone «Nuova chat»
    //    (Luca 25/08: si deve poter scrivere anche a un numero digitato a
    //    mano — cliente non ancora registrato che deve mandare documenti).
    //    Cerca la conversazione tra i numeri visibili (aggancio per coda di
    //    cifre, come il ponte Aircall); se non esiste la CREA sull'istanza
    //    selezionata (o la prima visibile).
    const apriPerNumero = async (digIn: string): Promise<boolean> => {
        if (!visibleInstances.length) return false;
        // un numero troppo corto (deep-link malformato) cercherebbe %coda
        // su una coda di 1-2 cifre e aggancerebbe la chat sbagliata
        if (digIn.replace(/\D/g, "").length < 6) return false;
        // normalizzazione: "0039…" → "39…" (revisore 25/08: il non-canonico
        // spezzava il thread alla risposta del cliente)
        const dig = digIn.startsWith("00") ? digIn.slice(2) : digIn;
        const coda = dig.slice(-9);
        const ids = visibleInstances.map(i => i.id);
        // coda CONTIGUA e NIENTE GRUPPI (revisore 25/08): la vecchia
        // sottosequenza %3%3%1%… poteva agganciare l'id di un gruppo (~18
        // cifre) o un numero sbagliato — i numeri a DB sono cifre canoniche
        const { data: trovate } = await supabase.from("wa_conversations")
            .select("*").in("instance_id", ids)
            .or("is_group.is.null,is_group.eq.false")
            .ilike("customer_number", "%" + coda)
            .order("last_message_at", { ascending: false }).limit(1);
        let conv = (trovate && trovate[0]) as Conv | undefined;
        if (!conv) {
            const inst = visibleInstances.find(i => i.id === selInst) || visibleInstances[0];
            const numero = dig.length === 10 && dig.startsWith("3") ? "39" + dig : dig;
            // NOME VERO dall'anagrafica (Luca 25/08 notte: «Donna Olimpia ha
            // scritto a un cliente salvato e non è comparso come cliente»):
            // stesso aggancio del webhook — vale anche per le chat che
            // creiamo NOI, non solo per i messaggi in arrivo
            let clientId: string | null = null;
            let nomeCliente: string | null = null;
            const codaCli = numero.slice(-9);
            if (codaCli.length >= 6) {
                // coppia consumer+business sullo stesso cellulare (ammessa in
                // anagrafica): si preferisce SEMPRE la scheda persona, così
                // l'aggancio è deterministico (rilievo del revisore 25/08)
                const { data: cli } = await supabase.from("clients").select("id, nome, cognome, ragione_sociale").ilike("cellulare", `%${codaCli}%`).order("tipo", { ascending: false }).limit(1);
                if (cli && cli[0]) {
                    clientId = cli[0].id as string;
                    nomeCliente = (cli[0].ragione_sociale as string) || `${cli[0].nome || ""} ${cli[0].cognome || ""}`.trim() || null;
                }
            }
            const { data: creata, error } = await supabase.from("wa_conversations")
                .insert({ instance_id: inst.id, customer_number: numero, customer_name: nomeCliente, client_id: clientId, unread: 0 })
                .select("*").maybeSingle();
            if (error || !creata) { alert("Chat non aperta: " + (error?.message || "conversazione non creata")); return false; }
            conv = creata as Conv;
        }
        setSelInst(conv.instance_id);
        setSelConv(conv);
        return true;
    };

    // DEEP-LINK ALLA CONVERSAZIONE (Luca 25/08 notte: dalla scheda cliente si
    // apre LA chat esatta col numero — Donna Olimpia, il caller… — non una
    // generica): /chat?conv=<id>. Se l'istanza non è nella visibilità di chi
    // clicca, non si apre nulla (le regole restano quelle).
    const _convFatto = useRef<string | null>(null);
    const _convCache = useRef<{ id: string; conv: Conv | null } | null>(null);
    useEffect(() => {
        if (!apriConvId || _convFatto.current === apriConvId) return;
        if (!visibleInstances.length) return;    // istanze non ancora arrivate
        (async () => {
            // la visibilità arriva a scaglioni (negozi, ruoli cc): il ref si
            // brucia SOLO ad apertura riuscita o su id inesistente — mai su
            // visibilità ancora parziale o errore di rete (rilievo alto del
            // revisore: il direttore cc perdeva il deep-link del reparto).
            // Una sola query per id: le ripetizioni leggono la cache.
            if (_convCache.current?.id !== apriConvId) {
                const { data: c, error } = await supabase.from("wa_conversations").select("*").eq("id", apriConvId).maybeSingle();
                if (error) return;   // transitorio: si riprova al prossimo giro
                _convCache.current = { id: apriConvId, conv: (c as Conv) || null };
            }
            const c = _convCache.current.conv;
            if (!c) { _convFatto.current = apriConvId; return; }   // id inesistente
            if (!visibleInstances.some(i => i.id === c.instance_id)) return;
            _convFatto.current = apriConvId;
            setSelInst(c.instance_id);
            setSelConv(c);
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apriConvId, visibleInstances.map(i => i.id).join("|")]);

    // DEEP-LINK (Luca 29/07): /chat?wa=<numero> apre la chat col cliente precaricata.
    const _apriFatto = useRef<string | null>(null);
    const _apriBusy = useRef(false);
    const _testoFatto = useRef(false);   // CAL-01: prefill applicato una volta sola
    useEffect(() => {
        const dig = String(apriNumero || "").replace(/\D/g, "");
        if (!dig || dig.length < 6 || _apriFatto.current === dig) return;
        if (!visibleInstances.length) return;    // istanze non ancora arrivate
        if (_apriBusy.current) return;           // un tentativo alla volta
        _apriBusy.current = true;
        (async () => {
            // come per ?conv=: il ref si brucia solo ad apertura riuscita,
            // così se le istanze visibili crescono dopo il mount si riprova
            const ok = await apriPerNumero(dig);
            _apriBusy.current = false;
            if (!ok) return;
            _apriFatto.current = dig;
            // CAL-01: ?testo= del deep-link precompila il composer (UNA volta
            // sola: l'operatore rilegge, ritocca e conferma con l'invio)
            if (testoIniziale && !_testoFatto.current) { _testoFatto.current = true; setText(testoIniziale); }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apriNumero, visibleInstances.map(i => i.id).join("|")]);

    const invia = async () => {
        setEmojiOpen(false);
        if (!selConv || !text.trim() || sending) return;
        setSending(true);
        // CHT-02: composer in modalita' MODIFICA -> aggiorna il messaggio, non ne invia uno nuovo
        if (editMsg) {
            const res = await fetch("/api/whatsapp/message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "edit", messageId: editMsg.id, userId: user?.id, text: text.trim() }) }).then(r => r.json());
            if (res?.error) alert("Modifica non riuscita: " + res.error);
            else {
                // aggiornamento ottimista: il polling (2,5s) poi conferma dal DB
                const nuovo = text.trim();
                setMsgs(p => p.map(m => m.id === editMsg.id ? { ...m, body: nuovo, edited_at: new Date().toISOString() } : m));
                setEditMsg(null); setText("");
            }
            setSending(false);
            return;
        }
        const res = await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: selConv.id, text: text.trim(), userId: user?.id }) }).then(r => r.json());
        if (res?.error) alert("Invio non riuscito: " + res.error);
        else setText("");
        setSending(false);
    };

    // CHT-02: chi puo' agire sulla bolla — l'autore o la vista completa (waScope
    // "all", solo Luca); per i messaggi senza autore (mandati dal telefono o
    // dalle automazioni) decide il proprietario del numero. Stesse regole server.
    const puoAgire = (m: Msg) => {
        if (waScope === "all") return true;
        if (m.sent_by_user_id) return m.sent_by_user_id === user?.id;
        const inst = instances.find(i => i.id === selConv?.instance_id);
        return !!inst?.owner_user_id && inst.owner_user_id === user?.id;
    };

    // CHT-02: elimina PER TUTTI, come su WhatsApp (nessun "rimuovi solo dal
    // CRM" — deciso da Luca). La bolla resta come segnaposto "Messaggio eliminato".
    const eliminaMessaggio = async (m: Msg) => {
        if (!window.confirm("Eliminare questo messaggio per tutti?\nSparira' anche dal telefono del cliente (entro la finestra WhatsApp, best-effort come sull'app).")) return;
        const res = await fetch("/api/whatsapp/message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", messageId: m.id, userId: user?.id }) }).then(r => r.json());
        if (res?.error) alert("Eliminazione non riuscita: " + res.error);
        else setMsgs(p => p.map(x => x.id === m.id ? { ...x, deleted_at: new Date().toISOString() } : x));
    };

    // invia un allegato: carica nel bucket pubblico, poi Evolution lo spedisce
    // dall'URL. Il testo eventuale diventa la didascalia.
    const inviaFile = async (f: File) => {
        if (!selConv || sending || editMsg) return;   // niente allegati mentre si modifica
        setSending(true);
        try {
            const safe = f.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
            const path = `out/${selConv.id}/${Date.now()}-${safe}`;
            const { error } = await supabase.storage.from("whatsapp-media").upload(path, f, { contentType: f.type || "application/octet-stream", upsert: true });
            if (error) throw error;
            const { data: pub } = supabase.storage.from("whatsapp-media").getPublicUrl(path);
            const res = await fetch("/api/whatsapp/send", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ conversationId: selConv.id, text: text.trim(), userId: user?.id, mediaUrl: pub?.publicUrl, mediaMime: f.type || "application/octet-stream", fileName: f.name }),
            }).then(r => r.json());
            if (res?.error) alert("Invio non riuscito: " + res.error);
            else setText("");
        } catch (e: any) {
            alert("Allegato non inviato: " + (e?.message || e));
        } finally {
            setSending(false);
        }
    };

    const instConnessa = visibleInstances.find(i => i.id === selInst);
    const fmtOra = (s: string | null) => s ? new Date(s).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "";
    // GIORNO + ora (segnalazione Luca 10/08 via Verifiche): "oggi" resta solo
    // orario, ieri = "ieri", altrimenti gg/mm — cosi' si capisce QUANDO
    const fmtQuandoWa = (s: string | null) => {
        if (!s) return "";
        const d = new Date(s);
        if (isNaN(d.getTime())) return "";
        const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
        const giorno = new Date(d); giorno.setHours(0, 0, 0, 0);
        const diff = Math.round((oggi.getTime() - giorno.getTime()) / 86400000);
        const ora = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
        if (diff === 0) return ora;
        if (diff === 1) return "ieri " + ora;
        return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) + " " + ora;
    };

    return (
        <div className={embedded ? "h-full flex flex-col gap-3 p-3 sm:p-4 overflow-hidden" : "w-full max-w-7xl mx-auto space-y-4"}>
            <div className="flex items-center justify-between gap-4 flex-wrap shrink-0">
                {embedded ? (
                    <p className="text-sm font-semibold text-slate-400">I numeri che gestisci</p>
                ) : (
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30"><MessageCircle className="w-6 h-6 text-emerald-400" /></div>
                        <div><h1 className="text-2xl font-black text-white tracking-tight">WhatsApp</h1><p className="text-slate-500 text-sm">Messaggi dei clienti, rispondi da qui</p></div>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    {instConnessa?.status === "connessa" && (
                        <button onClick={() => sincronizza()} disabled={syncing} title="Ricarica le conversazioni dal telefono (di solito non serve: si aggiorna da solo)"
                            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 disabled:opacity-40">
                            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        </button>
                    )}
                    {/* DISCONNETTI ed ELIMINA sono usciti dall'Inbox (Luca 25/08
                        notte: «gli utenti non devono avere la possibilità di
                        sconnettere il numero, non ha senso») — vivono SOLO nel
                        pannello Amministrazione → WhatsApp. */}
                    {/* Numero selezionato NON connesso (mai scansionato o sessione scaduta):
                        serve ri-scansionare LO STESSO numero, non crearne un altro. */}
                    {instConnessa && instConnessa.status !== "connessa" && (
                        <button onClick={() => setRelinkName(instConnessa.instance_name)}
                            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold flex items-center gap-2">
                            <QrCode className="w-4 h-4" /> {instConnessa.status === "disconnessa" ? "Ricollega" : "Scansiona QR"}
                        </button>
                    )}
                    {/* Numero connesso e visibilita' "own": il caller ha gia' il suo numero. */}
                    {waScope === "own" && instConnessa?.status === "connessa" && (
                        <span className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-bold flex items-center gap-2">
                            <CheckCheck className="w-4 h-4" /> Connesso
                        </span>
                    )}
                    {/* "Collega numero" (25/08, niente testo libero): il caller
                        collega solo il SUO numero — nome automatico = il suo;
                        tutti gli altri numeri (utenti, negozi) si collegano dal
                        Pannello WhatsApp in Amministrazione, a selezione. */}
                    {waScope === "own" && !instances.some(i => i.owner_user_id === user?.id) && (
                        <button onClick={() => setLinkModal(true)} className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold flex items-center gap-2"><Plus className="w-4 h-4" /> Collega il mio numero</button>
                    )}
                    {/* il link al pannello solo a chi può entrarci (revisore:
                        per lo store manager era un vicolo cieco → redirect) */}
                    {waScope === "all" && (
                        <a href="/amministrazione?sez=whatsapp" className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold flex items-center gap-2"><Plus className="w-4 h-4" /> Pannello numeri</a>
                    )}
                    {waScope === "store" && (
                        <span className="text-[11px] text-slate-500">i numeri si collegano dall&apos;amministrazione</span>
                    )}
                </div>
            </div>

            {/* selettore numero — PER NOME, non per numero (Luca 31/07): il
                titolare (dipendente) o il negozio, cosi' l'admin clicca
                "Tommaso Evangelisti" senza ricordarsi il cellulare. Ordine di
                preferenza: nome scelto a mano → titolare → negozio → numero.
                La matita (solo amministrazione) rinomina l'etichetta. */}
            {visibleInstances.length > 0 && (
                <div className="flex gap-2 flex-wrap shrink-0 items-center">
                    {/* FILTRO (Luca 25/08 notte-6): con tanti numeri si sceglie
                        la persona/il negozio e resta solo il suo chip */}
                    {visibleInstances.length > 4 && (
                        <div className="min-w-[190px]">
                            <SelectOpzioni value={filtroNum}
                                onChange={(v) => {
                                    setFiltroNum(v);
                                    const hit = visibleInstances.find(i => etichettaIstanza(i) === v);
                                    if (hit) { setSelInst(hit.id); setSelConv(null); }
                                }}
                                opzioni={[...new Set(visibleInstances.map(etichettaIstanza))]}
                                placeholder="🔍 Filtra per persona o negozio…" maxVoci={100} />
                        </div>
                    )}
                    {filtroNum && (
                        <button onClick={() => setFiltroNum("")} className="text-[11px] text-slate-500 hover:text-slate-300" title="Torna a tutti i numeri">✕ tutti</button>
                    )}
                    {chipsVisibili.map(i => (
                        <span key={i.id} className="inline-flex items-center">
                            <button onClick={() => { setSelInst(i.id); setSelConv(null); }}
                                title={i.wa_number ? `+${i.wa_number}` : i.instance_name}
                                className={cn("px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-2",
                                    selInst === i.id ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200" : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10")}>
                                {/* SEMAFORO SULL'ICONA (Luca 25/08 notte, screenshot): il
                                    telefono a sinistra dice lo stato — verde attivo, giallo
                                    da ricollegare; la destra resta SOLO per il badge dei
                                    messaggi in sospeso (il pallino accanto confondeva) */}
                                <Phone className={cn("w-3.5 h-3.5", i.status === "connessa" ? "text-emerald-400" : "text-amber-400")}
                                    aria-label={i.status} />
                                {/* NUMERO SEMPRE IN VISTA (Luca 25/08 notte): sotto
                                    l'etichetta il numero VERO rilevato da WhatsApp
                                    dopo la scansione — «così hanno sempre il loro
                                    numero a disposizione» */}
                                <span className="flex flex-col items-start leading-tight text-left" title={i.status === "connessa" ? "Numero attivo" : "Da ricollegare (QR dal pannello amministrativo)"}>
                                    <span>{etichettaIstanza(i)}</span>
                                    <span className="text-[10px] font-normal text-slate-500">{i.wa_number ? `+${i.wa_number}` : "numero in arrivo…"}</span>
                                </span>
                                {(unreadPerInst[i.id] || 0) > 0 && (
                                    <span title={`${unreadPerInst[i.id]} chat da leggere su questo numero`}
                                        className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center">
                                        {unreadPerInst[i.id]}
                                    </span>
                                )}
                            </button>
                            {/* la RINOMINA libera non esiste più (Luca 25/08 notte):
                                il nome è SEMPRE la copia dell'intestazione — si cambia
                                riassegnando il numero dal pannello Amministrazione →
                                WhatsApp (a un utente o a un negozio, dalle tendine) */}
                        </span>
                    ))}
                </div>
            )}

            {visibleInstances.length === 0 ? (
                <div className={cn("glass-card p-12 text-center text-slate-400", embedded && "flex-1 flex flex-col items-center justify-center")}>
                    <QrCode className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                    {waScope === "own"
                        ? <span>Non hai ancora un numero WhatsApp collegato. Premi <b className="text-emerald-300">Collega il mio numero</b> e scansiona il QR col tuo telefono.</span>
                        : <span>Nessun numero collegato per la tua visibilita&apos;. I numeri si collegano dal <b className="text-emerald-300">Pannello numeri</b> (Amministrazione → WhatsApp), intestati a un utente o a un negozio.</span>}
                </div>
            ) : (
                <div className={cn("grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4", embedded ? "flex-1 min-h-0" : "h-[calc(100vh-230px)]")}>
                    {/* elenco conversazioni — CHT-01: sotto lg lista e thread si
                        alternano (prima si impilavano entrambi, pannelli minuscoli) */}
                    <div className={cn("glass-card overflow-y-auto", selConv && "hidden lg:block")}>
                        {/* NUOVA CHAT A NUMERO LIBERO (Luca 25/08): si scrive anche a
                            chi non è ancora cliente — documenti da farsi mandare
                            prima di avergli venduto qualcosa */}
                        {instConnessa?.status === "connessa" && (
                            <button onClick={() => setNuovaChat(true)}
                                className="w-full px-4 py-2.5 border-b border-emerald-500/20 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/10 text-sm font-bold flex items-center gap-2">
                                <Plus className="w-4 h-4" /> Nuova chat — numero o cliente
                            </button>
                        )}
                        {instConnessa && instConnessa.status !== "connessa" && (
                            <div className="p-3 text-xs text-amber-300 border-b border-amber-500/20 bg-amber-500/5">
                                {instConnessa.status === "disconnessa" ? "Sessione scaduta — le conversazioni sono nascoste" : "Numero non ancora collegato"} — premi{" "}
                                <button onClick={() => setRelinkName(instConnessa.instance_name)} className="underline font-semibold hover:text-amber-200">
                                    {instConnessa.status === "disconnessa" ? "Ricollega" : "Scansiona QR"}
                                </button>{" "}per il QR.
                            </div>
                        )}
                        {convs.length === 0 ? (
                            <div className="p-6 text-center text-slate-500 text-sm">{instConnessa && instConnessa.status !== "connessa" ? "Conversazioni nascoste finché non ricolleghi il numero." : "Ancora nessuna conversazione."}</div>
                        ) : convs.map(c => (
                            <button key={c.id} onClick={() => setSelConv(c)}
                                className={cn("w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/[0.03] flex items-center gap-3", selConv?.id === c.id && "bg-white/[0.05]")}>
                                <div className={cn("w-9 h-9 rounded-full border flex items-center justify-center text-xs font-bold shrink-0",
                                    c.is_group ? "bg-sky-500/15 border-sky-500/25 text-sky-300" : "bg-emerald-500/15 border-emerald-500/25 text-emerald-300")}>
                                    {c.is_group ? <Users className="w-4 h-4" /> : (c.customer_name || c.customer_number).slice(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-semibold text-white truncate">{c.customer_name || (c.is_group ? "Gruppo" : `+${c.customer_number}`)}</span>
                                        <span className="text-[10px] text-slate-500 shrink-0">{fmtQuandoWa(c.last_message_at)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs text-slate-500 truncate">{c.last_preview || ""}</span>
                                        {c.unread > 0 && <span className="text-[10px] font-bold bg-emerald-500 text-white rounded-full px-1.5 shrink-0">{c.unread}</span>}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* thread */}
                    <div className={cn("glass-card flex-col min-h-0", selConv ? "flex" : "hidden lg:flex")}>
                        {!selConv ? (
                            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Seleziona una conversazione</div>
                        ) : (
                            <>
                                <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3">
                                    {/* CHT-01: indietro (solo sotto lg) — torna alla lista */}
                                    <button onClick={() => setSelConv(null)} title="Torna alle conversazioni"
                                        className="lg:hidden p-1.5 -ml-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 shrink-0">
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>
                                    <div className={cn("w-9 h-9 rounded-full border flex items-center justify-center text-xs font-bold shrink-0",
                                        selConv.is_group ? "bg-sky-500/15 border-sky-500/25 text-sky-300" : "bg-emerald-500/15 border-emerald-500/25 text-emerald-300")}>
                                        {selConv.is_group ? <Users className="w-4 h-4" /> : (selConv.customer_name || selConv.customer_number).slice(0, 2).toUpperCase()}
                                    </div>
                                    <div><div className="text-sm font-bold text-white flex items-center gap-1.5">
                                        {selConv.customer_name || (selConv.is_group ? "Gruppo" : `+${selConv.customer_number}`)}
                                        {/* RINOMINA (Luca 31/07): l'amministrazione corregge i nomi
                                            messi male (spesso c'e' il numero al posto del nome) */}
                                        {!selConv.is_group && ["admin", "dev", "direttore_generale", "amministrativo"].includes(user?.role || "") && (
                                            <button
                                                title="Rinomina questa chat (il nome scritto a mano non viene mai sovrascritto)"
                                                onClick={async () => {
                                                    const nuovo = window.prompt("Nome da mostrare per questa chat:", selConv.customer_name || "");
                                                    if (nuovo === null) return;
                                                    const pulito = nuovo.trim();
                                                    const { error } = await supabase.from("wa_conversations").update({ customer_name: pulito || null }).eq("id", selConv.id);
                                                    if (error) { alert("Rinomina non riuscita: " + error.message); return; }
                                                    setConvs(p => p.map(c => c.id === selConv.id ? { ...c, customer_name: pulito || null } : c));
                                                    setSelConv(p => p ? { ...p, customer_name: pulito || null } : p);
                                                }}
                                                className="p-1 rounded-md text-slate-500 hover:text-white hover:bg-white/10 transition-colors text-xs">✏️</button>
                                        )}
                                    </div>
                                        <div className="text-[11px] text-slate-500">{selConv.is_group ? "gruppo WhatsApp" : `+${selConv.customer_number}`}{selConv.client_id ? " · cliente collegato" : ""}</div></div>
                                </div>
                                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
                                    {msgs.map(m => {
                                        const mine = m.direction === "out";
                                        // CHT-02: matita/cestino sulla bolla in uscita — solo entro le
                                        // finestre WhatsApp e se il messaggio e' indirizzabile
                                        // (wa_message_id presente, non failed, non gia' eliminato)
                                        const eta = Date.now() - new Date(m.wa_timestamp || m.created_at).getTime();
                                        const agibile = mine && !m.deleted_at && !!m.wa_message_id && m.status !== "failed" && puoAgire(m);
                                        const puoModificare = agibile && !m.media_url && !!m.body && eta < FIN_MODIFICA_WA_MS;
                                        const puoCancellare = agibile && eta < FIN_CANCELLA_WA_MS;
                                        return (
                                            <div key={m.id} className={cn("group flex items-center gap-1", mine ? "justify-end" : "justify-start")}>
                                                {mine && (puoModificare || puoCancellare) && (
                                                    <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100 transition-opacity shrink-0">
                                                        {puoModificare && (
                                                            <button type="button" title="Modifica (entro 14 minuti)" onClick={() => { setEditMsg(m); setText(m.body || ""); }}
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-white/10">
                                                                <Pencil className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        {puoCancellare && (
                                                            <button type="button" title="Elimina per tutti (entro 48 ore)" onClick={() => eliminaMessaggio(m)}
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-white/10">
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </span>
                                                )}
                                                <div className={cn("max-w-[75%] rounded-2xl px-3.5 py-2 text-sm", mine ? "bg-emerald-600 text-white rounded-br-sm" : "bg-white/5 text-slate-100 rounded-bl-sm border border-white/5")}>
                                                    {selConv.is_group && !mine && m.sender_name && (
                                                        <p className="text-[11px] font-bold text-sky-300 mb-0.5">{m.sender_name}</p>
                                                    )}
                                                    {/* CHI L'HA SCRITTO (Luca 25/08 notte): sui numeri
                                                        condivisi si risale a Ben vs Alberto — solo qui,
                                                        il cliente non lo vede */}
                                                    {mine && m.sent_by_user_id && nomiMittenti[m.sent_by_user_id] && (
                                                        <p className="text-[11px] font-bold text-emerald-100/90 mb-0.5" title="Chi l'ha inviato dal CRM — visibile solo a noi, mai al cliente">
                                                            {nomiMittenti[m.sent_by_user_id]}{m.sent_by_user_id === user?.id ? " (tu)" : ""}
                                                        </p>
                                                    )}
                                                    {/* CHT-02: eliminato -> solo segnaposto in corsivo, mai body/media */}
                                                    {m.deleted_at ? (
                                                        <p className={cn("italic flex items-center gap-1.5", mine ? "text-emerald-100/80" : "text-slate-400")}>
                                                            <Ban className="w-3.5 h-3.5 shrink-0" /> Messaggio eliminato
                                                        </p>
                                                    ) : (<>
                                                    {m.media_url && (
                                                        m.media_mime?.startsWith("image/") ? (
                                                            <button type="button" onClick={() => window.open(m.media_url as string, "_blank")} className="block mb-1">
                                                                <img src={m.media_url} alt="" className="max-w-[240px] max-h-[280px] rounded-lg object-cover cursor-zoom-in" />
                                                            </button>
                                                        ) : m.media_mime?.startsWith("video/") ? (
                                                            <video src={m.media_url} controls className="max-w-[260px] rounded-lg mb-1" />
                                                        ) : m.media_mime?.startsWith("audio/") ? (
                                                            <audio src={m.media_url} controls className="mb-1 w-[240px] max-w-full" />
                                                        ) : (
                                                            <a href={m.media_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-black/25 hover:bg-black/35 text-xs mb-1">
                                                                <FileText className="w-4 h-4 shrink-0" /><span className="truncate max-w-[180px]">Documento</span>
                                                            </a>
                                                        )
                                                    )}
                                                    {m.body && !(m.media_url && /^\[(Immagine|Documento|Audio|Video|Sticker)\]$/.test(m.body)) && (
                                                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                                                    )}
                                                    </>)}
                                                    <p className={cn("text-[10px] mt-0.5 flex items-center gap-1 justify-end", mine ? "text-emerald-100/70" : "text-slate-500")}>
                                                        {m.edited_at && !m.deleted_at && <span className="italic opacity-70">(modificato)</span>}
                                                        {fmtQuandoWa(m.wa_timestamp || m.created_at)}
                                                        {mine && !m.deleted_at && (m.status === "read" ? <CheckCheck className="w-3.5 h-3.5 text-sky-200" /> : m.status === "delivered" ? <CheckCheck className="w-3.5 h-3.5" /> : m.status === "failed" ? <span className="text-rose-200">✕</span> : <Check className="w-3.5 h-3.5" />)}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {/* CHT-02: barra "stai modificando" sopra il composer (pattern chat interna) */}
                                {editMsg && (
                                    <div className="px-3 pt-2 flex items-center gap-2 text-xs text-amber-300 border-t border-white/10">
                                        <Pencil className="w-3.5 h-3.5 shrink-0" />
                                        <span className="flex-1 truncate">Stai modificando: {editMsg.body}</span>
                                        <button onClick={() => { setEditMsg(null); setText(""); }} title="Annulla la modifica"
                                            className="p-1 rounded-md hover:bg-white/10"><X className="w-3.5 h-3.5" /></button>
                                    </div>
                                )}
                                <div className={cn("p-3 flex items-center gap-2 relative", !editMsg && "border-t border-white/10")}>
                                    <input ref={fileRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) inviaFile(f); e.target.value = ""; }} />
                                    <button onClick={() => fileRef.current?.click()} disabled={sending || !!editMsg} title="Allega un file"
                                        className="p-2.5 rounded-xl text-slate-400 hover:text-emerald-300 hover:bg-white/5 disabled:opacity-40">
                                        <Paperclip className="w-5 h-5" />
                                    </button>
                                    {/* EMOJI (Luca 25/08 notte: «non abbiamo le emoticons») */}
                                    <button onClick={() => setEmojiOpen(v => !v)} title="Emoji"
                                        className={cn("p-2 rounded-xl text-lg leading-none hover:bg-white/5", emojiOpen ? "bg-white/10" : "")}>😊</button>
                                    {emojiOpen && <EmojiPickerWA onPick={(e) => setText(t => t + e)} onClose={() => setEmojiOpen(false)} />}
                                    <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") invia(); }}
                                        placeholder="Scrivi un messaggio…  (o allega un file con la graffetta)" className="glass-input flex-1 text-sm" />
                                    <button onClick={invia} disabled={sending || !text.trim()} className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white">
                                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {nuovaChat && <NuovaChatModal apri={apriPerNumero} onClose={() => setNuovaChat(false)} />}
            {linkModal && <LinkModal presetName={user?.name || undefined} onClose={() => { setLinkModal(false); loadInstances(); }} onLinked={(name) => sincronizza(name, { silent: true })} ownerUserId={user?.id} />}
            {relinkName && <LinkModal reconnectName={relinkName} onClose={() => { setRelinkName(null); loadInstances(); }} onLinked={(name) => sincronizza(name, { silent: true })} ownerUserId={user?.id} />}
        </div>
    );
}

// Modal: crea (o RICOLLEGA) un'istanza, mostra il QR, poll dello stato finche'
// connesso. Con reconnectName si salta la creazione e si ri-scansiona lo stesso
// numero (es. dopo una sessione scaduta), senza crearne uno nuovo.
// ── EMOJI PICKER del composer WhatsApp (Luca 25/08 notte: «non abbiamo le
// emoticons») — stesso dataset della chat interna (src/lib/emojiData.json,
// ~1.900 emoji con nomi e ricerca it/en), caricato pigramente alla prima
// apertura. Compatto: ricerca + categorie + griglia; il click INSERISCE e
// il pannello resta aperto (come WhatsApp), la ✕ o l'invio lo chiudono.
type EmojiDatoWA = { e: string; n: string; k: string[]; g: number };
const GRUPPI_EMOJI_WA: string[] = ["😀", "👋", "🐻", "🍕", "🚗", "⚽", "💡", "🔣", "🏁"];
const EMOJI_RAPIDE_WA = ["👍", "❤️", "😂", "🙏", "😊", "🎉", "💪", "👏", "🔥", "✅", "📞", "📄"];
const _normEmoji = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
function EmojiPickerWA({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
    const [dati, setDati] = useState<(EmojiDatoWA & { s: string })[] | null>(null);
    const [q, setQ] = useState("");
    const [gr, setGr] = useState(0);
    useEffect(() => {
        import("@/lib/emojiData.json")
            .then((m) => setDati((m.default as EmojiDatoWA[]).map(d => ({ ...d, s: _normEmoji(d.n + " " + d.k.join(" ")) }))))
            .catch(() => { /* restano le rapide */ });
    }, []);
    const lista = !dati ? [] : (q.trim()
        ? dati.filter(d => d.s.includes(_normEmoji(q))).slice(0, 300)
        : dati.filter(d => d.g === gr).slice(0, 400));
    return (
        <div className="absolute bottom-16 left-2 z-50 w-[340px] glass-card p-3 shadow-2xl border border-white/10"
            onMouseDown={e => e.preventDefault()}>
            <div className="flex items-center gap-2 mb-2">
                <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Escape") onClose(); }}
                    placeholder="Cerca un'emoji… (es. cuore, risata)" autoFocus
                    className="glass-input flex-1 text-xs py-1.5" />
                <button onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            {!q.trim() && (
                <div className="flex gap-1 mb-2">
                    {GRUPPI_EMOJI_WA.map((icona, i) => (
                        <button key={i} onClick={() => setGr(i)}
                            className={cn("flex-1 py-1 rounded-lg text-base leading-none", gr === i ? "bg-white/15" : "hover:bg-white/5 opacity-60")}>{icona}</button>
                    ))}
                </div>
            )}
            {!dati ? (
                <div className="flex flex-wrap gap-1 py-1">
                    {EMOJI_RAPIDE_WA.map(e => (
                        <button key={e} onClick={() => onPick(e)} className="w-9 h-9 rounded-lg text-xl hover:bg-white/10">{e}</button>
                    ))}
                    <div className="w-full text-[10px] text-slate-500 pt-1">carico tutte le emoji…</div>
                </div>
            ) : (
                <div className="grid grid-cols-8 gap-0.5 max-h-56 overflow-y-auto pr-1">
                    {lista.map(d => (
                        <button key={d.e} title={d.n} onClick={() => onPick(d.e)}
                            className="w-9 h-9 rounded-lg text-xl leading-none hover:bg-white/10">{d.e}</button>
                    ))}
                    {!lista.length && <div className="col-span-8 text-center text-[11px] text-slate-500 py-3">Nessuna emoji per «{q}»</div>}
                </div>
            )}
        </div>
    );
}

// NUOVA CHAT A NUMERO (Luca 25/08 sera-2): modale del CRM al posto del
// prompt del browser («sembra che arrivi da Chrome») — centrato, stile glass
// come gli altri, Invio per aprire. Top-level (lezione: mai annidata).
function NuovaChatModal({ apri, onClose }: { apri: (dig: string) => Promise<boolean>; onClose: () => void }) {
    const [numero, setNumero] = useState("");
    const [errore, setErrore] = useState("");
    const [busy, setBusy] = useState(false);
    const conferma = async () => {
        const dig = numero.replace(/\D/g, "");
        if (dig.length < 6) { setErrore("Numero troppo corto: ricontrolla."); return; }
        if (busy) return;
        setBusy(true);
        const ok = await apri(dig);
        setBusy(false);
        if (ok) onClose();
    };
    // Luca 25/08 notte: oltre al numero a mano, il solito campo multi-ricerca
    // dell'anagrafica (nome+cognome, CF/P.IVA, ragione sociale, cellulare) —
    // un click sul cliente e la chat si apre sul suo cellulare
    const scegliCliente = async (c: ClienteTrovato) => {
        const dig = String(c.cellulare || "").replace(/\D/g, "");
        if (dig.length < 6) { setErrore(`${etichettaCliente(c)} non ha un cellulare in anagrafica: completa la scheda cliente o scrivi il numero qui sopra.`); return; }
        if (busy) return;
        setErrore("");
        setBusy(true);
        const ok = await apri(dig);
        setBusy(false);
        if (ok) onClose();
    };
    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="glass-card w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">Nuova chat</h3>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-3">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Numero WhatsApp del destinatario</label>
                    <input value={numero} onChange={e => { setNumero(e.target.value); setErrore(""); }}
                        onKeyDown={e => { if (e.key === "Enter") conferma(); }}
                        className="glass-input w-full text-sm" placeholder="es. 333 1234567 oppure +39 333 1234567"
                        inputMode="tel" autoFocus />
                    <p className="text-[11px] text-slate-500">Vale anche per chi non è ancora cliente (es. documenti da farsi mandare prima della vendita). Il prefisso +39 sui cellulari italiani si aggiunge da solo; se una chat con questo numero esiste già, si riapre quella.</p>
                    {numero.trim() && <button onClick={conferma} disabled={busy}
                        className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white font-bold flex items-center justify-center gap-2">
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Apri la chat
                    </button>}
                    <div className="flex items-center gap-3 pt-1">
                        <div className="flex-1 h-px bg-white/10" />
                        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">oppure un cliente</span>
                        <div className="flex-1 h-px bg-white/10" />
                    </div>
                    <RicercaCliente onScelto={scegliCliente} placeholder="Cerca: nome e cognome, CF, P.IVA o ragione sociale…" />
                    <p className="text-[11px] text-slate-500">Un click sull&apos;anagrafica apre la chat sul cellulare del cliente.</p>
                    {errore && <p className="text-xs text-rose-300 font-semibold">{errore}</p>}
                </div>
            </div>
        </div>
    );
}

// Esportato per il PANNELLO WHATSAPP in Amministrazione (Luca 25/08 sera):
// da lì si collega un numero a QUALSIASI utente o a un NEGOZIO — sempre da
// selezione, mai testo libero. `presetName` blocca il nome (chip in sola
// lettura), `negozio` marca il numero come numero di punto vendita.
export function LinkModal({ onClose, onLinked, ownerUserId, reconnectName, presetName, negozio }: { onClose: () => void; onLinked?: (instanceName: string) => void; ownerUserId?: string; reconnectName?: string; presetName?: string; negozio?: string | null }) {
    const [name, setName] = useState(presetName || "");
    const [instanceName, setInstanceName] = useState<string | null>(reconnectName || null);
    const [qr, setQr] = useState<string | null>(null);
    const [state, setState] = useState<string>("");
    const [busy, setBusy] = useState(false);

    const crea = async () => {
        if (!name.trim()) return;
        setBusy(true);
        const res = await api({ action: "create", displayName: name.trim(), ownerUserId });
        setBusy(false);
        if (res?.error) { alert(res.error); return; }
        // numero DI NEGOZIO (pannello 25/08): la colonna negozio attiva la
        // condivisione automatica con chi ha quel punto vendita in visibilità
        if (negozio && res.instanceName) {
            await supabase.from("wa_instances").update({ negozio }).eq("instance_name", res.instanceName);
        }
        setInstanceName(res.instanceName);
        setQr(res.qr || null);
    };

    // ricollegamento: chiedi subito un QR fresco per l'istanza esistente
    useEffect(() => {
        if (!reconnectName) return;
        let alive = true;
        (async () => {
            const q = await api({ action: "qr", instanceName: reconnectName });
            if (alive) setQr(q.qr || null);
        })();
        return () => { alive = false; };
    }, [reconnectName]);

    // poll stato + rinfresca QR
    useEffect(() => {
        if (!instanceName) return;
        let alive = true;
        const t = setInterval(async () => {
            const st = await api({ action: "state", instanceName });
            if (!alive) return;
            setState(st.state || "");
            if (st.state === "open") { clearInterval(t); if (instanceName) onLinked?.(instanceName); setTimeout(onClose, 800); return; }
            // se il QR e' scaduto, richiedine uno nuovo
            const q = await api({ action: "qr", instanceName });
            if (alive && q.qr) setQr(q.qr);
        }, 4000);
        return () => { alive = false; clearInterval(t); };
    }, [instanceName]);

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="glass-card w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">{reconnectName ? "Ricollega il numero WhatsApp" : "Collega un numero WhatsApp"}</h3>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                {!instanceName ? (
                    <div className="space-y-3">
                        {presetName ? (
                            <>
                                {/* niente testo libero (Luca 25/08): il nome arriva
                                    dalla selezione — utente o negozio — già fatta */}
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Numero intestato a</label>
                                <div className="w-full px-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-sm font-bold text-white">{negozio ? "🏪 " : "👤 "}{presetName}</div>
                            </>
                        ) : (
                            <>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nome (es. "Caller Giulia")</label>
                                <input value={name} onChange={e => setName(e.target.value)} className="glass-input w-full text-sm" placeholder="Nome del numero" autoFocus />
                            </>
                        )}
                        <button onClick={crea} disabled={busy || !name.trim()} className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white font-bold flex items-center justify-center gap-2">
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />} Genera QR
                        </button>
                    </div>
                ) : state === "open" ? (
                    <div className="py-8 text-center text-emerald-300 font-bold flex flex-col items-center gap-2"><CheckCheck className="w-10 h-10" /> Numero collegato!</div>
                ) : (
                    <div className="text-center space-y-3">
                        <p className="text-sm text-slate-400">Apri WhatsApp sul telefono → <b>Dispositivi collegati</b> → <b>Collega un dispositivo</b> → inquadra il QR.</p>
                        {qr ? <img src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`} alt="QR WhatsApp" className="w-56 h-56 mx-auto rounded-xl bg-white p-2" />
                            : <div className="w-56 h-56 mx-auto rounded-xl bg-white/5 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-500" /></div>}
                        <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1"><RefreshCw className="w-3 h-3" /> il QR si aggiorna da solo · stato: {state || "in attesa"}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
