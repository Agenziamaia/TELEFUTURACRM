/* ═══ CHAT OMNICANALE — lo strato dati ════════════════════════════════════
   Tutto quello che la UI mostra nasce qui. La regola che ho seguito: la UI
   non interroga MAI il database e non decide MAI quale modulo mostrare —
   riceve un `Radar` già della forma giusta e lo disegna. Se domani cambia
   una regola di business si cambia questo file, non la grafica.

   Le fonti sono quelle che il CRM ha già:
     · WhatsApp  → wa_conversations / wa_messages / wa_triage
     · Email     → email_conversations / email_messages / email_triage
     · Interna   → chat_conversations / chat_messages (via lib/chat)
     · Anagrafica→ clients (il `client_id` sulla conversazione È lo status)
     · Storia    → contracts (LTV, telefono a rate, cronologia)          */

import { supabase } from "@/lib/supabaseClient";
import {
    brandIdDaLabel, calcolaAvanzamento, caricaContrattiContesto, caricaTabellareAzienda,
    contestoVfFw, esclusaDalleGare, matchRigheAttivazione, payEuroAttivazione,
    type ContrattoPay, type Tabellare,
} from "@/lib/commissioning";
import { waIstanzeVisibili } from "@/lib/waVisibilita";
import { emailCaselleVisibili, membershipEmail } from "@/lib/emailVisibilita";
import { sendMessage } from "@/lib/chat";
import type { ChatOmni, MessaggioOmni, Radar, VoceTimeline, Hardware } from "./tipi";

const iniziali = (s: string) => String(s || "?").trim().split(/\s+/).slice(0, 2).map(x => x[0] || "").join("").toUpperCase() || "#";

