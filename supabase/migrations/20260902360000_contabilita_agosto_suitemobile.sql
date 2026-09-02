-- ═══ AGOSTO NON È NOSTRO ═══════════════════════════════════════════════════
-- Luca 02/09: «agosto se lo fa al vecchio modo, perché di fatto le vendite sono
-- state fatte da SuiteMobile: il primo mese che dobbiamo fare è settembre».
--
-- Il lavoro pianificato parte il 3 di ogni mese e guarda il mese appena chiuso:
-- il 3 settembre avrebbe mandato agosto, che nel CRM esiste a metà — i telefoni
-- venduti in agosto sono entrati il 2/8 senza costo e senza società, perché le
-- vendite le ha registrate il gestionale vecchio.
--
-- ⚠️ NON SI SPEGNE IL LAVORO, SI CHIUDE IL MESE. Spegnere il cron vorrebbe dire
-- ricordarsi di riaccenderlo il 3 ottobre — e quel tipo di promemoria non
-- sopravvive a un mese. Qui agosto risulta già chiuso, con scritto perché: la
-- corsa del 3 settembre lo salta da sola, e quella del 3 ottobre manda
-- settembre, che è il primo mese vero.

alter table public.contabilita_usati_inviati
    add column if not exists nota text;

comment on column public.contabilita_usati_inviati.nota is
  'Perché questo mese è chiuso così. Serve ai mesi non mandati da noi: senza, fra un anno una riga «inviato» senza destinatari sembra un guasto.';

insert into public.contabilita_usati_inviati
    (mese, esito, destinatari, quanti_venduti, quanti_comprati, da_confermare, inviato_da, nota)
values
    ('2026-08-01', 'inviato', '{}', 0, 0, 0, 'non applicabile',
     'Agosto 2026 non passa dal CRM: le vendite degli usati sono state registrate su SuiteMobile e il resoconto al commercialista lo fa il vecchio gestionale. Il primo mese nostro è settembre 2026, che parte il 3 ottobre.')
on conflict (mese) do update set nota = excluded.nota, esito = excluded.esito;

do $$
declare e text;
begin
    select esito into e from public.contabilita_usati_inviati where mese = '2026-08-01';
    raise notice 'agosto 2026: %', coalesce(e, 'ASSENTE');
    if e is distinct from 'inviato' then raise exception 'agosto non risulta chiuso'; end if;
end $$;
