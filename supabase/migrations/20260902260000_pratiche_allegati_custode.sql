-- ═══ I CONTRATTI FIRMATI NON SI LEGGONO SALTANDO IL CUSTODE ═══════════════
-- Luca 02/09: «non vedo perché i contratti di ordini e assistenze devono
-- essere visibili da parte di tutti».
--
-- Non devono, ed era un errore mio: il deposito `pratiche-allegati` è nato il
-- 01/09 con una regola `FOR ALL` — e `ALL` comprende anche la LETTURA. Su
-- tutti gli altri depositi le regole coprono solo la scrittura, e leggere si
-- può soltanto dal custode (`/api/file/…`), che prima di consegnare guarda chi
-- sei. Qui invece chiunque avesse una sessione del CRM poteva elencare e
-- farsi firmare l'indirizzo di ogni contratto — moduli di ordini e assistenze
-- con dentro i dati del cliente — direttamente dal browser.
--
-- ⚠️ È ESATTAMENTE LO SCENARIO CONTRO CUI LA MIGRAZIONE DEL 31/08 METTEVA IN
-- GUARDIA: «se si ritrova a scrivere "for select using (tf_uid() is not
-- null)", sta riaprendo questa porta». Il giorno dopo l'ho riaperta.

drop policy if exists tf_pratiche_all_rw on storage.objects;

/* Le tre regole di scrittura, nella forma di tutti gli altri depositi: si
   carica, si sostituisce e si cancella stando dentro il CRM; per LEGGERE si
   passa dal custode, che usa la chiave di servizio. */
create policy "tf_pratiche-allegati_write" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'pratiche-allegati'
                and ((current_setting('request.jwt.claims', true))::json ->> 'tf_uid') is not null);
create policy "tf_pratiche-allegati_update" on storage.objects
    for update to authenticated
    using (bucket_id = 'pratiche-allegati'
           and ((current_setting('request.jwt.claims', true))::json ->> 'tf_uid') is not null);
create policy "tf_pratiche-allegati_del" on storage.objects
    for delete to authenticated
    using (bucket_id = 'pratiche-allegati'
           and ((current_setting('request.jwt.claims', true))::json ->> 'tf_uid') is not null);

do $$
declare sel int; tot int;
begin
    select count(*) into sel from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and qual like '%pratiche-allegati%' and cmd in ('SELECT', 'ALL');
    select count(*) into tot from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname like '%pratiche%';
    raise notice 'pratiche-allegati · regole: % · che permettono la LETTURA diretta: % (deve essere 0)', tot, sel;
    if sel > 0 then raise exception 'la lettura diretta è ancora aperta: % regole', sel; end if;
end $$;
