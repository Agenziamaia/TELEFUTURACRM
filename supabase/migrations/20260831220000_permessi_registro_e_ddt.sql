-- ═══════════════════════════════════════════════════════════════════════════
-- I PERMESSI DEL REGISTRO E DEI DOCUMENTI DI TRASPORTO — 31/08/2026
--
-- Tre difetti trovati dai revisori, due dei quali fermavano il lavoro dei
-- negozi. Il filo comune è lo stesso: un trigger che scrive su una tabella
-- protetta deve girare coi PROPRI permessi, non con quelli di chi lo fa
-- scattare. Se no la protezione della tabella diventa un blocco del gesto che
-- la doveva usare.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. NON SI VENDEVA PIÙ UN TELEFONO ────────────────────────────────────
-- Ieri sera `mag_eventi` è stata chiusa in scrittura al browser: il registro
-- della storia di un pezzo non dev'essere falsificabile da chi ha in mano la
-- chiave anon. Giusto — ma `mag_registra_evento` NON era `security definer`,
-- quindi girava coi permessi dell'operatore, e da quel momento QUALUNQUE
-- aggiornamento su `mag_unita` moriva con «permission denied for table
-- mag_eventi». Cioè: vendere un telefono con IMEI, accettare un
-- trasferimento, cestinare un pezzo. Misurato oggi, in produzione, su un
-- pezzo vero dentro una transazione annullata.
alter function public.mag_registra_evento() security definer set search_path = public;

-- ── 2. NON SI EMETTEVA UN DOCUMENTO DI TRASPORTO ─────────────────────────
-- Stesso identico difetto: il trigger che assegna il numero progressivo
-- scrive su `mag_ddt_progressivo`, che ha la RLS accesa e SOLO una regola di
-- lettura. Girando coi permessi di chi chiama, l'`insert … on conflict` del
-- contatore veniva rifiutato e il DDT non nasceva. `mag_ddt` in produzione ha
-- zero righe: non ne è mai stato emesso uno.
-- La riparazione NON è aprire il contatore in scrittura — sarebbe il numero
-- progressivo di un documento fiscale scrivibile dal browser. È far girare il
-- trigger coi suoi permessi, come già fa `mag_applica_movimento`.
alter function public.mag_ddt_numera() security definer set search_path = public;

-- ── 3. LE RIGHE DEI DOCUMENTI ERANO APERTE A CHIUNQUE ────────────────────
-- `mag_ddt` è blindata dalla regola di casa («devi avere un tf_uid, cioè
-- essere entrato»), `mag_ddt_righe` no: select, insert e update erano
-- `using(true)`. Provato dal revisore con la sola chiave anon, senza nessun
-- login: letto tutto lo storico con IMEI e valori, marcata «arrivata» merce
-- mai arrivata, inserita una riga inventata. La chiave anon viaggia dentro il
-- bundle JavaScript: sta nel browser di chiunque apra il CRM.
drop policy if exists mag_ddt_righe_lettura on public.mag_ddt_righe;
drop policy if exists mag_ddt_righe_scrittura on public.mag_ddt_righe;
drop policy if exists mag_ddt_righe_modifica on public.mag_ddt_righe;
drop policy if exists tf_blindata on public.mag_ddt_righe;
create policy tf_blindata on public.mag_ddt_righe for all
  using      (((current_setting('request.jwt.claims', true))::json ->> 'tf_uid') is not null)
  with check (((current_setting('request.jwt.claims', true))::json ->> 'tf_uid') is not null);

-- ── 4. UN DDT NON SI CANCELLA — NEMMENO DAL PADRE ────────────────────────
-- Sulle righe il DELETE non era concesso, e va bene. Ma `mag_ddt_righe` ha
-- `on delete cascade` verso `mag_ddt`, e su `mag_ddt` il DELETE era concesso
-- ad anon e authenticated: bastava cancellare il documento per portarsi via
-- tutte le sue righe. Un progressivo con un buco non è un progressivo, e la
-- prova di un trasferimento sparita è esattamente ciò che questa tabella
-- esiste per impedire. Un documento sbagliato si ANNULLA (resta col suo
-- numero, marcato annullato), non si cancella.
revoke delete on public.mag_ddt from anon, authenticated;
revoke delete on public.mag_ddt_righe from anon, authenticated;