const oraBreve = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const oggi = new Date();
    const stessoGiorno = d.toDateString() === oggi.toDateString();
    if (stessoGiorno) return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    const ieri = new Date(); ieri.setDate(ieri.getDate() - 1);
    if (d.toDateString() === ieri.toDateString()) return `ieri ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
};

/* ── LA LISTA DI SINISTRA ─────────────────────────────────────────────────
   Le tre code arrivano in parallelo e si fondono in un ordine solo: il più
   recente in cima, i non letti sempre davanti. È questa fusione che rende
   il tab «Tutti» una cosa sola invece di tre liste appiccicate.          */
export async function caricaConversazioni(
    me: { id: string | null; role: string | null; stores: string[]; membri?: { id: string; nome: string }[] | null },
): Promise<ChatOmni[]> {
    const meId = me.id;
    // QUANDO GUARDO UN NEGOZIO le chat interne non sono di «uno»: sono di
    // tutti quelli che ci lavorano (Luca 27/08: «l'unica cosa che cambia sono
    // le chat interne, però a quel punto me le dai tutte di tutte le persone
    // che fanno parte di quel punto vendita»). Il numero e la casella invece
    // restano quelli del negozio: quelli il perimetro li prende già da solo.
    const membri = me.membri && me.membri.length ? me.membri : null;
    const proprietari = membri ? membri.map((m) => m.id) : meId ? [meId] : [];
    const nomeProprietario = new Map((membri || []).map((m) => [m.id, m.nome]));
    // ⛔ IL PERIMETRO, PRIMA DI TUTTO. Su wa_conversations e
    // email_conversations non c'è RLS: se non si filtra qui, si legge tutto —
    // compresi i numeri e le caselle PERSONALI dei colleghi. Le due funzioni
    // sono LE STESSE che usano le inbox vere, non una copia.
    const [inst, acc, membro] = await Promise.all([
        supabase.from("wa_instances").select("id, owner_user_id, negozio, display_name, status").limit(100),
        supabase.from("email_accounts").select("id, owner_user_id, negozio").limit(100),
        membershipEmail(supabase as never, meId),
    ]);
    if (inst.error) throw new Error(`Numeri WhatsApp: ${inst.error.message}`);
    if (acc.error) throw new Error(`Caselle email: ${acc.error.message}`);
    const idWa = waIstanzeVisibili(inst.data || [], meId, me.role, me.stores).map((i) => i.id);
    const idEm = emailCaselleVisibili(acc.data || [], meId, me.role, me.stores, membro).map((a) => a.id);
    // nessun numero e nessuna casella in visibilità: resta la chat interna
    
    const [wa, em, itn] = await Promise.all([
        // ⚠️ nullsFirst: false — in ORDER BY … DESC Postgres mette i NULL PER
        // PRIMI: senza questo il limite si riempiva di conversazioni senza
        // data (47 su WhatsApp, 29 sulla mail) e quelle vere restavano fuori
        idWa.length
            ? supabase.from("wa_conversations")
                .select("id, customer_name, customer_number, client_id, last_preview, last_message_at, unread, chiusa_il")
                .in("instance_id", idWa)
                .is("chiusa_il", null).order("last_message_at", { ascending: false, nullsFirst: false }).limit(80)
            : Promise.resolve({ data: [], error: null }),
        idEm.length
            ? supabase.from("email_conversations")
                .select("id, customer_name, customer_email, client_id, subject, last_preview, last_message_at, unread, spam, trashed, archived")
                .in("account_id", idEm)
                .eq("spam", false).eq("trashed", false).eq("archived", false)
                .order("last_message_at", { ascending: false, nullsFirst: false }).limit(80)
            : Promise.resolve({ data: [], error: null }),
        proprietari.length
            ? supabase.from("chat_participants").select("conversation_id, user_id, last_read_at")
                .in("user_id", proprietari).limit(120 * Math.min(6, proprietari.length))
            : Promise.resolve({ data: [] as { conversation_id: string; user_id: string; last_read_at: string | null }[] }),
    ]);

    if (wa.error) throw new Error(`WhatsApp: ${wa.error.message}`);
    if (em.error) throw new Error(`Email: ${em.error.message}`);

    const out: ChatOmni[] = [];

    for (const c of (wa.data || []) as Record<string, unknown>[]) {
        const nome = String(c.customer_name || c.customer_number || "Sconosciuto");
        out.push({
            id: `wa:${c.id}`, canale: "wa", nome,
            sottotitolo: null,          // il numero sta in testata: qui serve il messaggio
            anteprima: String(c.last_preview || ""), ora: oraBreve(c.last_message_at as string),
            daLeggere: !!c.unread, iniziali: /^[+\d\s]+$/.test(nome) ? "#" : iniziali(nome),
            clientId: (c.client_id as string) || null,
            riferimento: String(c.customer_number || "") || null,
            numero: String(c.customer_number || "") || null,
            utenteId: null, aggiornata: (c.last_message_at as string) || null,
        });
    }
    for (const c of (em.data || []) as Record<string, unknown>[]) {
        const nome = String(c.customer_name || c.customer_email || "Sconosciuto");
        out.push({
            id: `em:${c.id}`, canale: "email", nome,
            sottotitolo: String(c.subject || ""),
            anteprima: String(c.last_preview || ""), ora: oraBreve(c.last_message_at as string),
            daLeggere: !!c.unread, iniziali: nome.includes("@") ? "@" : iniziali(nome),
            clientId: (c.client_id as string) || null,
            riferimento: String(c.customer_email || "") || null,
            utenteId: null, aggiornata: (c.last_message_at as string) || null,
        });
    }

    // CHAT INTERNA: le conversazioni dei proprietari, col nome del collega.
    // Con un proprietario solo (io, o la persona in cui mi immedesimo) è la
    // sua rubrica; con un negozio sono le rubriche di tutti quelli che ci
    // lavorano, e ogni riga porta scritto DI CHI è.
    const partecipazioni = ((itn as { data?: { conversation_id: string; user_id: string; last_read_at: string | null }[] }).data || []);
    const convIds = [...new Set(partecipazioni.map(x => x.conversation_id))];
    // di chi è la conversazione: se due colleghi dello stesso negozio si
    // scrivono, la riga esce UNA volta sola, intestata al primo dei due
    const proprietarioDi = new Map<string, string>();
    for (const p of partecipazioni) if (!proprietarioDi.has(p.conversation_id)) proprietarioDi.set(p.conversation_id, p.user_id);
    if (convIds.length && proprietari.length) {
        const [parts, ultimi] = await Promise.all([
            supabase.from("chat_participants").select("conversation_id, user_id").in("conversation_id", convIds).limit(400),
            supabase.from("chat_messages").select("conversation_id, body, created_at, sender_id")
                .in("conversation_id", convIds).is("deleted_at", null).order("created_at", { ascending: false }).limit(400),
        ]);
        const altri = new Map<string, string>();
        for (const p of (parts.data || []) as { conversation_id: string; user_id: string }[]) {
            const mio = proprietarioDi.get(p.conversation_id);
            if (p.user_id !== mio && !altri.has(p.conversation_id)) altri.set(p.conversation_id, p.user_id);
        }
        const ids = [...new Set(altri.values())];
        // ⚠️ la colonna è `full_name`, non `name` (che non esiste): con la
        // colonna sbagliata la query tornava 400 e OGNI chat si chiamava
        // «Collega» — e il confronto del CASO C cercava un venditore di nome
        // «Collega», quindi era sempre zero a zero
        const { data: users, error: eU } = ids.length
            ? await supabase.from("app_users").select("id, full_name").in("id", ids).limit(200)
            : { data: [] as { id: string; full_name: string }[], error: null };
        if (eU) throw new Error(`Colleghi: ${eU.message}`);
        const nomi = new Map((users || []).map(u => [u.id, u.full_name]));
        // i GRUPPI restano fuori (il radar è un confronto a due): senza questo
        // un gruppo da cinque compariva come chat singola con un membro a caso
        const { data: convs } = await supabase.from("chat_conversations")
            .select("id, type").in("id", convIds).limit(200);
        const gruppi = new Set((convs || []).filter((c: { type?: string }) => c.type === "group").map((c: { id: string }) => c.id));
        const letturaMia = new Map(partecipazioni.map(x => [`${x.conversation_id}|${x.user_id}`, x.last_read_at]));
        const visti = new Set<string>();
        for (const m of (ultimi.data || []) as Record<string, unknown>[]) {
            const cid = String(m.conversation_id);
            if (visti.has(cid)) continue;         // solo l'ultimo per conversazione
            visti.add(cid);
            if (gruppi.has(cid)) continue;
            const altro = altri.get(cid);
            if (!altro) continue;
            const mio = proprietarioDi.get(cid) || "";
            out.push({
                id: `in:${cid}`, canale: "interna", nome: nomi.get(altro) || "Collega",
                sottotitolo: null, anteprima: String(m.body || ""), ora: oraBreve(m.created_at as string),
                daLeggere: (() => {
                    const letto = letturaMia.get(`${cid}|${mio}`);
                    return !letto || String(m.created_at) > String(letto);
                })(),
                iniziali: iniziali(nomi.get(altro) || "C"),
                clientId: null, riferimento: null, utenteId: altro,
                aggiornata: (m.created_at as string) || null,
                // il nome del proprietario compare SOLO guardando un negozio:
                // nella mia lista sarei sempre io, e sarebbe rumore
                perChi: membri ? (nomeProprietario.get(mio) || null) : null,
            });
        }
    }

    // ORDINE UNICO: IL PIÙ RECENTE IN CIMA, e basta.
    // ⚠️ Prima mettevo i non letti davanti, e il risultato era che una mail di
    // ieri non letta stava sopra un WhatsApp di stamattina: l'ordine di tempo
    // spariva (Luca 26/08: «non me le mette in ordine di tempo, cosa che
    // chiaramente non deve accadere»). Il non letto si vede dal pallino — non
    // deve spostare le righe: in una lista fusa di tre canali l'unica cosa che
    // permette di orientarsi è che il tempo scenda sempre.
    return out.sort((a, b) => String(b.aggiornata || "").localeCompare(String(a.aggiornata || "")));
}

/* ── CHI POSSO GUARDARE ───────────────────────────────────────────────────
   Le due liste del selettore «vedi come». I negozi arrivano dalla tabella
   `stores` e NON da `useVisibleStores`: chi vede tutta la rete lì dentro ha
   una lista VUOTA (`seesAll` senza elenco), ed è per questo che nel selettore
   comparivano solo le persone (Luca 27/08).                              */
export async function elencoNegozi(): Promise<string[]> {
    const { data, error } = await supabase.from("stores").select("name").eq("active", true).order("name").limit(200);
    if (error) throw new Error(`Punti vendita: ${error.message}`);
    return [...new Set((data || []).map((s: { name?: string | null }) => String(s.name || "")).filter(Boolean))];
}

export async function elencoPersone(): Promise<{ id: string; nome: string; role: string; negozio: string | null }[]> {
    const { data, error } = await supabase.from("app_users")
        .select("id, full_name, role, primary_store").eq("active", true).order("full_name").limit(300);
    if (error) throw new Error(`Collaboratori: ${error.message}`);
    return (data || []).map((u: Record<string, unknown>) => ({
        id: String(u.id), nome: String(u.full_name || "—"),
        role: String(u.role || ""), negozio: (u.primary_store as string) || null,
    }));
}

/** CHI LAVORA IN QUEL NEGOZIO — serve per le chat interne quando mi
 *  immedesimo in un punto vendita. Sia chi ce l'ha come negozio principale
 *  sia chi ci è stato aggiunto (`user_stores`): l'appartenenza nel CRM è
 *  queste due cose insieme, non una sola. */
export async function membriNegozio(negozio: string): Promise<{ id: string; nome: string }[]> {
    const [pri, agg] = await Promise.all([
        supabase.from("app_users").select("id, full_name").eq("active", true).eq("primary_store", negozio).limit(80),
        supabase.from("user_stores").select("user_id").eq("store_name", negozio).limit(150),
    ]);
    if (pri.error) throw new Error(`Persone del negozio: ${pri.error.message}`);
    const out = new Map<string, string>();
    for (const u of (pri.data || []) as { id: string; full_name: string }[]) out.set(u.id, u.full_name || "—");
    const extra = [...new Set(((agg.data || []) as { user_id: string }[]).map(x => x.user_id))].filter(id => !out.has(id));
    if (extra.length) {
        const { data } = await supabase.from("app_users").select("id, full_name").eq("active", true).in("id", extra).limit(150);
        for (const u of (data || []) as { id: string; full_name: string }[]) out.set(u.id, u.full_name || "—");
    }
    return [...out.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
}

/* ── I MESSAGGI DELLA CONVERSAZIONE APERTA ──────────────────────────────
   ⚠️ Le colonne sono quelle VERE, verificate a schema: `direction` (non
   `from_me`), `wa_timestamp` e `email_date` (non `timestamp`/`sent_at`).
   Con quelle sbagliate PostgREST rispondeva 400, il codice non guardava
   l'errore e l'utente leggeva «Nessun messaggio» su due canali su tre.
   Da qui in poi ogni errore viene sollevato: meglio una schermata che dice
   cosa non ha funzionato di una che finge di essere vuota.            */
export async function caricaMessaggi(chat: ChatOmni, meId: string | null): Promise<MessaggioOmni[]> {
    const [tipo, id] = chat.id.split(":");
    if (tipo === "wa") {
        const { data, error } = await supabase.from("wa_messages")
            .select("id, direction, body, wa_timestamp, created_at").eq("conversation_id", id)
            .is("deleted_at", null)
            .order("wa_timestamp", { ascending: true, nullsFirst: true }).limit(200);
        if (error) throw new Error(`Messaggi WhatsApp: ${error.message}`);
        return (data || []).map((m: Record<string, unknown>) => ({
            id: String(m.id), verso: m.direction === "out" ? "out" as const : "in" as const,
            testo: String(m.body || ""), ora: oraBreve((m.wa_timestamp || m.created_at) as string),
        }));
    }
    if (tipo === "em") {
        const { data, error } = await supabase.from("email_messages")
            .select("id, direction, body_text, subject, email_date, created_at").eq("conversation_id", id)
            .order("email_date", { ascending: true, nullsFirst: true }).limit(100);
        if (error) throw new Error(`Messaggi email: ${error.message}`);
        return (data || []).map((m: Record<string, unknown>) => ({
            id: String(m.id), verso: m.direction === "out" ? "out" as const : "in" as const,
            testo: String(m.body_text || m.subject || ""),
            ora: oraBreve((m.email_date || m.created_at) as string), isMail: true,
        }));
    }
    // CHAT INTERNA: i MIEI messaggi devono stare a destra. `sender_id` c'era
    // già nella select e veniva buttato via: tutta la conversazione appariva
    // in arrivo, anche quello che avevo scritto io.
    const { data, error } = await supabase.from("chat_messages")
        .select("id, body, created_at, sender_id").eq("conversation_id", id)
        .is("deleted_at", null).order("created_at", { ascending: true }).limit(200);
    if (error) throw new Error(`Chat interna: ${error.message}`);
    const altrui = [...new Set((data || []).map((m: Record<string, unknown>) => String(m.sender_id)).filter(x => x && x !== meId))];
    const { data: users } = altrui.length
        ? await supabase.from("app_users").select("id, full_name").in("id", altrui).limit(50)
        : { data: [] as { id: string; full_name: string }[] };
    const nomi = new Map((users || []).map(u => [u.id, u.full_name]));
    return (data || []).map((m: Record<string, unknown>) => ({
        id: String(m.id), verso: String(m.sender_id) === meId ? "out" as const : "in" as const,
        testo: String(m.body || ""), ora: oraBreve(m.created_at as string),
        autore: String(m.sender_id) === meId ? null : (nomi.get(String(m.sender_id)) || null),
    }));
}

/* ── IL RADAR ─────────────────────────────────────────────────────────────
   Qui si applicano LE REGOLE, una volta sola. Chi chiama riceve la forma
   giusta e non deve decidere niente.                                    */
export async function caricaRadar(chat: ChatOmni, me: { id: string | null; nome: string | null }): Promise<Radar> {
    if (chat.canale === "interna") return radarStaff(chat, me);
    const riassunto = await aiSummary(chat);
    if (!chat.clientId) {
        // CASO B — nessuna anagrafica: si ferma qui, e non per scelta grafica.
        // Il tipo `RadarProspect` non ha nemmeno i campi ltv/timeline.
        return { tipo: "prospect", stato: "Non Registrato", umore: "Da qualificare", coloreUmore: "indigo", aiSummary: riassunto };
    }
    return radarCliente(chat.clientId, riassunto);
}

/** AI SUMMARY: oggi viene dal triage che già gira (DeepSeek, ogni 10'), che
 *  per ogni chat scrive lo stato e il PERCHÉ. Non è ancora un riassunto
 *  disteso — quando ci sarà, cambia solo questa funzione. */
async function aiSummary(chat: ChatOmni): Promise<string> {
    const [tipo, id] = chat.id.split(":");
    const tab = tipo === "wa" ? "wa_triage" : "email_triage";
    const { data, error } = await supabase.from(tab).select("stato, azione").eq("conversation_id", id).maybeSingle();
    if (error) return "Il triage non è raggiungibile in questo momento.";
    const stato = String(data?.stato || "");
    const perche = String(data?.azione || "");
    if (!stato && !perche) return "Il triage non ha ancora letto questa conversazione.";
    // ⚠️ GLI STATI VERI, quelli del vincolo a DB: `leggere` e `attesa` non
    // esistono, e con la mappa sbagliata il 67% delle email mostrava lo slug
    // grezzo nel riquadro che deve stare per primo («da_leggere — …»)
    const ETICHETTA: Record<string, string> = {
        rispondere: "Aspetta una risposta da noi",
        da_leggere: "Da leggere, senza fretta",
        programmata: "Già programmata",
        attesa_cliente: "In attesa del cliente",
        spazzatura: "Spazzatura",
        niente: "Non serve fare niente",
    };
    return `${ETICHETTA[stato] || stato}${perche ? ` — ${perche}` : ""}`;
}

/* ── CASO A: il cliente registrato ───────────────────────────────────── */
async function radarCliente(clientId: string, aiSummaryTxt: string): Promise<Radar> {
    const { data: righe, error: eC } = await supabase.from("contracts")
        .select("id, data, brand, categoria, prodotto, offerta, negozio, stato, dettagli, is_demo, nascosta_gestione")
        .eq("client_id", clientId).order("data", { ascending: false, nullsFirst: false }).limit(200);
    if (eC) throw new Error(`Storia del cliente: ${eC.message}`);
    const vendite = (righe || []).filter((c: Record<string, unknown>) => !c.is_demo && !c.nascosta_gestione);

    return {
        tipo: "cliente", stato: "Cliente Registrato",
        umore: vendite.length > 3 ? "Cliente solido" : "Cliente attivo",
        coloreUmore: vendite.length > 3 ? "emerald" : "indigo",
        aiSummary: aiSummaryTxt,
        ltv: await ltvServizi(vendite),
        hardware: hardwareDa(vendite),
        timeline: timelineDa(vendite),
    };
}

/** VALORE GENERATO = IL RICAVO DELL'AZIENDA (Luca 26/08, testuale: «sui
 *  servizi degli operatori telefonici corrisponde al commissioning di quella
 *  attivazione»). Quindi NON è un importo scritto sul contratto: è il pay
 *  della lettera di gara del mese in cui l'attivazione è stata fatta, alla
 *  soglia che quel mese è stata davvero raggiunta.
 *
 *  Per calcolarlo bene servono tre cose per ogni mese toccato dal cliente: il
 *  tabellare azienda del contesto, la produzione di quel mese (le soglie si
 *  raggiungono in gruppo, non da soli) e il canone dell'offerta. Si ricicla
 *  il motore invece di riscriverlo, e si passa dal `caricaContrattiContesto`
 *  invece di normalizzare a mano — così il cliente eredita gratis anche le
 *  cose che il motore sa fare (fascia di prezzo dei telefoni dal listino,
 *  opzioni, provenienza).
 *
 *  ⚠️ LO SCONTRINATO NON C'È, ED È VOLUTO: «dobbiamo ancora settare il
 *  magazzino dove andiamo a definire il margine dell'azienda rispetto al
 *  valore che scontriniamo, per ora mettici solo quelle dei servizi». Le
 *  vendite di marginalità sono contate a parte e DICHIARATE nella nota, così
 *  il numero non sembra completo quando non lo è. */
async function ltvServizi(vendite: Record<string, unknown>[]): Promise<{ euro: number; nota: string }> {
    const attivazioni = vendite.filter((c) =>
        String(c.id).startsWith("CTR-") && !/annull/i.test(String(c.stato || "")));
    const scontrinate = vendite.length - attivazioni.length;
    if (!attivazioni.length) return { euro: 0, nota: nota(0, 0, scontrinate) };

    // gruppi (contesto pay, mese): le soglie sono mensili e di contesto
    const gruppi = new Map<string, { ctx: string; mese: string; ids: Set<string>; prefix: string }>();
    for (const c of attivazioni) {
        const d = (c.dettagli || {}) as Record<string, unknown>;
        const brandId = brandIdDaLabel(c.brand);
        if (!brandId) continue;
        const ctx = contestoVfFw(brandId, String(d["Cod.Ins."] || "") || null, String(c.negozio || ""), String(c.categoria || ""));
        const mese = `${String(c.data).slice(0, 7)}-01`;
        if (!ctx || String(c.data).length < 7) continue;
        const k = `${ctx}|${mese}`;
        const g = gruppi.get(k) || { ctx, mese, ids: new Set<string>(), prefix: String(c.brand || "") };
        g.ids.add(String(c.id));
        gruppi.set(k, g);
    }
    if (!gruppi.size) return { euro: 0, nota: nota(0, 0, scontrinate) };

    const canoni = await mappaCanoni();
    let euro = 0, contate = 0, senzaPay = 0;
    for (const g of gruppi.values()) {
        const { tab, mese } = await meseContesto(g.ctx, g.mese, g.prefix);
        if (!tab) continue;
        // la SOGLIA raggiunta quel mese da tutta la produzione del contesto
        const avz = calcolaAvanzamento(tab, mese.filter((x) => !esclusaDalleGare(x)));
        for (const c of mese) {
            if (!g.ids.has(String(c.id))) continue;
            const set = matchRigheAttivazione(tab.righe, c, brandIdDaLabel(c.brand));
            if (!set.length) { senzaPay++; continue; }
            const pista = set[0].pista;
            const tier = pista ? (avz.piste[pista]?.tier ?? 0) : 0;
            const canone = canoni.get(`${brandIdDaLabel(c.brand)}|${chiave(c.offerta)}|${chiave(c.prodotto)}`) ?? null;
            const v = payEuroAttivazione(set, set[0].gettone ? 0 : tier, canone);
            if (v == null) { senzaPay++; continue; }
            euro += v; contate++;
        }
    }
    return { euro: Math.round(euro * 100) / 100, nota: nota(contate, senzaPay, scontrinate) };
}

const chiave = (x: unknown) => String(x || "").trim().toLowerCase();

/** un mese di un contesto si carica UNA volta: il confronto fra due colleghi
 *  tocca gli stessi mesi, e senza cache si pagherebbe due volte */
const _mesi = new Map<string, Promise<{ tab: Tabellare | null; mese: ContrattoPay[] }>>();
function meseContesto(ctx: string, mese: string, prefix: string) {
    const k = `${ctx}|${mese}`;
    const gia = _mesi.get(k);
    if (gia) return gia;
    const p = (async () => {
        try {
            const [tab, cc] = await Promise.all([
                caricaTabellareAzienda(ctx, mese),
                caricaContrattiContesto(ctx, mese, prefix),
            ]);
            return { tab, mese: cc.contratti };
        } catch { return { tab: null, mese: [] as ContrattoPay[] }; }
    })();
    _mesi.set(k, p);
    return p;
}

function nota(contate: number, senzaPay: number, scontrinate: number): string {
    const parti = [`${contate} ${contate === 1 ? "attivazione" : "attivazioni"} a commissioning`];
    if (senzaPay) parti.push(`${senzaPay} senza riga di pay`);
    if (scontrinate) parti.push(`${scontrinate} di scontrinato, non ancora valorizzate`);
    return parti.join(" · ");
}

/** canone mensile per offerta, che serve alle righe a moltiplicatore */
let _canoni: Map<string, number> | null = null;
async function mappaCanoni(): Promise<Map<string, number>> {
    if (_canoni) return _canoni;
    const { data } = await supabase.from("catalog_offerte")
        .select("nome, canone_mensile, catalog_prodotti!inner(nome, brand_id)")
        .not("canone_mensile", "is", null).limit(4000);
    const m = new Map<string, number>();
    for (const o of (data || []) as Record<string, unknown>[]) {
        const p = o.catalog_prodotti as { nome: string; brand_id: string } | null;
        if (p) m.set(`${p.brand_id}|${chiave(o.nome)}|${chiave(p.nome)}`, Number(o.canone_mensile));
    }
    _canoni = m;
    return m;
}

/** ECOSISTEMA & HARDWARE — il telefono a rate ancora in corso.
 *  Se non ce n'è, torna null e il modulo NON si disegna (regola di Luca). */
function hardwareDa(vendite: Record<string, unknown>[]): Hardware | null {
    const tel = vendite.find((c) => {
        const d = (c.dettagli || {}) as Record<string, unknown>;
        return String(d["categoria_catalogo"] || c.categoria || "") === "Telefono a Rate" && d["Modello Terminale"];
    });
    if (!tel) return null;
    const d = (tel.dettagli || {}) as Record<string, unknown>;
    const inizio = new Date(String(tel.data));
    const mesiPassati = Math.max(0, Math.floor((Date.now() - inizio.getTime()) / (30.44 * 86400000)));
    // durata: se non la sappiamo, i 24 mesi che sono lo standard delle rate
    // ⚠️ la durata NON è a catalogo: 24 è lo standard delle rate, e la UI
    // lo dice invece di far passare una stima per un dato letto
    const totali = 24;
    const pagate = Math.min(totali, mesiPassati);
    const restano = Math.max(0, totali - pagate);
    if (restano === 0) return null;              // finanziamento chiuso: non è più «in corso»
    return {
        nome: String(d["Modello Terminale"]),
        finanziaria: /compass/i.test(String(tel.offerta)) ? "Compass"
            : /findomestic/i.test(String(tel.offerta)) ? "Findomestic" : null,
        rate: pagate, rateTotali: totali,
        percentuale: Math.round((pagate / totali) * 100),
        scade: restano === 1 ? "1 mese" : `${restano} mesi`,
        stato: "In corso",
        stimata: true,
    };
}

/** CRONOLOGIA EVENTI — le vendite raggruppate per giorno, esplodibili. */
function timelineDa(vendite: Record<string, unknown>[]): VoceTimeline[] {
    const perGiorno = new Map<string, Record<string, unknown>[]>();
    for (const c of vendite) {
        const g = String(c.data || "").slice(0, 10);
        if (!g) continue;
        (perGiorno.get(g) || perGiorno.set(g, []).get(g)!).push(c);
    }
    return [...perGiorno.entries()].slice(0, 12).map(([g, arr]) => {
        const brands = [...new Set(arr.map(x => String(x.brand || "")))].filter(Boolean);
        return {
            id: g,
            icona: arr.some(x => String((x.dettagli as Record<string, unknown>)?.categoria_catalogo || "") === "Telefono a Rate") ? "📱" : "💰",
            coloreIcona: "text-amber-500 border-amber-500/50 bg-amber-500/10",
            data: new Date(g).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }),
            titolo: [...new Set(arr.map((x) => String(x.negozio || "")).filter(Boolean))].join(" · ") || "Vendita",
            sottotitolo: `${arr.length} ${arr.length === 1 ? "contratto" : "contratti"} · ${brands.join(" · ")}`,
            dettagli: arr.map((x) => ({
                brand: [x.brand, x.categoria].map(String).filter((v, k, a) => v && a.indexOf(v) === k).join(" · "),
                desc: [x.prodotto, x.offerta].map((v) => String(v || "").trim()).filter(Boolean).join(" — "),
                stato: (x.stato as string) || null,
                logo: "🌀",
            })),
        };
    });
}

/* ── CASO C: il collega ──────────────────────────────────────────────────
   Confronto delle attivazioni DI OGGI, mie contro sue. I pezzi si vedono
   subito; il valore in euro è sotto un toggle perché è un dato che si
   guarda apposta, non che si lascia acceso davanti a tutti.            */
async function radarStaff(chat: ChatOmni, me: { id: string | null; nome: string | null }): Promise<Radar> {
    const oggi = new Date();
    const ymd = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, "0")}-${String(oggi.getDate()).padStart(2, "0")}`;
    // solo i due che si stanno confrontando: due filtri invece di scaricare
    // tutta la giornata della rete e cercarci dentro (e senza `order` il
    // limite tagliava righe a caso nei giorni di picco)
    const nomi = [chat.nome, me.nome].filter(Boolean) as string[];
    const { data, error } = nomi.length
        ? await supabase.from("contracts")
            .select("id, data, brand, negozio, categoria, prodotto, offerta, stato, dettagli, venditore, is_demo, nascosta_gestione")
            .eq("data", ymd).in("venditore", nomi).order("id").limit(400)
        : { data: [], error: null };
    if (error) throw new Error(`Attivazioni di oggi: ${error.message}`);
    const valide = (data || []).filter((c: Record<string, unknown>) =>
        String(c.id).startsWith("CTR-") && !c.is_demo && !c.nascosta_gestione && !/annull/i.test(String(c.stato || "")));

    // «valore generato» è la STESSA cosa del cliente: il commissioning
    // dell'attivazione (Luca 26/08). Niente scontrinato: non è ancora
    // valorizzato, e infatti le righe EXT- restano fuori anche dai pezzi.
    const conta = async (nome: string | null) => {
        const mie = valide.filter((c) => chiave(c.venditore) === chiave(nome));
        const { euro } = mie.length ? await ltvServizi(mie) : { euro: 0 };
        return { pezzi: mie.length, valore: euro };
    };
    const [loroC, tuoC] = await Promise.all([conta(chat.nome), conta(me.nome)]);
    return {
        tipo: "staff", stato: "Staff",
        umore: tuoC.pezzi >= loroC.pezzi ? "Sei avanti" : "Sei dietro",
        coloreUmore: tuoC.pezzi >= loroC.pezzi ? "emerald" : "indigo",
        aiSummary: tuoC.pezzi === loroC.pezzi
            ? `Oggi siete pari: ${tuoC.pezzi} ${tuoC.pezzi === 1 ? "pezzo" : "pezzi"} a testa.`
            : tuoC.pezzi > loroC.pezzi
                ? `Oggi sei avanti di ${tuoC.pezzi - loroC.pezzi} ${tuoC.pezzi - loroC.pezzi === 1 ? "pezzo" : "pezzi"}.`
                : `Oggi ${chat.nome} è avanti di ${loroC.pezzi - tuoC.pezzi} ${loroC.pezzi - tuoC.pezzi === 1 ? "pezzo" : "pezzi"}.`,
        kpi: {
            loro: { nome: chat.nome, ...loroC },
            tuo: { nome: "Tu", ...tuoC },
            maxPezzi: Math.max(1, loroC.pezzi, tuoC.pezzi),
        },
    };
}


/* ── INVIO ────────────────────────────────────────────────────────────────
   Nessuna strada nuova: si usano le tre che il CRM ha già e che funzionano
   da mesi — /api/whatsapp/send, /api/email/send e `sendMessage` della chat
   interna. Inventarne una quarta avrebbe voluto dire rifare da capo anche
   la coda, i tentativi e la scrittura in `wa_messages`.                   */
export async function inviaMessaggio(chat: ChatOmni, testo: string, meId: string | null): Promise<void> {
    const [tipo, id] = chat.id.split(":");
    const corpo = testo.trim();
    if (!corpo) return;
    if (tipo === "in") {
        if (!meId) throw new Error("Non riesco a capire chi sei: ricarica la pagina.");
        await sendMessage(id, meId, corpo);
        return;
    }
    const url = tipo === "wa" ? "/api/whatsapp/send" : "/api/email/send";
    const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id, text: corpo, userId: meId }),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "rete non raggiungibile" }));
    if (res?.ok === false || res?.error) throw new Error(String(res.error || "invio non riuscito"));
}
