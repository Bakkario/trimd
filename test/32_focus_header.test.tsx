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

// ISSUE-011 (R-2 chrome) — visual focus indicator on the pane headers: the
// focused pane's header is bright (no dim SGR), the inactive pane's header
// is dim (ADR-023 headers; focus from ADR-017). The dim SGR is `2` in
// DEFAULT_THEME. Assertion mechanic: ink writes style runs around its
// managed text (and merges adjacent dim `Text`s into one SGR span — e.g.
// `\x1b[2m│¶ a.md`), so the probe-verified way to ask "is this header dim?"
// is: what SGR is active at the start of the header text, i.e. the last
// `\x1b[<n>m` before it (`sgrActiveAt` below). `2` = dim, anything else
// (incl. a reset like `22`) = bright.
//
// capture-stdout only surfaces the final state at unmount (ink 8 defers
// frame writes — verified by probe, test/31), so each focus state is
// asserted in its own render.
//
// Fixture = test/31's: root = <tmp>/vault (sidebar header `vault`), a.md
// 30 rendered lines (doc header `¶ a.md`). Keys go to the fake TTY; `←`
// (doc → sidebar, ADR-017 am. 008) is `\x1b[D`.

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

// The SGR active at raw[idx] = the last SGR emitted before it (ink writes
// style runs, so the run open at idx's position styles the text there).
function sgrActiveAt(raw: string, idx: number): string {
  const re = /\x1b\[([0-9;]*)m/g;
  let last = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m.index >= idx) break;
    last = m[1];
  }
  return last;
}

function setup(): { inst: ReturnType<typeof render>; out: Writable; stdin: Readable; tmp: string } {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-32-'));
  const root = join(tmp, 'vault');
  mkdirSync(root);
  // 30 rendered lines (numbered list — no wrapping, no source blanks needed
  // for this test; no link paragraph is involved).
  const list = Array.from({ length: 30 }, (_, i) => `${i + 1}. item${i + 1}`).join('\n') + '\n';
  writeFileSync(join(root, 'a.md'), list);
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
  return (h.out as unknown as { chunks: string[] }).chunks.join('');
}

test('initial doc focus: doc header bright, sidebar header dim (R-2)', async () => {
  const h = setup();
  try {
    await wait(200);
    const raw = await finish(h);
    const vault = raw.indexOf('vault');
    const docHdr = raw.indexOf('¶ a.md');
    assert.ok(vault >= 0, 'sidebar header present (`vault`)');
    assert.ok(docHdr >= 0, 'doc header present (`¶ a.md`)');
    assert.strictEqual(sgrActiveAt(raw, vault), '2', 'inactive sidebar header is dim');
  } finally {
    rmSync(h.tmp, { recursive: true, force: true });
  }
});

test('after ← (doc → sidebar): sidebar header bright, doc header dim (R-2)', async () => {
  const h = setup();
  try {
    await wait(200);
    h.stdin.push('\x1b[D'); // ← : focus doc → sidebar (ADR-017 am. 008)
    await wait(300);
    const raw = await finish(h);
    const vault = raw.indexOf('vault');
    const docHdr = raw.indexOf('¶ a.md');
    assert.ok(vault >= 0, 'sidebar header present (`vault`)');
    assert.ok(docHdr >= 0, 'doc header present (`¶ a.md`)');
    assert.strictEqual(sgrActiveAt(raw, docHdr), '2', 'inactive doc header is dim');
  } finally {
    rmSync(h.tmp, { recursive: true, force: true });
  }
});
