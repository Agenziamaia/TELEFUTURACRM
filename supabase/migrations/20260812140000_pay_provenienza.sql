-- PROVENIENZA nelle gare (esito Luca 12/08 sulla riga TIM/Kena: «la provenienza
-- dell'MNP è un dato fondamentale non solo per TIM ma anche per le altre gare,
-- dobbiamo prenderla e importarla»). Una riga pay può ora valere SOLO per
-- alcune provenienze: lista di token separati da virgola, confrontati per
-- prefisso normalizzato con dettagli->>'Operatore di Provenienza' della vendita
-- (es. "iliad,coop,poste" ↔ "CoopVoce"/"PosteMobile"). NULL = qualsiasi.
-- La riga con provenienza è più specifica e vince sul pari-ancora senza.
alter table pay_righe add column if not exists provenienza text;
comment on column pay_righe.provenienza is
  'Token di provenienza (virgole, prefissi normalizzati) per cui la riga vale — es. TIM MNP +10 da "iliad,coop,poste". NULL = ogni provenienza.';
