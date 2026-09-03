-- ═══════════════════════════════════════════════════════════════════════════
-- LE PORTE DEL MAGAZZINO — 04/09/2026
--
-- Il 03/09 una revisione ostile ha misurato che un VENDITORE loggato, dalla
-- console del browser, poteva: far comparire merce dal nulla, gonfiare una
-- giacenza, emettere un DDT numerato e far sparire un telefono. Non era un
-- ragionamento: le quattro cose sono state fatte davvero, in transazioni
-- annullate. La policy `tf_blindata` dice «basta essere loggati», e i GRANT a
-- `authenticated` arrivavano fino a DELETE e TRUNCATE.
--
-- ── PERCHÉ NON BASTAVA TOGLIERE I PERMESSI ─────────────────────────────────
-- Perché il magazzino lo scrivono i NEGOZI, dal browser, e sono gesti veri:
-- la vendita scarica un pezzo, l'accettazione lo mette a scaffale, il rientro
-- lo riporta indietro. Chiudere tutto avrebbe spento le casse.
--
-- Quindi si è censito, riga per riga, cosa il browser scrive DAVVERO. Il
-- risultato ha reso il lavoro molto più piccolo di quanto sembrasse:
--
--   `mag_unita`      → nessun INSERT, nessun DELETE. Solo UPDATE (vendita,
--                      accettazione, rientro, partenza, cestino).
--   `mag_ddt`        → 1 INSERT (nuovo trasferimento), 3 UPDATE. Zero DELETE.
--   `mag_ddt_righe`  → 1 INSERT, 10 UPDATE. Zero DELETE.
--   `mag_movimenti`  → solo INSERT, e solo di quattro tipi.
--   `mag_giacenze`   → la scrive il trigger, che è SECURITY DEFINER.
--   `mag_eventi`     → la scrive il trigger. Il browser non la tocca mai.
--   `mag_ddt_progressivo` → la scrive il trigger della numerazione.
--
-- E DUE FUNZIONI MORTE tenevano aperta una porta per niente: `caricaMerce` e
-- `rettificaConteggio` in `lib/magazzinoScarico.ts` non le chiama nessuno —
-- verificato su tutto `src/` — ed erano le uniche a scrivere `carico` dal
-- browser. Si tolgono nel commit che accompagna questa migrazione.
--
-- ── COSA RESTA APERTO, E PERCHÉ ────────────────────────────────────────────
-- `mag_ddt` e `mag_ddt_righe` restano scrivibili: il nuovo trasferimento e
-- l'accettazione vivono ancora nel browser, e spostarli è il cantiere dopo.
-- Ma un documento è TRACCIATO — porta chi l'ha creato, quando, da dove a dove
-- — e non fa comparire merce: la merce la muovono i movimenti e le unità, che
-- da qui in poi sono chiuse.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① I PEZZI NON SI CREANO E NON SI CANCELLANO DAL BROWSER ────────────────
-- Era il «far comparire un iPhone» e il «far sparire un telefono». I pezzi
-- nascono dal carico merce (RPC, security definer) o dagli import (chiave di
-- servizio); si tolgono marcandoli `annullato`, che è un UPDATE e resta.
revoke insert, delete, truncate on public.mag_unita from authenticated, anon;

-- ── ② LA STORIA DI UN PEZZO NON SI RISCRIVE ────────────────────────────────
-- `mag_eventi` è il racconto di dove è stato un telefono: la scrive un
-- trigger, e nessuno deve poterla correggere a posteriori. Un registro che si
-- può riscrivere non è un registro.
revoke update, delete, truncate on public.mag_eventi from authenticated, anon;

-- ── ③ IL CONTATORE DEI NUMERI DI DOCUMENTO ─────────────────────────────────
-- `mag_ddt_progressivo` tiene l'ultimo numero per società e per anno. Chi lo
-- azzera fa uscire DUE documenti fiscali con lo stesso numero. Lo scrive solo
-- il trigger `mag_ddt_numera`, che è security definer e non ha bisogno del
-- permesso di chi chiama.
revoke insert, update, delete, truncate on public.mag_ddt_progressivo from authenticated, anon;

