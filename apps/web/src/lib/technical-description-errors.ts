/** Only known parser errors are permanent. Unknown/runtime/storage failures remain retryable. */
export function permanentPdfError(error: unknown): { code: string; error: string } | undefined {
  const name = error && typeof error === "object" && "name" in error ? error.name : undefined;
  if (name === "InvalidPDFException") return {code:"INVALID_PDF",error:"PDF-filen verkar vara skadad. Ladda upp en ny kopia."};
  if (name === "PasswordException") return {code:"PASSWORD_PROTECTED",error:"PDF-filen är lösenordsskyddad. Ladda upp en olåst kopia."};
}

export function importFailure(status: number, payload: Record<string, unknown>) {
  const permanent = status < 500 && status !== 429;
  return { permanent, code: permanent && typeof payload.code === "string" ? payload.code : permanent ? "INPUT_INVALID" : "RETRY_REQUIRED",
    message: permanent && typeof payload.error === "string" ? payload.error : "Importen kunde inte slutföras. Försök igen." };
}
