-- ═══ IL BRAND SCRITTO DUE VOLTE NEL NOME DEL TELEFONO ══════════════════════
-- Luca, 02/09, con la fotografia di «ZTE ZTE Blade A34»: «i ragazzi stanno
-- ingressando degli usati nel modo sbagliato, nel modello vanno a scrivere il
-- nome del prodotto ripetendo il brand».
--
-- MISURATO PRIMA DI TOCCARE: non lo scrivono affatto. Il modello si sceglie da
-- una tendina alimentata da `dispositivi_catalogo`, e sono le voci del
-- CATALOGO a contenere già la marca — 4.335 su 40.133. Il nome finale si
-- componeva come «brand + modello» senza guardare se la marca ci fosse già.
--
-- La composizione ora la fa `nomeDispositivo()` e non ripete più. Qui si
-- sistemano le righe già inserite: sono DODICI, e il campo è descrittivo
-- (serve a leggere e a cercare), non regge nessun calcolo.
--
-- ⚠️ SI TAGLIA SOLO UNA PAROLA INTERA RIPETUTA, e solo se le due prime parole
-- sono identiche: «Apple Watch (38mm)» non si tocca — lì «Apple» fa parte del
-- nome del prodotto, non è una ripetizione.

do $$
declare r record; n int := 0;
begin
    for r in
        select id, model from public.usati
         where split_part(model, ' ', 2) <> ''
           and lower(split_part(model, ' ', 1)) = lower(split_part(model, ' ', 2))
    loop
        update public.usati
           set model = substring(r.model from position(' ' in r.model) + 1)
         where id = r.id;
        raise notice '  % → %', r.model, substring(r.model from position(' ' in r.model) + 1);
        n := n + 1;
    end loop;
    raise notice 'nomi sistemati: %', n;
end $$;

-- prova: non ne restano
do $$
declare n int;
begin
    select count(*) into n from public.usati
     where split_part(model, ' ', 2) <> ''
       and lower(split_part(model, ' ', 1)) = lower(split_part(model, ' ', 2));
    raise notice 'ripetizioni rimaste: % (devono essere 0)', n;
    if n > 0 then raise exception 'ci sono ancora % nomi col brand ripetuto', n; end if;
end $$;
