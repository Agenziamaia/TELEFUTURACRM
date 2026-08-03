-- 142: ALIAS UTENTE (03/08, richiesta delicata di Luca — privacy di una
-- persona che non vuole esporre il proprio storico). Compilando l'alias dal
-- pannello Utenti, l'alias diventa L'UNICO nome presente in ogni sezione del
-- gestionale: il nome precedente viene sostituito in TUTTE le colonne di
-- testo e jsonb del DB, e si conserva SOLO in app_users.nome_riservato,
-- visibile alla sola amministrazione nella scheda utente. Il login non si
-- tocca (avviene per email). match_name si azzera: non deve trapelare.
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS nome_riservato TEXT;

CREATE OR REPLACE FUNCTION public.applica_alias(p_user_id uuid, p_alias text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_vecchio text; v_rec record; v_n int; v_report jsonb := '{}'::jsonb; v_sql text; v_alias text := btrim(coalesce(p_alias, ''));
BEGIN
  SELECT full_name INTO v_vecchio FROM app_users WHERE id = p_user_id;
  IF v_vecchio IS NULL THEN RAISE EXCEPTION 'utente non trovato'; END IF;
  IF v_alias = '' THEN RAISE EXCEPTION 'alias vuoto'; END IF;
  IF v_alias = v_vecchio THEN RAISE EXCEPTION 'alias uguale al nome attuale'; END IF;

  UPDATE app_users
     SET nome_riservato = coalesce(nome_riservato, v_vecchio),
         full_name = v_alias,
         match_name = NULL
   WHERE id = p_user_id;
  v_report := v_report || jsonb_build_object('app_users.full_name', 1);

  -- il vecchio nome sparisce da OGNI colonna testo/jsonb del gestionale
  -- (sostituzione della stringa ESATTA del nome completo)
  FOR v_rec IN
    SELECT c.table_name, c.column_name, c.data_type
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = 'public' AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
     WHERE c.table_schema = 'public'
       AND c.data_type IN ('text', 'character varying', 'jsonb')
       AND NOT (c.table_name = 'app_users' AND c.column_name IN ('full_name', 'nome_riservato', 'password_hash', 'totp_secret'))
  LOOP
    BEGIN
      IF v_rec.data_type = 'jsonb' THEN
        v_sql := format('UPDATE %I SET %I = replace(%I::text, %L, %L)::jsonb WHERE %I::text LIKE %L',
          v_rec.table_name, v_rec.column_name, v_rec.column_name, v_vecchio, v_alias, v_rec.column_name, '%' || v_vecchio || '%');
      ELSE
        v_sql := format('UPDATE %I SET %I = replace(%I, %L, %L) WHERE %I LIKE %L',
          v_rec.table_name, v_rec.column_name, v_rec.column_name, v_vecchio, v_alias, v_rec.column_name, '%' || v_vecchio || '%');
      END IF;
      EXECUTE v_sql;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN
        v_report := v_report || jsonb_build_object(v_rec.table_name || '.' || v_rec.column_name, v_n);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_report := v_report || jsonb_build_object(v_rec.table_name || '.' || v_rec.column_name || ' (SALTATA)', SQLERRM);
    END;
  END LOOP;

  RETURN v_report;
END $$;

GRANT EXECUTE ON FUNCTION public.applica_alias(uuid, text) TO anon;

NOTIFY pgrst, 'reload schema';
