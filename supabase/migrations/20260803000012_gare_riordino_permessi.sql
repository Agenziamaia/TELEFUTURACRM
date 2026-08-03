-- Mig. 148 — RIORDINO GARE (Luca 03/08/2026): i brand si riuniscono nel
-- sub-hub "Operatori"; Target, Obiettivi Home e Direzione Inserimento
-- traslocano dall'hub Amministrazione all'hub Gare. Le chiavi cambiano forma:
--   /gare?brand=w3 (e gli altri 7)     →  /gare?brand=operatori&tab=w3
--   /amministrazione?sez=target        →  /gare?brand=target
--   /amministrazione?sez=obiettivi     →  /gare?brand=obiettivi
--   /amministrazione?sez=direzione     →  /gare?brand=direzione
-- Come nella mig. 115: si MIGRANO le righe di role_permissions cosi' nessuna
-- concessione (o revoca) data dalla rotellina va persa.

-- 1) i brand dentro Operatori
insert into public.role_permissions (role, perm_key, allowed, updated_by, updated_at)
select role,
       '/gare?brand=operatori&tab=' || substr(perm_key, length('/gare?brand=') + 1),
       allowed, updated_by, updated_at
from public.role_permissions
where perm_key in ('/gare?brand=w3', '/gare?brand=vs', '/gare?brand=vnd', '/gare?brand=fastweb',
                   '/gare?brand=sky', '/gare?brand=s4', '/gare?brand=tim', '/gare?brand=dojo')
on conflict (role, perm_key) do update set allowed = excluded.allowed;

delete from public.role_permissions
where perm_key in ('/gare?brand=w3', '/gare?brand=vs', '/gare?brand=vnd', '/gare?brand=fastweb',
                   '/gare?brand=sky', '/gare?brand=s4', '/gare?brand=tim', '/gare?brand=dojo');

-- 2) le tre sezioni traslocate da Amministrazione
insert into public.role_permissions (role, perm_key, allowed, updated_by, updated_at)
select role,
       '/gare?brand=' || substr(perm_key, length('/amministrazione?sez=') + 1),
       allowed, updated_by, updated_at
from public.role_permissions
where perm_key in ('/amministrazione?sez=target', '/amministrazione?sez=obiettivi', '/amministrazione?sez=direzione')
on conflict (role, perm_key) do update set allowed = excluded.allowed;

delete from public.role_permissions
where perm_key in ('/amministrazione?sez=target', '/amministrazione?sez=obiettivi', '/amministrazione?sez=direzione');
