-- ═══ IL MAGAZZINO NON SI MUOVE DAL BANCONE DI UN ALTRO ═══════════════════
-- Fino a oggi `mag_ddt`, `mag_ddt_righe` e `mag_unita` avevano una sola
-- regola: `tf_blindata`, cioè «hai un tf_uid» — sei loggato. Il perimetro
-- viveva soltanto nelle schermate: dalla console del browser, con la propria
-- sessione, un venditore poteva emettere un trasferimento da un negozio che
-- non è suo, marcare «arrivata» merce mai arrivata, o spostare un pezzo
-- altrui. Il 02/09 abbiamo chiuso la porta della chiave pubblica; questa è
-- quella interna.
--
-- ⚠️ SI INCASTRA CON IL LAVORO DEL TERMINAL GEMELLO (migrazione
-- `magazzino_porte_chiuse`), che ha tolto i PERMESSI: niente INSERT né DELETE
-- su `mag_unita`, perché il browser non li fa mai. Quello chiude le porte che
-- non servono; questo mette il nome sulla porta che resta aperta — l'UPDATE
-- di un pezzo e l'emissione di un documento, che il browser fa eccome, ma
-- solo per il proprio bancone. Le due cose non si sovrappongono.
--
-- ⚠️ SI CHIUDE LA SCRITTURA, NON LA LETTURA. Luca, 03/09: «il lavoro che
-- abbiamo fatto sui trasferimenti era per dare ordine, non per limitare la
-- visibilità». Vedere il magazzino del gruppo serve — si cerca un pezzo, si
-- guarda dov'è, si chiede a chi ce l'ha. Muoverlo no.

/* Dove questa persona può MUOVERE merce: il negozio del login, quelli
   assegnati, e la sede dichiarata oggi. Il confronto è per SEDE FISICA (la
   prima parola del nome), perché «Magliana W3» e «Magliana Multi» sono lo
   stesso bancone e lo stesso magazzino. Direzione e amministrazione ovunque. */
create or replace function public.tf_magazzino_mio(p_negozio text)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select case
    when p_negozio is null or btrim(p_negozio) = '' then false
    when public.tf_e_governo() then true
    else exists (
      select 1 from app_users u
       where u.id = public.tf_uid()
         and lower(split_part(btrim(coalesce(u.primary_store, '')), ' ', 1)) = lower(split_part(btrim(p_negozio), ' ', 1))
         and coalesce(u.primary_store, '') <> ''
      union all
      select 1 from user_stores us
       where us.user_id = public.tf_uid()
         and lower(split_part(btrim(us.store_name), ' ', 1)) = lower(split_part(btrim(p_negozio), ' ', 1))
      union all
      select 1 from presenza_negozio p
       where p.user_id = public.tf_uid() and p.data = current_date and p.stato = 'attiva'
         and lower(p.sede) = lower(split_part(btrim(p_negozio), ' ', 1))
    )
  end
$$;

-- ── mag_ddt ────────────────────────────────────────────────────────────────
drop policy if exists tf_blindata on public.mag_ddt;
create policy tf_ddt_leggi   on public.mag_ddt for select to authenticated
    using (public.tf_uid() is not null);
-- si EMETTE solo da un magazzino proprio
create policy tf_ddt_emetti  on public.mag_ddt for insert to authenticated
    with check (public.tf_magazzino_mio(da_negozio));
-- si TOCCA se si è una delle due parti: chi manda (annullo) o chi riceve
create policy tf_ddt_muovi   on public.mag_ddt for update to authenticated
    using (public.tf_magazzino_mio(da_negozio) or public.tf_magazzino_mio(a_negozio))
    with check (public.tf_magazzino_mio(da_negozio) or public.tf_magazzino_mio(a_negozio));
create policy tf_ddt_cancella on public.mag_ddt for delete to authenticated
    using (public.tf_e_governo());

-- ── mag_ddt_righe: seguono il loro documento ───────────────────────────────
drop policy if exists tf_blindata on public.mag_ddt_righe;
create policy tf_righe_leggi on public.mag_ddt_righe for select to authenticated
    using (public.tf_uid() is not null);
create policy tf_righe_scrivi on public.mag_ddt_righe for insert to authenticated
    with check (exists (select 1 from mag_ddt d where d.id = ddt_id
                         and (public.tf_magazzino_mio(d.da_negozio) or public.tf_magazzino_mio(d.a_negozio))));
create policy tf_righe_muovi on public.mag_ddt_righe for update to authenticated
    using (exists (select 1 from mag_ddt d where d.id = ddt_id
                    and (public.tf_magazzino_mio(d.da_negozio) or public.tf_magazzino_mio(d.a_negozio))))
    with check (true);
create policy tf_righe_cancella on public.mag_ddt_righe for delete to authenticated
    using (public.tf_e_governo());

-- ── mag_unita: il pezzo con seriale ────────────────────────────────────────
drop policy if exists tf_blindata on public.mag_unita;
create policy tf_unita_leggi on public.mag_unita for select to authenticated
    using (public.tf_uid() is not null);
create policy tf_unita_carica on public.mag_unita for insert to authenticated
    with check (public.tf_magazzino_mio(negozio));
/* ⚠️ IL PEZZO IN VIAGGIO NON È DI NESSUNO DEI DUE. Alla partenza il CRM
   scrive già il negozio d'ARRIVO sulla riga: da quel momento il mittente non
   sarebbe più il proprietario e non potrebbe annullare il suo stesso
   trasferimento. Perciò si guarda anche il documento a cui il pezzo è
   agganciato. */
create policy tf_unita_muovi on public.mag_unita for update to authenticated
    using (public.tf_magazzino_mio(negozio)
           or (ddt_id is not null and exists (select 1 from mag_ddt d where d.id = ddt_id
                                               and (public.tf_magazzino_mio(d.da_negozio) or public.tf_magazzino_mio(d.a_negozio)))))
    with check (true);
create policy tf_unita_cancella on public.mag_unita for delete to authenticated
    using (public.tf_e_governo());
