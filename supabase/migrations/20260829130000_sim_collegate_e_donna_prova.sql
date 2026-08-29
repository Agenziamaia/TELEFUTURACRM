-- ═══════════════════════════════════════════════════════════════════════════
-- LE SIM COLLEGATE AL MAGAZZINO, E DONNA CHE STAMPA IN PROVA (Luca 29/08)
--
-- 1. «Donna Olimpia deve stampare dalle stampanti fiscali, ma non deve essere
--    fiscale, così intanto testiamo tutto.» Non era configurato così: la
--    tabella era VUOTA, quindi il negozio non era acceso per niente e la
--    schermata Incasso & Scontrino non si apriva nemmeno. Ora si accende in
--    PROVA: i registratori sono già configurati (T2 Telefutura 2 su
--    192.168.1.50, predefinita; T1 Telefutura su 192.168.1.219) e stampano
--    «DOCUMENTO NON FISCALE». Per passare al fiscale basterà mettere
--    `test_mode = false` su questa riga — nient'altro.
--
-- 2. «Collegami i pulsanti alle varie SIM che trovi in magazzino.» Fatto per
--    nome: le descrizioni dell'anagrafica dicono operatore e tipo, e dove lo
--    dicono senza ambiguità il legame è quello. QUATTRO restano scollegate,
--    e sono elencate in fondo: non perché sia difficile, ma perché indovinare
--    quale articolo esce dall'inventario è il modo di sbagliare in silenzio.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. DONNA IN PROVA (test_mode ha default true: si accende, non si finge)
insert into pos_scontrino_negozi (negozio, test_mode)
select 'Donna', true
where not exists (select 1 from pos_scontrino_negozi where negozio = 'Donna');

-- ── 2. IL PULSANTE E IL SUO ARTICOLO
--    Ogni riga: la voce a marginalità → il codice di magazzino, e il perché.
update marg_items i set codice_magazzino = v.codice
  from (values
    -- Fastweb: nome esatto, «SOST» per la sostitutiva, «ESIM» per la eSIM
    ('Sim Fastweb',       '60A001'),                      -- SIM FASTWEB
    ('Sost Fastweb',      'SOSTFASTW'),                   -- SOSTFASTWEB
    ('ESIM Fastweb',      'ESIMFASTW'),                   -- ESIMFASTW
    -- WindTre: nell'anagrafica si chiama «WT» e «W3»
    ('Sim Wind3',         'KITSIMWTWINDBASIC1EWIND'),     -- KIT SIM WT WIND BASIC 1 Euro
    ('Sost Wind3',        'SIM4GPRESOSTNOPINWT'),         -- SIM 4G PRE SOSTITUTIVA NO PIN WT
    ('ESIM Sost Windtre', 'ESIMSOST15EW3'),               -- eSIM Voucher Sostitutiva 15E W3
    -- Vodafone: un solo articolo lo nomina per esteso
    ('Sim Vodafone',      'SIMUNICATRIO4G128KVODAFONE'),  -- Sim Unica Trio 4G 128K Vodafone
    -- TIM
    ('Sim TIM',           '785689'),                      -- SIM TIM
    ('Sost TIM',          '779844'),                      -- SOSTITUTIVE TIM
    -- Very: «Triplecut Sostitutiva» è la sostitutiva, l'altra è la nuova
    ('Sim Very',          '0U4K01C1009007'),              -- SIM VERY MOBILE
    ('Sost Very',         'SIMTRIPLECUTSOSTVERY'),        -- SIM Triplecut Sostitutiva VERY
    -- operatori con un articolo solo: nessun dubbio possibile
    ('Sim Ho.',           '821328'),                      -- SIM HO MOBILE
    ('Sim Iliad',         'SIMILIAD'),                    -- SIMILIAD (ATTIVAZIONEILIAD è un servizio, non una SIM)
    ('Sim Kena',          'SIMKENA'),                     -- SIMKENA
    ('Sim Sky',           'simsky'),                      -- SIMSKY
    ('Sim L',             'SimL')                         -- SimL — stesso nome
  ) as v(nome, codice)
 where i.name = v.nome
   and exists (select 1 from mag_articoli a where a.codice = v.codice and a.attivo);

-- ── LE QUATTRO CHE RESTANO SCOLLEGATE, e perché
--    · «Sost Vodafone»      → in anagrafica non esiste una sostitutiva Vodafone
--    · «ESIM Windtre»       → esiste solo la eSIM SOSTITUTIVA W3, non la nuova
--    · «ESIM Sost Fastweb»  → non esiste una eSIM sostitutiva Fastweb
--    · «ESIM Vodafone»      → ce ne sono DUE e non si può scegliere a caso:
--        820510 «eSIM Voucher 128K» (1 pezzo) e 821339 «eSim Next» (17).
--        Sono due famiglie d'offerta diverse, come lo sono le due SIM fisiche
--        Vodafone a scaffale: «Unica Trio 4G 128K» (151) e «SIM TRIO NEXT»
--        (46). Un pulsante solo non le copre entrambe.
--    Restano vendibili dalla ricerca, che le trova tutte.
