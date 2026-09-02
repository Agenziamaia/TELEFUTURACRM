-- ═══ PERCHÉ QUESTA LAVORAZIONE VALE ZERO ══════════════════════════════════
-- Da ieri si può aprire un'assistenza a zero (Luca: «magari è un prodotto in
-- garanzia, o facciamo una cortesia a un cliente»). La revisione ostile ha
-- trovato che lo zero passa ma non finisce da nessuna parte: chi riapre la
-- pratica domani legge «Valore 0,00 €» e non ha modo di distinguere «gratis
-- per garanzia» da «prezzo sbagliato». È la stessa confusione fra vuoto e
-- zero che volevamo chiudere, ricomparsa una schermata dopo.
--
-- ⚠️ E C'È UN SECONDO CASO, PIÙ SCOMODO: su tre tipologie su quattro quel
-- campo si chiama «Preventivo» — su Riparazione la nota dice testualmente «è
-- una stima fatta prima di aprire l'apparecchio». Lì zero vuol dire quasi
-- sempre «non lo so ancora», non «gratis». E il modulo che il cliente FIRMA
-- stampa «Preventivo presunto 0,00 €» seguito da «l'intero importo si paga
-- alla consegna»: il cliente firma un foglio che dice zero, e alla consegna
-- gli si chiedono novanta euro. Il documento firmato direbbe il contrario.
--
-- Quindi lo zero adesso ha un perché, ed è obbligatorio sceglierlo:
--   gratis        = non si paga niente (garanzia, cortesia)
--   da_quantificare = il prezzo si saprà dopo la diagnosi
-- e il modulo firmato dice due cose diverse nei due casi.

alter table public.pratiche
    add column if not exists motivo_zero text;

comment on column public.pratiche.motivo_zero is
  'Perché la pratica vale zero: «gratis» (garanzia o cortesia, non si paga niente) oppure «da_quantificare» (il prezzo si saprà dopo la diagnosi). Nullo su tutte le pratiche con un valore.';

alter table public.pratiche drop constraint if exists pratiche_motivo_zero_check;
alter table public.pratiche add constraint pratiche_motivo_zero_check
    check (motivo_zero is null or motivo_zero in ('gratis', 'da_quantificare'));

do $$
declare n int; zero int;
begin
    select count(*) into n from information_schema.columns
     where table_name = 'pratiche' and column_name = 'motivo_zero';
    select count(*) into zero from public.pratiche where valore = 0;
    raise notice 'colonna motivo_zero: % · pratiche a zero già esistenti: % (restano senza motivo, sono nate prima)', n, zero;
    if n <> 1 then raise exception 'la colonna non è stata creata'; end if;
end $$;
