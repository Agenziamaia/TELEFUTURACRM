-- Fix: wa_messages.wa_message_id doveva essere UNIQUE (la 091 non l'ha applicato).
-- Senza questo vincolo tutti gli upsert onConflict=wa_message_id fallivano in
-- silenzio, e nessun messaggio veniva mai salvato. I NULL restano ammessi e
-- distinti (invii falliti senza id), quindi non collidono tra loro.

alter table wa_messages
    add constraint wa_messages_wa_message_id_key unique (wa_message_id);
