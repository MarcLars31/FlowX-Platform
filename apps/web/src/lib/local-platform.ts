type Environment = Record<string, string | undefined>;

export function localPlatformEnabled(environment: Environment, host: string | null) {
  return environment.NODE_ENV === 'development' && environment.SCIPX_LOCAL_PLATFORM === '1' &&
    environment.SUPABASE_URL === 'http://127.0.0.1:54329' &&
    Boolean(environment.SCIPX_LOCAL_PASSWORD) &&
    /^(127\.0\.0\.1|localhost):3100$/.test(host ?? '');
}
