-- MITTENTI BLOCCATI (Luca 26/08: «le email da parte di Verisure le puoi
-- sempre cancellare») — primo pezzo della fase 3 del progetto Email.
-- Un pattern (sottostringa case-insensitive dell'indirizzo mittente) =
-- cestino AUTOMATICO senza nemmeno interpellare l'AI, con le stesse guardie
-- dure del triage (mai su conversazioni con nostre risposte, cliente censito,
-- stella o ripristinate dall'admin). Governabile dal Pannello Email; le
-- azioni restano nel registro Attività AI col motivo «mittente bloccato».
-- Il caso Verisure: ~109 conversazioni/35gg di avvisi automatici dell'allarme
-- dei negozi (Disconnection/Connection) che il modello avrebbe tenuto come
-- «avvisi di sistema» — serve la volontà esplicita.
create table if not exists email_mittenti_bloccati (
  id uuid primary key default gen_random_uuid(),
  pattern text not null unique,
  note text,
  creato_da text,
  creato_il timestamptz not null default now()
);
alter table email_mittenti_bloccati disable row level security;

insert into email_mittenti_bloccati (pattern, note, creato_da)
values
  ('verisure', 'Avvisi automatici allarme (Connection/Disconnection) e marketing — cancellare sempre, direttiva Luca 26/08', 'Luca (direttiva a terminal)'),
  ('allarmi.payprint', 'Avvisi automatici del sistema di allarme PayPrint — cancellare sempre, direttiva Luca 26/08', 'Luca (direttiva a terminal)')
on conflict (pattern) do nothing;
