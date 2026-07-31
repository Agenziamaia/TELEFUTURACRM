-- Mig. 115 — Mini-hub Costi nella sidebar (Luca 31/07/2026): le tre sezioni
-- (negozi, condivisi, altri) diventano SOTTO-VOCI della voce "Costi", come
-- le funzioni di Utenti. Le chiavi di permesso cambiano forma:
--   /amministrazione?sez=negozi     →  /amministrazione?sez=costi&tab=negozi
--   /amministrazione?sez=condivisi  →  /amministrazione?sez=costi&tab=condivisi
--   /amministrazione?sez=altri      →  /amministrazione?sez=costi&tab=altri
-- Qui si MIGRANO le righe gia' presenti in role_permissions cosi' nessuna
-- concessione (o revoca) data dalla rotellina va persa.
insert into public.role_permissions (role, perm_key, allowed, updated_by, updated_at)
select role,
       '/amministrazione?sez=costi&tab=' || substr(perm_key, length('/amministrazione?sez=') + 1),
       allowed, updated_by, updated_at
from public.role_permissions
where perm_key in ('/amministrazione?sez=negozi', '/amministrazione?sez=condivisi', '/amministrazione?sez=altri')
on conflict (role, perm_key) do update set allowed = excluded.allowed;

delete from public.role_permissions
where perm_key in ('/amministrazione?sez=negozi', '/amministrazione?sez=condivisi', '/amministrazione?sez=altri');
