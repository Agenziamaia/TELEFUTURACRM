-- IL CUSTODE NEGAVA TUTTI I MEDIA DI WHATSAPP (31/08).
--
-- Francesco: «ancora non vediamo le immagini che riceviamo». Il salvataggio
-- era riparato — i file c'erano — ma non uscivano dalla porta.
--
-- L'errore è mio ed è di una riga: per i media di WhatsApp confrontavo la
-- cartella dell'indirizzo con l'elenco delle ISTANZE, cioè dei numeri. Ma
-- quella cartella è l'id della CONVERSAZIONE:
--
--   /api/file/whatsapp-media/<conversazione>/<messaggio>.jpg
--
-- Un id di conversazione non sarà mai un id di istanza, quindi la risposta era
-- «no» sempre — anche per l'admin, anche per il titolare del numero. Provato:
-- `tf_puo_vedere_file(Luca, 'whatsapp-media', <conv>)` → false.
--
-- Gli allegati della posta funzionavano perché lì il legame l'avevo scritto
-- giusto: dalla conversazione risalivo alla casella. Qui saltavo un passaggio.

create or replace function public.tf_puo_vedere_file(
  p_utente uuid, p_deposito text, p_cartella text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare esito boolean;
begin
  if p_utente is null or coalesce(p_cartella, '') = '' then return false; end if;

  perform set_config('request.jwt.claims',
                     json_build_object('tf_uid', p_utente::text)::text, true);

  if p_deposito = 'email-attachments' then
    select exists (
      select 1 from email_conversations c
      where c.id = p_cartella::uuid
        and c.account_id in (select tf_mie_caselle())
    ) into esito;
  elsif p_deposito = 'whatsapp-media' then
    /* ⚠️ DALLA CONVERSAZIONE AL NUMERO, che è il passaggio che mancava. La
       cartella è una conversazione; il permesso sta sul numero da cui quella
       conversazione dipende. */
    select exists (
      select 1 from wa_conversations c
      where c.id = p_cartella::uuid
        and c.instance_id in (select tf_wa_istanze())
    ) into esito;
  else
    esito := false;
  end if;

  return coalesce(esito, false);
exception when others then
  return false;
end $$;

comment on function public.tf_puo_vedere_file(uuid, text, text) is
  'Il file di questo deposito, in questa cartella, lo può vedere questa persona? La chiama SOLO /api/file, col server. La cartella è sempre una CONVERSAZIONE (posta o WhatsApp): da lì si risale alla casella o al numero, e si chiede a tf_mie_caselle()/tf_wa_istanze() — stesse regole delle schermate, lucchetti compresi.';
