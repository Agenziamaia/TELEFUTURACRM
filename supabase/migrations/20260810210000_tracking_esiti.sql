-- TRACKING ESITI (MOD-28, Luca 10/08): gli esiti negozio del Tracking PDA
-- diventano AMMINISTRABILI per categoria (pannello Amministrazione → Tracking
-- PDA): etichetta, colore, ordine, voce attiva/spenta e il flag COMPLETATA
-- (= fine del processo: la pratica sparisce dalla lista attiva ed entra nella
-- coda di verifica amministrazione; pilota anche il filtro "Mostra completate"
-- e lo stop del malus).
--
-- La CHIAVE nasce col seed (o dall'etichetta alla creazione) e NON si tocca:
-- e' il valore persistito su contracts.stato_negozio / stati_categoria, quindi
-- rinominare cambia solo la resa a schermo. Il seed fotografa le liste
-- hardcoded storiche (trackingConstants.ts), flag completata compreso
-- (STATI_COMPLETATI + statiCompletatiNegozio, ora unificati qui).

CREATE TABLE IF NOT EXISTS public.tracking_esiti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text NOT NULL,
  chiave text NOT NULL,
  etichetta text NOT NULL,
  colore text NOT NULL DEFAULT 'var(--tf-94a3b8)',
  bg text NOT NULL DEFAULT 'var(--tf-1e293b)',
  ordine int NOT NULL DEFAULT 0,
  attiva boolean NOT NULL DEFAULT true,
  completata boolean NOT NULL DEFAULT false,
  UNIQUE (categoria, chiave)
);

