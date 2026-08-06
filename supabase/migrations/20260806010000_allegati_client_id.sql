-- NUOVO DISEGNO ELIMINAZIONI (Luca 06/08): eliminare una vendita da Ricerca
-- Vendite cancella la riga contracts ma NON deve portarsi via anagrafica,
-- documento d'identità e contratto firmato: gli allegati restano ("se un
-- giorno succede qualcosa perlomeno ce li abbiamo") e devono restare
-- VISIBILI nella scheda cliente anche a contratto morto.
--
-- Due interventi, entrambi indispensabili:
-- 1) contract_attachments.client_id: aggancio DIRETTO al cliente, così la
--    scheda cliente ritrova i documenti anche senza più il contratto.
--    Backfill immediato dai contratti esistenti.
-- 2) la FK contract_id era ON DELETE CASCADE (019_contract_attachments.sql):
--    con la cascade il DELETE del contratto avrebbe continuato a mangiarsi
--    le righe allegato, vanificando tutto. Diventa ON DELETE SET NULL
--    (e contract_id perde il NOT NULL: un allegato orfano di contratto
--    è legittimo, resta figlio del cliente).

-- 1a) colonna client_id (text: clients.id è TEXT, come contracts.client_id)
alter table public.contract_attachments
  add column if not exists client_id text;

-- 1b) backfill dai contratti ancora vivi (idempotente: solo dove manca)
update public.contract_attachments a
   set client_id = c.client_id
  from public.contracts c
 where a.contract_id = c.id
   and a.client_id is null;

-- 1c) indice per la lettura dalla scheda cliente
create index if not exists idx_contract_attachments_client
  on public.contract_attachments(client_id);

-- 2a) contract_id può restare vuoto dopo l'eliminazione del contratto
alter table public.contract_attachments
  alter column contract_id drop not null;

-- 2b) FK: via la CASCADE, dentro la SET NULL (idempotente: droppa qualunque
--     FK verso contracts e la ricrea con il comportamento nuovo)
do $$
declare
  fk record;
begin
  for fk in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.contract_attachments'::regclass
       and con.contype = 'f'
       and con.confrelid = 'public.contracts'::regclass
  loop
    execute format('alter table public.contract_attachments drop constraint %I', fk.conname);
  end loop;
  alter table public.contract_attachments
    add constraint contract_attachments_contract_id_fkey
    foreign key (contract_id) references public.contracts(id) on delete set null;
end $$;

notify pgrst, 'reload schema';
