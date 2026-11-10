import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink';
import App from '../src/ui/App.js';
import { renderFile } from '../src/core/pipeline.js';
import { DEFAULT_THEME } from '../src/core/themes.js';

// ISSUE-003 (INV-3.6 am., ADR-012 am.) — focus follows click: mouseup sets
// keyboard focus to the clicked pane. Focus is not rendered directly, so
// each test observes it behaviorally: ↓ scrolls the doc (status bar
// `L<n> <n>/30`) when the doc is focused, or moves the sidebar cursor
// (reverse-video entry row) when the sidebar is.
// Keyboard keys go to the fake TTY; mouse bytes go to process.stdin
// (App's mouse listener is attached to process.stdin — test/21 pattern).

// strips SGR, OSC 8 and generic terminal control sequences
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

// The App's mouse effect attaches a 'data' listener to the test process's
// process.stdin and removes it on unmount; the ref'd socket handle would
// keep the process alive — release it in teardown (test/16/21/25 pattern).
function releaseStdinFixture() {
  process.stdin.pause();
  process.stdin.unref();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// a.md: link paragraph to b.md on row 0 + 29 numbered items (30 rendered
// lines total → scrollable at paneRows 23; plain paragraphs would wrap and
// break the line count). b.md: 30-line numbered list. sub/: dir with one
// note. Sidebar rows (dirs first): ▸ sub (0), a.md (1), b.md (2).
function setup(): { inst: ReturnType<typeof render>; out: Writable; stdin: Readable; tmp: string } {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-30-'));
  const aLines = ['[alpha](b.md)', ...Array.from({ length: 29 }, (_, i) => `${i + 1}. item${i + 1}`)];
  writeFileSync(join(tmp, 'a.md'), aLines.join('\n') + '\n');
  const list = Array.from({ length: 30 }, (_, i) => `${i + 1}. item${i + 1}`).join('\n') + '\n';
  writeFileSync(join(tmp, 'b.md'), list);
  mkdirSync(join(tmp, 'sub'));
  writeFileSync(join(tmp, 'sub', 'z.md'), '# Zebra\n');
  const doc = renderFile(join(tmp, 'a.md'), { root: tmp, width: 48, theme: DEFAULT_THEME, showFrontmatter: true, showHidden: false });
  const out = captureStdout();
  const stdin = fakeTty();
  const inst = render(
    <App doc={doc} root={tmp} theme={DEFAULT_THEME} themeId="default" sidebarOpen={true} showHidden={false} showFrontmatter={true} />,
    { stdout: out, stdin },
  );
  return { inst, out, stdin, tmp };
}

async function finish(h: { inst: ReturnType<typeof render>; out: Writable }): Promise<{ raw: string; frame: string }> {
  let unmounted = false;
  try {
    h.inst.unmount();
    unmounted = true;
    await waitExit(h.inst);
  } finally {
    if (!unmounted) h.inst.unmount();
    releaseStdinFixture();
  }
  const raw = (h.out as unknown as { chunks: string[] }).chunks.join('');
  return { raw, frame: stripAnsi(raw) };
}

// Konsole left-button release bytes (code 0), 1-based coords (ADR-012 am.
// ISSUE-001; ADR-023 am. ISSUE-010 — content starts below the header row,
// and the doc pane starts at column 31 with the separator column open):
const clickDoc = () => process.stdin.emit('data', '\x1b[<0;67;7m');    // 0-based (66,6): doc row 5, doc col 35, no span
const clickSidebarRow = (row: number) => process.stdin.emit('data', `\x1b[<0;11;${row + 5}m`); // 0-based: entries start at content row 3 (frame header rows 0-2)

test('doc click outside a link moves focus to the doc (INV-3.6 am. ISSUE-003)', async () => {
  const h = setup();
  try {
    await wait(200);
    h.stdin.push('\x1b[C'); // → : sidebar focus (cursor stays on row 0, sub)
    await wait(300);
    clickDoc(); // click doc row 5 (plain line, no span)
    await wait(300);
    h.stdin.push('\x1b[B'); // ↓ : must scroll the doc, not move the cursor
    await wait(300);
    const { raw, frame } = await finish(h);
    assert.ok(frame.includes('L2 2/31'), 'doc scrolled (status bar L2 2/31) → doc has focus');
    assert.ok(!raw.includes('a.md\x1b[0m') || !raw.includes('\x1b[7m'), 'cursor did not move (sidebar not focused)');
  } finally {
    rmSync(h.tmp, { recursive: true, force: true });
  }
});

test('sidebar file click opens the entry and keeps sidebar focus (INV-3.6 am. ISSUE-003)', async () => {
  const h = setup();
  try {
    await wait(200);
    clickSidebarRow(2); // click b.md (row 2 — dirs first)
    await wait(300);
    h.stdin.push('\x1b[B'); // ↓ : must move the cursor, not scroll the doc
    await wait(300);
    const { raw, frame } = await finish(h);
    assert.ok(raw.includes('\x1b[7m') && frame.includes('a.md'), 'cursor moved sub → a.md → sidebar has focus');
    assert.ok(frame.includes('b.md'), 'sidebar click opened b.md (breadcrumb)');
    assert.ok(!frame.includes('L2 2/30') && !frame.includes('L2 2/31'), 'doc (now b.md) did not scroll');
  } finally {
    rmSync(h.tmp, { recursive: true, force: true });
  }
});

test('sidebar dir click enters the dir and keeps sidebar focus (regression, INV-3.6 am. ISSUE-003)', async () => {
  const h = setup();
  try {
    await wait(200);
    clickSidebarRow(0); // click sub (row 0)
    await wait(300);
    const { raw, frame } = await finish(h);
    assert.ok(raw.includes('\x1b[7m') && frame.includes('z.md'), 'entered sub — cursor on z.md (sidebar focus)');
    assert.ok(frame.includes('L1 1/31'), 'doc unchanged (a.md at top)');
  } finally {
    rmSync(h.tmp, { recursive: true, force: true });
  }
});
