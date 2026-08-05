-- Mig. 181 — EMAIL A THREAD (Luca 05/08): «le mail dello stesso emittente
-- devono rimanere separate». Finora una conversazione = un mittente per
-- casella (vincolo unique account+customer_email): tutte le mail di un
-- indirizzo si impilavano in un thread solo. Da ora una conversazione = un
-- THREAD (aggancio via In-Reply-To / radice dell'oggetto per le risposte,
-- altrimenti conversazione nuova): il vincolo salta, resta l'indice normale
-- per le ricerche per interlocutore. Idempotente.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint
               WHERE conname = 'email_conversations_account_id_customer_email_key') THEN
        ALTER TABLE public.email_conversations
            DROP CONSTRAINT email_conversations_account_id_customer_email_key;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS email_conv_acc_cust_idx
    ON public.email_conversations (account_id, customer_email);
