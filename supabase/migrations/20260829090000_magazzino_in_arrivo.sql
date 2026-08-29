-- ═══════════════════════════════════════════════════════════════════════════
-- LA MERCE IN ARRIVO (29/08, segnalazione di Francesco: «non mi torna»)
--
-- L'export del gestionale ha DUE colonne: «Disponibilità» e «Arrivo». La
-- seconda non veniva caricata, e su Multi sono 96 pezzi — 40 SIM Fastweb,
-- 40 SIM Trio Next, 15 sostitutive, 1 Kena. Chi confrontava il CRM col
-- gestionale vedeva 109 SIM Fastweb invece di 109 + 40, e concludeva che i
-- conti non tornano. Tornavano: mancava un pezzo di verità.
--
-- La merce in arrivo NON è giacenza: non si può vendere, non esce dallo
-- scaffale perché sullo scaffale non c'è. Ma sapere che sta arrivando serve —
-- per non riordinare due volte e per rispondere al cliente «ce l'ho domani».
-- Quindi è un numero suo, accanto alla giacenza, mai sommato dentro.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.mag_giacenze add column if not exists in_arrivo numeric not null default 0;

-- la vista la porta con sé, separata. `create or replace` non sa aggiungere
-- una colonna in mezzo: si ricrea.
drop view if exists public.mag_disponibilita;
create view public.mag_disponibilita as
  select codice, negozio, azienda,
         sum(quantita)                                              as quantita,
         sum(in_arrivo)                                             as in_arrivo,
         sum(case when forma='serializzato' then quantita else 0 end) as pezzi_con_seriale,
         sum(case when forma='quantita'     then quantita else 0 end) as pezzi_a_quantita
    from (
      select g.codice, g.negozio, g.azienda, g.quantita, g.in_arrivo, 'quantita' as forma
        from public.mag_giacenze g
      union all
      select u.codice, u.negozio, coalesce(u.azienda,'T1'),
             count(*) filter (where u.stato = 'disponibile')::numeric,
             count(*) filter (where u.stato = 'in_arrivo')::numeric,
             'serializzato'
        from public.mag_unita u
       where u.codice is not null
         and u.stato in ('disponibile','in_arrivo')
       group by u.codice, u.negozio, coalesce(u.azienda,'T1')
    ) t
   group by codice, negozio, azienda;

notify pgrst, 'reload schema';
