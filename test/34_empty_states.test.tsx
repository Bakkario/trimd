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

// ISSUE-013 (R-4 chrome) — empty states: an empty sidebar (no entries in the
// cwd) shows a dim `(no notes)` row; an empty doc (no rendered lines) shows
// a dim `(empty document)` row in place of the DocPane.
//
// capture-stdout only surfaces the final state at unmount (ink 8 defers
// frame writes — verified by probe, test/31). Assertions use the
// ANSI-stripped frame. Probe-verified fixture facts: an empty `.md` file
// renders 0 lines; a directory with only hidden files yields 0 entries at
// showHidden=false.

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

function setup(docFile: string, root: string): { inst: ReturnType<typeof render>; out: Writable; stdin: Readable } {
  const list = Array.from({ length: 30 }, (_, i) => `${i + 1}. item${i + 1}`).join('\n') + '\n';
  const doc = renderFile(docFile, { root, width: 49, theme: DEFAULT_THEME, showFrontmatter: true, showHidden: false });
  const out = captureStdout();
  const stdin = fakeTty();
  const inst = render(
    <App doc={doc} root={root} theme={DEFAULT_THEME} themeId="default" sidebarOpen={true} showHidden={false} showFrontmatter={true} />,
    { stdout: out, stdin },
  );
  return { inst, out, stdin };
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

test('empty sidebar: dim `(no notes)` row (R-4)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-34-'));
  const root = join(tmp, 'vault');
  mkdirSync(root);
  // Only a hidden file → 0 entries at showHidden=false. The initial doc
  // comes from outside root so the sidebar stays empty.
  writeFileSync(join(root, '.gitkeep'), '');
  const list = Array.from({ length: 30 }, (_, i) => `${i + 1}. item${i + 1}`).join('\n') + '\n';
  const docFile = join(tmp, 'outside.md');
  writeFileSync(docFile, list);
  const h = setup(docFile, root);
  try {
    await wait(200);
    const frame = await finish(h);
    assert.ok(frame.includes('(no notes)'), 'empty sidebar shows `(no notes)`');
    assert.ok(!frame.includes('(empty document)'), 'doc is non-empty');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('empty doc: dim `(empty document)` row (R-4)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-34-'));
  const root = join(tmp, 'vault');
  mkdirSync(root);
  // a.md is empty (0 rendered lines); b.md keeps the sidebar non-empty.
  writeFileSync(join(root, 'a.md'), '');
  const list = Array.from({ length: 30 }, (_, i) => `${i + 1}. item${i + 1}`).join('\n') + '\n';
  writeFileSync(join(root, 'b.md'), list);
  const h = setup(join(root, 'a.md'), root);
  try {
    await wait(200);
    const frame = await finish(h);
    assert.ok(frame.includes('(empty document)'), 'empty doc shows `(empty document)`');
    assert.ok(!frame.includes('(no notes)'), 'sidebar is non-empty');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
