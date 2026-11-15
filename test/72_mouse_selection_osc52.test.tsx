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
import { extractSelectionText, applySelectionHighlight } from '../src/core/clipboard.js';
import type { RenderedLine } from '../src/core/types.js';

function fakeTty(): Readable {
  const stdin = new Readable({ read() {} });
  Object.defineProperty(stdin, 'isTTY', { value: true });
  (stdin as unknown as { setRawMode: (e: boolean) => void }).setRawMode = () => {};
  return stdin;
}

function captureStdout(): Writable & { chunks: string[] } {
  const chunks: string[] = [];
  const out = new Writable({
    write(chunk: Buffer | string, _enc, cb) {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      cb();
    },
  });
  Object.defineProperty(out, 'rows', { value: 24 });
  Object.defineProperty(out, 'columns', { value: 80 });
  Object.defineProperty(out, 'isTTY', { value: true });
  (out as unknown as { chunks: string[] }).chunks = chunks;
  return out as Writable & { chunks: string[] };
}

const waitExit = (inst: { waitUntilExit: () => Promise<unknown> }) =>
  Promise.race([
    inst.waitUntilExit(),
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error('unmount timeout after 2s')), 2000)),
  ]);

test('ISSUE-030: extractSelectionText handles single-line, multi-line, ANSI-styled, and reverse selections', () => {
  const lines: RenderedLine[] = [
    { text: '\x1b[1mHello\x1b[0m world', links: [] },
    { text: 'Second \x1b[36mline\x1b[0m here', links: [] },
  ];

  // Single line
  assert.equal(extractSelectionText(lines, { line: 0, col: 0 }, { line: 0, col: 5 }), 'Hello');
  // Reverse order
  assert.equal(extractSelectionText(lines, { line: 0, col: 11 }, { line: 0, col: 6 }), 'world');
  // Multi-line
  assert.equal(extractSelectionText(lines, { line: 0, col: 6 }, { line: 1, col: 11 }), 'world\nSecond line');
});

test('ISSUE-030: applySelectionHighlight wraps selected range with inverse video \\x1b[7m...\\x1b[27m', () => {
  const lines: RenderedLine[] = [{ text: '\x1b[1mHello\x1b[0m world', links: [] }];
  const highlighted = applySelectionHighlight(lines, { line: 0, col: 2 }, { line: 0, col: 8 });
  assert.ok(highlighted[0].text.includes('\x1b[7m'), 'contains inverse-video start');
  assert.ok(highlighted[0].text.includes('\x1b[27m'), 'contains inverse-video end');
});

test('ISSUE-030: mouse press + release across columns in App emits OSC 52 clipboard sequence', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-72-'));
  try {
    mkdirSync(join(tmp, 'root'));
    writeFileSync(join(tmp, 'root', 'note.md'), 'Hello world from Trimd\n');
    const doc = renderFile(join(tmp, 'root', 'note.md'), {
      root: join(tmp, 'root'),
      width: 75,
      theme: DEFAULT_THEME,
      showFrontmatter: false,
      showHidden: false,
    });

    const out = captureStdout();
    let unmounted = false;
    const inst = render(
      <App
        doc={doc}
        root={join(tmp, 'root')}
        theme={DEFAULT_THEME}
        themeId="default"
        sidebarOpen={false}
        showHidden={false}
        showFrontmatter={false}
      />,
      { stdout: out, stdin: fakeTty() },
    );

    try {
      await new Promise((r) => setTimeout(r, 150));
      // Line 0 is at e.y = 1 -> 1-based protocol y = 2.
      // With sidebarOpen=false, docX = 0 is at e.x = 2 -> 1-based protocol x = 3.
      // Select cols 0..11 ("Hello world"): press at (3, 2), release at (14, 2).
      process.stdin.push('\x1b[<0;3;2M');
      await new Promise((r) => setTimeout(r, 30));
      process.stdin.push('\x1b[<0;14;2m');
      await new Promise((r) => setTimeout(r, 150));
      await inst.waitUntilRenderFlush();

      const rawOut = out.chunks.join('');
      const expectedB64 = Buffer.from('Hello world', 'utf8').toString('base64');
      assert.ok(rawOut.includes(`\x1b]52;c;${expectedB64}\x07`), 'emits OSC 52 sequence with base64("Hello world")');
      assert.ok(rawOut.includes('Copied 11 chars'), 'displays OSC 52 copy toast');

      inst.unmount();
      unmounted = true;
      await waitExit(inst);
    } finally {
      if (!unmounted) inst.unmount();
      process.stdin.pause();
      process.stdin.unref();
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
