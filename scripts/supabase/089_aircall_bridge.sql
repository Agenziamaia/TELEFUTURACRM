-- 089: FASE 2 Aircall — ponte verso la sezione Caller (conferma Luca 26/07).
-- bridged: l'evento telefonico e' gia' stato riversato sulla pratica (il webhook
-- riceve piu' eventi per chiamata: il ponte gira UNA volta, sul terminale).
-- da_esitare: chiamata RISPOSTA in attesa dell'esito del caller (nessun nuovo
-- stato in lista: e' un flag, lo stato lo sceglie il caller).
ALTER TABLE public.call_events ADD COLUMN IF NOT EXISTS bridged BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS da_esitare BOOLEAN NOT NULL DEFAULT false;
NOTIFY pgrst, 'reload schema';
