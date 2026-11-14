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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const waitExit = (inst: { waitUntilExit: () => Promise<unknown> }) =>
  Promise.race([
    inst.waitUntilExit(),
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error('unmount timeout after 2s')), 2000)),
  ]);

function releaseStdinFixture() {
  process.stdin.pause();
  process.stdin.unref();
}

test('Sidebar renders active doc dot ● and footer summary', async () => {
  const entries = [
    { name: 'folder', isDir: true, abs: '/tmp/folder' },
    { name: 'active.md', isDir: false, abs: '/tmp/active.md' },
    { name: 'other.md', isDir: false, abs: '/tmp/other.md' },
  ];

  const out = captureStdout();
  const inst = render(
    <Sidebar
      entries={entries}
      cursor={0}
      width={30}
      showBack={false}
      rows={10}
      activeAbs="/tmp/active.md"
      totalDirs={1}
      totalNotes={2}
      theme={DEFAULT_THEME}
    />,
    { stdout: out },
  );

  await wait(100);
  inst.unmount();
  await waitExit(inst);

  const raw = (out as unknown as { chunks: string[] }).chunks.join('');
  const plain = stripAnsi(raw);

  // Active doc color styling (ADR-030 amended ISSUE-024: activeDoc color on icon and filename)
  assert.ok(plain.includes('active.md'), 'active note name present');
  assert.ok(raw.includes('38;5;51'), 'active note styled with activeDoc color');

  // Summary footer
  assert.ok(plain.includes('1 dirs · 2 notes'), 'footer renders dirs and notes count');
});

test('App: sidebar displays passive active-doc dot while browsing other notes', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-50-'));
  const root = join(tmp, 'vault');
  mkdirSync(root);
  writeFileSync(join(root, 'note1.md'), '# Note 1\n');
  writeFileSync(join(root, 'note2.md'), '# Note 2\n');

  const doc = renderFile(join(root, 'note1.md'), { root, width: 45, theme: DEFAULT_THEME, showFrontmatter: false });
  const out = captureStdout();
  const stdin = fakeTty();
  const inst = render(
    <App doc={doc} root={root} theme={DEFAULT_THEME} themeId="default" sidebarOpen={true} showHidden={false} showFrontmatter={false} />,
    { stdout: out, stdin },
  );

  try {
    await wait(200);
    inst.unmount();
    await waitExit(inst);
    releaseStdinFixture();

    const frame = stripAnsi((out as unknown as { chunks: string[] }).chunks.join(''));
    assert.ok(frame.includes('note1.md'), 'note1 is rendered');
    const rawApp = (out as unknown as { chunks: string[] }).chunks.join('');
    assert.ok(rawApp.includes('38;5;51'), 'active note styled with activeDoc color');
    assert.ok(frame.includes('0 dirs · 2 notes'), 'sidebar footer present');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
