-- ═══════════════════════════════════════════════════════════════════════════
-- DUE SOCIETÀ, DUE MAGAZZINI (Luca 29/08)
--
-- «Noi abbiamo due società a livello fiscale nei negozi, e anche i magazzini
--  hanno un'attribuzione — tanto è che ti ho fatto due export diversi: il
--  magazzino Wind3 è legato a Telefutura SRL, il magazzino Multi è legato a
--  Telefutura 2 SRL.»
--
-- Nel CRM le due società si chiamano già così (pos_rt):
--     T1 = Telefutura S.R.L.    P.IVA 06457391008   → magazzino WIND3
--     T2 = Telefutura 2 S.R.L.  P.IVA 10916221004   → magazzino MULTI
-- e il negozio «Donna» ha DUE registratori telematici, uno per società.
--
-- PERCHÉ CONTA, e non è un dettaglio anagrafico: lo scontrino esce dalla
-- cassa di UNA società, e la merce deve uscire dal magazzino di QUELLA
-- società. Un accessorio del magazzino Multi battuto sullo scontrino di
-- Telefutura SRL è merce che sparisce da un inventario e compare in una
-- fattura dell'altra: due contabilità che non tornano.
--
-- La giacenza quindi non è più «articolo × negozio» ma «articolo × negozio ×
-- società». Le tabelle sono ancora vuote: cambiarla adesso costa niente,
-- farlo dopo l'importazione sarebbe un lavoro.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.mag_giacenze  add column if not exists azienda text;
alter table public.mag_movimenti add column if not exists azienda text;

-- la chiave della giacenza comprende la società
alter table public.mag_giacenze drop constraint if exists mag_giacenze_pkey;
update public.mag_giacenze set azienda = coalesce(azienda, 'T1') where azienda is null;
alter table public.mag_giacenze alter column azienda set not null;
alter table public.mag_giacenze add primary key (codice, negozio, azienda);

alter table public.mag_movimenti alter column azienda set default 'T1';
update public.mag_movimenti set azienda = coalesce(azienda, 'T1') where azienda is null;
alter table public.mag_movimenti alter column azienda set not null;
create index if not exists mag_movimenti_azienda on public.mag_movimenti (azienda, negozio, creato_il desc);

-- il trigger tiene i conti separati per società
create or replace function public.mag_applica_movimento() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_delta numeric;
begin
  v_delta := case new.tipo
    when 'carico' then new.quantita
    when 'trasferimento_in' then new.quantita
    when 'reso' then new.quantita
    when 'scarico' then -new.quantita
    when 'trasferimento_out' then -new.quantita
    when 'rettifica' then new.quantita
    else 0 end;
  insert into public.mag_giacenze (codice, negozio, azienda, quantita, updated_at)
  values (new.codice, new.negozio, new.azienda, v_delta, now())
  on conflict (codice, negozio, azienda) do update
    set quantita = public.mag_giacenze.quantita + excluded.quantita,
        updated_at = now();
  return new;
end $$;

-- ── L'ARTICOLO SA DA QUALE LISTINO VIENE ─────────────────────────────────
--    `gruppo` porta già il listino di provenienza (LISTINO WIND3, LISTINO
--    VODAFONE, Accessori…). Da lì si ricava la società di riferimento, ma
--    resta modificabile a mano: è l'amministrazione a decidere.
alter table public.mag_articoli add column if not exists azienda text;

notify pgrst, 'reload schema';
