-- Mig. 114 — Chat WhatsApp con i NOMI VERI (Luca 31/07/2026): tante
-- conversazioni mostrano il numero al posto del nome. Bonifica:
--  1) si aggancia il cliente dell'anagrafica dove manca (match sulle ultime
--     9 cifre del numero);
--  2) dove il nome e' vuoto o fatto solo di cifre, arriva nome e cognome
--     (o ragione sociale) dall'anagrafica. I nomi scritti A MANO non si
--     toccano. Le nuove chat nascono gia' col nome vero (webhook).

update public.wa_conversations wc
set client_id = c.id
from public.clients c
where wc.client_id is null
  and coalesce(wc.is_group, false) = false
  and length(regexp_replace(coalesce(wc.customer_number, ''), '\D', '', 'g')) >= 6
  and length(regexp_replace(coalesce(c.cellulare, ''), '\D', '', 'g')) >= 6
  and right(regexp_replace(coalesce(c.cellulare, ''), '\D', '', 'g'), 9)
      = right(regexp_replace(wc.customer_number, '\D', '', 'g'), 9);

update public.wa_conversations wc
set customer_name = nullif(trim(coalesce(nullif(c.ragione_sociale, ''), c.nome || ' ' || c.cognome)), '')
from public.clients c
where wc.client_id = c.id
  and (wc.customer_name is null or trim(wc.customer_name) = '' or wc.customer_name ~ '^[+0-9 ]+$')
  and nullif(trim(coalesce(nullif(c.ragione_sociale, ''), c.nome || ' ' || c.cognome)), '') is not null;
