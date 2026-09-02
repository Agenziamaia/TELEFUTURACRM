-- ═══ IL LABORATORIO ESISTE, E HA UN INDIRIZZO ═════════════════════════════
-- Luca 02/09: «il laboratorio è in via della Magliana 263, Roma 00146. Sta
-- dietro il negozio di Magliana, per cui i documenti di trasporto che andranno
-- da Magliana al laboratorio e viceversa saranno un trasferimento interno.»
--
-- ⚠️ SERVIVA UN LUOGO VERO, non un nome. Il documento di trasporto stampa
-- l'indirizzo di partenza e di arrivo leggendoli da `stores`: senza questa
-- riga, ogni documento di un telefono usato usciva con scritto in rosso
-- «manca l'indirizzo di Laboratorio» e «Documento non ancora valido» — un
-- foglio fiscale che nasce dichiarandosi invalido. Lo aveva trovato la
-- revisione, e riguardava due dei tre passaggi che emettono.
--
-- Sta fra gli UFFICI (`is_ufficio`), come Ufficio e Ufficio Commerciale: le
-- tendine dei negozi filtrano su quel campo, quindi non compare dove si sceglie
-- un punto vendita — ma il documento lo trova.
--
-- ⚠️ NESSUNA SOCIETÀ. Il laboratorio è un REPARTO, non un soggetto giuridico:
-- il telefono che ci passa resta di chi era. Scriverci dentro T1 o T2 vorrebbe
-- dire che ogni ritorno dal laboratorio verso un negozio dell'altra società
-- diventa una cessione fra società — con una fattura da fare che non esiste.

insert into public.stores (name, address, civico, cap, citta, provincia, is_ufficio, active, azienda)
values ('Laboratorio', 'Via della Magliana', '263', '00146', 'Roma', 'RM', true, true, null)
on conflict (name) do update set
    address = excluded.address, civico = excluded.civico, cap = excluded.cap,
    citta = excluded.citta, provincia = excluded.provincia, is_ufficio = true;

do $$
declare n int; ind text;
begin
    select count(*), max(address || ' ' || civico || ', ' || cap || ' ' || citta)
      into n, ind from public.stores where name = 'Laboratorio' and is_ufficio;
    raise notice 'Laboratorio: % riga · %', n, coalesce(ind, '(senza indirizzo)');
    if n <> 1 or ind is null then raise exception 'il laboratorio non è a posto: righe=% indirizzo=%', n, ind; end if;
end $$;
