import { spawn, execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import nextEnv from '@next/env';
import { assertLocalPlatformEnvironment } from './local-platform/environment.mjs';
import { credentialsAt, startBackend } from './local-platform/server.mjs';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
nextEnv.loadEnvConfig(web, true);
const branch = execFileSync('git', ['branch', '--show-current'], { cwd: web, encoding: 'utf8' }).trim();
assertLocalPlatformEnvironment(process.env, branch);
if (process.argv.includes('--check')) { console.log('Isolerad utvecklingskonfiguration godkänd.'); process.exit(0); }
const directory = resolve(web, '.local-platform');
await mkdir(directory, { recursive: true });
const lock = resolve(directory, 'runtime.lock');
try {
  const previous = JSON.parse(await readFile(lock, 'utf8'));
  let running = false;
  try { process.kill(previous.pid, 0); running = true; } catch (error) { if (error.code !== 'ESRCH') throw error; }
  if (running) throw new Error('Den lokala plattformen är redan startad. Öppna http://127.0.0.1:3100.');
  await unlink(lock);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await writeFile(lock, JSON.stringify({ pid: process.pid }), { flag: 'wx' });
let backend, child, maintenance, closing = false;
async function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  clearInterval(maintenance);
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise(resolve => { child.once('exit', resolve); setTimeout(resolve, 5000).unref(); });
  }
  await backend?.close();
  await unlink(lock).catch(() => {});
  process.exitCode = code;
}
try {
  const credentials = await credentialsAt(directory);
  console.log('Startar separat lokal databas och laddar plattformens schema…');
  backend = await startBackend({ directory, repository: resolve(web, '../..'), credentials });
  const environment = {
    ...process.env, NODE_ENV: 'development', SCIPX_LOCAL_PLATFORM: '1', SCIPX_LOCAL_DESIGN: '',
    SUPABASE_URL: 'http://127.0.0.1:54329', SUPABASE_PUBLISHABLE_KEY: credentials.anonKey,
    SUPABASE_SECRET_KEY: credentials.serviceKey, SCIPX_LOCAL_PASSWORD: credentials.password,
    PRODUCT_SYNC_WRITES_ENABLED: 'false', NEXT_TELEMETRY_DISABLED: '1',
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${pathToFileURL(resolve(web, 'scripts/local-platform/network-guard.mjs')).href}`.trim()
  };
  child = spawn(process.execPath, [resolve(web, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '3100'], { cwd: web, env: environment, stdio: 'inherit' });
  child.once('error', error => { console.error(error.message); void shutdown(1); });
  child.once('exit', code => { if (!closing) void shutdown(code ?? 1); });
  // Run the existing application worker against the local backend only.
  maintenance = setInterval(() => {
    fetch('http://127.0.0.1:3100/api/internal/import-worker', { method: 'POST', headers: { Authorization: `Bearer ${credentials.instance}${credentials.instance.slice(0, 24)}` }, signal: AbortSignal.timeout(15000) }).catch(() => {});
  }, 30000);
  console.log('Hela ScipX: http://127.0.0.1:3100 — kundvyn öppnas direkt. Administration finns i sidans överkant.');
  console.log('Projekt och filer sparas i apps/web/.local-platform. Ingen livedatabas används.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void shutdown(); });
} catch (error) { console.error(error.message); await shutdown(1); }
