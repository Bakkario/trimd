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

// ISSUE-012 (R-3 chrome) — contextual key hints in the status bar: between
// the center (`L<line> <n>/<total>`) and the right group, a dim hint showing
// only the keymap relevant to the focused pane — doc focus:
// `↑↓ scroll · g/G · ?`; sidebar focus: `↑↓ move · ⏎ open · ?`. Warnings
// take precedence: the hint is omitted while `docMemo.warnings` is
// non-empty.
//
// capture-stdout only surfaces the final state at unmount (ink 8 defers
// frame writes — verified by probe, test/31), so each state is asserted in
// its own render. Assertions use the ANSI-stripped frame; `·`, `⏎` and `⚠`
// survive stripping. Keys go to the fake TTY; `←` (doc → sidebar, ADR-017
// am. 008) is `\x1b[D`.

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

// a.md content: a plain numbered list (no warnings) or a list followed by an
// unresolved wikilink paragraph (source blank lines keep markdown-it from
// merging it into the list) → warnings = ['1 unresolved links'].
function setup(withWarning: boolean): { inst: ReturnType<typeof render>; out: Writable; stdin: Readable; tmp: string } {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-33-'));
  const root = join(tmp, 'vault');
  mkdirSync(root);
  const list = Array.from({ length: 30 }, (_, i) => `${i + 1}. item${i + 1}`).join('\n') + '\n';
  writeFileSync(join(root, 'a.md'), withWarning ? list + '\n[[missing]]\n' : list);
  mkdirSync(join(root, 'sub'));
  writeFileSync(join(root, 'sub', 'z.md'), '# Zebra\n');
  const doc = renderFile(join(root, 'a.md'), { root, width: 49, theme: DEFAULT_THEME, showFrontmatter: true, showHidden: false });
  const out = captureStdout();
  const stdin = fakeTty();
  const inst = render(
    <App doc={doc} root={root} theme={DEFAULT_THEME} themeId="default" sidebarOpen={true} showHidden={false} showFrontmatter={true} />,
    { stdout: out, stdin },
  );
  return { inst, out, stdin, tmp };
}

async function finish(h: { inst: ReturnType<typeof render>; out: Writable }): Promise<string> {
  let unmounted = false;
  try {
    h.inst.unmount();
    unmounted = true;
    await waitExit(h.inst);
  } finally {
    if (!unmounted) h.inst.unmount();
    releaseStdinFixture();
  }
  return stripAnsi((h.out as unknown as { chunks: string[] }).chunks.join(''));
}

test('doc focus: hint `↑↓ scroll · g/G · ?` in the status bar (R-3)', async () => {
  const h = setup(false);
  try {
    await wait(200);
    const frame = await finish(h);
    assert.ok(frame.includes('↑↓ scroll · g/G · ?'), 'doc hint present');
    assert.ok(!frame.includes('↑↓ move'), 'sidebar hint absent');
  } finally {
    rmSync(h.tmp, { recursive: true, force: true });
  }
});

test('after ← (doc → sidebar): hint `↑↓ move · ⏎ open · ?` (R-3)', async () => {
  const h = setup(false);
  try {
    await wait(200);
    h.stdin.push('\x1b[D'); // ← : focus doc → sidebar (ADR-017 am. 008)
    await wait(300);
    const frame = await finish(h);
    assert.ok(frame.includes('↑↓ move · ⏎ open · ?'), 'sidebar hint present');
    assert.ok(!frame.includes('↑↓ scroll'), 'doc hint absent');
  } finally {
    rmSync(h.tmp, { recursive: true, force: true });
  }
});

test('warnings take precedence: hint omitted while a warning is shown (R-3)', async () => {
  const h = setup(true);
  try {
    await wait(200);
    const frame = await finish(h);
    assert.ok(frame.includes('⚠'), 'warning shown in the status bar');
    assert.ok(!frame.includes('↑↓ scroll'), 'doc hint omitted');
    assert.ok(!frame.includes('↑↓ move'), 'sidebar hint omitted');
  } finally {
    rmSync(h.tmp, { recursive: true, force: true });
  }
});
