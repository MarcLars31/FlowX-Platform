export function isLegacyJwtApiKey(apiKey: string) {
  return apiKey.split(".").length === 3 && apiKey.startsWith("eyJ");
}

export function buildSupabaseHeaders(
  apiKey: string,
  bearerToken?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: apiKey
  };

  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  } else if (isLegacyJwtApiKey(apiKey)) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}
