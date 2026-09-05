-- ═══ ANCHE «D'agostino» VA SISTEMATO ═════════════════════════════════════
-- La regola dice: non toccare ciò che è scritto in modo misto, perché
-- l'ha scritto una persona e magari è giusto così. Vale quasi sempre, ma non
-- per la lettera minuscola SUBITO DOPO UN APOSTROFO: in italiano non esiste
-- un cognome che si scriva «D'agostino» o «Dell'olio». Quello non è uno
-- stile, è la mano che scappa — o un vecchio `initcap` passato di lì.
-- Sono quattro righe oggi, ma la corsa notturna non le avrebbe mai prese.
create or replace function public.tf_nomi_in_ordine(p_prova boolean default false)
returns table (tabella text, campo text, sistemati integer)
language plpgsql security definer set search_path to 'public'
as $$
declare n integer;
begin
    if p_prova then
        select count(*) into n from clients
         where nome is not null and btrim(nome) <> ''
           and (nome = upper(nome) or nome = lower(nome) or nome ~ '''[[:lower:]]')
           and nome <> tf_nome_bello(nome);
    else
        with agg as (update clients set nome = tf_nome_bello(nome)
             where nome is not null and btrim(nome) <> ''
               and (nome = upper(nome) or nome = lower(nome) or nome ~ '''[[:lower:]]')
               and nome <> tf_nome_bello(nome)
             returning 1) select count(*) into n from agg;
    end if;
    tabella := 'clients'; campo := 'nome'; sistemati := n; return next;

    if p_prova then
        select count(*) into n from clients
         where cognome is not null and btrim(cognome) <> ''
           and (cognome = upper(cognome) or cognome = lower(cognome) or cognome ~ '''[[:lower:]]')
           and cognome <> tf_nome_bello(cognome);
    else
        with agg as (update clients set cognome = tf_nome_bello(cognome)
             where cognome is not null and btrim(cognome) <> ''
               and (cognome = upper(cognome) or cognome = lower(cognome) or cognome ~ '''[[:lower:]]')
               and cognome <> tf_nome_bello(cognome)
             returning 1) select count(*) into n from agg;
    end if;
    tabella := 'clients'; campo := 'cognome'; sistemati := n; return next;

    if p_prova then
        select count(*) into n from app_users
         where full_name is not null and btrim(full_name) <> ''
           and (full_name = upper(full_name) or full_name = lower(full_name) or full_name ~ '''[[:lower:]]')
           and full_name <> tf_nome_bello(full_name);
    else
        with agg as (update app_users set full_name = tf_nome_bello(full_name)
             where full_name is not null and btrim(full_name) <> ''
               and (full_name = upper(full_name) or full_name = lower(full_name) or full_name ~ '''[[:lower:]]')
               and full_name <> tf_nome_bello(full_name)
             returning 1) select count(*) into n from agg;
    end if;
    tabella := 'app_users'; campo := 'full_name'; sistemati := n; return next;
end $$;

revoke execute on function public.tf_nomi_in_ordine(boolean) from public;
grant execute on function public.tf_nomi_in_ordine(boolean) to service_role;
