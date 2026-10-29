import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 5.3 — final audit: build, built-bin usage, core layering, fixture sanitization.

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');

function run(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: repo,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

test('audit: pnpm build exits 0', async () => {
  const r = await run('pnpm', ['build']);
  assert.equal(r.code, 0, 'pnpm build failed (exit ' + r.code + '): ' + r.stderr.slice(0, 400));
});

test('audit: node dist/trimd.js --help exits 0 + usage on stdout', async () => {
  const r = await run(process.execPath, ['dist/trimd.js', '--help']);
  assert.equal(r.code, 0, '--help failed (exit ' + r.code + '): ' + r.stderr.slice(0, 400));
  assert.ok(r.stdout.includes('usage: trimd'), 'missing usage (got: ' + r.stdout.slice(0, 200) + ')');
});

test('audit: src/core layering — no ink / react / src/ui imports (ADR-005)', () => {
  const dir = join(repo, 'src', 'core');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
  assert.ok(files.length > 0, 'no src/core/*.ts found');
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf8');
    // every module specifier in import/export statements (any layout)
    for (const m of src.matchAll(/(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g)) {
      const spec = m[1];
      assert.ok(
        spec !== 'ink' && !spec.startsWith('ink/') &&
        spec !== 'react' && !spec.startsWith('react/') &&
        !spec.startsWith('../ui/') && !spec.startsWith('./ui/'),
        f + ' imports a forbidden module: ' + spec,
      );
    }
  }
});

test('audit: vault fixtures — exactly 3 sanitized notes, none contains /home/walid', () => {
  const dir = join(repo, 'test', 'fixtures', 'vault');
  const files = readdirSync(dir).sort();
  assert.deepEqual(files, ['vault_callout_note.md', 'vault_daily_log.md', 'vault_wiki_note.md']);
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf8');
    assert.ok(!src.includes('/home/walid'), f + ' contains /home/walid (unsanitized)');
  }
});
