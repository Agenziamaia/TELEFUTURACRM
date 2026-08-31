-- LE CASELLE DI UNA PERSONA, CHIESTE DAL SERVER (31/08).
--
-- Sette rotte `/api/email/*` girano con la chiave di servizio — che scavalca
-- ogni regola — e prendono dal browser l'id della casella o della
-- conversazione su cui operare, senza mai chiedersi se sia di chi sta
-- scrivendo. Il revisore l'ha provato: si legge il contatore di una casella
-- altrui, si segnano lette le conversazioni di un collega, si SPEDISCE dalla
-- casella protetta e si risponde dentro un thread che non si dovrebbe vedere.
--
-- Ogni rotta ha bisogno della stessa risposta: «questa casella è sua?». La
-- domanda è già risolta in `tf_mie_caselle()`, ma quella funzione parla della
-- persona nel LASCIAPASSARE — e dal server il lasciapassare non c'è, perché
-- lì si usa la chiave di servizio. Questa la interroga per conto di qualcuno,
-- dichiarando chi.
--
-- ⚠️ NON RISCRIVE LA REGOLA. Fa esattamente quello che fa il custode dei
-- file: dichiara l'identità e lascia rispondere la funzione vera, lucchetti
-- compresi. Una seconda copia della regola, scritta qui, fra sei mesi
-- direbbe una cosa diversa dall'Inbox — ed è così che si riaprono i buchi.

create or replace function public.tf_caselle_di(p_utente uuid)
returns setof uuid
language plpgsql stable security definer set search_path = public
as $$
begin
  if p_utente is null then return; end if;
  perform set_config('request.jwt.claims',
                     json_build_object('tf_uid', p_utente::text)::text, true);
  return query select tf_mie_caselle();
end $$;

/** Scorciatoia per la domanda che fanno tutte le rotte. */
create or replace function public.tf_casella_e_sua(p_utente uuid, p_casella uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select p_casella is not null and p_casella in (select tf_caselle_di(p_utente)) $$;

/** E la stessa, partendo dalla conversazione. */
create or replace function public.tf_conversazione_e_sua(p_utente uuid, p_conv uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from email_conversations c
    where c.id = p_conv and c.account_id in (select tf_caselle_di(p_utente)))
$$;

revoke all on function public.tf_caselle_di(uuid)              from public, anon, authenticated;
revoke all on function public.tf_casella_e_sua(uuid, uuid)     from public, anon, authenticated;
revoke all on function public.tf_conversazione_e_sua(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tf_caselle_di(uuid)              to service_role;
grant execute on function public.tf_casella_e_sua(uuid, uuid)     to service_role;
grant execute on function public.tf_conversazione_e_sua(uuid, uuid) to service_role;

comment on function public.tf_caselle_di(uuid) is
  'Le caselle che vede una persona, chiesto dal server (che con la chiave di servizio non ha un lasciapassare). Riusa tf_mie_caselle(): stessa regola dell''Inbox, lucchetti compresi.';
