-- ═══════════════════════════════════════════════════════════════════════════
-- DOVE STO LAVORANDO OGGI — 31/08/2026
--
-- Luca: «a ogni login dobbiamo chiedere il punto vendita in cui sta lavorando.
-- La selezione già preselezionata dev'essere quella dei turni, e ci mettiamo un
-- pulsante "altro negozio": a quel punto lo seleziona, ma uno
-- dell'amministrazione deve approvargli l'accesso. Per i negozi doppi metti
-- solo la selezione generale, tipo Magliana, Collatina. A quel punto abbiamo il
-- dato certo su quale magazzino stanno lavorando e non abbiamo più dubbi.»
--
-- Perché serve: fin qui il negozio era un campo MODIFICABILE dentro Registra
-- Vendita, e da lì dipendono lo scontrino, il magazzino da cui esce la merce e
-- i conti in sospeso che uno vede. Un campo che si può cambiare senza che
-- nessuno lo sappia non è un dato certo: oggi si sceglie una volta, si scrive,
-- e chi va altrove lo fa dichiarandolo.
--
-- LA SEDE, NON L'INSEGNA. Si registra «Magliana», non «Magliana W3»: le due
-- insegne sono la stessa stanza e lo stesso magazzino (è la regola che la
-- pagina Turni chiama «sede unica», col calderone delle due squadre). Quale
-- società emette lo scontrino continua a deciderlo la MERCE, riga per riga.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.presenza_negozio (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references public.app_users(id),
    data         date not null,
    /** la SEDE fisica dichiarata (prima parola del nome negozio: magliana, donna…) */
    sede         text not null,
    /** 'turno' = era di turno lì · 'richiesta' = ha chiesto di lavorare altrove */
    origine      text not null default 'turno',
    /** 'attiva' · 'in_attesa' · 'rifiutata' · 'chiusa' */
    stato        text not null default 'attiva',
    /** dov'era di turno quando ha chiesto di andare altrove: serve a chi approva */
    sede_turno   text,
    motivo       text,
    deciso_da    text,
    deciso_il    timestamptz,
    created_at   timestamptz not null default now(),
    constraint presenza_stato_valido check (stato in ('attiva','in_attesa','rifiutata','chiusa')),
    constraint presenza_origine_valida check (origine in ('turno','richiesta'))
);

-- UNA SOLA PRESENZA ATTIVA AL GIORNO: se no «dove sta lavorando» tornerebbe ad
-- avere due risposte, che è il dubbio che questa tabella esiste per togliere.
create unique index if not exists presenza_una_attiva
    on public.presenza_negozio (user_id, data) where stato = 'attiva';
create index if not exists presenza_da_approvare
    on public.presenza_negozio (data) where stato = 'in_attesa';

alter table public.presenza_negozio enable row level security;
-- si legge e si dichiara da dentro il CRM; l'APPROVAZIONE passa da una rotta
-- di server, che controlla il ruolo — qui il browser non può cambiare `stato`
-- di una riga altrui perché la policy lo lega al proprio id.
drop policy if exists tf_presenza_mia on public.presenza_negozio;
create policy tf_presenza_mia on public.presenza_negozio for all
  using      (user_id::text = (current_setting('request.jwt.claims', true))::json ->> 'tf_uid')
  with check (user_id::text = (current_setting('request.jwt.claims', true))::json ->> 'tf_uid');
-- e il governo vede tutto (per la schermata dei turni)
drop policy if exists tf_presenza_governo on public.presenza_negozio;
create policy tf_presenza_governo on public.presenza_negozio for select
  using (public.tf_e_governo());
grant select, insert on public.presenza_negozio to anon, authenticated;
-- niente update né delete dal browser: chi approva passa dal server

-- I PERMESSI PREDEFINITI DI SUPABASE concedono tutto alle tabelle nuove: la
-- `grant` qui sopra non toglie niente, aggiunge. Va REVOCATO quello che non
-- serve, se no `update` e `delete` restano aperti e uno potrebbe cambiarsi lo
-- stato della propria richiesta da «in attesa» ad «attiva» da solo.
revoke update, delete, truncate, references, trigger on public.presenza_negozio from anon, authenticated;
