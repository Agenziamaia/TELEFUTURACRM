-- I DEPOSITI SI LEGGONO SOLO DAL CUSTODE (31/08, secondo giro di revisione).
--
-- Stamattina ho reso privati undici depositi su dodici e ho messo davanti una
-- rotta che chiede chi sei. Il revisore ha guardato la porta accanto:
--
--   le regole di lettura dicevano «basta essere collegati».
--
-- Cioè: un venditore qualunque, con lo stesso lasciapassare che il CRM gli dà
-- per lavorare, apre la console del browser e chiede lui stesso un indirizzo
-- firmato per QUALUNQUE file. Provato dal revisore: 8.710 allegati di posta,
-- 6.867 contratti, 487 media di WhatsApp — tutti visibili, tutti scaricabili.
--
-- Il custode controllava chi può vedere cosa, ma nessuno era obbligato a
-- passarci. Era teatro.
--
-- ⚠️ QUI SI TOGLIE LA LETTURA, NON LA SCRITTURA. Caricare un file resta come
-- prima — l'upload passa dalle regole di INSERT, che non si toccano — e così
-- il caricamento dell'allegato, la foto del profilo, il documento dal
-- telefono del cliente col QR. Cambia solo chi può CHIEDERE un file: da oggi
-- il solo server, dentro `/api/file`, dopo aver controllato che sia tuo.

do $$
declare r record;
begin
  /* le regole di lettura, una per deposito, tutte con la stessa formula
     cieca. Si spengono tutte insieme: lasciarne una viva vanificherebbe le
     altre, perché basta un deposito aperto per firmare i suoi file. */
  for r in select policyname from pg_policies
            where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

/* ⚠️ E NIENTE POLICY DI LETTURA AL POSTO LORO: senza policy, `authenticated`
   e `anon` non leggono nulla — è il modo in cui funziona la protezione a
   livello di riga. Il custode gira con la chiave di servizio, che le regole
   le scavalca per costruzione: lui continua a firmare, e prima di farlo
   chiede a `tf_puo_vedere_file` di chi è quel file.

   Chi domani aggiunge un deposito NON deve aggiungere una regola di lettura:
   deve aggiungere il deposito a `REGOLE` dentro /api/file. Se si ritrova a
   scrivere «for select using (tf_uid() is not null)», sta riaprendo questa
   porta — è successo il 31/08 con `avanzamenti-files`. */

-- ── e la difesa in profondità sulla tabella che governa le iscrizioni ────
/* `email_account_users` dava TRUNCATE ad anon e authenticated, e TRUNCATE non
   fa scattare la guardia per riga: svuotarla azzererebbe tutte le iscrizioni
   alle caselle. Dal browser non è raggiungibile — PostgREST non ha quel verbo
   — ma un privilegio che non serve a nessuno non ha motivo di restare. */
revoke truncate on table public.email_account_users from anon, authenticated;
revoke insert, update, delete on table public.email_account_users from anon;
