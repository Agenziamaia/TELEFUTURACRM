-- ═══ I NOMI SI SCRIVONO IN UN MODO SOLO ══════════════════════════════════
-- Luca, dal 31/08 e ancora il 04/09: «avrei voluto standardizzare la modalità
-- con la quale vengono scritti i nomi e i cognomi, sia dei clienti che degli
-- utenti: solo la prima lettera maiuscola e il resto minuscolo». Oggi 4.163
-- clienti su 5.485 sono TUTTI MAIUSCOLI, più tre utenti.
--
-- ⚠️ SI TOCCA SOLO CIÒ CHE È TUTTO MAIUSCOLO O TUTTO MINUSCOLO. Un nome
-- scritto in maiuscolo non l'ha voluto nessuno: è come esce da un'importazione
-- o da una tastiera col blocco acceso. Un nome scritto in modo MISTO invece
-- è stato scritto da una persona, e magari è giusto proprio così — «McDonald»,
-- «de Sanctis», un secondo nome puntato. Quelli non si toccano: correggere
-- ciò che qualcuno ha scritto apposta è peggio del disordine.
--
-- `initcap` fa il resto: rispetta l'apostrofo e lo spazio, quindi «D'AMICO»
-- diventa «D'Amico» e «DE ANGELIS» diventa «De Angelis».
create or replace function public.tf_nomi_in_ordine(p_prova boolean default false)
returns table (tabella text, campo text, sistemati integer)
language plpgsql security definer set search_path to 'public'
as $$
declare n integer;
begin
    -- ── clienti: nome, cognome, ragione sociale
    if p_prova then
        select count(*) into n from clients
         where nome is not null and btrim(nome) <> '' and (nome = upper(nome) or nome = lower(nome)) and nome <> initcap(nome);
    else
        with agg as (
            update clients set nome = initcap(nome)
             where nome is not null and btrim(nome) <> '' and (nome = upper(nome) or nome = lower(nome)) and nome <> initcap(nome)
             returning 1)
        select count(*) into n from agg;
    end if;
    tabella := 'clients'; campo := 'nome'; sistemati := n; return next;

    if p_prova then
        select count(*) into n from clients
         where cognome is not null and btrim(cognome) <> '' and (cognome = upper(cognome) or cognome = lower(cognome)) and cognome <> initcap(cognome);
    else
        with agg as (
            update clients set cognome = initcap(cognome)
             where cognome is not null and btrim(cognome) <> '' and (cognome = upper(cognome) or cognome = lower(cognome)) and cognome <> initcap(cognome)
             returning 1)
        select count(*) into n from agg;
    end if;
    tabella := 'clients'; campo := 'cognome'; sistemati := n; return next;

    /* ⚠️ LA RAGIONE SOCIALE NO. «SRL», «SPA», «SNC» sono sigle: initcap le
       trasformerebbe in «Srl», e una ragione sociale è un dato legale, non un
       nome di persona. Si lascia com'è scritta. */

    -- ── utenti
    if p_prova then
        select count(*) into n from app_users
         where full_name is not null and btrim(full_name) <> ''
           and (full_name = upper(full_name) or full_name = lower(full_name)) and full_name <> initcap(full_name);
    else
        with agg as (
            update app_users set full_name = initcap(full_name)
             where full_name is not null and btrim(full_name) <> ''
               and (full_name = upper(full_name) or full_name = lower(full_name)) and full_name <> initcap(full_name)
             returning 1)
        select count(*) into n from agg;
    end if;
    tabella := 'app_users'; campo := 'full_name'; sistemati := n; return next;
end $$;

comment on function public.tf_nomi_in_ordine is
  'Mette i nomi in forma «Prima lettera maiuscola». Tocca solo ciò che è tutto maiuscolo o tutto minuscolo. Con p_prova=true conta e basta.';
