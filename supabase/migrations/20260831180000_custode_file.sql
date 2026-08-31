-- IL CUSTODE DEI FILE — la parte che sta nel database (31/08).
--
-- Undici depositi su dodici erano PUBBLICI: 13 GB, e dentro ci sono 6.807
-- contratti di clienti e 8.703 allegati di posta. La rotta
-- `/storage/v1/object/public/…` Supabase la serve a chiunque conosca
-- l'indirizzo — senza login, senza chiave, da qualunque parte del mondo. E
-- gli indirizzi sono scritti in chiaro dentro `email_messages.attachments` e
-- `wa_messages.media_url`, cioè bastava una qualunque delle altre falle per
-- portarseli via tutti.
--
-- Da qui in avanti si passa da `/api/file/…`, che prima di consegnare chiede
-- chi sei. Questa funzione è il pezzo che risponde alla domanda difficile:
-- «questo file è suo?».
--
-- ⚠️ NON RISCRIVE LE REGOLE, LE RIUSA. `tf_mie_caselle()` e
-- `tf_wa_istanze()` sono le stesse funzioni da cui dipendono l'Inbox e la
-- chat — lucchetti compresi. Una seconda copia della regola, scritta qui,
-- fra sei mesi divergerebbe da quella vera: ed è esattamente così che si
-- riaprono i buchi che si credevano chiusi.

create or replace function public.tf_puo_vedere_file(
  p_utente uuid, p_deposito text, p_cartella text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare esito boolean;
begin
  if p_utente is null or coalesce(p_cartella, '') = '' then return false; end if;

  /* ⚠️ Il custode gira sul server con la chiave di servizio, che scavalca le
     regole delle tabelle: `tf_uid()` da lì è NULL e tf_mie_caselle()
     tornerebbe vuota. Qui si dichiara CHI sta chiedendo — l'id arriva dalla
     sessione firmata, non dal browser — e si fa girare la regola vera con la
     sua identità. È l'unico modo di riusare la regola invece di copiarla. */
  perform set_config('request.jwt.claims',
                     json_build_object('tf_uid', p_utente::text)::text, true);

  if p_deposito = 'email-attachments' then
    /* la cartella è l'id della CONVERSAZIONE: risalgo alla casella e chiedo
       se questa persona la vede */
    select exists (
      select 1 from email_conversations c
      where c.id = p_cartella::uuid
        and c.account_id in (select tf_mie_caselle())
    ) into esito;
  elsif p_deposito = 'whatsapp-media' then
    -- la cartella è l'id dell'ISTANZA (il numero)
    select exists (select 1 from (select tf_wa_istanze() i) t where t.i = p_cartella::uuid) into esito;
  else
    esito := false;   -- per gli altri depositi decide la rotta, non questa
  end if;

  return coalesce(esito, false);
exception when others then
  -- un id malformato non è un permesso: nel dubbio si nega
  return false;
end $$;

revoke all on function public.tf_puo_vedere_file(uuid, text, text) from public, anon, authenticated;
grant execute on function public.tf_puo_vedere_file(uuid, text, text) to service_role;

comment on function public.tf_puo_vedere_file(uuid, text, text) is
  'Il file di questo deposito, in questa cartella, lo può vedere questa persona? La chiama SOLO /api/file, col server. Riusa tf_mie_caselle() e tf_wa_istanze(): stesse regole delle schermate, lucchetti compresi.';
