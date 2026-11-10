import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink';
import App from '../src/ui/App.js';
import Sidebar from '../src/ui/Sidebar.js';
import { renderFile } from '../src/core/pipeline.js';
import { DEFAULT_THEME } from '../src/core/themes.js';
import type { DirEntry } from '../src/core/resolve.js';

function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\]8;[^\]]*\\/g, '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

function fakeTty(): Readable {
  const stdin = new Readable({ read() {} });
  Object.defineProperty(stdin, 'isTTY', { value: true });
  (stdin as unknown as { setRawMode: (e: boolean) => void }).setRawMode = () => {};
  return stdin;
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

const waitExit = (inst: { waitUntilExit: () => Promise<unknown> }) =>
  Promise.race([
    inst.waitUntilExit(),
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error('unmount timeout after 2s')), 2000)),
  ]);

function releaseStdinFixture() {
  process.stdin.pause();
  process.stdin.unref();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('ISSUE-017: Sidebar component windowing slices to rows height when rows is provided', async () => {
  const entries: DirEntry[] = [];
  for (let i = 0; i < 40; i++) {
    entries.push({ name: `note_${i}.md`, isDir: false, abs: `/tmp/note_${i}.md` });
  }

  const chunks: string[] = [];
  const out = new Writable({ write(c, _, cb) { chunks.push(c.toString()); cb(); } });
  const fakeStdin = fakeTty();

  // cursor at 35, window height = 10
  const inst = render(
    <Sidebar entries={entries} cursor={35} width={30} showBack={false} rows={10} />,
    { stdout: out, stdin: fakeStdin },
  );
  inst.unmount();
  await waitExit(inst);

  const raw = chunks.join('');
  const lines = raw.trim().split('\n');
  assert.equal(lines.length, 10, 'renders exactly 10 rows without overflowing');
  const frame = stripAnsi(raw);
  assert.ok(frame.includes('note_35.md'), 'cursor item note_35.md is visible in window');
  assert.ok(raw.includes('\x1b[7m'), 'cursor line is highlighted in reverse video');
});

test('ISSUE-017: App scrolling sidebar down past viewport keeps cursor visible and clamps correctly', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-53-'));
  const root = join(tmp, 'vault');
  mkdirSync(root);
  for (let i = 1; i <= 35; i++) {
    writeFileSync(join(root, `doc_${String(i).padStart(2, '0')}.md`), `# Doc ${i}\n`);
  }
  const firstDoc = join(root, 'doc_01.md');
  const doc = renderFile(firstDoc, { root, width: 49, theme: DEFAULT_THEME, showFrontmatter: false, showHidden: false });
  const out = captureStdout();
  const stdin = fakeTty();
  const inst = render(
    <App doc={doc} root={root} theme={DEFAULT_THEME} themeId="default" sidebarOpen={true} showHidden={false} showFrontmatter={false} />,
    { stdout: out, stdin },
  );

  try {
    await wait(200);
    // Switch focus to sidebar: ← (spatial, ADR-017 am. 008)
    stdin.push('\x1b[D');
    await wait(100);
    // Move down 30 times
    for (let i = 0; i < 30; i++) {
      stdin.push('\x1b[B'); // down arrow
    }
    await wait(200);

    inst.unmount();
    await waitExit(inst);
    releaseStdinFixture();

    const raw = (out as unknown as { chunks: string[] }).chunks.join('');
    const frame = stripAnsi(raw);
    assert.ok(frame.includes('doc_31.md'), 'scrolled entries are visible in the sidebar');
    assert.ok(raw.includes('\x1b[7m') && raw.includes('doc_31.md'), 'cursor at doc_31.md is rendered in reverse video');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
