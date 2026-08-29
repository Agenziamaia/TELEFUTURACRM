-- ═══════════════════════════════════════════════════════════════════════════
-- I QUATTRO TASTI VODAFONE (Luca 29/08)
--
-- «Su Vodafone c'è un po' di confusione, ti faccio il riepilogo del codice
--  articolo al quale devi associare il tasto rapido dentro Sim ed E-Sim:
--  820462 Sim Bus., 820510 E-Sim Business, 821339 E-Sim Next, 821335 Sim Next.
--  Sono solo queste. Al posto della scritta Vodafone ci metti il solito
--  brand, come già stai facendo ora.»
--
-- Due cose da sapere, verificate in anagrafica:
--   · 820462 NON ESISTE: va creato, e serve il listino per prezzo e costo.
--   · 820510 e 821335 si chiamano «eSIM Voucher 128K» e «SIM TRIO NEXT»:
--     i nomi veri li ha dati Luca, e qui l'anagrafica si allinea a quelli.
--
-- I VECCHI TASTI VODAFONE NON SI CANCELLANO. «Sim Vodafone» e «Sost
-- Vodafone» non sono solo pulsanti: sono i nomi che il CRM usa per generare
-- da sé la riga di provvigione quando si registra un'attivazione Vodafone
-- (AUTO_SIM/AUTO_SOST in registra-vendita). Rinominarli o spegnerli
-- romperebbe quel flusso in silenzio. Si nascondono dai pulsanti e basta:
-- `mostra_in_cassa = false`.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── il flag: una voce può servire al flusso senza essere un pulsante
alter table marg_items add column if not exists mostra_in_cassa boolean not null default true;
comment on column marg_items.mostra_in_cassa is
  'false = la voce esiste (serve alle righe automatiche del flusso di brand) ma NON compare fra i pulsanti rapidi della cassa.';

-- ── i nomi veri degli articoli, come li chiama il negozio
update mag_articoli set descrizione = 'E-Sim Business Vodafone' where codice = '820510';
update mag_articoli set descrizione = 'E-Sim Next Vodafone'     where codice = '821339';
update mag_articoli set descrizione = 'Sim Next Vodafone'       where codice = '821335';

-- ── i tasti nuovi: il nome SENZA il brand, che lo dice il logo
insert into marg_items (name, category_id, brand, codice_magazzino, reparto, vat_rate, active, sort_order, cost_mode, icon)
select v.nome, c.id, 'Vodafone', v.codice, 1, 0, true, v.ordine, 'costo_fisso', '📶'
  from (values
    ('Sim Next',       '821335', 'SIM',  20),
    ('E-Sim Business', '820510', 'ESIM', 10),
    ('E-Sim Next',     '821339', 'ESIM', 20)
  ) as v(nome, codice, cat, ordine)
  join marg_categories c on c.name = v.cat
 where exists (select 1 from mag_articoli a where a.codice = v.codice and a.attivo)
   and not exists (select 1 from marg_items m where m.name = v.nome);

-- ── i tre vecchi escono dai pulsanti, ma restano per il flusso di brand
update marg_items set mostra_in_cassa = false
 where name in ('Sim Vodafone', 'Sost Vodafone', 'ESIM Vodafone');

-- ⏳ RESTA DA FARE, appena arriva il listino:
--    · creare l'articolo 820462 «Sim Bus. Vodafone» (serve prezzo e costo)
--      e la sua voce nella categoria SIM con ordine 10;
--    · creare l'articolo della E-SIM WindTre, che oggi non esiste: in
--      anagrafica c'è solo la SOSTITUTIVA (ESIMSOST15EW3), non la nuova.
