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
}
export interface ChatAttachment {
  id: string; url: string; name: string | null; mime: string | null; size_bytes: number | null;
}
/** Riferimento a un record del CRM allegato a un messaggio (tag cliccabile). */
export type RefKind = "cliente" | "contratto" | "appuntamento";
export interface ChatRef { type: RefKind; id: string; label: string }

/** Dove porta il tag quando ci clicchi. */
export function refHref(r: ChatRef): string {
  if (r.type === "cliente") return `/clienti?id=${encodeURIComponent(r.id)}`;
  if (r.type === "contratto") return `/ricerca-contratto?id=${encodeURIComponent(r.id)}`;
  return `/calendario?appuntamento=${encodeURIComponent(r.id)}`;
}

export interface ChatMessage {
  id: string; sender_id: string | null; body: string | null; created_at: string;
  edited_at: string | null; attachments: ChatAttachment[]; refs: ChatRef[];
  // Segnalazione 74: id del messaggio a cui questo risponde (stile WhatsApp).
  reply_to: string | null;
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
  return (data || []) as InboxItem[];
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
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, sender_id, body, created_at, edited_at, refs, reply_to, chat_attachments(id, url, name, mime, size_bytes)")
    .eq("conversation_id", convId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((m: any) => ({
    id: m.id, sender_id: m.sender_id, body: m.body, created_at: m.created_at,
    edited_at: m.edited_at, attachments: m.chat_attachments || [],
    refs: Array.isArray(m.refs) ? m.refs : [],
    reply_to: m.reply_to ?? null,
  }));
}

/**
 * Token inline di un tag dentro il testo del messaggio: `@[tipo:id|etichetta]`.
 * Permette di scrivere "ho sentito @Mario Rossi per @CTR_0001" con il tag nel punto giusto.
 */
export const REF_TOKEN_RE = /@\[(cliente|contratto|appuntamento):([^\]|]+)\|([^\]]+)\]/g;
export const refToken = (r: ChatRef) => `@[${r.type}:${r.id}|${r.label}]`;

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
export async function recentEntities(): Promise<ChatRef[]> {
  const [cl, ct, ap] = await Promise.all([
    supabase.from("clients").select("id, nome, cognome, ragione_sociale, cf_piva")
      .order("created_at", { ascending: false }).limit(5).then((r) => r.data || [], () => []),
    supabase.from("contracts").select("id, brand, prodotto, categoria, stato, negozio")
      .order("data_registrazione", { ascending: false }).limit(5).then((r) => r.data || [], () => []),
    supabase.from("appointments").select("id, date, time, customer_name, store")
      .order("date", { ascending: false }).limit(4).then((r) => r.data || [], () => []),
  ]);
  return [
    ...cl.map((c: any) => ({ type: "cliente" as const, id: c.id, label: clientLabel(c) })),
    ...ct.map((c: any) => ({ type: "contratto" as const, id: String(c.id), label: contractLabel(c) })),
    ...ap.map((a: any) => ({ type: "appuntamento" as const, id: String(a.id), label: apptLabel(a) })),
  ];
}

/** Ricerca su tutti e tre i tipi insieme (usata dall'autocomplete con "@"). */
export async function searchAllEntities(q: string): Promise<ChatRef[]> {
  const [a, b, c] = await Promise.all([
    searchEntities("cliente", q).catch(() => []),
    searchEntities("contratto", q).catch(() => []),
    searchEntities("appuntamento", q).catch(() => []),
  ]);
  return [...a.slice(0, 6), ...b.slice(0, 6), ...c.slice(0, 4)];
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
    .or(`customer_name.ilike.${like},agente.ilike.${like},store.ilike.${like},notes.ilike.${like}`)
    .order("date", { ascending: false })
    .limit(15);
  return (data || []).map((a: any) => ({
    type: "appuntamento" as const,
    id: String(a.id),
    label: [a.date, a.time, a.customer_name, a.store].filter(Boolean).join(" · "),
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
