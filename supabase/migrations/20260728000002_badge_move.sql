-- 096: TRASLOCO del Badge da Collaboratori all'hub CALL CENTER (Luca 28/07).
-- Le righe di role_permissions traslano alla nuova chiave: chi vedeva/faceva
-- prima, vede/fa uguale dopo — nessun permesso perso, nessun default cambiato.
UPDATE public.role_permissions SET perm_key='/caller?tab=badge'
  WHERE perm_key='/collaboratori?tab=badge';
UPDATE public.role_permissions SET perm_key=replace(perm_key,'cap:/collaboratori?tab=badge:','cap:/caller?tab=badge:')
  WHERE perm_key LIKE 'cap:/collaboratori?tab=badge:%';
NOTIFY pgrst, 'reload schema';
