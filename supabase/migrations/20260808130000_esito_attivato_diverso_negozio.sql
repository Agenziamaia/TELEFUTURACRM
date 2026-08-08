-- MATCH — esito "attivato diverso negozio" (mig. 193, cantiere 08/08)
--
-- Quando il cliente aveva un appuntamento in un negozio ma la vendita avviene
-- in un ALTRO negozio (o da un venditore che non lavora in quello
-- dell'appuntamento): l'appuntamento risulta ATTIVATO (il negozio vede che il
-- cliente si è mosso altrove) MA la cooperation NON sale al caller — non è
-- giusto attribuirla, ed è un segnale che qualcosa non ha funzionato nella
-- comunicazione col cliente (Luca 08/08).
insert into public.calendario_esiti (id, tipo, chiave, etichetta, colore, ordine, attiva)
select gen_random_uuid(), t, 'attivato_diverso_negozio', 'Attivato — altro negozio', 'sky', 25, true
  from (values ('incoming'), ('outgoing')) as v(t)
 where not exists (
   select 1 from public.calendario_esiti e where e.tipo = v.t and e.chiave = 'attivato_diverso_negozio');

notify pgrst, 'reload schema';
