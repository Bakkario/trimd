import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 5.1 — errors & exit codes (ADR-018). We spawn the real entry point
// (node --import tsx src/trimd.tsx …) and assert exit code + the single
// stderr line `trimd: <message>` for each error class.

const here = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/trimd.tsx', ...args], {
      cwd: opts.cwd ?? here,
      env: { ...process.env, ...(opts.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

const tmp = mkdtempSync(join(tmpdir(), 'trimd-26-'));
test.after(() => rmSync(tmp, { recursive: true, force: true }));

test('missing file → exit 1 + `trimd: file not found:` (ADR-018)', async () => {
  const r = await run([join(tmp, 'nope.md')]);
  assert.equal(r.code, 1, 'exit code 1 (got ' + r.code + ')');
  assert.ok(r.stderr.startsWith('trimd: file not found:'), 'stderr (got: ' + r.stderr + ')');
});

test('--bogus → exit 3 + `trimd: unknown flag: --bogus` (ADR-018)', async () => {
  const r = await run([join(tmp, 'nope.md'), '--bogus']);
  assert.equal(r.code, 3, 'exit code 3 (got ' + r.code + ')');
  assert.ok(r.stderr.startsWith('trimd: unknown flag: --bogus'), 'stderr (got: ' + r.stderr + ')');
});

test('bad config JSON (temp) → exit 3 + `trimd: config:` (ADR-018, INV-4.2)', async () => {
  const cfg = join(tmp, 'bad.json');
  writeFileSync(cfg, '{ not json');
  const r = await run([join(tmp, 'nope.md'), '--config', cfg]);
  assert.equal(r.code, 3, 'exit code 3 (got ' + r.code + ')');
  assert.ok(r.stderr.startsWith('trimd: config:'), 'stderr (got: ' + r.stderr + ')');
});

test('--help → exit 0, usage on stdout, empty stderr (ADR-018)', async () => {
  const r = await run(['--help']);
  assert.equal(r.code, 0, 'exit code 0 (got ' + r.code + ')');
  assert.ok(r.stdout.includes('usage: trimd'), 'stdout has usage (got: ' + r.stdout + ')');
  assert.equal(r.stderr, '', 'stderr empty (got: ' + r.stderr + ')');
});

test('missing file with --debug → exit 1 + stack trace on stderr (ADR-018)', async () => {
  const r = await run([join(tmp, 'nope.md'), '--debug']);
  assert.equal(r.code, 1, 'exit code 1 (got ' + r.code + ')');
  assert.ok(r.stderr.startsWith('trimd: file not found:'), 'stderr message line (got: ' + r.stderr + ')');
  assert.ok(r.stderr.includes('at '), '--debug adds a stack trace (got: ' + r.stderr + ')');
});
