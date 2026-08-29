-- ═══════════════════════════════════════════════════════════════════════════
-- TUTTE LE SIM SONO ESENTI IVA (Luca, 29/08)
--
-- Stamattina i reparti IVA mancanti del magazzino erano stati assegnati
-- dall'anagrafica del fornitore (ART.74 → reparto 1 «Non soggetta», N2), e
-- restava aperta una divergenza: in `marg_items` le stesse voci — «Sim
-- Fastweb», «Sim Wind3», «Sost Vodafone» — erano a reparto 2, cioè IVA 22%.
-- La stessa SIM usciva al 22% se battuta dalla scorciatoia e non soggetta se
-- battuta dal magazzino. Le due strade non si incrociavano solo perché le
-- descrizioni differiscono per maiuscole («SIM FASTWEB» ≠ «Sim Fastweb»).
--
-- Luca ha sciolto il nodo: **tutte le SIM sono esenti**. Quindi è la
-- scorciatoia a essere sbagliata, non il magazzino — e le 20 voci delle
-- categorie SIM ed ESIM passano al reparto 1, come i 23 articoli ART.74.
--
-- COSA NON È UNA SIM (controllato uno per uno, restano al 22%):
--   · «Chiusura Sim/Fisso» — è un servizio, non la vendita di una SIM
--   · ADATTSIM, TEKITSIMADAPTK — adattatori, cioè plastica
--   · KASKOSV — un'assicurazione (sta nel gruppo «Usim» per come è
--     classificata a listino, ma SIM non è)
--   · 13024332 «Xiaomi Watch 2 Pro E SIM 4G» — è un orologio
-- Nessuno di questi ha pezzi a Donna.
--
-- ⚠️ DA CONTROLLARE SUL REGISTRATORE: il reparto 1 dei misuratori fiscali
-- dev'essere configurato «non soggetta» come dice `pos_reparti`. In tabella
-- esistono anche il reparto 8 «C/VOD · non soggetta» e il 10 «Esente VOD ·
-- non sogg.», entrambi N2: se l'amministrazione vuole le SIM Vodafone su un
-- reparto suo per la riconciliazione, si cambiano solo queste righe.
-- ═══════════════════════════════════════════════════════════════════════════

update marg_items i set reparto = 1, vat_rate = 0
  from marg_categories c
 where c.id = i.category_id
   and c.name in ('SIM', 'ESIM');

-- ── IL CODICE DOPPIO IN cassa_catalogo ────────────────────────────────────
-- Esporre `codice: codice_magazzino` sul ramo servizio ha creato quattro
-- codici presenti DUE volte nella vista (60A001, 785689, PLX, PLKasko). I
-- pulsanti di gruppo cercano l'articolo con `find(x => x.codice === …)` e
-- prendevano il primo che capita: per PLX arrivava prima la riga servizio, a
-- prezzo NULL, e il pulsante mostrava «€ —» aggiungendo al carrello una voce
-- senza prezzo che poi bloccava il salvataggio. L'ordine fra pari non è
-- garantito, quindi poteva cambiare da un caricamento all'altro.
-- Il gemello resta, ma su una colonna sua: chi scarica il magazzino lo legge
-- da lì, la ricerca per codice continua a trovare un articolo solo.
drop view if exists cassa_catalogo;
create view cassa_catalogo as
 select 'p:'::text || a.codice as id,
    'prodotto'::text as natura,
    a.codice, a.barcode,
    a.descrizione as nome,
    coalesce(nullif(a.sottogruppo,''), nullif(a.gruppo,''), 'Altro') as famiglia,
    a.marca, a.gruppo, a.prezzo,
    case when a.costo_ultimo >= 0 and a.costo_ultimo <= 5000 then a.costo_ultimo else null end as costo,
    null::numeric as iva,
    a.reparto,
    a.iva_vendita as regime_iva,
    true as scarica_magazzino,
    a.prezzo_modificabile,
    a.attivo,
    a.azienda,
    a.codice as codice_scarico
   from mag_articoli a
  where a.attivo
union all
 select 's:'::text || i.id::text as id,
    'servizio'::text as natura,
    null::text as codice,
    null::text as barcode,
    i.name as nome,
    coalesce(c.name,'Servizi') as famiglia,
    i.brand as marca,
    coalesce(c.name,'Servizi') as gruppo,
    i.default_price as prezzo,
    i.company_cost as costo,
    i.vat_rate as iva,
    i.reparto,
    null::text as regime_iva,
    false as scarica_magazzino,
    i.prezzo_modificabile,
    i.active as attivo,
    null::text as azienda,
    i.codice_magazzino as codice_scarico
   from marg_items i
   left join marg_categories c on c.id = i.category_id
  where i.active;

grant select on cassa_catalogo to anon, authenticated;
