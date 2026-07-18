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
export interface ChatMessage {
  id: string; sender_id: string | null; body: string | null; created_at: string;
  edited_at: string | null; attachments: ChatAttachment[];
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
    .select("id, sender_id, body, created_at, edited_at, chat_attachments(id, url, name, mime, size_bytes)")
    .eq("conversation_id", convId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((m: any) => ({
    id: m.id, sender_id: m.sender_id, body: m.body, created_at: m.created_at,
    edited_at: m.edited_at, attachments: m.chat_attachments || [],
  }));
}

const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);

// Invia un messaggio: carica gli allegati sul bucket, inserisce il messaggio e gli allegati.
export async function sendMessage(
  convId: string, meId: string, body: string, files: File[] = []
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
    .insert({ conversation_id: convId, sender_id: meId, body: body || null })
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

export async function markRead(convId: string, meId: string): Promise<void> {
  await supabase
    .from("chat_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", convId)
    .eq("user_id", meId);
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
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
