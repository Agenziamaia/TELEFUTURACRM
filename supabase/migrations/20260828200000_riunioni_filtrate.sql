-- LE RIUNIONI SONO DI CHI LE FA E DI CHI È INVITATO (28/08 sera).
--
-- Segnalazione arrivata da un controllo indipendente: la regola era «basta
-- essere loggati», quindi qualunque dipendente poteva LEGGERE le riunioni di
-- tutti (con luogo, link e note) e soprattutto CANCELLARLE. Il filtro che si
-- vedeva nell'interfaccia esisteva solo nel browser.
--
-- Da qui: si vede una riunione se l'hai creata tu, se sei tra gli invitati,
-- o se sei della direzione. Cancellarla può solo chi l'ha organizzata.
create or replace function tf_riunione_mia(p_created_by text, p_recipients jsonb, p_solo_organizzatore boolean default false)
returns boolean
language sql stable security definer set search_path = public as $$
  select case when tf_uid() is null then false else exists (
      -- l'ho creata io (created_by è il nome) oppure sono della direzione
      select 1 from app_users u
      where u.id = tf_uid()
        and (lower(trim(u.full_name)) = lower(trim(coalesce(p_created_by, '')))
             or u.role in ('admin', 'dev', 'direttore_generale'))
    ) or (
      -- sono tra gli invitati (solo per leggere e confermare, non per cancellare)
      not p_solo_organizzatore
      and exists (
        select 1 from jsonb_array_elements(coalesce(p_recipients, '[]'::jsonb)) e
        where (e ->> 'id') = tf_uid()::text)
    ) end
$$;
grant execute on function tf_riunione_mia(text, jsonb, boolean) to authenticated;

drop policy if exists tf_blindata on calendar_meetings;
create policy tf_meet_leggi on calendar_meetings for select
  using (tf_riunione_mia(created_by, recipients));
create policy tf_meet_crea on calendar_meetings for insert
  with check (tf_uid() is not null);
-- gli invitati aggiornano la propria conferma di presenza: l'update resta loro
create policy tf_meet_aggiorna on calendar_meetings for update
  using (tf_riunione_mia(created_by, recipients))
  with check (tf_riunione_mia(created_by, recipients));
-- ma cancellare la riunione può solo chi l'ha organizzata (o la direzione)
create policy tf_meet_cancella on calendar_meetings for delete
  using (tf_riunione_mia(created_by, recipients, true));
