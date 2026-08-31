-- QUANTE FERIE HANNO ANCORA (Luca 31/08).
--
-- «Nella sezione ferie voglio un rendiconto del totale delle ferie di tutti i
-- collaboratori: nel momento in cui ci fanno una richiesta, vedere subito
-- quali sono i loro giorni residui.»
--
-- Il residuo VERO lo dice la busta paga, una volta al mese. Fra una busta e
-- l'altra lo tiene aggiornato il CRM, sottraendo le ferie approvate da quella
-- data in poi. Quindi qui si conserva solo il PUNTO FERMO — «al 31 luglio
-- aveva 12,5 giorni» — e il resto si calcola: un numero solo da mantenere,
-- e sempre riconciliabile col cedolino.
--
-- `fonte` dice da dove viene il punto fermo: 'busta_paga' quando lo si legge
-- dal cedolino, 'manuale' quando lo scrive una persona. Serve a sapere di
-- quale numero ci si può fidare senza chiedere.
create table if not exists ferie_residue (
    user_id     uuid not null references app_users(id) on delete cascade,
    mese        date not null,                    -- il mese del cedolino (primo del mese)
    giorni      numeric not null,                 -- giorni residui A QUELLA DATA
    fonte       text not null default 'manuale',  -- busta_paga | manuale
    note        text,
    inserito_da text,
    created_at  timestamptz default now(),
    primary key (user_id, mese)
);

comment on table ferie_residue is
  'Il residuo ferie di un collaboratore come risulta dalla busta paga di quel mese: è il punto fermo da cui il CRM sottrae le ferie approvate dopo.';

create index if not exists idx_ferie_residue_mese on ferie_residue (mese desc);

alter table ferie_residue enable row level security;
drop policy if exists tf_blindata on ferie_residue;
create policy tf_blindata on ferie_residue for all
  using (public.tf_uid() is not null) with check (public.tf_uid() is not null);
