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
import type { ChatOmni, Radar, VoceTimeline, Hardware } from "./tipi";

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
export async function caricaConversazioni(meId: string | null): Promise<ChatOmni[]> {
    const [wa, em, itn] = await Promise.all([
        supabase.from("wa_conversations")
            .select("id, customer_name, customer_number, client_id, last_preview, last_message_at, unread, chiusa_il")
            .is("chiusa_il", null).order("last_message_at", { ascending: false }).limit(80),
        supabase.from("email_conversations")
            .select("id, customer_name, customer_email, client_id, subject, last_preview, last_message_at, unread, spam, trashed")
            .eq("spam", false).eq("trashed", false).order("last_message_at", { ascending: false }).limit(80),
        meId
            ? supabase.from("chat_participants").select("conversation_id, last_read_at").eq("user_id", meId).limit(120)
            : Promise.resolve({ data: [] as { conversation_id: string; last_read_at: string | null }[] }),
    ]);

    const out: ChatOmni[] = [];

    for (const c of (wa.data || []) as Record<string, unknown>[]) {
        const nome = String(c.customer_name || c.customer_number || "Sconosciuto");
        out.push({
            id: `wa:${c.id}`, canale: "wa", nome,
            sottotitolo: String(c.customer_number || ""),
            anteprima: String(c.last_preview || ""), ora: oraBreve(c.last_message_at as string),
            daLeggere: !!c.unread, iniziali: c.client_id ? iniziali(nome) : "#",
            clientId: (c.client_id as string) || null,
            riferimento: String(c.customer_number || "") || null,
            utenteId: null, aggiornata: (c.last_message_at as string) || null,
        });
    }
    for (const c of (em.data || []) as Record<string, unknown>[]) {
        const nome = String(c.customer_name || c.customer_email || "Sconosciuto");
        out.push({
            id: `em:${c.id}`, canale: "email", nome,
            sottotitolo: String(c.subject || ""),
            anteprima: String(c.last_preview || ""), ora: oraBreve(c.last_message_at as string),
            daLeggere: !!c.unread, iniziali: c.client_id ? iniziali(nome) : "@",
            clientId: (c.client_id as string) || null,
            riferimento: String(c.customer_email || "") || null,
            utenteId: null, aggiornata: (c.last_message_at as string) || null,
        });
    }

    // CHAT INTERNA: le conversazioni a cui partecipo, col nome del collega
    const convIds = ((itn as { data?: { conversation_id: string }[] }).data || []).map(x => x.conversation_id);
    if (convIds.length && meId) {
        const [parts, ultimi] = await Promise.all([
            supabase.from("chat_participants").select("conversation_id, user_id").in("conversation_id", convIds).limit(400),
            supabase.from("chat_messages").select("conversation_id, body, created_at, sender_id")
                .in("conversation_id", convIds).is("deleted_at", null).order("created_at", { ascending: false }).limit(400),
        ]);
        const altri = new Map<string, string>();
        for (const p of (parts.data || []) as { conversation_id: string; user_id: string }[]) {
            if (p.user_id !== meId && !altri.has(p.conversation_id)) altri.set(p.conversation_id, p.user_id);
        }
        const ids = [...new Set(altri.values())];
        const { data: users } = ids.length
            ? await supabase.from("app_users").select("id, name").in("id", ids).limit(200)
            : { data: [] as { id: string; name: string }[] };
        const nomi = new Map((users || []).map(u => [u.id, u.name]));
        const visti = new Set<string>();
        for (const m of (ultimi.data || []) as Record<string, unknown>[]) {
            const cid = String(m.conversation_id);
            if (visti.has(cid)) continue;         // solo l'ultimo per conversazione
            visti.add(cid);
            const altro = altri.get(cid);
            if (!altro) continue;                  // gruppi: fuori dal modulo, per ora
            out.push({
                id: `in:${cid}`, canale: "interna", nome: nomi.get(altro) || "Collega",
                sottotitolo: null, anteprima: String(m.body || ""), ora: oraBreve(m.created_at as string),
                daLeggere: false, iniziali: iniziali(nomi.get(altro) || "C"),
                clientId: null, riferimento: null, utenteId: altro,
                aggiornata: (m.created_at as string) || null,
            });
        }
    }

    // ORDINE UNICO: i non letti davanti, poi il più recente
    return out.sort((a, b) => {
        if (a.daLeggere !== b.daLeggere) return a.daLeggere ? -1 : 1;
        return String(b.aggiornata || "").localeCompare(String(a.aggiornata || ""));
    });
}

