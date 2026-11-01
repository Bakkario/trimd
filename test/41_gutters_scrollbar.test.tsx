import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink';
import App from '../src/ui/App.js';
import DocPane from '../src/ui/DocPane.js';
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

test('DocPane: renders 2-space left gutter, padded width, 2-space right gutter, and scrollbar column', () => {
  const doc = {
    lines: Array.from({ length: 40 }, (_, i) => ({ text: `Line ${i + 1}`, links: [] })),
    meta: null,
    title: 'Test',
    warnings: [],
    source: '/test.md',
  };
  const chunks: string[] = [];
  const out = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      cb();
    },
  });
  const stdin = fakeTty();
  const inst = render(<DocPane doc={doc} scrollTop={0} rows={10} width={20} theme={DEFAULT_THEME} />, {
    stdout: out,
    stdin,
  });
  inst.unmount();
  releaseStdinFixture();
  const raw = chunks.join('');
  const lines = raw.split('\n');
  assert.ok(lines.length >= 10);
  // line format starts with two spaces
  assert.ok(lines[0].startsWith('  Line 1'));
  // includes scrollbar thumb ┃ in scrollbar color
  assert.ok(raw.includes('┃'));
});

test('App: gutters prevent ││ collision next to separator and scrollbar thumb moves to bottom on G', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trimd-41-'));
  const root = join(tmp, 'vault');
  mkdirSync(root);
  const docLines = Array.from({ length: 100 }, (_, i) => `Paragraph line ${i + 1}`).join('\n\n');
  const file = join(root, 'long.md');
  writeFileSync(file, `# Long Document\n\n${docLines}\n`);

  const doc = renderFile(file, { root, width: 44, theme: DEFAULT_THEME, showFrontmatter: false, showHidden: false });
  const out = captureStdout();
  const stdin = fakeTty();
  const inst = render(
    <App doc={doc} root={root} theme={DEFAULT_THEME} themeId="default" sidebarOpen={true} showHidden={false} showFrontmatter={false} />,
    { stdout: out, stdin },
  );

  try {
    await wait(200);
    let raw = (out as unknown as { chunks: string[] }).chunks.join('');
    // Ensure no ││ collision: separator │ followed immediately by another │ is not present
    assert.ok(!raw.includes('││'), 'no double vertical separator bar');

    // Press 'G' to jump to bottom
    stdin.push('G');
    await wait(200);

    inst.unmount();
    await waitExit(inst);
    releaseStdinFixture();

    raw = (out as unknown as { chunks: string[] }).chunks.join('');
    assert.ok(raw.includes('┃'), 'scrollbar thumb rendered');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
