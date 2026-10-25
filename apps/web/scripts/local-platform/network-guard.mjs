// Loaded only by dev:platform, before Next.js captures global fetch.
// Public catalog GET requests may be read; writes can only reach loopback.
if (process.env.SCIPX_LOCAL_PLATFORM !== '1' || process.env.SUPABASE_URL !== 'http://127.0.0.1:54329') {
  throw new Error('Local network guard requires the isolated development backend.');
}
const originalFetch = globalThis.fetch;
globalThis.fetch = function localPlatformFetch(input, options) {
  const url = new URL(input instanceof Request ? input.url : input);
  const method = (options?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (!local && (!['GET', 'HEAD'].includes(method) || /(^|\.)supabase\.(co|com|net)$/.test(url.hostname))) {
    throw new Error('Utvecklingsmiljön blockerade åtkomst till en extern databas eller skrivtjänst.');
  }
  // Do not follow an allowed public GET into a remote database or a local mutation.
  return originalFetch(input, { ...options, ...(!local ? { redirect: 'error' } : {}) });
};
