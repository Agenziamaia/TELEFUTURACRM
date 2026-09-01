-- ═══════════════════════════════════════════════════════════════════════════
-- IL CONTO SOSPESO SI RICORDA I TELEFONI — 01/09/2026
--
-- Un conto in sospeso salvava le righe dello scontrino ma non i telefoni a
-- rate. Riprendendolo, la divisione del pagamento spariva: la riga del
-- telefono tornava a prezzo pieno, senza la riga «Finanziamento» in sola
-- lettura, e l'operatore la assegnava a mano. Con i contanti la cassa
-- automatica chiedeva al cliente 899 € invece dei 100 di anticipo, e i 799
-- della finanziaria uscivano certificati come incassati.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.vendite_sospese add column if not exists telefoni jsonb;
comment on column public.vendite_sospese.telefoni is
'I telefoni a rate/finanziati del conto sospeso: senza, riprendendolo si perde la divisione del pagamento fra anticipo e finanziato.';
