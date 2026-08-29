-- ═══════════════════════════════════════════════════════════════════════════
-- I PULSANTI DELLA CASSA, A DUE LIVELLI (Luca 29/08)
--
-- «Alcuni di questi devono avere dei sotto pulsanti, in quanto sono delle
--  sotto categorie che contengono altri prodotti.»
--
-- Le scorciatoie della cassa sono la strada veloce: chi sta al banco preme
-- «Accessori» e trova dentro i pezzi che vende davvero, senza cercarli. La
-- struttura arriva da Luca (foto 29/08) e riguarda gli ARTICOLI VERI: sotto
-- ogni sotto-pulsante c'è un codice di magazzino, con il suo prezzo e la sua
-- giacenza — non una voce inventata.
--
-- Sta a DATABASE e non nel codice: i negozi cambiano assortimento, e
-- aggiungere un pulsante non deve voler dire toccare una riga di programma.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.cassa_gruppi (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  icona     text,
  ordine    int  not null default 100,
  attivo    boolean not null default true,
  creato_il timestamptz not null default now()
);

-- una voce del gruppo: punta a un articolo di magazzino (codice) oppure a
-- una voce di marginalità (marg_item_id) — servizi e assicurazioni non hanno
-- una giacenza, ma sul pulsante stanno accanto agli altri
create table if not exists public.cassa_gruppo_voci (
  id           uuid primary key default gen_random_uuid(),
  gruppo_id    uuid not null references public.cassa_gruppi(id) on delete cascade,
  codice       text references public.mag_articoli(codice) on delete cascade,
  marg_item_id uuid references public.marg_items(id) on delete cascade,
  etichetta    text,          -- se manca si usa la descrizione dell'articolo
  ordine       int not null default 100,
  attivo       boolean not null default true,
  -- o punta a un articolo, o punta a una voce di marginalità: non tutt'e due
  constraint cassa_voce_una_sola check (num_nonnulls(codice, marg_item_id) = 1)
);
create index if not exists cassa_voci_gruppo on public.cassa_gruppo_voci (gruppo_id, ordine);

alter table public.cassa_gruppi enable row level security;
drop policy if exists cassa_gruppi_lettura on public.cassa_gruppi;
create policy cassa_gruppi_lettura on public.cassa_gruppi for all using (true) with check (true);
alter table public.cassa_gruppo_voci enable row level security;
drop policy if exists cassa_voci_lettura on public.cassa_gruppo_voci;
create policy cassa_voci_lettura on public.cassa_gruppo_voci for all using (true) with check (true);

-- ── I GRUPPI DI LUCA (foto 29/08) ────────────────────────────────────────
--    Si inseriscono solo i codici che ESISTONO in anagrafica: un pulsante che
--    punta a un articolo inesistente è un pulsante che non vende niente.
insert into public.cassa_gruppi (nome, icona, ordine)
select * from (values
  ('Accessori',        '🎧', 10),
  ('Cavi e Trasformatori', '🔌', 20),
  ('Memorie e USB',    '💾', 30),
  ('Pellicole',        '🛡', 40),
  ('Telefoni Senior',  '📞', 50)
) v(nome, icona, ordine)
where not exists (select 1 from public.cassa_gruppi g where g.nome = v.nome);

do $$
declare
  v_gruppo text; v_cod text; v_id uuid; v_ord int;
  v_mappa text[][] := array[
    ['Accessori','POWER5000'],['Accessori','POWER10000'],['Accessori','POWER20000'],['Accessori','POWERMAGSAFE'],
    ['Accessori','EARBUDS'],['Accessori','AURCOMM'],['Accessori','AURTYPEC'],['Accessori','AURAPPLE'],
    ['Accessori','POCHETTE'],['Accessori','LACCIO'],['Accessori','OROLOGICASH'],['Accessori','NEWCOVER'],
    ['Cavi e Trasformatori','CVMICRO'],['Cavi e Trasformatori','CVAPPLE'],['Cavi e Trasformatori','CVTYPEC'],
    ['Cavi e Trasformatori','CVTYPECTYPEC'],['Cavi e Trasformatori','CVTYPECAPPLE'],['Cavi e Trasformatori','CVTYPEC2M'],
    ['Cavi e Trasformatori','CVMICRO2M'],['Cavi e Trasformatori','CVAPPLE2M'],['Cavi e Trasformatori','TRV'],
    ['Cavi e Trasformatori','TRVAUTO'],['Cavi e Trasformatori','KITCHARGER'],
    ['Memorie e USB','MEM32'],['Memorie e USB','MEM64'],['Memorie e USB','MEM128'],['Memorie e USB','MEM256'],
    ['Memorie e USB','PEN32'],['Memorie e USB','PEN64'],['Memorie e USB','PEN128'],['Memorie e USB','PEN256'],
    ['Pellicole','PLC'],['Pellicole','PLV'],['Pellicole','PLX'],['Pellicole','PLT'],['Pellicole','PLSPY'],['Pellicole','PELLICOLAVETRO'],
    ['Telefoni Senior','PRESIDENT'],['Telefoni Senior','MAGNUM4']
  ];
begin
  for i in 1 .. array_length(v_mappa, 1) loop
    v_gruppo := v_mappa[i][1];
    v_cod    := v_mappa[i][2];
    select id into v_id from public.cassa_gruppi where nome = v_gruppo;
    -- l'ordine dei pulsanti è quello in cui li ha scritti Luca
    v_ord := i * 10;
    if exists (select 1 from public.mag_articoli a where upper(trim(a.codice)) = v_cod)
       and not exists (select 1 from public.cassa_gruppo_voci x where x.gruppo_id = v_id and upper(trim(x.codice)) = v_cod) then
      insert into public.cassa_gruppo_voci (gruppo_id, codice, ordine)
      select v_id, a.codice, v_ord from public.mag_articoli a where upper(trim(a.codice)) = v_cod limit 1;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
