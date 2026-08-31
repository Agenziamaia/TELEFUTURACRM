-- IL TETTO DI SPESA DELL'AI (Luca 31/08: «intorno ai trenta euro»).
--
-- Vive nel database e non in una variabile d'ambiente per la stessa ragione
-- di tutto il resto: una variabile si cambia solo entrando nella macchina, e
-- ogni volta serve un rilascio. Se una sera il tetto va alzato, si alza.
alter table impostazioni_servizio add column if not exists ai_tetto_mensile_eur numeric(10,2);
alter table impostazioni_servizio add column if not exists ai_soglia_avviso  numeric(4,2);
alter table impostazioni_servizio add column if not exists ai_soglia_allarme numeric(4,2);

update impostazioni_servizio
   set ai_tetto_mensile_eur = coalesce(ai_tetto_mensile_eur, 30),
       ai_soglia_avviso  = coalesce(ai_soglia_avviso, 0.60),
       ai_soglia_allarme = coalesce(ai_soglia_allarme, 0.85)
 where id = 1;

comment on column impostazioni_servizio.ai_tetto_mensile_eur is
  'Quanto si è disposti a spendere in un mese di AI, in euro. ⚠️ NON spegne l''assistente personale: al tetto si fermano prima i motori che girano da soli (i triage tornano alle euristiche, che esistono già). Spegnere l''assistente al 30 del mese vorrebbe dire dire a tutti che «quella cosa che solo qui potete avere» gliela togliamo quando conviene a noi — e quella frase non si disinnesca più.';
