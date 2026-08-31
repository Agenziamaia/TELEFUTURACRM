-- «CI HO GIÀ PROVATO E NON C'ERA PIÙ» (31/08).
--
-- Il recupero delle foto perse girava a vuoto: prendeva sempre le stesse
-- conversazioni — le più recenti con un buco — e su quelle riprovava all'
-- infinito due media che WhatsApp non ha più. Otto giri, zero recuperi.
--
-- Manca il ricordo del tentativo. Senza, «da recuperare» e «non recuperabile»
-- sono la stessa cosa, e la coda non avanza mai.
alter table wa_messages add column if not exists media_tentato_il timestamptz;

comment on column wa_messages.media_tentato_il is
  'Quando si è provato a ripescare il file da WhatsApp senza riuscirci (media scaduto sul loro CDN). Serve a non riprovare in eterno gli stessi: chi cerca i media da recuperare deve escludere le righe che ce l''hanno.';
