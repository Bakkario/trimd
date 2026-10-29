import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink';
import Sidebar from '../src/ui/Sidebar.js';
import { listEntries } from '../src/core/resolve.js';
import type { DirEntry } from '../src/core/resolve.js';

// strips SGR, OSC 8 and generic terminal control sequences
function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\]8;[^\]]*\\/g, '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

test('Sidebar: dirs carry ▸, cursor line is reverse video, files have no ▸ (02 §11, INV-3.4)', async () => {
  const entries: DirEntry[] = [
    { name: 'zeta', isDir: true, abs: '/x/zeta' },
    { name: 'Alpha', isDir: true, abs: '/x/Alpha' },
    { name: 'beta.md', isDir: false, abs: '/x/beta.md' },
    { name: 'gamma.md', isDir: false, abs: '/x/gamma.md' },
  ];

  const chunks: string[] = [];
  const out = new Writable({
    write(chunk: Buffer | string, _enc, cb) {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      cb();
    },
  });
  const fakeStdin = new Readable({ read() {} });
  Object.defineProperty(fakeStdin, 'isTTY', { value: true });
  (fakeStdin as unknown as { setRawMode: (e: boolean) => void }).setRawMode = () => {};

  const inst = render(
    <Sidebar entries={entries} cursor={2} width={30} />,
    { stdout: out, stdin: fakeStdin },
  );
  inst.unmount();
  await Promise.race([
    inst.waitUntilExit(),
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error('unmount timeout after 2s')), 2000)),
  ]);

  const raw = chunks.join('');
  assert.ok(raw.includes('\x1b[7m'), 'cursor line wrapped in reverse video');
  const frame = stripAnsi(raw);
  assert.ok(frame.includes('▸ zeta'), 'dir entry rendered with ▸ prefix');
  assert.ok(frame.includes('▸ Alpha'), 'dir entry rendered with ▸ prefix');
  const betaLine = frame.split('\n').find((l) => l.includes('beta.md'));
  assert.ok(betaLine !== undefined, 'file entry rendered');
  assert.ok(!betaLine!.includes('▸'), 'file entry has no ▸ prefix');
});

test('listEntries: dirs first, case-insensitive sort, md-only files, dot rules (02 §9)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-18-'));
  try {
    mkdirSync(join(tmp, 'zeta'));
    mkdirSync(join(tmp, 'Alpha'));
    mkdirSync(join(tmp, 'notes'));
    mkdirSync(join(tmp, '.obsidian'));
    writeFileSync(join(tmp, 'beta.md'), '');
    writeFileSync(join(tmp, 'Gamma.md'), '');
    writeFileSync(join(tmp, 'readme.txt'), '');
    writeFileSync(join(tmp, '.hidden.md'), '');

    const entries = listEntries(tmp, false);
    assert.deepEqual(
      entries.map((e) => e.name),
      ['Alpha', 'notes', 'zeta', 'beta.md', 'Gamma.md'],
      'dirs first (case-insensitive), then md files (case-insensitive); .obsidian/.hidden.md/readme.txt excluded',
    );
    assert.ok(entries.slice(0, 3).every((e) => e.isDir), 'first three are dirs');
    assert.ok(entries.slice(3).every((e) => !e.isDir), 'last two are files');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
