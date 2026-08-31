-- LE SCHEDE RIPESCATE (Luca 31/08).
-- Quando una lista nuova ripesca un cliente che c'era già, il CRM NON crea una
-- scheda nuova: riapre quella. La scheda cambia lista_origine — è giusto, adesso
-- la sta lavorando quella lista — ma questo la esporrebbe a due cancellazioni
-- scritte quando le pratiche di una lista erano tutte NATE da quella lista:
--   • il rollback dell'import (delete where lista_origine = ...)
--   • il cestino della lista, che si porta via le pratiche importate
-- Cancellerebbero una scheda storica, con dentro anni di lavorazione. Queste due
-- colonne la marcano come «ripescata» e ricordano da dove veniva, così la si può
-- sempre riconoscere e rimettere al suo posto invece di distruggerla.
alter table public.calls
    add column if not exists ripescata_il timestamptz,
    add column if not exists lista_precedente text;

comment on column public.calls.ripescata_il is
    'Quando questa scheda è stata riaperta da una lista nuova invece di crearne una doppia. Se valorizzata, la scheda NON nasce dalla lista in lista_origine: le è stata affidata.';
comment on column public.calls.lista_precedente is
    'La lista che aveva questa scheda prima del ripescaggio: serve a rimetterla a posto se la lista nuova viene cancellata.';

create index if not exists calls_ripescate_idx on public.calls (lista_origine) where ripescata_il is not null;
