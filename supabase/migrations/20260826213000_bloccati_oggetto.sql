-- MITTENTI BLOCCATI con filtro OGGETTO facoltativo (Luca 26/08 sera:
-- «le mail di suitemobile rispetto ai trasferimenti di merce cestinale») —
-- da suitemobile@mirasolutions.it arrivano 3.389 conversazioni: 3.148
-- «Chiusura Fiscale» (da NON toccare) e 241 «TRASFERIMENTO MERCE IN
-- ENTRATA/USCITA» (da cestinare). Il blocco sul solo mittente era troppo
-- largo: con `oggetto` valorizzato il cestino scatta solo se ANCHE
-- l'oggetto della conversazione contiene quel testo.
alter table email_mittenti_bloccati add column if not exists oggetto text;

-- lo unique sul solo pattern impedirebbe due regole diverse per lo stesso
-- mittente (es. suitemobile+trasferimenti oggi, suitemobile+altro domani)
alter table email_mittenti_bloccati drop constraint if exists email_mittenti_bloccati_pattern_key;
create unique index if not exists email_mittenti_bloccati_pattern_oggetto
  on email_mittenti_bloccati (pattern, coalesce(oggetto, ''));

insert into email_mittenti_bloccati (pattern, oggetto, note, creato_da)
select 'suitemobile', 'trasferimento merce', 'Notifiche automatiche dei trasferimenti di merce del gestionale — cancellare sempre, direttiva Luca 26/08 (le Chiusure Fiscali dello stesso mittente NON si toccano)', 'Luca (direttiva a terminal)'
where not exists (select 1 from email_mittenti_bloccati where pattern = 'suitemobile' and coalesce(oggetto,'') = 'trasferimento merce');
