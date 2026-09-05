# Nästa projektstyrningssteg

1. Bygg domänvyerna i varje projektsektion (dokument, krav, analys, matchning,
   materiallista och export) ovanpå de nya gates.
2. Lägg integrationstester mot en isolerad Supabase-testdatabas för RLS,
   cross-tenant-skydd, unika projektnummer och stale-propagation.
3. Kräv att tekniska avvikelser är hanterade före approval/completed.
4. Koppla Storage-sökvägar strikt till `project_documents` och dokumentera
   retention-jobb för arkiverade projekt.
