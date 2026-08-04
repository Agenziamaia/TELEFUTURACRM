-- CAT-03 (04/08): icone amministrabili del catalogo marginalita'.
-- icon TEXT (emoji) su voci e categorie; NULL = fallback (legacy per nome sulle
-- voci, mappa hardcoded / kind sulle categorie). Colonne nullable: zero impatto
-- su righe esistenti e client vecchi.
ALTER TABLE public.marg_items ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE public.marg_categories ADD COLUMN IF NOT EXISTS icon TEXT;

-- Backfill delle emoji storiche (MARG_PRODUCTS_LEGACY di Registra Vendita) sulle
-- voci seed della mig. 082: match per nome NORMALIZZATO (stessa regola di
-- _margNorm: maiuscole, via tutto cio' che non e' A-Z/0-9), solo dove l'icona
-- non e' gia' stata scelta dal pannello (icon IS NULL) — idempotente.
UPDATE public.marg_items mi SET icon = v.icon
FROM (VALUES
  ('ACCESSORI','🎧'),
  ('TELEFONISENIOR','📱'),
  ('EARBUDS','🎵'),
  ('VENDITAUSATO','♻️'),
  ('PLX','📦'),
  ('CNCP','💳'),
  ('NEWCOVER','🔲'),
  ('MEMPEN','💾'),
  ('OROLOGIOCASH','⌚'),
  ('MIBAND6','⌚'),
  ('POWERBANK','🔋'),
  ('ASSISTENZATECNICO','🔧'),
  ('BACKUP','💿'),
  ('RIPARAZIONE','🔨'),
  ('CHIUSURASIMFISSO','✂️'),
  ('ETELEFONO','📞'),
  ('EXTRAACCCOMPASS','🧭'),
  ('SALVASCONTRINO','🧾'),
  ('EXTRAMARGINEKASKO','🛡️'),
  ('PLKASKO','🏷️'),
  ('KASKOSV','🔖'),
  ('SIMWIND3','📶'),
  ('SOSTWIND3','🔄'),
  ('SIMVODAFONE','📶'),
  ('SOSTVODAFONE','🔄'),
  ('SIMFASTWEB','📶'),
  ('SOSTFASTWEB','🔄'),
  ('SIMTIM','📶'),
  ('SOSTTIM','🔄'),
  ('SIMILIAD','📶'),
  ('SIMSKY','📶'),
  ('SIMHO','📶'),
  ('SIMVERY','📶'),
  ('SOSTVERY','🔄'),
  ('SIMKENA','📶'),
  ('SIML','📶'),
  ('SUBENTROREALEUTIL','🔄'),
  ('ESIMWINDTRE','📲'),
  ('ESIMSOSTWINDTRE','🔄'),
  ('ESIMVODAFONE','📲'),
  ('ESIMFASTWEB','📲'),
  ('ESIMSOSTFASTWEB','🔄'),
  ('TELEFONOCASH','📱')
) AS v(nk, icon)
WHERE upper(regexp_replace(mi.name, '[^A-Za-z0-9]', '', 'g')) = v.nk
  AND mi.icon IS NULL;

-- Icone delle categorie seed (stessa mappa _MARG_CAT_EMOJI di Registra Vendita)
UPDATE public.marg_categories mc SET icon = v.icon
FROM (VALUES
  ('PRODOTTI','📦'),
  ('SERVIZI','🔧'),
  ('KASKO','🛡️'),
  ('SIM','📶'),
  ('ESIM','📲'),
  ('TELEFONOCASH','📱')
) AS v(nk, icon)
WHERE upper(regexp_replace(mc.name, '[^A-Za-z0-9]', '', 'g')) = v.nk
  AND mc.icon IS NULL;

NOTIFY pgrst, 'reload schema';
