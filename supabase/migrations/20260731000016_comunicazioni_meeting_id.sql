-- Mig. 122 (Luca 31/07): collegamento invito ↔ riunione. Annullando una
-- riunione, l'invito pop-up si ritrova (e si ritira) dal meeting_id invece
-- che dal titolo — chi non l'aveva visto non riceve nulla, chi l'aveva
-- visto riceve l'avviso di cancellazione in bacheca.

alter table public.comunicazioni add column if not exists meeting_id bigint;
