-- Chi non è più nominato da nessun messaggio, e ha smesso di essere recente.
-- Sta nel database e non nel codice perché è un confronto fra ottomila oggetti
-- e ottomila righe: farlo di là vorrebbe dire portarseli tutti in memoria.
create or replace function public.tf_allegati_orfani(p_giorni integer default 3)
returns table (nome text, peso bigint)
language sql stable security definer set search_path to 'public', 'storage'
as $$
  /* ⚠️ IN CASO DI DUBBIO SI TIENE, NON SI BUTTA. Prima si riconosceva UNA
     sola forma di indirizzo e tutto il resto contava come «non citato», cioè
     da cancellare. In `fileUrl.ts` è scritto che dentro questa colonna sono
     esistite quattro forme diverse: oggi non ce ne sono più (misurato: 8.334
     su 8.334 nella forma nuova), ma il giorno che ne ricompare una il default
     sbagliato distrugge i file invece di lasciarli stare. Adesso si prende
     tutto quello che nomina il deposito, in qualunque forma, e si decodifica. */
  with citati as (
    select regexp_replace(
             coalesce(nullif(split_part(x->>'url', 'email-attachments/', 2), ''), x->>'url'),
             '\?.*$', '') n
      from email_messages m, lateral jsonb_array_elements(coalesce(m.attachments, '[]'::jsonb)) x
     where coalesce(x->>'url', '') <> '')
  select o.name, coalesce((o.metadata->>'size')::bigint, 0)
    from storage.objects o
   where o.bucket_id = 'email-attachments'
     and o.created_at < now() - make_interval(days => greatest(p_giorni, 1))
     and o.name not in (select n from citati)
     and o.name not in (select replace(n, '%20', ' ') from citati)
$$;
