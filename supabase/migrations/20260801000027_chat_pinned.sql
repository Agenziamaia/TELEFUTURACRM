-- 132: CHAT — conversazioni FISSATE stile Telegram, max 5 (Luca 02/08)
-- La spunta vive in chat_participants (riga per utente+conversazione, gia'
-- usata per letture e ricevute): additiva, nessun impatto su markRead/inbox.
alter table public.chat_participants add column if not exists pinned_at timestamptz;
notify pgrst, 'reload schema';
