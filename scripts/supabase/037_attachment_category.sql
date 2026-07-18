-- 037: categoria allegato utente (contratto / documenti / altri)
ALTER TABLE public.user_attachments ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'altri';
NOTIFY pgrst, 'reload schema';