/* ── I MESSAGGI DELLA CONVERSAZIONE APERTA ───────────────────────────── */
export async function caricaMessaggi(chat: ChatOmni) {
    const [tipo, id] = chat.id.split(":");
    if (tipo === "wa") {
        const { data } = await supabase.from("wa_messages")
            .select("id, from_me, body, timestamp").eq("conversation_id", id)
            .order("timestamp", { ascending: true }).limit(200);
        return (data || []).map((m: Record<string, unknown>) => ({
            id: String(m.id), verso: m.from_me ? "out" as const : "in" as const,
            testo: String(m.body || ""), ora: oraBreve(m.timestamp as string),
        }));
    }
    if (tipo === "em") {
        const { data } = await supabase.from("email_messages")
            .select("id, from_me, body_text, snippet, sent_at").eq("conversation_id", id)
            .order("sent_at", { ascending: true }).limit(100);
        return (data || []).map((m: Record<string, unknown>) => ({
            id: String(m.id), verso: m.from_me ? "out" as const : "in" as const,
            testo: String(m.body_text || m.snippet || ""), ora: oraBreve(m.sent_at as string), isMail: true,
        }));
    }
    const { data } = await supabase.from("chat_messages")
        .select("id, body, created_at, sender_id").eq("conversation_id", id)
        .is("deleted_at", null).order("created_at", { ascending: true }).limit(200);
    return (data || []).map((m: Record<string, unknown>) => ({
        id: String(m.id), verso: "in" as const, testo: String(m.body || ""),
        ora: oraBreve(m.created_at as string), autore: null,
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
    const { data } = await supabase.from(tab).select("stato, azione").eq("conversation_id", id).maybeSingle();
    const stato = String(data?.stato || "");
    const perche = String(data?.azione || "");
    if (!stato && !perche) return "Il triage non ha ancora letto questa conversazione.";
    const ETICHETTA: Record<string, string> = {
        rispondere: "Aspetta una risposta da noi",
        leggere: "Da leggere, senza fretta",
        niente: "Non serve fare niente",
        attesa: "In attesa del cliente",
    };
    return `${ETICHETTA[stato] || stato}${perche ? ` — ${perche}` : ""}`;
}

/* ── CASO A: il cliente registrato ───────────────────────────────────── */
async function radarCliente(clientId: string, aiSummaryTxt: string): Promise<Radar> {
    const { data: righe } = await supabase.from("contracts")
        .select("id, data, brand, categoria, prodotto, offerta, negozio, stato, dettagli, is_demo, nascosta_gestione")
        .eq("client_id", clientId).order("data", { ascending: false }).limit(200);
    const vendite = (righe || []).filter((c: Record<string, unknown>) => !c.is_demo && !c.nascosta_gestione);

    return {
        tipo: "cliente", stato: "Cliente Registrato",
        umore: vendite.length > 3 ? "Cliente solido" : "Cliente attivo",
        coloreUmore: vendite.length > 3 ? "emerald" : "indigo",
        aiSummary: aiSummaryTxt,
        ltv: ltvDa(vendite),
        hardware: hardwareDa(vendite),
        timeline: timelineDa(vendite),
    };
}

/** VALORE GENERATO — «dal momento della registrazione».
 *  ⚠️ APERTO CON LUCA: qui sommo i prezzi delle voci di MARGINALITÀ, che
 *  sono le uniche con un euro scritto sulla vendita. Il valore delle
 *  attivazioni telco non è un numero sul contratto: è il pay della lettera
 *  di gara del mese in cui è stato fatto, e va deciso se «valore generato»
 *  vuol dire quello (ricavo dell'azienda) o il margine netto. Finché non è
 *  deciso, il numero mostrato è ONESTO su cosa contiene: lo dice la nota. */
function ltvDa(vendite: Record<string, unknown>[]): { euro: number; nota: string } {
    let euro = 0, conMargine = 0;
    for (const c of vendite) {
        const d = (c.dettagli || {}) as Record<string, unknown>;
        const prezzo = Number(d["Prezzo"] ?? d["Importo"] ?? d["Totale"] ?? 0);
        if (prezzo > 0) { euro += prezzo; conMargine++; }
    }
    const telco = vendite.length - conMargine;
    return {
        euro: Math.round(euro * 100) / 100,
        nota: telco > 0
            ? `${conMargine} vendite con importo · ${telco} attivazioni telco ancora da valorizzare`
            : `${conMargine} vendite con importo`,
    };
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
    const totali = Number(d["Mesi"] || 24);
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
            titolo: String(arr[0].negozio || "Vendita"),
            sottotitolo: `${arr.length} ${arr.length === 1 ? "contratto" : "contratti"} · ${brands.join(" · ")}`,
            dettagli: arr.map((x) => ({
                brand: `${x.brand} · ${x.categoria}`,
                desc: `${x.prodotto || ""} — ${x.offerta || ""}`.trim(),
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
    const { data } = await supabase.from("contracts")
        .select("id, venditore, dettagli, is_demo, nascosta_gestione, stato")
        .eq("data", ymd).limit(500);
    const valide = (data || []).filter((c: Record<string, unknown>) =>
        String(c.id).startsWith("CTR-") && !c.is_demo && !c.nascosta_gestione && !/annull/i.test(String(c.stato || "")));
    const conta = (nome: string | null) => {
        const mie = valide.filter((c) => String(c.venditore || "").trim().toLowerCase() === String(nome || "").trim().toLowerCase());
        let euro = 0;
        for (const c of mie) {
            const d = (c.dettagli || {}) as Record<string, unknown>;
            euro += Number(d["Prezzo"] ?? d["Importo"] ?? 0);
        }
        return { pezzi: mie.length, valore: Math.round(euro * 100) / 100 };
    };
    const loroC = conta(chat.nome), tuoC = conta(me.nome);
    return {
        tipo: "staff", stato: "Staff",
        umore: tuoC.pezzi >= loroC.pezzi ? "Sei avanti" : "Sei dietro",
        coloreUmore: tuoC.pezzi >= loroC.pezzi ? "emerald" : "indigo",
        aiSummary: tuoC.pezzi === loroC.pezzi
            ? `Oggi siete pari: ${tuoC.pezzi} pezzi a testa.`
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
