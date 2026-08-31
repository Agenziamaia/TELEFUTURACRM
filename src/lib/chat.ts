// Data layer per la chat interna. Si appoggia al client anon (supabaseClient)
// e alle RPC 052 (chat_inbox / chat_get_or_create_dm / chat_create_group).
import { supabase } from "@/lib/supabaseClient";

export interface DirUser {
  id: string;
  full_name: string;
  role: string;
  grade: string | null;
  primary_store: string | null;
}
export interface InboxItem {
  conversation_id: string;
  type: "dm" | "group";
  title: string | null;
  last_message_at: string;
  last_body: string | null;
  last_sender_id: string | null;
  unread: number;
  other_id: string | null;
  other_name: string | null;
  other_role: string | null;
  member_count: number;
  pinned_at: string | null;   // fissata (mig. 132) — in cima all'elenco
}
export interface ChatAttachment {
  id: string; url: string; name: string | null; mime: string | null; size_bytes: number | null;
}
/** Riferimento a un record del CRM allegato a un messaggio (tag cliccabile). */
// «persona» = un COLLEGA, non un record del CRM (Luca 31/08: «quando creo un
// gruppo devo poter taggare anche le persone che ci sono dentro»). Prima
// scrivendo @alex uscivano i CLIENTI di nome Alexandra: il tag serviva solo a
// puntare a schede, non a chiamare qualcuno.
export type RefKind = "cliente" | "contratto" | "appuntamento" | "persona";
export interface ChatRef { type: RefKind; id: string; label: string }

/** Dove porta il tag quando ci clicchi. */
export function refHref(r: ChatRef): string {
  // una persona taggata porta alla chat con lei: e' la cosa che serve dopo
  // averla nominata in un gruppo
  if (r.type === "persona") return `/chat?persona=${encodeURIComponent(r.id)}`;
  if (r.type === "cliente") return `/clienti?id=${encodeURIComponent(r.id)}`;
  if (r.type === "contratto") return `/ricerca-vendite?id=${encodeURIComponent(r.id)}`;
  return `/calendario?appuntamento=${encodeURIComponent(r.id)}`;
}

export interface ChatReaction { emoji: string; user_id: string; user_name: string }
export interface ChatMessage {
  id: string; sender_id: string | null; body: string | null; created_at: string;
  edited_at: string | null; attachments: ChatAttachment[]; refs: ChatRef[];
  // Segnalazione 74: id del messaggio a cui questo risponde (stile WhatsApp).
  reply_to: string | null;
  // reazioni emoji stile Telegram (mig. 130)
  reactions: ChatReaction[];
}
export interface Participant {
  user_id: string; is_admin: boolean; full_name: string; role: string; primary_store: string | null;
  last_read_at: string | null; last_delivered_at: string | null; last_seen_at: string | null;
}

// Rubrica: tutti gli account attivi (escluso me), per DM e creazione gruppi.
export async function listDirectory(meId: string): Promise<DirUser[]> {
  const { data, error } = await supabase
    .from("app_users")
    .select("id, full_name, role, grade, primary_store")
    .eq("active", true)
    .order("full_name");
  if (error) throw error;
  return (data || []).filter((u: any) => u.id !== meId);
}

export async function getInbox(meId: string): Promise<InboxItem[]> {
  const { data, error } = await supabase.rpc("chat_inbox", { p_user_id: meId });
  if (error) throw error;
  const items = ((data || []) as InboxItem[]).map((i) => ({ ...i, pinned_at: null as string | null }));
  // FISSATE (mig. 132): la spunta sta in chat_participants; senza la
  // migrazione la query fallisce e l'inbox resta quella di sempre
  try {
    const { data: pins } = await supabase.from("chat_participants")
      .select("conversation_id, pinned_at").eq("user_id", meId).not("pinned_at", "is", null);
    const mappa = new Map((pins || []).map((p: any) => [p.conversation_id, p.pinned_at as string]));
    items.forEach((i) => { i.pinned_at = mappa.get(i.conversation_id) ?? null; });
    items.sort((a, b) => {
      if (!!a.pinned_at !== !!b.pinned_at) return a.pinned_at ? -1 : 1;
      if (a.pinned_at && b.pinned_at) return new Date(a.pinned_at).getTime() - new Date(b.pinned_at).getTime();
      return 0;   // tra le non fissate vale l'ordine del server (ultimo messaggio)
    });
  } catch { /* pre-mig. 132 */ }
  return items;
}