ALTER TABLE public.tracking_esiti ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tracking_esiti_all ON public.tracking_esiti FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── SEED: fotografa le liste hardcoded (idempotente) ──
INSERT INTO public.tracking_esiti (categoria, chiave, etichetta, colore, bg, ordine, completata) VALUES
  -- MNP (base meno doc_mancante/contattare_supporto + re_inserita)
  ('mnp', 'nuovo',              'Nuovo',               'var(--tf-94a3b8)', 'var(--tf-1e293b)', 10, false),
  ('mnp', 'contattare_cliente', 'Contattato Cliente',  'var(--tf-f59e0b)', 'var(--tf-451a03)', 20, false),
  ('mnp', 'in_corso',           'In Corso',            'var(--tf-3b82f6)', 'var(--tf-172554)', 30, false),
  ('mnp', 'attivato',           'Completato',          'var(--tf-22c55e)', 'var(--tf-052e16)', 40, true),
  ('mnp', 'ko',                 'KO',                  'var(--tf-ef4444)', 'var(--tf-450a0a)', 50, false),
  ('mnp', 're_inserita',        'Re-Inserita',         'var(--tf-38bdf8)', 'var(--tf-0c2a3f)', 60, true),
  -- FISSO / FIBRA
  ('fisso', 'nuovo',               'Nuovo',                 'var(--tf-94a3b8)', 'var(--tf-1e293b)', 10, false),
  ('fisso', 'contattare_cliente',  'Contattato Cliente',    'var(--tf-f59e0b)', 'var(--tf-451a03)', 20, false),
  ('fisso', 'contattare_supporto', 'Contattato Supporto',   'var(--tf-f97316)', 'var(--tf-431407)', 30, false),
  ('fisso', 'in_corso',            'In Corso',              'var(--tf-3b82f6)', 'var(--tf-172554)', 40, false),
  ('fisso', 'attivato',            'Completato',            'var(--tf-22c55e)', 'var(--tf-052e16)', 50, true),
  ('fisso', 'ko',                  'KO Ripensamento',       'var(--tf-ef4444)', 'var(--tf-450a0a)', 60, false),
  ('fisso', 'ko_ripensamento',     'KO Ripensamento',       'var(--tf-ef4444)', 'var(--tf-450a0a)', 70, false),
  ('fisso', 'ko_tecnico',          'KO Tecnico Definitivo', 'var(--tf-dc2626)', 'var(--tf-3f0a0a)', 80, false),
  ('fisso', 'ko_reinserito',       'KO Reinserito',         'var(--tf-f97316)', 'var(--tf-431407)', 90, false),
  ('fisso', 'ricaduta',            'Ricaduta',              'var(--tf-a78bfa)', 'var(--tf-2e1065)', 100, false),
  -- FINANZIAMENTO
  ('finanziamento', 'nuovo',               'Nuovo',               'var(--tf-94a3b8)', 'var(--tf-1e293b)', 10, false),
  ('finanziamento', 'otp_mancante',        'OTP Mancante',        'var(--tf-f59e0b)', 'var(--tf-451a03)', 20, false),
  ('finanziamento', 'liquidato',           'Liquidato',           'var(--tf-22c55e)', 'var(--tf-052e16)', 30, true),
  ('finanziamento', 'annullato',           'Annullato',           'var(--tf-ef4444)', 'var(--tf-450a0a)', 40, false),
  ('finanziamento', 'cartaceo',            'Cartaceo',            'var(--tf-e879f9)', 'var(--tf-3b0764)', 50, false),
  ('finanziamento', 'in_liquidazione',     'In Liquidazione',     'var(--tf-3b82f6)', 'var(--tf-172554)', 60, false),
  ('finanziamento', 'doc_mancante',        'Doc Mancante',        'var(--tf-fb923c)', 'var(--tf-431407)', 70, false),
  ('finanziamento', 'contattare_supporto', 'Contattato Supporto', 'var(--tf-f97316)', 'var(--tf-431407)', 80, false),
  ('finanziamento', 'modulo_win_back',     'Modulo Win Back',     'var(--tf-818cf8)', 'var(--tf-1e1b4b)', 90, false),
  -- P.IVA
  ('piva', 'nuovo',                 'Nuovo',                 'var(--tf-94a3b8)', 'var(--tf-1e293b)', 10, false),
  ('piva', 'contattare_cliente',    'Contattato Cliente',    'var(--tf-f59e0b)', 'var(--tf-451a03)', 20, false),
  ('piva', 'contattare_supporto',   'Contattato Supporto',   'var(--tf-f97316)', 'var(--tf-431407)', 30, false),
  ('piva', 'in_lavorazione',        'In Lavorazione',        'var(--tf-3b82f6)', 'var(--tf-172554)', 40, false),
  ('piva', 'cliente_irreperibile',  'Cliente Irreperibile',  'var(--tf-e879f9)', 'var(--tf-3b0764)', 50, false),
  ('piva', 'in_attesa_dispositivo', 'In Attesa Dispositivo', 'var(--tf-38bdf8)', 'var(--tf-0c2a3f)', 60, false),
  ('piva', 'attivato',              'Completato',            'var(--tf-22c55e)', 'var(--tf-052e16)', 70, true),
  ('piva', 'ko_tecnico_piva',       'KO Tecnico',            'var(--tf-dc2626)', 'var(--tf-3f0a0a)', 80, false),
  ('piva', 'ko_credito',            'KO Credito',            'var(--tf-f97316)', 'var(--tf-431407)', 90, false),
  ('piva', 'ko_reinserito_piva',    'KO Reinserito',         'var(--tf-a78bfa)', 'var(--tf-2e1065)', 100, false),
  -- ENERGIA
  ('energia', 'nuovo',               'Nuovo',               'var(--tf-94a3b8)', 'var(--tf-1e293b)', 10, false),
  ('energia', 'contattare_cliente',  'Contattato Cliente',  'var(--tf-f59e0b)', 'var(--tf-451a03)', 20, false),
  ('energia', 'contattare_supporto', 'Contattato Supporto', 'var(--tf-f97316)', 'var(--tf-431407)', 30, false),
  ('energia', 'doc_mancante',        'Doc Mancante',        'var(--tf-e879f9)', 'var(--tf-3b0764)', 40, false),
  ('energia', 'in_lavorazione_en',   'In Lavorazione',      'var(--tf-3b82f6)', 'var(--tf-172554)', 50, false),
  ('energia', 'attivato',            'Completato',          'var(--tf-22c55e)', 'var(--tf-052e16)', 60, true),
  ('energia', 'ko',                  'KO',                  'var(--tf-ef4444)', 'var(--tf-450a0a)', 70, false),
  ('energia', 'ko_verifica_email',   'KO Verifica Email',   'var(--tf-dc2626)', 'var(--tf-3f0a0a)', 80, false),
  ('energia', 'ko_credito_en',       'KO Credito',          'var(--tf-f97316)', 'var(--tf-431407)', 90, false),
  ('energia', 'inserimento_errato',  'Inserimento Errato',  'var(--tf-fb923c)', 'var(--tf-431407)', 100, false),
  ('energia', 'ko_reinserito_en',    'KO Reinserito',       'var(--tf-a78bfa)', 'var(--tf-2e1065)', 110, false),
  ('energia', 'ko_mancanza_firma',   'KO Mancanza Firma',   'var(--tf-e879f9)', 'var(--tf-4a044e)', 120, false),
  ('energia', 'ko_sii',              'KO dal Sii',          'var(--tf-dc2626)', 'var(--tf-3f0a0a)', 130, false),
  -- SKY / TV
  ('sky', 'nuovo',               'Nuovo',                   'var(--tf-94a3b8)', 'var(--tf-1e293b)', 10, false),
  ('sky', 'contattare_cliente',  'Contattato Cliente',      'var(--tf-f59e0b)', 'var(--tf-451a03)', 20, false),
  ('sky', 'in_attivazione_sky',  'In Attivazione',          'var(--tf-3b82f6)', 'var(--tf-172554)', 30, false),
  ('sky', 'wm_sospetta',         'WM Sospetta',             'var(--tf-f97316)', 'var(--tf-431407)', 40, false),
  ('sky', 'wm_confermata',       'TV WM - BB in Corso',     'var(--tf-fb923c)', 'var(--tf-451a03)', 50, false),
  ('sky', 'tv_wm_bb_ok',         'TV WM - BB Ok',           'var(--tf-4ade80)', 'var(--tf-052e16)', 60, false),
  ('sky', 'completo_sky',        'Completo',                'var(--tf-22c55e)', 'var(--tf-052e16)', 70, true),
  ('sky', 'attesa_matricola',    'Attesa Matricola',        'var(--tf-38bdf8)', 'var(--tf-0c2a3f)', 80, false),
  ('sky', 'ripensamento_sky',    'Ripensamento Cliente',    'var(--tf-e879f9)', 'var(--tf-3b0764)', 90, false),
  ('sky', 'attivo_sky',          'Attivo',                  'var(--tf-4ade80)', 'var(--tf-052e16)', 100, true),
  ('sky', 'ko_frode_mop',        'KO Frode MOP',            'var(--tf-dc2626)', 'var(--tf-3f0a0a)', 110, false),
  ('sky', 'ko_reinserito_sky',   'KO Reinserito',           'var(--tf-a78bfa)', 'var(--tf-2e1065)', 120, false),
  ('sky', 'aperto_sparks',       'Aperto Sparks',           'var(--tf-fbbf24)', 'var(--tf-451a03)', 130, false),
  ('sky', 'recesso_info_errate', 'Recesso per Info Errate', 'var(--tf-f43f5e)', 'var(--tf-4c0519)', 140, false),
  -- MOBILE / SOLUZIONI DIGITALI / MULTI-SERVIZI / POS (lista base)
  ('mobile', 'nuovo',               'Nuovo',               'var(--tf-94a3b8)', 'var(--tf-1e293b)', 10, false),
  ('mobile', 'contattare_cliente',  'Contattato Cliente',  'var(--tf-f59e0b)', 'var(--tf-451a03)', 20, false),
  ('mobile', 'contattare_supporto', 'Contattato Supporto', 'var(--tf-f97316)', 'var(--tf-431407)', 30, false),
  ('mobile', 'doc_mancante',        'Doc Mancante',        'var(--tf-e879f9)', 'var(--tf-3b0764)', 40, false),
  ('mobile', 'in_corso',            'In Corso',            'var(--tf-3b82f6)', 'var(--tf-172554)', 50, false),
  ('mobile', 'attivato',            'Completato',          'var(--tf-22c55e)', 'var(--tf-052e16)', 60, true),
  ('mobile', 'ko',                  'KO',                  'var(--tf-ef4444)', 'var(--tf-450a0a)', 70, false),
  ('digitale', 'nuovo',               'Nuovo',               'var(--tf-94a3b8)', 'var(--tf-1e293b)', 10, false),
  ('digitale', 'contattare_cliente',  'Contattato Cliente',  'var(--tf-f59e0b)', 'var(--tf-451a03)', 20, false),
  ('digitale', 'contattare_supporto', 'Contattato Supporto', 'var(--tf-f97316)', 'var(--tf-431407)', 30, false),
  ('digitale', 'doc_mancante',        'Doc Mancante',        'var(--tf-e879f9)', 'var(--tf-3b0764)', 40, false),
  ('digitale', 'in_corso',            'In Corso',            'var(--tf-3b82f6)', 'var(--tf-172554)', 50, false),
  ('digitale', 'attivato',            'Completato',          'var(--tf-22c55e)', 'var(--tf-052e16)', 60, true),
  ('digitale', 'ko',                  'KO',                  'var(--tf-ef4444)', 'var(--tf-450a0a)', 70, false),
  ('multi_servizi', 'nuovo',               'Nuovo',               'var(--tf-94a3b8)', 'var(--tf-1e293b)', 10, false),
  ('multi_servizi', 'contattare_cliente',  'Contattato Cliente',  'var(--tf-f59e0b)', 'var(--tf-451a03)', 20, false),
  ('multi_servizi', 'contattare_supporto', 'Contattato Supporto', 'var(--tf-f97316)', 'var(--tf-431407)', 30, false),
  ('multi_servizi', 'doc_mancante',        'Doc Mancante',        'var(--tf-e879f9)', 'var(--tf-3b0764)', 40, false),
  ('multi_servizi', 'in_corso',            'In Corso',            'var(--tf-3b82f6)', 'var(--tf-172554)', 50, false),
  ('multi_servizi', 'attivato',            'Completato',          'var(--tf-22c55e)', 'var(--tf-052e16)', 60, true),
  ('multi_servizi', 'ko',                  'KO',                  'var(--tf-ef4444)', 'var(--tf-450a0a)', 70, false),
  ('pos', 'nuovo',               'Nuovo',               'var(--tf-94a3b8)', 'var(--tf-1e293b)', 10, false),
  ('pos', 'contattare_cliente',  'Contattato Cliente',  'var(--tf-f59e0b)', 'var(--tf-451a03)', 20, false),
  ('pos', 'contattare_supporto', 'Contattato Supporto', 'var(--tf-f97316)', 'var(--tf-431407)', 30, false),
  ('pos', 'doc_mancante',        'Doc Mancante',        'var(--tf-e879f9)', 'var(--tf-3b0764)', 40, false),
  ('pos', 'in_corso',            'In Corso',            'var(--tf-3b82f6)', 'var(--tf-172554)', 50, false),
  ('pos', 'attivato',            'Completato',          'var(--tf-22c55e)', 'var(--tf-052e16)', 60, true),
  ('pos', 'ko',                  'KO',                  'var(--tf-ef4444)', 'var(--tf-450a0a)', 70, false)
ON CONFLICT (categoria, chiave) DO NOTHING;

NOTIFY pgrst, 'reload schema';
