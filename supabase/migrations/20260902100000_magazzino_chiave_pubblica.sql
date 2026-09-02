-- ═══ IL MAGAZZINO SI MUOVEVA CON LA SOLA CHIAVE PUBBLICA ══════════════════
-- Trovato il 02/09 dal ricognitore, prima di mettere mano ai trasferimenti.
--
-- `mag_movimenti` — il registro che MUOVE le giacenze, tramite un trigger
-- SECURITY DEFINER — aveva la politica di inserimento con `with check (true)`
-- e il permesso di INSERT concesso al ruolo `anon`. La chiave pubblica sta
-- dentro ogni pagina del sito: chiunque poteva creare movimenti a piacere e
-- quindi far salire o sparire la merce di qualunque negozio, senza nemmeno
-- fare login. Provato con curl: la richiesta non veniva respinta dalla RLS,
-- si fermava solo sulla chiave esterna dell'articolo.
--
-- Il CRM firma i suoi lasciapassare con `role: "authenticated"` (jwtTf.ts):
-- togliere `anon` non tocca nessuna schermata.
revoke insert, update, delete, truncate on public.mag_movimenti from anon;
revoke select on public.mag_movimenti from anon;

drop policy if exists mag_movimenti_scrittura on public.mag_movimenti;
drop policy if exists mag_movimenti_lettura on public.mag_movimenti;
create policy mag_movimenti_scrittura on public.mag_movimenti
    for insert to authenticated with check (public.tf_uid() is not null);
create policy mag_movimenti_lettura on public.mag_movimenti
    for select to authenticated using (public.tf_uid() is not null);

-- La stessa mano larga era su tutta la famiglia: lì la RLS reggeva
-- (`tf_blindata` chiede il tf_uid), ma un permesso concesso e non usato è un
-- permesso che un domani qualcuno trova già aperto.
revoke insert, update, delete, truncate on public.mag_ddt from anon;
revoke insert, update, delete, truncate on public.mag_ddt_righe from anon;
revoke insert, update, delete, truncate on public.mag_ddt_progressivo from anon;
revoke insert, update, delete, truncate on public.mag_unita from anon;
revoke update, delete, truncate on public.mag_eventi from anon;
revoke truncate on public.mag_giacenze from anon;
revoke all on public.mag_disponibilita from anon;
