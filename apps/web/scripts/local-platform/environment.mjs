export function assertLocalPlatformEnvironment(environment, branch) {
  if (branch !== 'codex/scipx-upgrades') throw new Error('Starta i utvecklingsgrenen codex/scipx-upgrades.');
  if ([environment.NODE_ENV, environment.VERCEL_ENV, environment.APP_ENV].some(value => ['production', 'prod'].includes(value))) throw new Error('Den lokala plattformen får inte köras i produktion.');
  const forbidden = Object.keys(environment).filter(name =>
    /SUPABASE|DOCLING_OCR|SPRSOK_API|PRODUCT_PDF_EXTRACTOR|CRAWLER_INGEST_TOKEN|RESEND_API_KEY|SMTP_|SENDGRID|PROJECT_WORK_EMAIL/.test(name) && environment[name]?.trim()
  );
  if (forbidden.length) throw new Error(`Utvecklingskopian får inte använda befintliga tjänsteanslutningar: ${forbidden.join(', ')}. Behåll livekonfigurationen i dess egen arbetskopia.`);
}
