-- POS / scontrino fiscale (progetto Registra Vendita → RT Epson + cassa pagAmico).
-- Due campi per voce del catalogo Marginalità (dove già vivono prezzo e IVA):
--   va_in_scontrino : la voce va stampata sullo scontrino fiscale (RT).
--   reparto         : indice REPARTO (1-40) del registratore telematico → DECIDE
--                     l'IVA/natura sul documento fiscale. Lo imposta la direzione
--                     per voce e DEVE corrispondere a Programmazione→Reparti del RT
--                     del negozio (verificare per printer: la mappa .50 e .219 può
--                     differire). NULL = non assegnato ⇒ la voce non è stampabile.

alter table public.marg_items
  add column if not exists va_in_scontrino boolean not null default true,
  add column if not exists reparto smallint;

-- reparto valido 1..40 (o NULL = non ancora assegnato)
alter table public.marg_items
  drop constraint if exists marg_items_reparto_range;
alter table public.marg_items
  add constraint marg_items_reparto_range
  check (reparto is null or (reparto between 1 and 40));

comment on column public.marg_items.va_in_scontrino is
  'La voce va stampata sullo scontrino fiscale RT (POS Registra Vendita).';
comment on column public.marg_items.reparto is
  'Indice REPARTO (1-40) del RT: decide IVA/natura sul documento fiscale. NULL = non assegnato (non stampabile).';
