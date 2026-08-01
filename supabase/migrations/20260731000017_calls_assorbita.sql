-- Mig. 123 (Luca 31/07): pratiche caller ASSORBITE. Quando il cliente ha
-- risposto su una riga (esito vero), le altre pratiche dello stesso CF ferme
-- su "Nuovo" o sui non-risposto vengono marcate con l'id della riga vincente:
-- spariscono dalla sezione caller ma restano a database (storico cliente:
-- "l'ho chiamato su tre numeri").

alter table public.calls add column if not exists assorbita_da text;