/** Fissa/sgancia una conversazione (stile Telegram, max 5 — il limite lo
 *  applica la UI). */
export async function togglePin(convId: string, meId: string, fissa: boolean): Promise<void> {
  const { error } = await supabase.from("chat_participants")
    .update({ pinned_at: fissa ? new Date().toISOString() : null })
    .eq("conversation_id", convId).eq("user_id", meId);
  if (error) throw new Error(/column/i.test(error.message) ? "Manca la migrazione 132 (pinned_at)" : error.message);
}

export async function getOrCreateDM(meId: string, otherId: string): Promise<string> {
  const { data, error } = await supabase.rpc("chat_get_or_create_dm", { p_me: meId, p_other: otherId });
  if (error) throw error;
  return data as string;
}

export async function createGroup(meId: string, title: string, memberIds: string[]): Promise<string> {
  const { data, error } = await supabase.rpc("chat_create_group", {
    p_me: meId, p_title: title, p_members: memberIds,
  });
  if (error) throw error;
  return data as string;
}

// Invia lo stesso messaggio a piu' persone come CHAT PRIVATE INDIVIDUALI (non un gruppo).
export async function broadcast(meId: string, memberIds: string[], body: string): Promise<number> {
  const { data, error } = await supabase.rpc("chat_broadcast", {
    p_me: meId, p_members: memberIds, p_body: body,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function getParticipants(convId: string): Promise<Participant[]> {
  const { data, error } = await supabase
    .from("chat_participants")
    .select("user_id, is_admin, last_read_at, last_delivered_at, app_users(full_name, role, primary_store, last_seen_at)")
    .eq("conversation_id", convId);
  if (error) throw error;
  return (data || []).map((p: any) => ({
    user_id: p.user_id,
    is_admin: p.is_admin,
    full_name: p.app_users?.full_name ?? "—",
    role: p.app_users?.role ?? "",
    primary_store: p.app_users?.primary_store ?? null,
    last_read_at: p.last_read_at ?? null,
    last_delivered_at: p.last_delivered_at ?? null,
    last_seen_at: p.app_users?.last_seen_at ?? null,
  }));
}

// Segna i messaggi di una conversazione come "consegnati" a me (ricevuti dal mio client).
export async function markDelivered(convId: string, meId: string): Promise<void> {
  await supabase
    .from("chat_participants")
    .update({ last_delivered_at: new Date().toISOString() })
    .eq("conversation_id", convId)
    .eq("user_id", meId);
}

// Aggiorna il mio "ultimo accesso" (chiamato periodicamente mentre sono online).
export async function touchLastSeen(meId: string): Promise<void> {
  await supabase.from("app_users").update({ last_seen_at: new Date().toISOString() }).eq("id", meId);
}

// Realtime: cambi ai partecipanti di una conversazione (ricevute lette/consegnate).
export function subscribeReceipts(convId: string, onChange: () => void) {
  const channel = supabase
    .channel(`chat_receipts_${convId}`)
    .on("postgres_changes",
      { event: "UPDATE", schema: "public", table: "chat_participants", filter: `conversation_id=eq.${convId}` },
      () => onChange())
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export async function listMessages(convId: string): Promise<ChatMessage[]> {
  // con le reazioni embeddate; se la mig. 130 non e' ancora a bordo si
  // ripiega sulla select storica: la chat non resta mai a terra
  let res = await supabase
    .from("chat_messages")
    .select("id, sender_id, body, created_at, edited_at, refs, reply_to, chat_attachments(id, url, name, mime, size_bytes), chat_reactions(emoji, user_id, user_name)")
    .eq("conversation_id", convId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (res.error) {
    res = (await supabase
      .from("chat_messages")
      .select("id, sender_id, body, created_at, edited_at, refs, reply_to, chat_attachments(id, url, name, mime, size_bytes)")
      .eq("conversation_id", convId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })) as typeof res;
    if (res.error) throw res.error;
  }
  return ((res.data || []) as any[]).map((m: any) => ({
    id: m.id, sender_id: m.sender_id, body: m.body, created_at: m.created_at,
    edited_at: m.edited_at, attachments: m.chat_attachments || [],
    refs: Array.isArray(m.refs) ? m.refs : [],
    reply_to: m.reply_to ?? null,
    reactions: Array.isArray(m.chat_reactions) ? m.chat_reactions : [],
  }));
}

/** MODIFICA un proprio messaggio entro 3 minuti (Luca 02/08): oltre la
 *  finestra la modifica non parte; edited_at marca il messaggio. */
export const FINESTRA_MODIFICA_MS = 3 * 60 * 1000;
export async function editMessage(messageId: string, meId: string, body: string, createdAt: string): Promise<void> {
  if (Date.now() - new Date(createdAt).getTime() > FINESTRA_MODIFICA_MS)
    throw new Error("Sono passati piu' di 3 minuti: il messaggio non si puo' piu' modificare");
  const { error } = await supabase.from("chat_messages")
    .update({ body: body || null, edited_at: new Date().toISOString() })
    .eq("id", messageId).eq("sender_id", meId);
  if (error) throw error;
}

/** INOLTRA un messaggio in un'altra conversazione (Luca 02/08): body con
 *  riga "Inoltrato", refs copiati e allegati ri-agganciati agli stessi URL
 *  dello storage (nessun re-upload). */
export async function forwardMessage(msg: ChatMessage, meId: string, targetConvId: string): Promise<void> {
  const body = ["↪️ Inoltrato", (msg.body || "").trim()].filter(Boolean).join("\n");
  const { data: nuovo, error } = await supabase
    .from("chat_messages")
    .insert({ conversation_id: targetConvId, sender_id: meId, body: body || "↪️ Inoltrato", refs: msg.refs || [] })
    .select("id").single();
  if (error) throw error;
  if ((msg.attachments || []).length) {
    const { error: aErr } = await supabase.from("chat_attachments").insert(
      (msg.attachments || []).map((a) => ({ message_id: nuovo.id, url: a.url, name: a.name, mime: a.mime, size_bytes: a.size_bytes ?? null }))
    );
    if (aErr) throw aErr;
  }
}

/** "Segna come da leggere" stile WhatsApp/Telegram (Luca 01/08): riporta il
 *  segnalibro di lettura a PRIMA dell'ultimo messaggio, cosi' il badge dei
 *  non letti ricompare e la notifica non si perde. */
export async function markUnread(convId: string, meId: string): Promise<void> {
  const { data } = await supabase.from("chat_messages")
    .select("created_at").eq("conversation_id", convId).is("deleted_at", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const ultimo = data?.created_at ? new Date(new Date(data.created_at).getTime() - 1000) : new Date(0);
  await supabase.from("chat_participants")
    .update({ last_read_at: ultimo.toISOString() })
    .eq("conversation_id", convId).eq("user_id", meId);
}

/** Reazione emoji stile Telegram: click = metti, ri-click = togli (riga per
 *  (messaggio, utente, emoji): niente conflitti tra reazioni simultanee). */
export async function toggleReaction(messageId: string, meId: string, meName: string, emoji: string): Promise<void> {
  const { error } = await supabase.from("chat_reactions").insert({ message_id: messageId, user_id: meId, user_name: meName, emoji });
  if (error) {
    if (/duplicate/i.test(error.message)) {
      await supabase.from("chat_reactions").delete().eq("message_id", messageId).eq("user_id", meId).eq("emoji", emoji);
    } else if (/(relation|table)/i.test(error.message)) {
      throw new Error("Manca la migrazione 130 (chat_reactions)");
    } else throw error;
  }
}

/** Realtime: qualunque reazione cambia -> ricarico i messaggi aperti. */
export function subscribeReactions(convId: string, onChange: () => void) {
  const channel = supabase
    .channel(`chat_react_${convId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "chat_reactions" }, () => onChange())
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

/**
 * Token inline di un tag dentro il testo del messaggio: `@[tipo:id|etichetta]`.
 * Permette di scrivere "ho sentito @Mario Rossi per @CTR_0001" con il tag nel punto giusto.
 */
export const REF_TOKEN_RE = /@\[(cliente|contratto|appuntamento|persona):([^\]|]+)\|([^\]]+)\]/g;
// le parentesi e la barra dentro l'etichetta romperebbero il token e
// farebbero uscire mezzo nome come testo: si neutralizzano scrivendolo
export const refToken = (r: ChatRef) => `@[${r.type}:${r.id}|${String(r.label).replace(/[\]|[]/g, " ")}]`;

/** Spezza il corpo del messaggio in testo semplice + tag, mantenendo l'ordine. */
export function splitBody(body: string): Array<{ text: string } | { ref: ChatRef }> {
  const out: Array<{ text: string } | { ref: ChatRef }> = [];
  let last = 0;
  const re = new RegExp(REF_TOKEN_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) out.push({ text: body.slice(last, m.index) });
    out.push({ ref: { type: m[1] as RefKind, id: m[2], label: m[3] } });
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last) });
  return out;
}

/** Il messaggio in TESTO PIATTO: ogni tag diventa la sua etichetta. Serve
 *  dove non c'è spazio per renderli — avvisi, anteprime, notifiche — perché il
 *  token grezzo `@[persona:<uuid>|Nome]` a video non lo capisce nessuno. */
export function testoPiatto(body: string | null): string {
  return splitBody(body || "")
    .map((p) => ("text" in p ? p.text : (p.ref.label || "").split(" · ")[0]))
    .join("").replace(/\s+/g, " ").trim();
}

/** Etichette coerenti fra ricerca e suggerimenti. */
const clientLabel = (c: any) =>
  [c.ragione_sociale || [c.nome, c.cognome].filter(Boolean).join(" "), c.cf_piva].filter(Boolean).join(" · ") || c.id;
const contractLabel = (c: any) =>
  [c.brand, c.prodotto || c.categoria, c.stato, c.negozio].filter(Boolean).join(" · ");
const apptLabel = (a: any) =>
  [a.date, a.time, a.customer_name, a.store].filter(Boolean).join(" · ");

/**
 * Suggerimenti mostrati appena si digita "@", senza ancora aver scritto nulla:
 * i record piu' recenti, cosi' il caso comune ("l'ultimo contratto") e' a un tasto.
 */
export async function recentEntities(dentro: string[] = [], meId?: string | null): Promise<ChatRef[]> {
  const [cl, ct, ap] = await Promise.all([
    supabase.from("clients").select("id, nome, cognome, ragione_sociale, cf_piva")
      .order("created_at", { ascending: false }).limit(5).then((r) => r.data || [], () => []),
    supabase.from("contracts").select("id, brand, prodotto, categoria, stato, negozio")
      .order("data_registrazione", { ascending: false }).limit(5).then((r) => r.data || [], () => []),
    /* ⛔ NIENTE RICHIAMI FRA I TAG (29/08). Dal calendario i richiami sono
       stati tolti, e il tag `@appuntamento` porta proprio lì: proporli qui
       significherebbe scrivere in chat un link che non apre niente. Fra i
       quattro più recenti erano tre su quattro. */
    supabase.from("appointments").select("id, date, time, customer_name, store")
      .neq("type", "richiamo")
      .order("date", { ascending: false }).limit(4).then((r) => r.data || [], () => []),
  ]);
  // premendo «@» e basta, in un gruppo, la cosa che si vuole quasi sempre e'
  // chiamare uno dei presenti: i partecipanti aprono l'elenco
  const persone = dentro.length ? await searchPersone("", dentro, meId, true).catch(() => []) : [];
  return [
    ...persone.filter((p) => dentro.includes(p.id)),
    ...cl.map((c: any) => ({ type: "cliente" as const, id: c.id, label: clientLabel(c) })),
    ...ct.map((c: any) => ({ type: "contratto" as const, id: String(c.id), label: contractLabel(c) })),
    ...ap.map((a: any) => ({ type: "appuntamento" as const, id: String(a.id), label: apptLabel(a) })),
  ];
}

/** Ricerca su tutti e tre i tipi insieme (usata dall'autocomplete con "@"). */
export async function searchAllEntities(q: string, dentro: string[] = [], meId?: string | null, soloDentro = false): Promise<ChatRef[]> {
  // LE PERSONE PER PRIME. Scrivendo «@alex» in un gruppo si sta chiamando un
  // collega, non cercando un cliente che si chiama Alexandra: i colleghi
  // stanno in cima, i record del CRM restano sotto.
  const [p, a, b, c] = await Promise.all([
    searchPersone(q, dentro, meId, soloDentro).catch(() => []),
    searchEntities("cliente", q).catch(() => []),
    searchEntities("contratto", q).catch(() => []),
    searchEntities("appuntamento", q).catch(() => []),
  ]);
  return [...p, ...a.slice(0, 5), ...b.slice(0, 5), ...c.slice(0, 3)];
}

/** I COLLEGHI da taggare. `dentro` sono gli id dei partecipanti alla
 *  conversazione: vengono per primi, perche' in un gruppo si tagga quasi
 *  sempre uno che e' dentro — gli altri restano raggiungibili scrivendone il
 *  nome, che serve per dire «ne parlo con Tizio» anche se Tizio non c'e'. */
export async function searchPersone(q: string, dentro: string[] = [], meId?: string | null, soloDentro = false): Promise<ChatRef[]> {
  const s = q.trim();
  /* DENTRO UNA CONVERSAZIONE SI TAGGA CHI C'È (Luca 31/08): «mi fa taggare
     anche persone che non ci sono». Giusto: un @ a chi non è nel gruppo non
     gli arriva, e il messaggio resta lì a nominare qualcuno che non lo
     leggerà. Fuori da una conversazione — la barra di ricerca, un gruppo che
     si sta creando — l'elenco resta quello di tutti. */
  const chiuso = soloDentro && dentro.length > 0;
  const base = () => {
    let sel = supabase.from("app_users").select("id, full_name").eq("active", true);
    if (meId) sel = sel.neq("id", meId);        // taggare se stessi non serve a niente
    return sel;
  };
  // DUE QUERY, NON UNA. Con una sola, il `limit` del database taglia PRIMA che
  // l'ordinamento possa portare su i partecipanti: in un gruppo di cinque
  // persone, digitando «@a» — 46 colleghi che combaciano — dei quattro dentro
  // la conversazione ne arrivava uno solo. I partecipanti si chiedono a parte.
  const [dent, tutti] = await Promise.all([
    dentro.length
      ? (s ? base().in("id", dentro).ilike("full_name", `%${s}%`) : base().in("id", dentro)).order("full_name").limit(8)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    chiuso
      ? Promise.resolve({ data: [] as { id: string; full_name: string }[] })
      : (s ? base().ilike("full_name", `%${s}%`) : base()).order("full_name").limit(s ? 12 : 40),
  ]);
  const visti = new Set<string>();
  const out: ChatRef[] = [];
  for (const u of [...((dent.data || []) as { id: string; full_name: string }[]), ...((tutti.data || []) as { id: string; full_name: string }[])]) {
    if (visti.has(u.id)) continue;
    visti.add(u.id);
    out.push({ type: "persona" as RefKind, id: u.id, label: u.full_name });
  }
  return out.slice(0, chiuso ? 12 : (s ? 8 : 10));
}

/** Ricerca record del CRM da taggare in chat (cliente / contratto / appuntamento). */
export async function searchEntities(kind: RefKind, q: string): Promise<ChatRef[]> {
  const s = q.trim();
  if (!s) return [];
  const like = `%${s}%`;

  if (kind === "cliente") {
    const { data } = await supabase
      .from("clients")
      .select("id, nome, cognome, ragione_sociale, cf_piva, citta")
      .or(`nome.ilike.${like},cognome.ilike.${like},ragione_sociale.ilike.${like},cf_piva.ilike.${like}`)
      .limit(15);
    return (data || []).map((c: any) => ({
      type: "cliente" as const,
      id: c.id,
      label: [c.ragione_sociale || [c.nome, c.cognome].filter(Boolean).join(" "), c.cf_piva]
        .filter(Boolean).join(" · ") || c.id,
    }));
  }

  if (kind === "contratto") {
    const { data } = await supabase
      .from("contracts")
      .select("id, brand, prodotto, categoria, stato, negozio, data_registrazione")
      .or(`brand.ilike.${like},prodotto.ilike.${like},negozio.ilike.${like},stato.ilike.${like},codice_attivazione.ilike.${like}`)
      .order("data_registrazione", { ascending: false })
      .limit(15);
    return (data || []).map((c: any) => ({
      type: "contratto" as const,
      id: String(c.id),
      label: [c.brand, c.prodotto || c.categoria, c.stato, c.negozio].filter(Boolean).join(" · "),
    }));
  }

  const { data } = await supabase
    .from("appointments")
    .select("id, date, time, customer_name, agente, store, status")
    // come sopra: i richiami non stanno più nel calendario, quindi non si
    // taggano (nella ricerca erano 13 dei primi 15)
    .neq("type", "richiamo")
    .or(`customer_name.ilike.${like},agente.ilike.${like},store.ilike.${like},notes.ilike.${like}`)
    .order("date", { ascending: false })
    .limit(15);
  return (data || []).map((a: any) => ({
    type: "appuntamento" as const,
    id: String(a.id),
    label: [a.date, a.time, a.customer_name, a.store].filter(Boolean).join(" · "),
  }));
}

/** CHT-03: un risultato della ricerca globale nei messaggi. */
export interface ChatSearchHit {
  message_id: string;
  conversation_id: string;
  body: string;
  created_at: string;
  sender_id: string | null;
}

/**
 * CHT-03 (Luca 04/08): ricerca "stile Telegram" in TUTTE le mie chat.
 * Perimetro: SOLO le conversazioni in cui compaio tra i partecipanti — la
 * lista degli id viene letta da chat_participants e passata come filtro alla
 * query sui messaggi, quindi non si cerca mai nelle chat altrui.
 * Server-side: ilike sul body (jolly % e _ escapati), max 50 risultati,
 * i piu' recenti per primi. Il raggruppamento per chat lo fa la UI.
 */
export async function searchMyMessages(meId: string, query: string): Promise<ChatSearchHit[]> {
  const s = query.trim();
  if (s.length < 3) return [];
  const { data: mie, error: pErr } = await supabase
    .from("chat_participants")
    .select("conversation_id")
    .eq("user_id", meId);
  if (pErr) throw pErr;
  const ids = (mie || []).map((p: any) => p.conversation_id);
  if (!ids.length) return [];
  // escape dei jolly di LIKE: chi cerca "100%" o "IT_01" vuole il testo letterale
  const like = "%" + s.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, conversation_id, body, created_at, sender_id")
    .in("conversation_id", ids)
    .ilike("body", like)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return ((data || []) as any[]).map((m) => ({
    message_id: m.id,
    conversation_id: m.conversation_id,
    body: m.body || "",
    created_at: m.created_at,
    sender_id: m.sender_id ?? null,
  }));
}

const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);

// Invia un messaggio: carica gli allegati sul bucket, inserisce il messaggio e gli allegati.
export async function sendMessage(
  convId: string, meId: string, body: string, files: File[] = [], refs: ChatRef[] = [],
  replyTo: string | null = null   // segnalazione 74
): Promise<void> {
  const uploaded: { url: string; name: string; mime: string; size: number }[] = [];
  for (const f of files) {
    const path = `${convId}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName(f.name)}`;
    const { error: upErr } = await supabase.storage.from("chat-attachments").upload(path, f);
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from("chat-attachments").getPublicUrl(path);
    uploaded.push({ url: pub.publicUrl, name: f.name, mime: f.type, size: f.size });
  }
  const { data: msg, error } = await supabase
    .from("chat_messages")
    .insert({ conversation_id: convId, sender_id: meId, body: body || null, refs, reply_to: replyTo })
    .select("id")
    .single();
  if (error) throw error;
  if (uploaded.length) {
    const { error: aErr } = await supabase.from("chat_attachments").insert(
      uploaded.map((u) => ({ message_id: msg.id, url: u.url, name: u.name, mime: u.mime, size_bytes: u.size }))
    );
    if (aErr) throw aErr;
  }
}

/** Invia una GIF scelta dal picker (Giphy): si allega la URL direttamente,
 *  senza upload — l'img la anima come una GIF (mime image/gif). */
export async function sendGif(convId: string, meId: string, gifUrl: string): Promise<void> {
  const { data: msg, error } = await supabase
    .from("chat_messages")
    .insert({ conversation_id: convId, sender_id: meId, body: null })
    .select("id")
    .single();
  if (error) throw error;
  const { error: aErr } = await supabase.from("chat_attachments")
    .insert({ message_id: msg.id, url: gifUrl, name: "GIF", mime: "image/gif" });
  if (aErr) throw aErr;
}

/**
 * Segna letto usando l'orologio del SERVER (RPC), non quello del browser:
 * con clock skew il segnalibro poteva restare indietro rispetto ai messaggi
 * e il badge dei non letti non si azzerava mai.
 */
export async function markRead(convId: string, meId: string): Promise<void> {
  await supabase.rpc("chat_mark_read", { p_conversation: convId, p_user: meId });
}

/** Elimina un'intera conversazione (solo admin). Cascade su participants/messages/attachments. */
export async function deleteConversation(convId: string): Promise<void> {
  const { error } = await supabase.from("chat_conversations").delete().eq("id", convId);
  if (error) throw error;
}

/**
 * #125: aggiunge partecipanti a un gruppo (idempotente sui duplicati).
 * Il gating (solo l'amministratore del gruppo) e' lato UI: qui si scrive e basta.
 */
export async function addParticipants(convId: string, userIds: string[]): Promise<void> {
  const rows = (userIds || []).filter(Boolean).map((user_id) => ({ conversation_id: convId, user_id }));
  if (!rows.length) return;
  const { error } = await supabase
    .from("chat_participants")
    .upsert(rows, { onConflict: "conversation_id,user_id", ignoreDuplicates: true });
  if (error) throw error;
}

/** #125: rimuove (espelle) un partecipante da un gruppo. */
export async function removeParticipant(convId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("chat_participants")
    .delete()
    .eq("conversation_id", convId)
    .eq("user_id", userId);
  if (error) throw error;
}

// Realtime: nuovi messaggi in UNA conversazione (per la finestra aperta).
export function subscribeMessages(convId: string, onInsert: (m: any) => void) {
  const channel = supabase
    .channel(`chat_msg_${convId}`)
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${convId}` },
      (payload) => onInsert(payload.new))
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

// Realtime: qualsiasi nuovo messaggio -> ricalcola l'inbox (badge non letti, ordinamento).
export function subscribeInbox(onChange: () => void) {
  const channel = supabase
    .channel("chat_inbox_watch")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, () => onChange())
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_participants" }, () => onChange())
    // UPDATE = qualcuno ha letto (last_read_at): serve per azzerare subito il badge,
    // altrimenti il contatore in sidebar resta fermo finche' non arriva un nuovo messaggio.
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_participants" }, () => onChange())
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
