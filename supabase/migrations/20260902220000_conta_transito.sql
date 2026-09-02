-- ═══ QUANTI FILE DI TRANSITO SONO RIMASTI INDIETRO ════════════════════════
-- Il riquadro in Monitor Negozi deve dire un numero, e per dirlo leggeva il
-- deposito a pagine: cinquecento cartelle, cento per volta, una richiesta
-- ognuna. Lento al punto da non rispondere — e il riquadro, non avendo dati,
-- spariva del tutto: Luca l'ha cercato e non l'ha trovato.
--
-- Il conto vero sta in una riga di SQL. `storage.objects` non si legge dal
-- browser (ed è giusto così: è il registro di tutti i file dell'azienda), ma
-- una funzione `security definer` può contare senza aprire niente.

create or replace function public.tf_transito_da_pulire()
returns table (tutti bigint, da_togliere bigint, byte bigint, sessioni_vive bigint)
language sql
stable
security definer
set search_path = public
as $$
    select
        count(*)::bigint,
        count(*) filter (where q.token is null)::bigint,
        coalesce(sum((o.metadata->>'size')::bigint) filter (where q.token is null), 0)::bigint,
        (select count(*) from public.qr_uploads)::bigint
    from storage.objects o
    /* ⚠️ LA SESSIONE VIVA NON SI TOCCA: la cartella del file è il token della
       sessione, e se quella sessione esiste ancora vuol dire che qualcuno sta
       caricando proprio adesso. */
    left join public.qr_uploads q on q.token = split_part(o.name, '/', 1)
    where o.bucket_id = 'qr-uploads';
$$;

comment on function public.tf_transito_da_pulire is
  'Quanti file di passaggio dei documenti fotografati col QR sono rimasti nel deposito, e quanti se ne possono togliere (quelli la cui sessione è già chiusa).';

revoke all on function public.tf_transito_da_pulire() from public, anon;
grant execute on function public.tf_transito_da_pulire() to authenticated, service_role;

do $$
declare r record;
begin
    select * into r from public.tf_transito_da_pulire();
    raise notice 'file di transito: % · da togliere: % · MB: % · sessioni vive: %',
        r.tutti, r.da_togliere, round(r.byte / 1048576.0, 1), r.sessioni_vive;
end $$;
