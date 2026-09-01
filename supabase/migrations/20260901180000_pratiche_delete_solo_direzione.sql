-- ═══ LA CANCELLAZIONE ERA APERTA A TUTTI ═════════════════════════════════
-- Rilievo del revisore, 01/09. C'erano due politiche:
--   tf_pratiche_rw  FOR ALL    using (tf_uid() is not null)
--   tf_pratiche_del FOR DELETE using (ruolo in admin/dev/direttore/amministrativo)
-- Le politiche permissive si sommano in OR, e FOR ALL comprende anche DELETE:
-- quindi la seconda non restringeva niente. Qualunque persona loggata poteva
-- cancellare qualunque pratica dalla console del browser — il commento della
-- migrazione diceva «la cancellazione è roba di direzione», ma l'unico
-- cancello vero era il bottone nascosto nella schermata.
drop policy if exists tf_pratiche_rw on public.pratiche;

create policy tf_pratiche_leggi   on public.pratiche for select using (tf_uid() is not null);
create policy tf_pratiche_scrivi  on public.pratiche for insert with check (tf_uid() is not null);
create policy tf_pratiche_aggiorna on public.pratiche for update using (tf_uid() is not null) with check (tf_uid() is not null);
-- la DELETE resta solo a tf_pratiche_del: direzione e amministrazione.

-- stessa forma sulle righe, che seguono la pratica
drop policy if exists tf_pratiche_righe_rw on public.pratiche_righe;
create policy tf_righe_leggi    on public.pratiche_righe for select using (tf_uid() is not null);
create policy tf_righe_scrivi   on public.pratiche_righe for insert with check (tf_uid() is not null);
create policy tf_righe_aggiorna on public.pratiche_righe for update using (tf_uid() is not null) with check (tf_uid() is not null);
create policy tf_righe_cancella on public.pratiche_righe for delete using (
    exists (select 1 from app_users me where me.id = tf_uid()
            and me.role = any (array['admin','dev','direttore_generale','amministrativo'])));
