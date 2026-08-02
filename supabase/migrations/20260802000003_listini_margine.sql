-- 136: margine percentuale sul prezzo di listino (Luca 02/08)
-- "sul prezzo al pubblico calcoliamo il 4% che e' il margine che abbiamo":
-- la percentuale si imposta all'import (puo' variare per brand/listino) e
-- serve a mostrare il guadagno reale sul terminale in Registra Vendita.
alter table public.listini_terminali add column if not exists margine_pct numeric(5,2) not null default 4;
notify pgrst, 'reload schema';
