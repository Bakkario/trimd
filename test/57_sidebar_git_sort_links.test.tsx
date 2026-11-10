import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Writable } from 'node:stream';
import { render } from 'ink';
import { listEntries, detectGitModified, clearGitCache } from '../src/core/resolve.js';
import Sidebar from '../src/ui/Sidebar.js';
import { DEFAULT_THEME } from '../src/core/themes.js';

function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\]8;[^\]]*\\/g, '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

function captureStdout(): Writable {
  const chunks: string[] = [];
  const out = new Writable({
    write(chunk: Buffer | string, _enc, cb) {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      cb();
    },
  });
  Object.defineProperty(out, 'rows', { value: 24 });
  Object.defineProperty(out, 'columns', { value: 80 });
  (out as unknown as { chunks: string[] }).chunks = chunks;
  return out;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const waitExit = (inst: { waitUntilExit: () => Promise<unknown> }) =>
  Promise.race([
    inst.waitUntilExit(),
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error('unmount timeout after 2s')), 2000)),
  ]);

test('listEntries sorts by mtime (newest first, dirs grouped first) when sortBy is mtime', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-57-'));
  try {
    const dirOld = join(tmp, 'old_dir');
    const dirNew = join(tmp, 'new_dir');
    mkdirSync(dirOld);
    mkdirSync(dirNew);

    const fileOld = join(tmp, 'old_doc.md');
    const fileNew = join(tmp, 'new_doc.md');
    writeFileSync(fileOld, '# Old\n');
    writeFileSync(fileNew, '# New\n');

    const past = new Date(Date.now() - 100000);
    const recent = new Date(Date.now());

    utimesSync(dirOld, past, past);
    utimesSync(dirNew, recent, recent);
    utimesSync(fileOld, past, past);
    utimesSync(fileNew, recent, recent);

    const byName = listEntries(tmp, false, 'name');
    assert.deepEqual(byName.map((e) => e.name), ['new_dir', 'old_dir', 'new_doc.md', 'old_doc.md']);

    const byMtime = listEntries(tmp, false, 'mtime');
    assert.deepEqual(byMtime.map((e) => e.name), ['new_dir', 'old_dir', 'new_doc.md', 'old_doc.md']);

    // Now invert mtimes so old_dir and old_doc.md are newer
    const newest = new Date(Date.now() + 5000);
    utimesSync(dirOld, newest, newest);
    utimesSync(fileOld, newest, newest);

    const byMtimeUpdated = listEntries(tmp, false, 'mtime');
    assert.deepEqual(byMtimeUpdated.map((e) => e.name), ['old_dir', 'new_dir', 'old_doc.md', 'new_doc.md']);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('detectGitModified is resilient on non-git dir and detects changes in git repo', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-git-'));
  try {
    clearGitCache();
    // Non-git directory: returns empty Set without error
    const nonGit = detectGitModified(tmp);
    assert.equal(nonGit.size, 0, 'non-git directory returns empty Set');

    // Init git repo
    spawnSync('git', ['init'], { cwd: tmp, stdio: 'ignore' });
    spawnSync('git', ['config', 'user.name', 'test'], { cwd: tmp, stdio: 'ignore' });
    spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tmp, stdio: 'ignore' });

    const fileA = join(tmp, 'tracked.md');
    writeFileSync(fileA, '# Tracked\n');
    spawnSync('git', ['add', 'tracked.md'], { cwd: tmp, stdio: 'ignore' });
    spawnSync('git', ['commit', '-m', 'init'], { cwd: tmp, stdio: 'ignore' });

    clearGitCache(tmp);
    const clean = detectGitModified(tmp);
    assert.equal(clean.size, 0, 'clean repo returns 0 modified files');

    // Modify tracked file and add untracked file
    writeFileSync(fileA, '# Modified\n');
    const fileB = join(tmp, 'untracked.md');
    writeFileSync(fileB, '# Untracked\n');

    clearGitCache(tmp);
    const dirty = detectGitModified(tmp);
    assert.ok(dirty.has(fileA), 'detects modified fileA');
    assert.ok(dirty.has(fileB), 'detects untracked fileB');
  } finally {
    clearGitCache();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('Sidebar renders [mtime] header and links mini-panel when rows >= 16', async () => {
  const entries = [
    { name: 'README.md', isDir: false, abs: '/tmp/README.md' },
    { name: 'guide.md', isDir: false, abs: '/tmp/guide.md' },
  ];

  const out = captureStdout();
  const inst = render(
    <Sidebar
      entries={entries}
      cursor={0}
      width={30}
      showBack={false}
      rows={18}
      theme={DEFAULT_THEME}
      focused={true}
      cwdLabel="vault"
      sortBy="mtime"
      outgoingLinks={[
        { label: 'architecture', resolved: true },
        { label: 'missing_spec', resolved: false },
      ]}
      backlinks={['index.md']}
    />,
    { stdout: out },
  );

  await wait(50);
  inst.unmount();
  await waitExit(inst);

  const raw = (out as unknown as { chunks: string[] }).chunks.join('');
  const plain = stripAnsi(raw);

  // Header contains [mtime]
  assert.ok(plain.includes('[mtime]'), 'sidebar header contains [mtime] sort indicator');

  // Links mini-panel rendered inside the frame
  assert.ok(plain.includes('Links'), 'sidebar contains Links divider');
  assert.ok(plain.includes('↗ architecture'), 'renders resolved outgoing link with ↗');
  assert.ok(plain.includes('⚠ missing_spec'), 'renders unresolved outgoing link with ⚠');
  assert.ok(plain.includes('↩ index.md'), 'renders backlink with ↩');
});
