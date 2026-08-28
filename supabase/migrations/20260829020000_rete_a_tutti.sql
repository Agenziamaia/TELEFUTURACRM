-- LA RETE E' DI TUTTI, TRANNE GLI APPRENDISTI (Luca, briefing della sezione:
-- «la sezione Rete dev'essere abilitata a tutti tranne gli apprendisti»).
-- Finora /analisi?sez=rete aveva quattro righe soltanto — direttore
-- commerciale, store manager e i due gradi di store specialist — e restava
-- chiusa a 17 utenti attivi, fra cui i due direttori generali.
-- Ordine dei permessi: ruolo → ruolo@grado → persona, l'ultimo vince. Quindi
-- il ruolo apre e il GRADO apprendista chiude.

-- il contenitore: /analisi deve essere raggiungibile, o l'area non si vede
insert into role_permissions (role, perm_key, allowed) values
    ('caller',             '/analisi', true),
    ('back_office_caller', '/analisi', true),
    ('direttore_cc',       '/analisi', true)
on conflict (role, perm_key) do update set allowed = excluded.allowed;

-- l'area Rete, ruolo per ruolo
insert into role_permissions (role, perm_key, allowed) values
    ('agente',                '/analisi?sez=rete', true),
    ('amministrativo',        '/analisi?sez=rete', true),
    ('back_office',           '/analisi?sez=rete', true),
    ('back_office_caller',    '/analisi?sez=rete', true),
    ('caller',                '/analisi?sez=rete', true),
    ('direttore_cc',          '/analisi?sez=rete', true),
    ('direttore_commerciale', '/analisi?sez=rete', true),
    ('direttore_generale',    '/analisi?sez=rete', true),
    ('direttore_ob',          '/analisi?sez=rete', true),
    ('store_manager',         '/analisi?sez=rete', true),
    ('tecnico',               '/analisi?sez=rete', true),
    ('venditore',             '/analisi?sez=rete', true)
on conflict (role, perm_key) do update set allowed = excluded.allowed;

-- ...e i due gradi apprendista restano fuori, esplicitamente: senza riga
-- funzionerebbe lo stesso oggi, ma domani basta un grado nuovo per farli
-- entrare per sbaglio
insert into role_permissions (role, perm_key, allowed) values
    ('venditore@apprendista', '/analisi?sez=rete', false),
    ('caller@apprendista',    '/analisi?sez=rete', false)
on conflict (role, perm_key) do update set allowed = excluded.allowed;
