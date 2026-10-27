import { execFileSync } from 'node:child_process';
import { win32 } from 'node:path';

function gitCandidates(environment, platform) {
  if (platform !== 'win32') return ['git'];
  const installations = [
    ...[environment.ProgramFiles, environment.ProgramW6432, environment['ProgramFiles(x86)']]
      .filter(Boolean).map(root => win32.join(root, 'Git', 'cmd', 'git.exe')),
    ...(environment.LOCALAPPDATA ? [win32.join(environment.LOCALAPPDATA, 'Programs', 'Git', 'cmd', 'git.exe')] : []),
    ...(environment.USERPROFILE ? [win32.join(environment.USERPROFILE, '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'native', 'git', 'cmd', 'git.exe')] : [])
  ];
  return ['git', ...new Set(installations)];
}

/** Use installed Git without changing the user's PATH or guessing the branch
 * from a folder name. Only a missing executable permits the next candidate. */
export function readLocalPlatformBranch(cwd, {
  environment = process.env, platform = process.platform, execute = execFileSync
} = {}) {
  for (const binary of gitCandidates(environment, platform)) {
    try {
      return execute(binary, ['branch', '--show-current'], {
        cwd, env: environment, encoding: 'utf8', windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000
      }).trim();
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw new Error('Git hittades men kunde inte läsa arbetskopians gren. Kontrollera att du startar från en fungerande Git-arbetskopia.', { cause: error });
    }
  }
  throw new Error('Git kunde inte hittas. Lägg Git i terminalens PATH eller installera Git för Windows och öppna terminalen igen.');
}
