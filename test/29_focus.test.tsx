import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink';
import App from '../src/ui/App.js';
import { renderFile } from '../src/core/pipeline.js';
import { DEFAULT_THEME } from '../src/core/themes.js';

// ISSUE-002 + ISSUE-008 (ADR-017 amended) — ←/→ switch focus between doc
// and sidebar without toggling the sidebar, spatially (the arrow points at
// the pane it focuses: ← → sidebar, → → doc); no-op when the target pane
// is closed.
// Focus is not rendered directly, so each test observes it behaviorally:
// ↓ scrolls the doc (status bar `L<n> <n>/30`) when the doc is focused, or
// moves the sidebar cursor (reverse-video entry row) when the sidebar is.

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
// process.stdin and removes it on unmount; the ref'd socket handle would keep
// the process alive — release it in teardown (same pattern as tests 16/21/25).
function releaseStdinFixture() {
  process.stdin.pause();
  process.stdin.unref();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 30-line doc (exceeds paneRows 23 → scrollable) + a second file so the
// sidebar has two entries: `a.md`, `b.md`.
function setup(sidebarOpen: boolean): { inst: ReturnType<typeof render>; out: Writable; stdin: Readable; tmp: string } {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-29-'));
  const list = Array.from({ length: 30 }, (_, i) => `${i + 1}. item${i + 1}`).join('\n') + '\n';
  writeFileSync(join(tmp, 'a.md'), list);
  writeFileSync(join(tmp, 'b.md'), '# Bravo\n');
  const doc = renderFile(join(tmp, 'a.md'), { root: tmp, width: 48, theme: DEFAULT_THEME, showFrontmatter: true, showHidden: false });
  const out = captureStdout();
  const stdin = fakeTty();
  const inst = render(
    <App doc={doc} root={tmp} theme={DEFAULT_THEME} themeId="default" sidebarOpen={sidebarOpen} showHidden={false} showFrontmatter={true} />,
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

test('← moves focus doc→sidebar: ↓ afterwards moves the sidebar cursor, not the doc (ADR-017 am. ISSUE-002/008)', async () => {
  const h = setup(true);
  try {
    await wait(200);
    h.stdin.push('\x1b[B'); // doc focused: ↓ scrolls the doc (L1 → L2)
    await wait(300);
    h.stdin.push('\x1b[D'); // ← : focus the sidebar (spatial — sidebar is on the left)
    await wait(300);
    h.stdin.push('\x1b[B'); // ↓ : sidebar cursor 0 → 1 (b.md)
    await wait(300);
    const { raw, frame } = await finish(h);
    assert.ok(frame.includes('L2 2/30'), 'doc scrolled once (status bar L2 2/30)');
    // cursor row starts with \x1b[7m  b.md (ink pads the line after the SGR span)
    assert.ok(raw.includes('\x1b[7m  b.md'), 'cursor moved to the second entry (b.md)');
    assert.ok(!frame.includes('L3 3/30'), 'doc did not scroll a second time');
  } finally {
    rmSync(h.tmp, { recursive: true, force: true });
  }
});

test('→ moves focus sidebar→doc: ↓ afterwards scrolls the doc again (ADR-017 am. ISSUE-002/008)', async () => {
  const h = setup(true);
  try {
    await wait(200);
    h.stdin.push('\x1b[D'); // ← : focus the sidebar (spatial — sidebar is on the left)
    await wait(300);
    h.stdin.push('\x1b[B'); // ↓ : sidebar cursor 0 → 1 (doc does not scroll)
    await wait(300);
    h.stdin.push('\x1b[C'); // → : focus the doc
    await wait(300);
    h.stdin.push('\x1b[B'); // ↓ : doc scrolls (L1 → L2)
    await wait(300);
    const { raw, frame } = await finish(h);
    // cursor row starts with \x1b[7m  b.md (ink pads the line after the SGR span)
    assert.ok(raw.includes('\x1b[7m  b.md'), 'cursor moved to b.md while the sidebar was focused');
    assert.ok(frame.includes('L2 2/30'), 'doc scrolled after ← (status bar L2 2/30)');
    assert.ok(!frame.includes('L3 3/30'), 'doc scrolled exactly once');
  } finally {
    rmSync(h.tmp, { recursive: true, force: true });
  }
});

test('← is a no-op when the sidebar is closed: ↓ still scrolls the doc (ADR-017 am. ISSUE-002/008)', async () => {
  const h = setup(false);
  try {
    await wait(200);
    h.stdin.push('\x1b[D'); // ← : no-op (sidebar closed)
    await wait(300);
    h.stdin.push('\x1b[B'); // ↓ : doc scrolls (focus stayed on the doc)
    await wait(300);
    const { frame } = await finish(h);
    assert.ok(frame.includes('L2 2/30'), 'doc scrolled (focus stayed on the doc)');
  } finally {
    rmSync(h.tmp, { recursive: true, force: true });
  }
});

test('→ is a no-op when the doc is already focused: ↓ scrolls the doc (ADR-017 am. ISSUE-002/008)', async () => {
  const h = setup(true);
  try {
    await wait(200);
    h.stdin.push('\x1b[C'); // → : no-op (focus already on the doc)
    await wait(300);
    h.stdin.push('\x1b[B'); // ↓ : doc scrolls
    await wait(300);
    const { frame } = await finish(h);
    assert.ok(frame.includes('L2 2/30'), 'doc scrolled (focus unchanged)');
  } finally {
    rmSync(h.tmp, { recursive: true, force: true });
  }
});
