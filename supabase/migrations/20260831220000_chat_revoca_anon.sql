-- LE FUNZIONI DELLA CHAT NON SONO PIÙ APERTE A CHIUNQUE (revisore 31/08).
--
-- `chat_create_group`, `chat_get_or_create_dm` e `chat_broadcast` girano
-- SECURITY DEFINER, cioè come `postgres`, che scavalca le policy. La guardia
-- interna (`tf_chat_sono_io`) regge — provata su sei scenari — ma il permesso
-- di ESEGUIRLE era concesso a PUBLIC e ad anon, cioè a chiunque conosca
-- l'indirizzo del sito e la chiave pubblica. La prassi della casa è un'altra:
-- `chat_mark_read` è concessa al solo ruolo `authenticated`.
--
-- Il lasciapassare del CRM (`/api/auth/token`) firma `role: "authenticated"`,
-- quindi per chi è dentro non cambia niente. Chi non ce l'ha già oggi non
-- passava: la guardia gli rispondeva «la sessione non è più valida».
revoke execute on function public.chat_create_group(uuid, text, uuid[]) from public, anon;
revoke execute on function public.chat_get_or_create_dm(uuid, uuid) from public, anon;
revoke execute on function public.chat_broadcast(uuid, uuid[], text) from public, anon;
grant execute on function public.chat_create_group(uuid, text, uuid[]) to authenticated, service_role;
grant execute on function public.chat_get_or_create_dm(uuid, uuid) to authenticated, service_role;
grant execute on function public.chat_broadcast(uuid, uuid[], text) to authenticated, service_role;
