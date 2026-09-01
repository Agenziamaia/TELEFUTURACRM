-- ═══ LA RICARICA È NATA DA UN'ATTIVAZIONE, O DA SOLA? ══════════════════════
-- Luca 01/09: «se si tratta di una ricarica associata a una vendita di un
-- mobile, cioè associata specificamente a un numero che corrisponde a una
-- vendita fatta di un'attivazione, o se invece si tratta di una ricarica non
-- correlata a un'attivazione».
--
-- Sono due cose diverse e vanno lette diverse: la prima è il completamento di
-- una SIM appena venduta — il numero è quello dell'attivazione, e se non parte
-- il cliente esce con una SIM senza credito; la seconda è un servizio a sé,
-- fatto al banco a chi entra solo per quello.
--
-- Il dato esiste già nel flusso (`paystore.daSim`): mancava solo di essere
-- scritto.
alter table public.paystore_ricariche
    add column if not exists con_attivazione boolean;

comment on column public.paystore_ricariche.con_attivazione is
  'true = ricarica associata alla SIM appena venduta (il numero è quello dell''attivazione) · false = ricarica «sciolta», venduta da sola · null = non si sa (righe precedenti al 01/09).';

-- ── LE RIGHE DI OGGI, riconosciute dalla vendita ──────────────────────────
-- La ricarica associata alla SIM prende come nome il NOME DELLA VOCE di
-- catalogo («Ricarica Vodafone»), perché è la marginalità automatica a
-- crearla; quella sciolta prende la descrizione che si legge sullo scontrino,
-- col taglio e il numero dentro. Il nome dice da dove viene.
update public.paystore_ricariche p
set con_attivazione = (c.prodotto ~* '^Ricarica [A-Za-z0-9. ]+$')
from public.contracts c
where p.contract_id = c.id and p.con_attivazione is null;

-- e quelle legate a un CONTRATTO (CTR-) sono per forza nate con un'attivazione
update public.paystore_ricariche
set con_attivazione = true
where con_attivazione is null and contract_id like 'CTR-%';

create index if not exists paystore_ricariche_con_attivazione
    on public.paystore_ricariche (con_attivazione) where con_attivazione is not null;
