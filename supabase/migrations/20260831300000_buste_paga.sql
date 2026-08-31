-- LE BUSTE PAGA HANNO UNA SEZIONE, E DENTRO I MESI (Luca 31/08).
--
-- «Le abbiamo messe dentro "altri allegati" perché non avevamo creato una
-- sezione apposita. Va creata, e dentro vanno create delle sottocartelle con i
-- mesi, così mese su mese quando allego la busta paga mi chiede anche la
-- mensilità ed è tutto bello ordinato.»
--
-- La sottocartella è una COLONNA, non una cartella vera: `mese`. Un allegato
-- appartiene a un mese, e l'interfaccia li raggruppa. Così cambiare mese a un
-- file è un clic e non una spostata di file nel deposito — e il deposito
-- resta esattamente com'è.
alter table user_attachments add column if not exists mese date;
comment on column user_attachments.mese is
  'La mensilità dell''allegato (primo del mese). Vale per le buste paga: l''interfaccia le raggruppa per mese. NULL = mensilità non assegnata.';

create index if not exists idx_user_att_mese on user_attachments (category, mese desc);

-- ── LE 40 GIÀ CARICATE ───────────────────────────────────────────────────
-- Stanno in «altri» e sono buste paga: si spostano nella sezione giusta.
-- LA MENSILITÀ SOLO A CHI NE HA UNA SOLA. Luca dice che sono di luglio
-- («l'hanno messa in ritardo»), e per i 24 collaboratori con un file solo la
-- cosa torna. Ma otto ne hanno DUE (predica1/predica2, damiano/damiano2…), e
-- due buste paga dello stesso mese non esistono: quelle restano senza
-- mensilità, con la loro riga che lo dice, e la si assegna guardandole.
-- Indovinare avrebbe voluto dire scrivere un dato falso in un posto dove poi
-- si va a cercare la verità.
update user_attachments a
   set category = 'busta_paga',
       mese = case when (select count(*) from user_attachments b
                          where b.user_id = a.user_id and b.category = 'altri') = 1
                   then date '2026-07-01' else null end
 where a.category = 'altri';
