-- ═══ «D'AMICO» NON DIVENTA «D'amico» ═════════════════════════════════════
-- La revisione ostile ha misurato quello che il commento della migrazione di
-- ieri dava per buono: `initcap` NON tratta l'apostrofo come separatore.
--     initcap('D''AMICO')    → D'amico     ❌
--     initcap('DELL''ORTO')  → Dell'orto   ❌
--     initcap('DE ANGELIS')  → De Angelis  ✅
-- Sono 61 cognomi che sarebbero stati riscritti male, e l'originale non si
-- recupera più dopo la prima corsa. «D'AMICO» almeno si legge; «D'amico»
-- sembra un refuso.
--
-- La cura: si spezza sull'apostrofo, si mette a posto ogni pezzo, si ricuce.
-- E si tolgono gli spazi ai bordi — 1.662 nomi e 264 cognomi ce li hanno, e
-- un lavoro che si chiama «i nomi in ordine» e lascia lo spazio finale ha
-- fatto metà mestiere (per giunta nascondendolo, perché dopo la corsa quei
-- nomi non risultano più da sistemare).
create or replace function public.tf_nome_bello(t text)
returns text language sql immutable set search_path to 'public'
as $$
  select case
    when t is null or btrim(t) = '' then t
    else (select string_agg(initcap(p), '''' order by i)
            from unnest(string_to_array(lower(btrim(t)), '''')) with ordinality as u(p, i))
  end
$$;

create or replace function public.tf_nomi_in_ordine(p_prova boolean default false)
returns table (tabella text, campo text, sistemati integer)
language plpgsql security definer set search_path to 'public'
as $$
declare n integer;
begin
    if p_prova then
        select count(*) into n from clients
         where nome is not null and btrim(nome) <> '' and (nome = upper(nome) or nome = lower(nome)) and nome <> tf_nome_bello(nome);
    else
        with agg as (update clients set nome = tf_nome_bello(nome)
             where nome is not null and btrim(nome) <> '' and (nome = upper(nome) or nome = lower(nome)) and nome <> tf_nome_bello(nome)
             returning 1) select count(*) into n from agg;
    end if;
    tabella := 'clients'; campo := 'nome'; sistemati := n; return next;

    if p_prova then
        select count(*) into n from clients
         where cognome is not null and btrim(cognome) <> '' and (cognome = upper(cognome) or cognome = lower(cognome)) and cognome <> tf_nome_bello(cognome);
    else
        with agg as (update clients set cognome = tf_nome_bello(cognome)
             where cognome is not null and btrim(cognome) <> '' and (cognome = upper(cognome) or cognome = lower(cognome)) and cognome <> tf_nome_bello(cognome)
             returning 1) select count(*) into n from agg;
    end if;
    tabella := 'clients'; campo := 'cognome'; sistemati := n; return next;

    if p_prova then
        select count(*) into n from app_users
         where full_name is not null and btrim(full_name) <> ''
           and (full_name = upper(full_name) or full_name = lower(full_name)) and full_name <> tf_nome_bello(full_name);
    else
        with agg as (update app_users set full_name = tf_nome_bello(full_name)
             where full_name is not null and btrim(full_name) <> ''
               and (full_name = upper(full_name) or full_name = lower(full_name)) and full_name <> tf_nome_bello(full_name)
             returning 1) select count(*) into n from agg;
    end if;
    tabella := 'app_users'; campo := 'full_name'; sistemati := n; return next;
end $$;

-- ⚠️ E LE DUE FUNZIONI NON SI CHIAMANO DA INTERNET. Sono `security definer`,
-- cioè girano come `postgres` e scavalcano ogni permesso: lasciarle
-- eseguibili ad `anon` vuol dire che chiunque, con la chiave pubblica che sta
-- dentro la pagina di login, riscrive l'anagrafica di cinquemila clienti o si
-- fa dare l'elenco di novemila allegati. Il revisore l'ha PROVATO davvero.
revoke execute on function public.tf_nomi_in_ordine(boolean) from anon, authenticated;
revoke execute on function public.tf_allegati_orfani(integer) from anon, authenticated;
revoke execute on function public.tf_nome_bello(text) from anon;

-- ⚠️ E NON BASTA TOGLIERLO AD `anon`. Postgres concede l'esecuzione di una
-- funzione a PUBLIC per definizione: finché quella resta, ogni ruolo la
-- eredita e la revoca mirata non serve a niente. Provato: dopo il `revoke …
-- from anon` la funzione era ancora chiamabile con la chiave pubblica.
revoke execute on function public.tf_nomi_in_ordine(boolean) from public;
revoke execute on function public.tf_allegati_orfani(integer) from public;
revoke execute on function public.tf_nome_bello(text) from public;
grant execute on function public.tf_nomi_in_ordine(boolean) to service_role;
grant execute on function public.tf_allegati_orfani(integer) to service_role;
grant execute on function public.tf_nome_bello(text) to service_role;
