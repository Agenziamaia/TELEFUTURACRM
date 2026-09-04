-- Chi non è più nominato da nessun messaggio, e ha smesso di essere recente.
-- Sta nel database e non nel codice perché è un confronto fra ottomila oggetti
-- e ottomila righe: farlo di là vorrebbe dire portarseli tutti in memoria.
create or replace function public.tf_allegati_orfani(p_giorni integer default 3)
returns table (nome text, peso bigint)
language sql stable security definer set search_path to 'public', 'storage'
as $$
  with citati as (
    select replace(x->>'url', '/api/file/email-attachments/', '') n
      from email_messages m, lateral jsonb_array_elements(coalesce(m.attachments, '[]'::jsonb)) x
     where x->>'url' like '/api/file/email-attachments/%')
  select o.name, coalesce((o.metadata->>'size')::bigint, 0)
    from storage.objects o
   where o.bucket_id = 'email-attachments'
     and o.created_at < now() - make_interval(days => greatest(p_giorni, 1))
     and o.name not in (select n from citati)
$$;
