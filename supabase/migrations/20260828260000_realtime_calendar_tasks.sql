-- IL FULMINE DEVE SAPERLO SUBITO (Luca 28/08 sera).
-- calendar_tasks non era fra le tabelle che mandano aggiornamenti in tempo
-- reale: il fulmine delle task assegnate si sarebbe mosso solo al giro di
-- polling successivo, fino a un minuto dopo. Chi assegna una task si aspetta
-- che l'altro la veda, non che la veda "entro un minuto".
alter publication supabase_realtime add table calendar_tasks;