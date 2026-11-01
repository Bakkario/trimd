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

// ISSUE-010 (R-1 chrome, ADR-023) — pane separator + pane headers: a dim `│`
// separator column (terminal column 30) between the sidebar and the doc
// (sidebar open only), plus a dim header row (row 0): sidebar header = the
// sidebar cwd, doc header = `¶ <root-relative path>`. Content rows =
// terminalRows − 2 (22 at 24 rows). Mouse geometry shifts accordingly: the
// header row and the separator column are no-ops, sidebar entries and doc
// lines sit at y − 1, docX = x − 31 with the sidebar open, and the status row
// (e.y ≥ contentRows) is a no-op.
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

// a.md: 22 numbered items, then the link row `[alpha](b.md)` at abs line 22
// (off-screen at scrollTop 0 — used to prove the status-row guard), then 7
// numbered items → exactly 30 rendered lines (scrollable at 22 content rows;
// plain paragraphs would wrap and break the line count). b.md: 30-line
// numbered list. sub/: dir with one note. root = <tmp>/vault so the sidebar
// header (basename(root)) is the stable `vault`. Sidebar rows (dirs first):
// ▸ sub (0), a.md (1), b.md (2).
function setup(sidebarOpen: boolean): { inst: ReturnType<typeof render>; out: Writable; stdin: Readable; tmp: string } {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-31-'));
  const root = join(tmp, 'vault');
  mkdirSync(root);
  // Source blank lines below are source-only (the renderer skips them); they
  // keep markdown-it from merging the link paragraph into the surrounding
  // lists → rendered count = 22 + 1 + 7 = 30 lines.
  const aLines = [
    ...Array.from({ length: 22 }, (_, i) => `${i + 1}. item${i + 1}`),
    '',
    '[alpha](b.md)',
    '',
    ...Array.from({ length: 7 }, (_, i) => `${i + 23}. item${i + 23}`),
  ];
  writeFileSync(join(root, 'a.md'), aLines.join('\n') + '\n');
  const list = Array.from({ length: 30 }, (_, i) => `${i + 1}. item${i + 1}`).join('\n') + '\n';
  writeFileSync(join(root, 'b.md'), list);
  mkdirSync(join(root, 'sub'));
  writeFileSync(join(root, 'sub', 'z.md'), '# Zebra\n');
  const doc = renderFile(join(root, 'a.md'), { root, width: 49, theme: DEFAULT_THEME, showFrontmatter: true, showHidden: false });
  const out = captureStdout();
  const stdin = fakeTty();
  const inst = render(
    <App doc={doc} root={root} theme={DEFAULT_THEME} themeId="default" sidebarOpen={sidebarOpen} showHidden={false} showFrontmatter={true} />,
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

test('header row + separator: `│` at col 30 on the header row and all 22 content rows (ADR-023)', async () => {
  const h = setup(true);
  try {
    await wait(200);
    const { frame } = await finish(h);
    const lines = frame.split('\n');
    const hdr = lines.findIndex((l) => l.includes('¶ a.md'));
    assert.ok(hdr >= 0, 'doc header row present (`¶ a.md`)');
    assert.ok(lines[hdr].includes('vault'), 'sidebar header = basename(root)');
    assert.strictEqual(lines[hdr][30], '│', 'separator at col 30 in the header row');
    for (let k = 1; k <= 22; k++) {
      assert.strictEqual(lines[hdr + k][30], '│', `separator at col 30 in content row ${k}`);
    }
    assert.ok(lines[hdr + 1].includes('▸ sub'), 'first sidebar entry starts below the header row');
    assert.ok(lines[hdr + 23].includes('L1 1/30'), 'status row below the 22 content rows');
  } finally {
    rmSync(h.tmp, { recursive: true, force: true });
  }
});

test('sidebar closed: no separator, doc header still present (ADR-023)', async () => {
  const h = setup(false);
  try {
    await wait(200);
    const { frame } = await finish(h);
    assert.ok(frame.includes('¶ a.md'), 'doc header present without the sidebar');
    // DocPane renders scrollbar │ on the right edge, but there is no separator │ column at col 30
    const lines = frame.split('\n');
    const hdr = lines.find((l) => l.includes('¶ a.md'));
    assert.ok(hdr && !hdr.includes('│'), 'no separator column in header when sidebar is closed');
  } finally {
    rmSync(h.tmp, { recursive: true, force: true });
  }
});

test('scrolling uses the 22 content rows: G → maxTop 8 (L9 9/30), ↓ → L2 2/30 (ADR-023)', async () => {
  // capture-stdout only surfaces the final state at unmount (ink 8 defers
  // frame writes — verified by probe), so each scrolled state is asserted
  // in its own render.
  const h1 = setup(true);
  try {
    await wait(200);
    h1.stdin.push('G'); // G : scrollTop → maxTop = 30 − 22 = 8 (was 7 at 23 rows)
    await wait(300);
    const { frame } = await finish(h1);
    assert.ok(frame.includes('L9 9/30'), 'G jumped to maxTop 8 (22 content rows)');
    assert.ok(!frame.includes('L10 10/30'), 'G did not overshoot maxTop');
  } finally {
    rmSync(h1.tmp, { recursive: true, force: true });
  }
  const h2 = setup(true);
  try {
    await wait(200);
    h2.stdin.push('\x1b[B'); // ↓ : scrollTop 0 → 1
    await wait(300);
    const { frame } = await finish(h2);
    assert.ok(frame.includes('L2 2/30'), '↓ scrolled one row');
  } finally {
    rmSync(h2.tmp, { recursive: true, force: true });
  }
});

test('separator-column click is a no-op: focus stays on the doc (ADR-023)', async () => {
  const h = setup(true);
  try {
    await wait(200);
    process.stdin.emit('data', '\x1b[<0;31;6m'); // 0-based (30,5): separator column, content row
    await wait(300);
    h.stdin.push('\x1b[B'); // ↓ : must scroll the doc, not move the sidebar cursor
    await wait(300);
    const { raw, frame } = await finish(h);
    assert.ok(frame.includes('L2 2/30'), 'doc scrolled → focus stayed on the doc');
    assert.ok(!raw.includes('\x1b[7m  a.md'), 'cursor did not move (sidebar not focused)');
  } finally {
    rmSync(h.tmp, { recursive: true, force: true });
  }
});

test('status-row click is a no-op: it must not hit the off-screen link (ADR-023)', async () => {
  const h = setup(true);
  try {
    await wait(200);
    // 0-based (35,23): the status row, one below the visible content area,
    // but on the link span's column — without the e.y ≥ contentRows guard
    // this click would resolve the off-screen link at abs line 22 and
    // navigate to b.md.
    process.stdin.emit('data', '\x1b[<0;36;24m');
    await wait(300);
    const { frame } = await finish(h);
    assert.ok(frame.includes('¶ a.md'), 'still on a.md (no navigation)');
    assert.ok(!frame.includes('¶ b.md'), 'did not navigate to b.md');
    assert.ok(frame.includes('L1 1/30'), 'scrollTop unchanged');
  } finally {
    rmSync(h.tmp, { recursive: true, force: true });
  }
});
