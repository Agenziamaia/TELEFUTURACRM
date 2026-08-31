-- IL PERIMETRO DI WHATSAPP PER IL SERVER (31/08).
--
-- Il gemello di `tf_caselle_di`. La posta è stata chiusa stamattina; le rotte
-- WhatsApp non hanno mai avuto un perimetro — il commento di `send` lo
-- ammetteva: «il gating per ruolo/proprietà è lato client», cioè nessuno,
-- perché il client lo si aggira aprendo la console.
--
-- Con la chiave di servizio si mandava un messaggio al cliente di un altro
-- negozio USCENDO DAL SUO NUMERO, e si scaricavano 50 messaggi di una
-- conversazione altrui passando il suo id.

create or replace function public.tf_numeri_di(p_utente uuid)
returns setof uuid
language plpgsql stable security definer set search_path = public
as $$
begin
  if p_utente is null then return; end if;
  perform set_config('request.jwt.claims',
                     json_build_object('tf_uid', p_utente::text)::text, true);
  return query select tf_wa_istanze();
end $$;

create or replace function public.tf_numero_e_suo(p_utente uuid, p_istanza uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select p_istanza is not null and p_istanza in (select tf_numeri_di(p_utente)) $$;

create or replace function public.tf_chat_e_sua(p_utente uuid, p_conv uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from wa_conversations c
    where c.id = p_conv and c.instance_id in (select tf_numeri_di(p_utente)))
$$;

revoke all on function public.tf_numeri_di(uuid)            from public, anon, authenticated;
revoke all on function public.tf_numero_e_suo(uuid, uuid)   from public, anon, authenticated;
revoke all on function public.tf_chat_e_sua(uuid, uuid)     from public, anon, authenticated;
grant execute on function public.tf_numeri_di(uuid)          to service_role;
grant execute on function public.tf_numero_e_suo(uuid, uuid) to service_role;
grant execute on function public.tf_chat_e_sua(uuid, uuid)   to service_role;
