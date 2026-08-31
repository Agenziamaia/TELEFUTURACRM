-- IL MINI-HUB SETUP: le chiavi dei permessi si spostano con le sezioni (31/08).
--
-- Luca: «creiamo un altro minihub per tenere tutto in ordine, chiamiamolo
-- Setup» — Catalogo, Call Center, Ordine Merce, Calendario, Tracking PDA.
--
-- ⚠️ QUANDO UNA SEZIONE ENTRA IN UN MINI-HUB, LA SUA CHIAVE DI PERMESSO
-- CAMBIA: da «/amministrazione?sez=catalogo» a
-- «/amministrazione?sez=setup&tab=catalogo». Senza questa migrazione le righe
-- già scritte resterebbero orfane, e chi aveva il Catalogo se lo vedrebbe
-- sparire senza che niente dia errore — il modo peggiore di rompere un
-- permesso. È già successo con il mini-hub Costi, e infatti anche lì c'è una
-- migrazione che sposta le chiavi.

update role_permissions
   set perm_key = replace(perm_key, '?sez=', '?sez=setup&tab=')
 where perm_key in (
   '/amministrazione?sez=catalogo', '/amministrazione?sez=callcenter',
   '/amministrazione?sez=ordinemerce', '/amministrazione?sez=calendario',
   '/amministrazione?sez=trackingesiti');

/* E il permesso sul GRUPPO a chi ha almeno una delle sue sezioni: la voce
   «Setup» nel menu ha i suoi ruoli, e senza una riga esplicita chi aveva il
   Catalogo per eccezione — non per ruolo — non troverebbe più la strada per
   arrivarci. Il permesso fine resta quello della sezione: questo apre solo la
   porta del gruppo. */
insert into role_permissions (role, perm_key, allowed, updated_by)
select distinct rp.role, '/amministrazione?sez=setup', true, 'mini-hub Setup 31/08'
  from role_permissions rp
 where rp.allowed
   and rp.perm_key like '/amministrazione?sez=setup&tab=%'
   and not exists (select 1 from role_permissions x
                    where x.role = rp.role and x.perm_key = '/amministrazione?sez=setup');