-- ── ④ I SALDI LI FA IL TRIGGER ─────────────────────────────────────────────
revoke insert, update, delete, truncate on public.mag_giacenze from authenticated, anon;

-- ── ⑤ I MOVIMENTI SONO IMMUTABILI, E ANCHE NEI PERMESSI ────────────────────
-- Un trigger già impediva di modificarli; adesso non c'è nemmeno il diritto.
revoke update, delete, truncate on public.mag_movimenti from authenticated, anon;

-- ── ⑥ I DOCUMENTI NON SI CANCELLANO ────────────────────────────────────────
-- Un progressivo con i buchi non è un progressivo: un documento sbagliato si
-- annulla, non sparisce. (Era già la regola nel codice; adesso è anche nei
-- permessi.)
revoke delete, truncate on public.mag_ddt from authenticated, anon;
revoke delete, truncate on public.mag_ddt_righe from authenticated, anon;

-- ── ⑦ E IL MOVIMENTO CHE CREA MERCE LO FA SOLO CHI DI DOVERE ───────────────
-- Restava la strada più semplice per gonfiare un magazzino: un `carico` da
-- 999 pezzi, o una `rettifica` in positivo. Dal browser servono solo quattro
-- tipi, e due di questi non li scrive nessuno.
--   · `scarico`            — la vendita. La fa chiunque stia in cassa.
--   · `trasferimento_in`   — accettazione e rientro. Idem.
--   · `trasferimento_out`  — la partenza di un trasferimento. Idem.
--   · `rettifica`          — il cestino delle Giacenze, che a schermo è già
--                            riservato «dall'amministrazione in su»: adesso lo
--                            è anche qui sotto.
--   · `carico`             — dal browser NON si fa più: passa dal carico merce.
create or replace function public.mag_mov_consentito(p_tipo text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_tipo in ('scarico', 'trasferimento_in', 'trasferimento_out') then true
    when p_tipo in ('rettifica', 'carico', 'inventario') then exists (
      select 1 from app_users
       where id = tf_uid() and coalesce(active, true)
         and role in ('amministrativo', 'direttore_generale', 'admin', 'dev'))
    else false
  end
$$;

drop policy if exists tf_mag_mov_tipi on public.mag_movimenti;
create policy tf_mag_mov_tipi on public.mag_movimenti
  for insert to authenticated
  with check (tf_uid() is not null and public.mag_mov_consentito(tipo));

/* La policy vecchia diceva «basta essere loggati» su TUTTO: sull'INSERT la
   sostituisce quella qui sopra. Le policy si sommano con un OR, quindi
   quella larga va tolta dall'INSERT o non servirebbe a niente. */
drop policy if exists tf_blindata on public.mag_movimenti;
create policy tf_blindata on public.mag_movimenti
  for select to public using (tf_uid() is not null);

-- ⚠️ C'ERA UNA SECONDA PORTA CON LA STESSA CHIAVE. Su `mag_movimenti` non
-- c'era solo `tf_blindata`: c'era anche `mag_movimenti_scrittura`, una policy
-- di INSERT che dice pure lei «basta essere loggati». Le policy si sommano con
-- un OR, quindi finché resta quella la mia non filtra niente — misurato: il
-- `carico` da 999 pezzi passava lo stesso. Va sostituita, non affiancata.
drop policy if exists mag_movimenti_scrittura on public.mag_movimenti;

-- e `reso` entra fra i tipi che ADDIZIONANO merce, quindi sta con gli altri:
-- nessuno lo scrive dal browser oggi, e se un domani servirà lo scriverà chi
-- di dovere.
create or replace function public.mag_mov_consentito(p_tipo text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_tipo in ('scarico', 'trasferimento_in', 'trasferimento_out') then true
    when p_tipo in ('rettifica', 'carico', 'reso') then exists (
      select 1 from app_users
       where id = tf_uid() and coalesce(active, true)
         and role in ('amministrativo', 'direttore_generale', 'admin', 'dev'))
    else false
  end
$$;
