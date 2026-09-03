-- ═══════════════════════════════════════════════════════════════════════════
-- «RESPINGI» DIVENTA «PROBLEMA!» — 03/09/2026
--
-- Luca: «il tasto respingi dobbiamo cambiarlo con Problema!, e lì in quel caso
-- deve arrivare una notifica al negozio che l'ha mandato, segnalando il
-- problema… quel trasferimento rimane comunque possibile accettarlo, perché
-- magari semplicemente avevano la merce lì, non se ne erano accorti, l'hanno
-- segnalato che era un problema come se non gli fosse mai arrivata».
--
-- ── UN SEGNALE, NON UNO STATO ──────────────────────────────────────────────
-- «Respingi» oggi fa una cosa grossa e irreversibile: rimanda indietro la
-- merce e CHIUDE il documento. Da lì in poi non c'è più nessun bottone che lo
-- riapra — «accetta» e «annulla» vogliono un documento in transito. Ma la
-- ragione vera per cui un negozio preme quel tasto, nove volte su dieci, è
-- «non l'ho trovata»: e la merce magari era lì.
--
-- Quindi il problema NON è uno stato del documento: è una BANDIERINA che gli
-- si mette addosso. Il trasferimento resta in viaggio, resta accettabile, e
-- intanto tre persone lo sanno — chi l'ha mandato, chi doveva riceverlo e
-- l'amministrazione. Chi ha ragione lo si scopre parlandosi, non cambiando
-- stato a un documento.
--
-- Il rientro della merce resta possibile: lo fa il MITTENTE con «annulla»,
-- che è il gesto di chi ha deciso, non di chi ha solo constatato.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.mag_ddt
  add column if not exists problema_il        timestamptz,
  add column if not exists problema_da        text,
  add column if not exists problema_nota      text,
  add column if not exists problema_chiuso_il timestamptz,
  add column if not exists problema_chiuso_da text,
  add column if not exists problema_chiuso_come text;

comment on column public.mag_ddt.problema_il is
  'Quando è stato segnalato un problema su questo trasferimento. Il documento resta com''era: è una bandierina, non uno stato (Luca 03/09).';

-- l'indice serve al pallino del menù, che lo chiede ogni due minuti a tutti
create index if not exists mag_ddt_problema_aperto
  on public.mag_ddt (problema_il) where problema_il is not null and problema_chiuso_il is null;

-- ── CHI PUÒ SEGNALARE E CHI PUÒ CHIUDERE ───────────────────────────────────
-- Segnala chi il trasferimento lo VIVE: il negozio che lo riceve, quello che
-- l'ha mandato, e l'amministrazione. Non chiunque passi di lì: una bandierina
-- rossa che squilla in tre posti la deve poter alzare solo chi c'entra.
create or replace function public.mag_ddt_problema(
  p_ddt_id uuid, p_nota text, p_chiudi boolean default false, p_come text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid; v_nome text; v_ruolo text; v_d record; v_miei text[];
begin
  v_uid := tf_uid();
  if v_uid is null then raise exception 'sessione non riconosciuta: rientra nel gestionale'; end if;
  select full_name, role into v_nome, v_ruolo from app_users where id = v_uid and coalesce(active, true);
  if v_ruolo is null then raise exception 'utente non attivo'; end if;

  select * into v_d from mag_ddt where id = p_ddt_id;
  if v_d.id is null then raise exception 'questo trasferimento non c''è più'; end if;

  /* I NEGOZI DI CHI CHIEDE: il suo e quelli che dividono lo stesso scaffale —
     `split_part(nome, ' ', 1)` è la regola che il database usa già per dire
     «stesso locale» (Magliana W3 e Magliana Multi sono un banco solo). */
  select coalesce(array_agg(distinct store_name), '{}') into v_miei
    from user_stores where user_id = v_uid;

  if v_ruolo not in ('amministrativo', 'direttore_generale', 'admin', 'dev')
     and not exists (
        select 1 from unnest(v_miei) m
         where split_part(m, ' ', 1) = split_part(v_d.a_negozio, ' ', 1)
            or split_part(m, ' ', 1) = split_part(v_d.da_negozio, ' ', 1))
  then
    raise exception 'questo trasferimento non passa dal tuo negozio: lo segnala chi lo manda, chi lo riceve o l''amministrazione';
  end if;

  if p_chiudi then
    if v_d.problema_il is null or v_d.problema_chiuso_il is not null then
      raise exception 'su questo trasferimento non c''è nessun problema aperto';
    end if;
    update mag_ddt set problema_chiuso_il = now(), problema_chiuso_da = v_nome,
                       problema_chiuso_come = nullif(btrim(coalesce(p_come, '')), '')
     where id = p_ddt_id;
    return jsonb_build_object('ok', true, 'chiuso', true, 'numero', v_d.numero);
  end if;

  if btrim(coalesce(p_nota, '')) = '' then
    raise exception 'scrivi cos''è successo: una segnalazione senza il perché non la può risolvere nessuno';
  end if;
  if v_d.problema_il is not null and v_d.problema_chiuso_il is null then
    raise exception 'un problema su questo trasferimento è già segnalato: «%»', v_d.problema_nota;
  end if;
  /* SI SEGNALA SOLO SU QUELLO CHE STA ANCORA VIAGGIANDO: su un documento
     chiuso non c'è più niente da risolvere, e il pallino rosso resterebbe
     acceso su una cosa che non si può più toccare. */
  if v_d.stato not in ('in_transito', 'parziale') then
    raise exception 'questo trasferimento è già chiuso (%): non c''è più niente da segnalare', v_d.stato;
  end if;

  update mag_ddt
     set problema_il = now(), problema_da = v_nome, problema_nota = btrim(p_nota),
         problema_chiuso_il = null, problema_chiuso_da = null, problema_chiuso_come = null
   where id = p_ddt_id;

  return jsonb_build_object('ok', true, 'numero', v_d.numero,
                            'da', v_d.da_negozio, 'a', v_d.a_negozio);
end $$;

revoke all on function public.mag_ddt_problema(uuid, text, boolean, text) from public, anon;
grant execute on function public.mag_ddt_problema(uuid, text, boolean, text) to authenticated;
