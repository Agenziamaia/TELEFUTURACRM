-- ═══════════════════════════════════════════════════════════════════════════
-- LA SOCIETÀ RESTA ANCHE DENTRO IL NEGOZIO UNIFICATO — 02/09/2026
--
-- Luca vuole due cose che sembrano in contrasto, e non lo sono:
--   «per le funzionalità dev'essere un punto vendita solo»
--   «sul pannello amministrativo devo poter vedere i negozi separati, per la
--    gestione dei costi... e dentro Fiscalità, perché fanno riferimento a due
--    società diverse che hanno due casse fiscali diverse»
--
-- Il modo per averle tutte e due è lo stesso già usato per la merce: **il
-- negozio è uno, la società è una colonna**. Fondere le righe dei negozi senza
-- questo passaggio perderebbe proprio la divisione che serve:
--
--  ① I COSTI sono agganciati alla RIGA del negozio (`store_cost_items.store_id`
--     → `stores.id`), e la tabella non sa niente di società. L'affitto di
--     Magliana oggi è spaccato in 10.107,48 € a Telefutura 1 e 10.107,51 a
--     Telefutura 2 SOLO perché ci sono due righe di negozio. Fondendole
--     diventerebbe una voce sola senza società: 108 voci su 306 sono così.
--
--  ② L'INTERRUTTORE FISCALE (`pos_scontrino_negozi`) ha per chiave il solo
--     nome del negozio: un locale con due registratori non può tenerne uno in
--     prova e uno in fiscale. Oggi non serve — tutti e 15 sono in fiscale — ma
--     il giorno che si sostituisce una cassa serve, e serve proprio in un
--     locale doppio.
--
-- Le colonne nascono col valore che rende il comportamento IDENTICO a oggi.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① I COSTI SANNO DI CHI SONO ─────────────────────────────────────────────
alter table public.store_cost_items add column if not exists azienda text;

comment on column public.store_cost_items.azienda is
  'La società che sostiene questa voce di costo. Serve a tenere separati affitto, utenze e assicurazione delle due società che convivono nello stesso locale, anche quando il negozio in anagrafica è uno solo.';

-- il valore di oggi è quello dell'insegna a cui la voce è appesa
update public.store_cost_items c
   set azienda = s.azienda
  from public.stores s
 where s.id = c.store_id and c.azienda is null and s.azienda is not null;

-- ── ② L'INTERRUTTORE FISCALE È DELLA CASSA, NON DEL NEGOZIO ─────────────────
alter table public.pos_scontrino_negozi add column if not exists azienda text;

comment on column public.pos_scontrino_negozi.azienda is
  'La società del registratore a cui si riferisce questo interruttore. NULL = vale per tutte le casse del negozio, che è il comportamento storico e resta il caso normale.';
