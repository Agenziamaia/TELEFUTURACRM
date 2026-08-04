-- CAL-01 (Luca 04/08/2026) — MODELLI WHATSAPP DEL CALLER.
-- Step intermedio a modelli tra la pratica e WhatsApp: il caller sceglie un
-- messaggio pronto (con VARIANTI anti-ban ruotate per numero) e lo invia dal
-- SUO numero collegato. Due tabelle:
--   wa_templates      = i modelli amministrabili (Amministrazione → Call Center).
--                       "gruppo" raggruppa le varianti dello stesso messaggio-tipo;
--                       "scenario" e' agganciato al COMPORTAMENTO dello stato
--                       (nr | richiamo | appuntamento | generico), NON al nome
--                       dello stato che e' rinominabile dal pannello.
--                       brand/obiettivo/provenienza/tipologia NULL = jolly.
--   wa_template_invii = log degli invii: rotazione anti-ban (mai la stessa
--                       variante due volte di fila allo stesso numero),
--                       statistiche per l'amministrazione e audit.
-- Nessun backfill: zero impatto sulle righe esistenti.

create table if not exists public.wa_templates (
  id          uuid primary key default gen_random_uuid(),
  gruppo      text not null,
  titolo      text,
  corpo       text not null,   -- placeholder: {nome} {cognome} {ragione_sociale}
                               -- {brand} {obiettivo} {negozio} {negozio_pertinenza}
                               -- {data_appuntamento} {ora_appuntamento} {fascia_appuntamento}
                               -- {data_richiamo} {fascia_richiamo} {caller}
  scenario    text not null,   -- nr | richiamo | appuntamento | generico
  brand       text,
  obiettivo   text,
  provenienza text,
  tipologia   text,
  attivo      boolean not null default true,
  ordine      integer not null default 100,
  created_at  timestamptz not null default now()
);

create table if not exists public.wa_template_invii (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid references public.wa_templates(id) on delete set null,
  call_id         text,
  conversation_id uuid references public.wa_conversations(id) on delete set null,
  wa_message_id   text,
  user_id         uuid references public.app_users(id) on delete set null,
  numero          text,        -- sole cifre del destinatario (chiave di rotazione)
  inviato_at      timestamptz not null default now()
);

create index if not exists wa_templates_scenario_idx     on public.wa_templates (scenario, attivo);
create index if not exists wa_template_invii_tpl_idx     on public.wa_template_invii (template_id, inviato_at desc);
create index if not exists wa_template_invii_numero_idx  on public.wa_template_invii (numero);

-- RLS con policy all/true, come le altre wa_* (091)
alter table public.wa_templates      enable row level security;
alter table public.wa_template_invii enable row level security;
drop policy if exists wa_templates_all      on public.wa_templates;
drop policy if exists wa_template_invii_all on public.wa_template_invii;
create policy wa_templates_all      on public.wa_templates      for all using (true) with check (true);
create policy wa_template_invii_all on public.wa_template_invii for all using (true) with check (true);

-- SEED (bozze, da rifinire dal pannello): 2-3 varianti per scenario, DIVERSE
-- davvero tra loro (anti-ban). Solo a tabella VUOTA: rilanciare la migrazione
-- non duplica ne' resuscita modelli eliminati a mano.
insert into public.wa_templates (gruppo, titolo, corpo, scenario, ordine)
select v.gruppo, v.titolo, v.corpo, v.scenario, v.ordine
from (values
  -- ── NON RISPOSTO ──────────────────────────────────────────────────────
  ('nr-primo-contatto', 'Non risposto — cordiale',
   'Ciao {nome}, sono {caller} del punto vendita {brand} di {negozio}. Ti ho appena cercato al telefono ma non ti ho trovato 😊 Niente di urgente: ho una proposta che potrebbe interessarti. Quando hai due minuti rispondimi pure qui, così ci mettiamo d''accordo.',
   'nr', 10),
  ('nr-primo-contatto', 'Non risposto — diretto',
   'Buongiorno {nome}! Sono {caller}, ti ho chiamato poco fa per una novità {brand} riservata ai clienti della zona di {negozio}. Se ti va di saperne di più scrivimi qui su WhatsApp, oppure dimmi tu a che ora preferisci essere richiamato.',
   'nr', 20),
  ('nr-primo-contatto', 'Non risposto — leggero',
   'Ciao {nome}! Ti ho cercato al telefono ma sarai impegnato, capita 🙂 Sono {caller} del negozio {brand} di {negozio}: appena riesci rispondimi qui, ho una cosa che secondo me ti conviene davvero.',
   'nr', 30),
  -- ── RICHIAMO ──────────────────────────────────────────────────────────
  ('richiamo-conferma', 'Richiamo — conferma',
   'Ciao {nome}, sono {caller} del punto vendita {brand} di {negozio}. Come d''accordo ti richiamo il {data_richiamo}. Se nel frattempo cambia qualcosa o preferisci un altro momento, scrivimi pure qui!',
   'richiamo', 10),
  ('richiamo-conferma', 'Richiamo — con invito',
   'Buongiorno {nome}! Ti confermo che ci sentiamo il {data_richiamo} come concordato al telefono. Intanto, se ti viene in mente qualche domanda, scrivimela qui così arrivo preparato 😉 A presto, {caller}',
   'richiamo', 20),
  ('richiamo-conferma', 'Richiamo — essenziale',
   'Ciao {nome}, qui {caller} ({brand} — {negozio}). Segnato in agenda: ti richiamo il {data_richiamo}. Per qualsiasi cosa prima di allora mi trovi su questo numero. Buona giornata!',
   'richiamo', 30),
  -- ── APPUNTAMENTO ──────────────────────────────────────────────────────
  ('appuntamento-conferma', 'Appuntamento — orario preciso',
   'Ciao {nome}, sono {caller}. Ti confermo l''appuntamento di {data_appuntamento} alle {ora_appuntamento} presso il nostro punto vendita {brand} di {negozio}. Se hai un imprevisto avvisami pure qui, altrimenti ti aspettiamo!',
   'appuntamento', 10),
  ('appuntamento-conferma', 'Appuntamento — con fascia',
   'Buongiorno {nome}! Appuntamento confermato per {data_appuntamento} ({fascia_appuntamento}) al negozio {brand} di {negozio}. Porta con te un documento e, se ce l''hai sottomano, un''ultima fattura: facciamo prima. A presto, {caller}',
   'appuntamento', 20),
  ('appuntamento-conferma', 'Appuntamento — breve',
   'Ciao {nome} 👋 perfetto per {data_appuntamento}: i colleghi del negozio di {negozio} ti aspettano. Io sono {caller}, per qualsiasi cosa prima dell''appuntamento scrivimi qui. Grazie e a presto!',
   'appuntamento', 30),
  -- ── GENERICO ──────────────────────────────────────────────────────────
  ('generico-contatto', 'Generico — presentazione',
   'Ciao {nome}, sono {caller} del punto vendita {brand} di {negozio}. Ti lascio il mio contatto qui su WhatsApp: per offerte, assistenza o anche solo un''informazione, scrivimi quando vuoi!',
   'generico', 10),
  ('generico-contatto', 'Generico — disponibilità',
   'Buongiorno {nome}! Sono {caller} ({brand} — {negozio}). Da oggi puoi raggiungermi direttamente qui su WhatsApp: se ti serve una mano con la tua linea o vuoi conoscere le promo del momento, sono a disposizione.',
   'generico', 20)
) as v(gruppo, titolo, corpo, scenario, ordine)
where not exists (select 1 from public.wa_templates);
