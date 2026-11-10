import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { render } from 'ink';
import Sidebar from '../src/ui/Sidebar.js';
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const waitExit = (inst: { waitUntilExit: () => Promise<unknown> }) =>
  Promise.race([
    inst.waitUntilExit(),
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error('unmount timeout after 2s')), 2000)),
  ]);

test('Sidebar renders ╭, │, ╰, ╯ rounded box frame and Superfile bottom border', async () => {
  const entries: DirEntry[] = [
    { name: 'docs', isDir: true, abs: '/tmp/docs' },
    { name: 'README.md', isDir: false, abs: '/tmp/README.md' },
    { name: 'SCHEMA.md', isDir: false, abs: '/tmp/SCHEMA.md' },
    { name: 'note.md', isDir: false, abs: '/tmp/note.md' },
  ];

  const out = captureStdout();
  const inst = render(
    <Sidebar
      entries={entries}
      cursor={0}
      width={30}
      showBack={false}
      rows={12}
      activeAbs="/tmp/note.md"
      totalDirs={1}
      totalNotes={3}
      theme={DEFAULT_THEME}
      focused={true}
      cwdLabel="vault"
    />,
    { stdout: out, stdin: fakeTty() },
  );

  await wait(50);
  inst.unmount();
  await waitExit(inst);

  const raw = (out as unknown as { chunks: string[] }).chunks.join('');
  const plain = stripAnsi(raw);

  // Rounded box frame
  assert.ok(plain.includes('╭'), 'frame contains top-left rounded corner ╭');
  assert.ok(plain.includes('│'), 'frame contains side border │');
  assert.ok(plain.includes('╰'), 'frame contains bottom-left rounded corner ╰');
  assert.ok(plain.includes('╯'), 'frame contains bottom-right rounded corner ╯');

  // Focused sidebar uses theme.colors.scrollbar (DEFAULT_THEME.colors.scrollbar is 38;5;39)
  assert.ok(raw.includes(`\x1b[${DEFAULT_THEME.colors.scrollbar}m╭`), 'focused sidebar paints frame with scrollbar color');

  // Role-based folder and file icons
  assert.ok(plain.includes('📂 docs') || plain.includes('📁 docs'), 'folder renders 📁/📂 icon');
  assert.ok(plain.includes('📘 README.md'), 'README.md renders 📘 icon');
  assert.ok(plain.includes('📐 SCHEMA.md'), 'SCHEMA.md renders 📐 icon');
  assert.ok(plain.includes('● 📝 note.md'), 'active note renders ● 📝 icon');

  // Bottom border embeds dirs · and notes inside ╰─┤ ... ├─╯
  assert.ok(plain.includes('╰─┤ 1 dirs · 3 notes'), 'bottom border embeds dirs and notes inside ╰─┤ ... ├─╯');
  assert.ok(plain.includes('├─╯') || plain.includes('├───╯') || plain.includes('├───────╯'), 'bottom border closes with ├─...─╯');
});

test('Unfocused sidebar uses theme.colors.tableBorder on frame borders', async () => {
  const entries: DirEntry[] = [
    { name: 'other.md', isDir: false, abs: '/tmp/other.md' },
  ];

  const out = captureStdout();
  const inst = render(
    <Sidebar
      entries={entries}
      cursor={0}
      width={30}
      showBack={false}
      rows={8}
      theme={DEFAULT_THEME}
      focused={false}
      cwdLabel="vault"
    />,
    { stdout: out, stdin: fakeTty() },
  );

  await wait(50);
  inst.unmount();
  await waitExit(inst);

  const raw = (out as unknown as { chunks: string[] }).chunks.join('');
  // Unfocused sidebar uses theme.colors.tableBorder (DEFAULT_THEME.colors.tableBorder is 2;38;5;245)
  assert.ok(raw.includes('38;5;245') && raw.includes('╭'), 'unfocused sidebar paints frame with tableBorder color');
});
