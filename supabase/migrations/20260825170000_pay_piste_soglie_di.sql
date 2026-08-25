-- Pista APPOGGIATA (S4 25/08 sera, correzione Luca: «le soglie non dovevi
-- cambiarle, solo il commissioning andava diviso — la soglia lasciala unica»).
-- soglie_di = chiave della pista MADRE dello stesso brand/mese/lato: la pista
-- appoggiata non ha soglie proprie — i suoi pezzi contano nella scala della
-- madre (canvass unico) e la sua soglia è quella della madre; la % ai ragazzi
-- e le righe di commissioning restano sue. Primo uso: s4 energia_business →
-- energia_consumer.
alter table pay_piste add column if not exists soglie_di text;
