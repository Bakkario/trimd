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
import { createMouseParser } from '../src/core/mouse.js';
import type { MouseEvt } from '../src/core/types.js';

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

test('createMouseParser parses wheelUp (64) and wheelDown (65)', () => {
  const evts: MouseEvt[] = [];
  const parse = createMouseParser((e) => evts.push(e));

  parse('\x1b[<64;20;10M');
  assert.equal(evts.length, 1);
  assert.equal(evts[0].action, 'wheelUp');
  assert.equal(evts[0].x, 19);
  assert.equal(evts[0].y, 9);

  parse('\x1b[<65;20;10M');
  assert.equal(evts.length, 2);
  assert.equal(evts[1].action, 'wheelDown');
  assert.equal(evts[1].x, 19);
  assert.equal(evts[1].y, 9);
});

test('App: mouse wheel scrolls doc scrollTop by ±3 lines', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-49-'));
  const root = join(tmp, 'vault');
  mkdirSync(root);
  const lines = Array.from({ length: 40 }, (_, i) => `Line ${i + 1}`).join('\n\n');
  writeFileSync(join(root, 'long.md'), lines + '\n');

  const doc = renderFile(join(root, 'long.md'), { root, width: 80, theme: DEFAULT_THEME, showFrontmatter: false });
  const out = captureStdout();
  const stdin = fakeTty();
  const inst = render(
    <App doc={doc} root={root} theme={DEFAULT_THEME} themeId="default" sidebarOpen={false} showHidden={false} showFrontmatter={false} />,
    { stdout: out, stdin },
  );

  try {
    await wait(200);

    // Send wheelDown over doc pane: x=10 (col 11 in 1-based SGR), y=10 (row 11)
    process.stdin.emit('data', '\x1b[<65;11;11M');
    await wait(200);

    inst.unmount();
    await waitExit(inst);
    releaseStdinFixture();

    const frame = stripAnsi((out as unknown as { chunks: string[] }).chunks.join(''));
    // Scrolled by +3 lines, so line counter now starts at L4
    assert.ok(frame.includes('L4 4/'), 'scrolled to L4 via wheelDown');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
