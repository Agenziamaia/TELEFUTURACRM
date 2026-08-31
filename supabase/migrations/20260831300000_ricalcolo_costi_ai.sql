-- LO STORICO DEI COSTI AI, RICALCOLATO COL LISTINO VERO (31/08).
--
-- Luca ha aperto il cruscotto di DeepSeek: loro 0,65 $, noi 0,32 €. Con i
-- token quasi uguali (1,83M contro 1,96M: ne registriamo il 93%), quindi non
-- era un problema di misura — era il PREZZO. Nel codice c'era 0,14/0,28 per
-- milione, vecchio; i prezzi veri sono 0,22 in ingresso e 0,66 in uscita.
--
-- Verifica: sui token di oggi (1.207.747 in + 621.931 out) il listino nuovo
-- fa 0,676 $, contro i 0,65 del loro cruscotto. Torna.
--
-- Le righe già scritte hanno il costo sbagliato, ma i TOKEN giusti — quindi
-- il conto si rifà. Un registro che sbaglia del doppio è peggio di non
-- averlo: fa prendere decisioni sbagliate con sicurezza.
--
-- ⚠️ Le righe che hanno già `prezzo_in_mtok` valorizzato NON si toccano: quel
-- listino è quello con cui sono nate, ed è il senso di averlo congelato. Si
-- ricalcolano solo quelle vecchie, che un prezzo non l'hanno mai avuto.

update ai_usage
   set prezzo_in_mtok  = 0.22,
       prezzo_out_mtok = 0.66,
       cost_usd  = (coalesce(prompt_tokens,0) / 1e6) * 0.22
                 + (coalesce(completion_tokens,0) / 1e6) * 0.66,
       cambio_eur = 0.92,
       costo_eur = ((coalesce(prompt_tokens,0) / 1e6) * 0.22
                 + (coalesce(completion_tokens,0) / 1e6) * 0.66) * 0.92
 where prezzo_in_mtok is null
   and model in ('deepseek-v4-flash', 'deepseek-chat')
   and (coalesce(prompt_tokens,0) > 0 or coalesce(completion_tokens,0) > 0);

update ai_usage
   set prezzo_in_mtok  = 0.66,
       prezzo_out_mtok = 1.98,
       cost_usd  = (coalesce(prompt_tokens,0) / 1e6) * 0.66
                 + (coalesce(completion_tokens,0) / 1e6) * 1.98,
       cambio_eur = 0.92,
       costo_eur = ((coalesce(prompt_tokens,0) / 1e6) * 0.66
                 + (coalesce(completion_tokens,0) / 1e6) * 1.98) * 0.92
 where prezzo_in_mtok is null
   and model in ('deepseek-v4-pro', 'deepseek-reasoner')
   and (coalesce(prompt_tokens,0) > 0 or coalesce(completion_tokens,0) > 0);
