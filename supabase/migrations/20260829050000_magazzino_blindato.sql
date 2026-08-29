-- ═══════════════════════════════════════════════════════════════════════════
-- IL MAGAZZINO FISCALE NON SI CANCELLA (29/08)
--
-- Due difetti trovati dal revisore, tutti e due veri:
--
-- 1. Il trigger che aggiorna la giacenza scatta SOLO all'inserimento. Provato:
--    carico 10 → giacenza 10 → cancello il movimento → la giacenza resta 10,
--    senza più niente che la spieghi. La promessa scritta nella migrazione di
--    ieri («non può esistere una giacenza senza una storia») non reggeva.
--
-- 2. Le policy erano `for all using(true)`: con la chiave pubblica del browser
--    chiunque poteva azzerare le giacenze o cancellare i movimenti di un
--    magazzino FISCALE.
--
-- Un movimento è un fatto contabile: si aggiunge, non si riscrive. Se è
-- sbagliato si scrive una rettifica — che lascia traccia di entrambe le cose.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── un movimento non si modifica e non si cancella ───────────────────────
create or replace function public.mag_movimenti_immutabili() returns trigger
language plpgsql as $$
begin
  raise exception 'Un movimento di magazzino non si modifica né si cancella: è un fatto contabile. Per correggerlo si registra una RETTIFICA, che lascia traccia di entrambe le cose.';
end $$;
drop trigger if exists trg_mag_movimenti_immutabili on public.mag_movimenti;
create trigger trg_mag_movimenti_immutabili before update or delete on public.mag_movimenti
  for each row execute function public.mag_movimenti_immutabili();

-- ── e la giacenza si scrive solo dal trigger, mai a mano ─────────────────
drop policy if exists mag_giacenze_allow_all on public.mag_giacenze;
create policy mag_giacenze_lettura on public.mag_giacenze for select using (true);
-- niente insert/update/delete diretti: passa tutto dai movimenti
revoke insert, update, delete on public.mag_giacenze from anon, authenticated;

drop policy if exists mag_movimenti_allow_all on public.mag_movimenti;
create policy mag_movimenti_lettura on public.mag_movimenti for select using (true);
create policy mag_movimenti_scrittura on public.mag_movimenti for insert with check (true);
revoke update, delete, truncate on public.mag_movimenti from anon, authenticated;

notify pgrst, 'reload schema';
