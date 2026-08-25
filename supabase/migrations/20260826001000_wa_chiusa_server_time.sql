-- Il ✓ «conclusa» scriveva l'orologio del BROWSER: un PC indietro di un
-- minuto faceva decadere subito la chiusura (chiusa_il < ultimo messaggio)
-- e il ✓ sembrava rotto (rilievo del revisore 25/08). Il timestamp lo mette
-- il server: qualunque client scriva chiusa_il non-null, vale now().
create or replace function wa_chiusa_server_time() returns trigger language plpgsql as $$
begin
  if new.chiusa_il is not null and (old.chiusa_il is distinct from new.chiusa_il) then
    new.chiusa_il := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_wa_chiusa_server_time on wa_conversations;
create trigger trg_wa_chiusa_server_time before update on wa_conversations
for each row execute function wa_chiusa_server_time();
