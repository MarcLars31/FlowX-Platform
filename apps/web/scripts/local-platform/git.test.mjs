import test from 'node:test';
import assert from 'node:assert/strict';
import { readLocalPlatformBranch } from './git.mjs';
import { assertLocalPlatformEnvironment } from './environment.mjs';

const missing = () => Object.assign(new Error('not found'), { code: 'ENOENT' });
const windows = { ProgramFiles: 'C:\\Program Files', ProgramW6432: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\Tester\\AppData\\Local', USERPROFILE: 'C:\\Users\\Tester' };

test('Git on PATH is preferred and receives the exact working directory without a shell', () => {
  const calls = [];
  const branch = readLocalPlatformBranch('C:\\work tree\\apps\\web', {
    platform: 'win32', environment: windows,
    execute: (binary, args, options) => {
      calls.push(String(binary));
      assert.deepEqual(args, ['branch', '--show-current']);
      assert.equal(options?.cwd, 'C:\\work tree\\apps\\web');
      assert.equal(options?.env, windows);
      assert.equal(options?.windowsHide, true);
      assert.equal(options?.shell, undefined);
      return 'codex/scipx-upgrades\r\n';
    }
  });
  assert.equal(branch, 'codex/scipx-upgrades');
  assert.deepEqual(calls, ['git']);
});

test('Windows falls back to Git for Windows when Git is absent from PATH', () => {
  const calls = [];
  const branch = readLocalPlatformBranch('C:\\work', {
    platform: 'win32', environment: windows,
    execute: binary => {
      calls.push(String(binary));
      if (binary === 'git') throw missing();
      assert.equal(binary, 'C:\\Program Files\\Git\\cmd\\git.exe');
      return 'codex/scipx-upgrades\n';
    }
  });
  assert.equal(branch, 'codex/scipx-upgrades');
  assert.equal(calls.length, 2);
});

test('the installed Codex runtime Git works when conventional Windows installations are absent', () => {
  const calls = [];
  assert.equal(readLocalPlatformBranch('C:\\work', {
    platform: 'win32', environment: windows,
    execute: binary => {
      calls.push(String(binary));
      if (binary !== 'C:\\Users\\Tester\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\git\\cmd\\git.exe') throw missing();
      return 'codex/scipx-upgrades\n';
    }
  }), 'codex/scipx-upgrades');
  assert.equal(calls.length, 4);
  assert.equal(new Set(calls).size, calls.length);
});

test('a missing Git executable gives an actionable error; non-Windows uses PATH only', () => {
  for (const platform of ['win32', 'linux']) {
    const calls = [];
    assert.throws(() => readLocalPlatformBranch('/work', { platform, environment: windows, execute: binary => {
      calls.push(String(binary)); throw missing();
    } }), /Git kunde inte hittas.*PATH/);
    if (platform === 'linux') assert.deepEqual(calls, ['git']);
  }
});

test('repository errors, denied execution and timeouts do not fall back or bypass the branch check', () => {
  for (const failure of [{ status: 128 }, { code: 'EACCES' }, { code: 'ETIMEDOUT' }]) {
    const calls = [];
    assert.throws(() => readLocalPlatformBranch('C:\\work', { platform: 'win32', environment: windows, execute: binary => {
      calls.push(String(binary)); throw Object.assign(new Error('failed'), failure);
    } }), /Git hittades men kunde inte läsa/);
    assert.deepEqual(calls, ['git']);
  }
  for (const branch of ['Frontend-', '']) {
    const actual = readLocalPlatformBranch('C:\\work', { execute: () => branch });
    assert.throws(() => assertLocalPlatformEnvironment({}, actual), /codex\/scipx-upgrades/);
  }
});
