-- ═══════════════════════════════════════════════════════════════════════════
-- LA GUARDIA SU CHI DECIDE I NEGOZI E LE CASSE — 31/08/2026
--
-- Il revisore ha attraversato queste porte davvero, dentro una transazione
-- annullata, col login VERO di un venditore qualsiasi (Alin Predica, Magliana):
--
--   insert user_store_visibility per SÉ, tutti e 18 i negozi   → PASSAVA
--   delete user_store_visibility di un COLLEGA                 → PASSAVA
--   update stores: «Donna» rinominata «Magliana Donna»         → PASSAVA
--   delete stores: «Promontori» cancellato                     → PASSAVA
--   delete pos_scontrino_negozi: tutte e 4 le casse spente     → PASSAVA
--
-- Cosa vuol dire, in concreto: una riga in `user_store_visibility` e quel
-- venditore vede i conti in sospeso — cliente e importo — di tutti e quindici i
-- punti vendita, e può chiuderli. Rinominare «Donna» in «Magliana Donna» la fa
-- diventare gemella di Magliana per `sedeFisica`, che guarda la prima parola:
-- cinque persone in più vedono i conti di Donna. Svuotare
-- `pos_scontrino_negozi` spegne lo scontrino fiscale nei quattro negozi accesi.
--
-- La guardia esiste già ed è quella di `user_stores`, `role_permissions`,
-- `role_defs`: cambia solo chi è «governo» — admin, dev, direzione generale,
-- amministrativo — o il server. Mancava su queste quattro tabelle, che sono
-- esattamente quelle da cui dipende «chi vede cosa» e «da quale cassa esce lo
-- scontrino». `pos_rt` non l'aveva segnalata nessuno: ci sono dentro gli
-- indirizzi dei registratori telematici.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  foreach t in array array['user_store_visibility','stores','pos_scontrino_negozi','pos_rt'] loop
    execute format('drop trigger if exists tf_guardia on public.%I', t);
    execute format('create trigger tf_guardia before insert or update or delete on public.%I
                    for each row execute function public.tf_guardia_permessi()', t);
  end loop;
end $$;
