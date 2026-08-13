-- SOGLIE PER PDV: originali di lettera + modifica manuale (Luca 13/08).
-- Le soglie arrivano dalla lettera/foglio target ma devono restare
-- ritoccabili a mano: le colonne *_lettera congelano l'originale così il
-- pannello può marcare «modificata» ogni soglia che se ne discosta.
alter table public.pay_target_pdv add column if not exists soglie_mobile_lettera numeric[];
alter table public.pay_target_pdv add column if not exists soglie_fisso_lettera numeric[];
update public.pay_target_pdv
  set soglie_mobile_lettera = coalesce(soglie_mobile_lettera, soglie_mobile),
      soglie_fisso_lettera  = coalesce(soglie_fisso_lettera,  soglie_fisso);
notify pgrst, 'reload schema';
