-- 071: aggancia le metriche di target alla tassonomia unica.
--
-- target_metrics.match_categorie e' una lista di nomi-categoria scritti a mano,
-- uno per ogni modo in cui i brand chiamano lo stesso servizio
-- (Energia = ['LUCE E GAS','ENERGIA','S4 ENERGIA','BARTON ENERGY','Luce & Gas']).
-- E' la stessa fragilita' che la tassonomia risolve per i contratti: ogni brand
-- nuovo, o ogni nome nuovo, esce dal conteggio in silenzio.
--
-- Qui si aggiunge match_macro: le categorie della tassonomia (categoria_macro)
-- che la metrica conta. Cosi' un contratto e il suo target contano la stessa
-- cosa unendosi su categoria_macro, senza liste da mantenere.

alter table public.target_metrics add column if not exists match_macro text[] not null default '{}';

-- Mappatura per nome della metrica (le 7 di reporting dell'ufficio).
update public.target_metrics set match_macro = '{mobile}'         where lower(name) = 'mobile';
update public.target_metrics set match_macro = '{fisso}'          where lower(name) = 'fisso';
update public.target_metrics set match_macro = '{energia}'        where lower(name) = 'energia';
update public.target_metrics set match_macro = '{tv}'             where lower(name) in ('sky tv', 'tv');
update public.target_metrics set match_macro = '{digitale}'       where lower(name) in ('soluzioni digitali', 'digitale');
update public.target_metrics set match_macro = '{multi_servizi}'  where lower(name) in ('multi-servizi', 'multi servizi', 'multiservizi');
update public.target_metrics set match_macro = '{pos}'            where lower(name) = 'pos';

comment on column public.target_metrics.match_macro is
  'Categorie della tassonomia (contracts.categoria_macro) contate da questa metrica. Sostituisce match_categorie, che elencava a mano i nomi dei brand.';

notify pgrst, 'reload schema';
